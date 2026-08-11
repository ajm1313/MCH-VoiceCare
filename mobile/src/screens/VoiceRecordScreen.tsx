/**
 * VoiceRecordScreen — CHW dictates clinical observations by voice.
 *
 * Pipeline: record audio → store locally → enqueue for sync →
 * backend calls Khaya ASR → Groq LLM extracts structured data →
 * creates observation → runs assessment → result syncs back.
 *
 * GATED by `speech_capture_enabled` feature flag (spec §34, §37).
 * The flag MUST be false in the first release. When disabled, the
 * screen shows a "feature unavailable" message and does not allow
 * recording. Every LLM-extracted field MUST be human-confirmed before
 * entering clinical scoring (spec §16.3).
 */
import React, {useEffect, useState} from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {getDb, query} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import type {RootStackParamList} from '../core/navigation/types';
import {useTheme} from '../theme/useTheme';
import {radius, space} from '../theme/tokens';
import {
  AppText,
  Badge,
  Button,
  Card,
  Icon,
  Screen,
  SectionHeader,
  type BadgeTone,
  type IconName,
} from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceRecord'>;

const audioRecorderPlayer = new AudioRecorderPlayer();

const MODULE_OPTIONS = [
  {label: 'Pregnancy', value: 'PREGNANCY'},
  {label: 'Newborn', value: 'NEONATE'},
] as const;

export function VoiceRecordScreen({route, navigation}: Props) {
  const {colors} = useTheme();

  // Feature flag gate (spec §34, §37): speech_capture_enabled MUST be false
  // in the first release. When disabled, show a "feature unavailable" view.
  const speechEnabled = isSpeechCaptureEnabled();

  const episodeId = route.params.episodeId;
  const [module, setModule] = useState<string>('PREGNANCY');
  const [language, setLanguage] = useState<string>('en');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [audioPath, setAudioPath] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);

  const LANG_OPTIONS = [
    {label: 'English', value: 'en'},
    {label: 'Twi', value: 'tw'},
    {label: 'Dagbani', value: 'dag'},
    {label: 'Ewe', value: 'ee'},
  ];

  useEffect(() => {
    loadRecordings();
  }, [episodeId]);

  function loadRecordings() {
    const rows = query(
      'SELECT id, episode_id, module, audio_path, duration_ms, language, transcript, status, sync_status, created_at FROM voice_recordings WHERE episode_id = ? ORDER BY created_at DESC',
      [episodeId],
    );
    setRecordings(rows as unknown as RecordingRow[]);
  }

  async function requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'MCH VoiceCare needs access to your microphone to record clinical observations.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  async function startRecording() {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Microphone permission is required to record audio.');
      return;
    }

    try {
      const path = Platform.select({
        ios: `voice_${Date.now()}.m4a`,
        android: `voice_${Date.now()}.m4a`,
      });

      await audioRecorderPlayer.startRecorder(path);
      audioRecorderPlayer.addRecordBackListener((e) => {
        setRecordSecs(Math.floor(e.currentPosition / 1000));
      });
      setIsRecording(true);
    } catch (err: any) {
      Alert.alert('Recording Error', err?.message ?? String(err));
    }
  }

  async function stopRecording() {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
      if (result) {
        setAudioPath(result);
        setRecordSecs(0);
      }
    } catch (err: any) {
      Alert.alert('Stop Error', err?.message ?? String(err));
      setIsRecording(false);
    }
  }

  async function playRecording(path: string) {
    try {
      await audioRecorderPlayer.startPlayer(path);
      audioRecorderPlayer.addPlayBackListener(() => {});
    } catch (err: any) {
      Alert.alert('Playback Error', err?.message ?? String(err));
    }
  }

  async function stopPlayback() {
    try {
      await audioRecorderPlayer.stopPlayer();
      audioRecorderPlayer.removePlayBackListener();
    } catch {
      // ignore
    }
  }

  function saveAndEnqueue() {
    if (!audioPath) {
      Alert.alert('No Recording', 'Please record audio first.');
      return;
    }

    setSaving(true);
    try {
      const id = `voice-${Date.now()}`;
      const now = new Date().toISOString();

      // Read audio file as base64 for sync payload
      // In production, this would use RNFS; for now we store the path
      // and the sync engine sends the path metadata. The backend
      // endpoint accepts multipart upload for the audio file.
      const db = getDb();
      db.execute(
        `INSERT OR REPLACE INTO voice_recordings
         (id, episode_id, module, audio_path, duration_ms, language, transcript, extracted_data, status, created_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'PENDING', ?, 'NOT_SYNCED')`,
        [id, episodeId, module, audioPath, recordSecs * 1000, language, now],
      );

      // Enqueue for sync — the sync engine will upload the audio file
      // to the backend's voice_observation endpoint
      enqueue(
        'voice_observation',
        {
          recordingId: id,
          episodeId,
          module,
          audioPath,
          durationMs: recordSecs * 1000,
          language,
          createdAt: now,
        },
        'device-001',
        'VOICE-v1',
      );

      Alert.alert('Saved', 'Recording saved and queued for sync. Transcript will appear after sync.', [
        {text: 'OK', onPress: () => {
          setAudioPath('');
          setRecordSecs(0);
          loadRecordings();
        }},
      ]);
    } catch (err: any) {
      Alert.alert('Error', `Failed to save: ${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Feature flag gate: if speech_capture_enabled is false, show disabled view
  if (!speechEnabled) {
    return (
      <Screen scroll>
        <SectionHeader
          title="Voice Observation"
          overline="Audio capture"
        />
        <Card style={styles.disabledCard}>
          <View style={styles.disabledIconRow}>
            <Icon name="mic" size={28} color={colors.textTertiary} />
          </View>
          <AppText variant="h3" center style={styles.disabledTitle}>
            Feature Unavailable
          </AppText>
          <AppText variant="small" tone="secondary" center>
            Voice observation capture is not enabled in this deployment.
            Use manual observation entry instead.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SectionHeader
        title="Voice Observation"
        overline="Audio capture"
        subtitle="Dictate clinical observations for transcription and structured extraction."
      />

      {/* Module + language selector */}
      <Card style={styles.sectionCard}>
        <AppText variant="smallStrong" tone="secondary" style={styles.fieldLabel}>
          Module *
        </AppText>
        <View style={styles.optionRow}>
          {MODULE_OPTIONS.map(opt => {
            const selected = module === opt.value;
            return (
              <Button
                key={opt.value}
                label={opt.label}
                variant={selected ? 'primary' : 'secondary'}
                size="sm"
                onPress={() => setModule(opt.value)}
                style={styles.flex}
              />
            );
          })}
        </View>

        <AppText variant="smallStrong" tone="secondary" style={[styles.fieldLabel, styles.fieldLabelGap]}>
          Language *
        </AppText>
        <View style={styles.langRow}>
          {LANG_OPTIONS.map(lang => {
            const selected = language === lang.value;
            return (
              <Button
                key={lang.value}
                label={lang.label}
                variant={selected ? 'primary' : 'ghost'}
                size="sm"
                onPress={() => setLanguage(lang.value)}
                style={styles.langBtn}
              />
            );
          })}
        </View>
      </Card>

      {/* Recording section */}
      <Card style={styles.sectionCard}>
        <AppText variant="h3">Record Observation</AppText>
        <AppText variant="small" tone="secondary" style={styles.hint}>
          Tap "Start Recording" and dictate the clinical observation clearly.
          The audio will be transcribed and structured data extracted when synced.
        </AppText>

        <View style={styles.recordSection}>
          {isRecording && (
            <View style={styles.timerRow}>
              <Icon name="mic" size={20} color={colors.danger} />
              <AppText variant="metric" tone="brand" style={styles.timer}>
                {formatTime(recordSecs)}
              </AppText>
            </View>
          )}

          {!isRecording ? (
            <Button
              label="Start Recording"
              variant="danger"
              size="lg"
              onPress={startRecording}
              icon="mic"
              fullWidth
            />
          ) : (
            <Button
              label="Stop Recording"
              variant="secondary"
              size="lg"
              onPress={stopRecording}
              icon="close"
              fullWidth
            />
          )}
        </View>

        {audioPath ? (
          <View style={styles.playbackSection}>
            <AppText variant="small" tone="secondary" center>
              Recording saved ({formatTime(recordSecs || Math.floor((recordSecs || 0)))})
            </AppText>
            <View style={styles.playbackBtns}>
              <Button
                label="Play"
                variant="secondary"
                size="sm"
                onPress={() => playRecording(audioPath)}
                icon="share"
              />
              <Button
                label="Stop"
                variant="ghost"
                size="sm"
                onPress={stopPlayback}
                icon="close"
              />
            </View>

            <Button
              label="Save & Queue for Sync"
              variant="primary"
              size="lg"
              onPress={saveAndEnqueue}
              loading={saving}
              disabled={saving}
              icon="check"
              fullWidth
              style={styles.saveBtn}
            />
          </View>
        ) : null}
      </Card>

      {/* Previous recordings */}
      {recordings.length > 0 ? (
        <View>
          <SectionHeader title="Recordings" overline="This episode" />
          {recordings.map((rec) => (
            <Card key={rec.id} style={styles.recCard}>
              <View style={styles.recHeader}>
                <View style={styles.recTitleRow}>
                  <Icon name="mic" size={16} color={colors.primary} />
                  <AppText variant="bodyStrong">{rec.module}</AppText>
                </View>
                <Badge
                  label={rec.sync_status}
                  tone={
                    rec.sync_status === 'SYNCED'
                      ? 'success'
                      : rec.sync_status === 'NOT_SYNCED'
                      ? 'warning'
                      : 'neutral'
                  }
                  icon={
                    rec.sync_status === 'SYNCED'
                      ? 'checkCircle'
                      : rec.sync_status === 'NOT_SYNCED'
                      ? 'refresh'
                      : 'info'
                  }
                />
              </View>
              <AppText variant="small" tone="secondary">
                Language: {rec.language} · Duration: {Math.floor(rec.duration_ms / 1000)}s
              </AppText>
              {rec.transcript ? (
                <AppText variant="small" style={styles.recTranscript}>
                  {rec.transcript}
                </AppText>
              ) : (
                <AppText variant="small" tone="tertiary" style={styles.recTranscript}>
                  {rec.sync_status === 'SYNCED' ? 'No transcript available' : 'Transcript pending sync…'}
                </AppText>
              )}
              {rec.extracted_data ? (
                <AppText variant="caption" tone="secondary" style={styles.recExtracted}>
                  Extracted: {rec.extracted_data}
                </AppText>
              ) : null}
              <View style={styles.statusPipeline}>
                <StatusBadge label="Recorded" done={true} />
                <Icon name="chevronRight" size={12} color={colors.textTertiary} />
                <StatusBadge
                  label="Uploaded"
                  done={rec.sync_status === 'SYNCED'}
                  pending={rec.sync_status === 'NOT_SYNCED'}
                />
                <Icon name="chevronRight" size={12} color={colors.textTertiary} />
                <StatusBadge
                  label="Transcribed"
                  done={!!rec.transcript}
                  pending={rec.sync_status === 'SYNCED' && !rec.transcript}
                />
                <Icon name="chevronRight" size={12} color={colors.textTertiary} />
                <StatusBadge
                  label="Extracted"
                  done={!!rec.extracted_data}
                  pending={!!(rec.transcript && !rec.extracted_data)}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

interface RecordingRow {
  id: string;
  episode_id: string;
  module: string;
  audio_path: string;
  duration_ms: number;
  language: string;
  transcript: string | null;
  extracted_data: string | null;
  status: string;
  sync_status: string;
  created_at: string;
}

const styles = StyleSheet.create({
  disabledCard: {alignItems: 'center', paddingVertical: space[8]},
  disabledIconRow: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
  },
  disabledTitle: {marginBottom: space[2]},
  sectionCard: {marginBottom: space[4]},
  fieldLabel: {marginBottom: space[2]},
  fieldLabelGap: {marginTop: space[4]},
  optionRow: {flexDirection: 'row', gap: space[2]},
  flex: {flex: 1},
  langRow: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2]},
  langBtn: {marginBottom: space[1]},
  hint: {marginTop: space[2], marginBottom: space[4]},
  recordSection: {alignItems: 'center', gap: space[4], paddingVertical: space[2]},
  timerRow: {flexDirection: 'row', alignItems: 'center', gap: space[2]},
  timer: {fontVariant: ['tabular-nums'] as any},
  playbackSection: {marginTop: space[4], alignItems: 'center', gap: space[3]},
  playbackBtns: {flexDirection: 'row', gap: space[2]},
  saveBtn: {marginTop: space[2]},
  recCard: {marginBottom: space[2]},
  recHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1]},
  recTitleRow: {flexDirection: 'row', alignItems: 'center', gap: space[2]},
  recTranscript: {marginTop: space[2], lineHeight: 20},
  recExtracted: {marginTop: space[1]},
  statusPipeline: {flexDirection: 'row', alignItems: 'center', marginTop: space[3], flexWrap: 'wrap', gap: space[1]},
});

function StatusBadge({
  label,
  done,
  pending,
}: {
  label: string;
  done: boolean;
  pending?: boolean;
}) {
  const tone: BadgeTone = done ? 'success' : pending ? 'warning' : 'neutral';
  const icon: IconName = done ? 'checkCircle' : pending ? 'clock' : 'info';
  return <Badge label={label} tone={tone} icon={icon} size="sm" />;
}
