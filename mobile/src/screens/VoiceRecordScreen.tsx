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
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {getDb, query} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'VoiceRecord'>;

const audioRecorderPlayer = new AudioRecorderPlayer();

const MODULE_OPTIONS = [
  {label: 'Pregnancy', value: 'PREGNANCY'},
  {label: 'Newborn', value: 'NEONATE'},
] as const;

export function VoiceRecordScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

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
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, {color: colors.textPrimary}]}>Voice Observation</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Feature Unavailable
            </Text>
            <Text style={[styles.bodyText, {color: colors.textSecondary, marginTop: 8}]}>
              Voice observation capture is not enabled in this deployment.
              Use manual observation entry instead.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Voice Observation</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Module selector */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Module *</Text>
          {MODULE_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              onPress={() => setModule(opt.value)}
              style={[styles.option, module === opt.value && {borderColor: colors.primary}]}>
              <Text style={{
                color: module === opt.value ? colors.primary : colors.textPrimary,
                fontSize: 14,
                fontWeight: module === opt.value ? '700' : '400',
              }}>{opt.label}</Text>
            </Pressable>
          ))}

          <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>Language *</Text>
          <View style={styles.langRow}>
            {LANG_OPTIONS.map(lang => (
              <Pressable
                key={lang.value}
                onPress={() => setLanguage(lang.value)}
                style={[styles.langBtn, language === lang.value && {backgroundColor: colors.primary}]}>
                <Text style={{
                  color: language === lang.value ? '#fff' : colors.textPrimary,
                  fontSize: 12,
                  fontWeight: '600',
                }}>{lang.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recording section */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Record Observation</Text>
          <Text style={[styles.hint, {color: colors.textSecondary}]}>
            Tap "Start Recording" and dictate the clinical observation clearly.
            The audio will be transcribed and structured data extracted when synced.
          </Text>

          <View style={styles.recordSection}>
            {isRecording && (
              <Text style={[styles.timer, {color: colors.primary}]}>{formatTime(recordSecs)}</Text>
            )}

            {!isRecording ? (
              <Pressable
                style={[styles.recordBtn, {backgroundColor: '#DC2626'}]}
                onPress={startRecording}>
                <Text style={styles.recordBtnText}>● Start Recording</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.recordBtn, {backgroundColor: '#6B7280'}]}
                onPress={stopRecording}>
                <Text style={styles.recordBtnText}>■ Stop Recording</Text>
              </Pressable>
            )}
          </View>

          {audioPath ? (
            <View style={styles.playbackSection}>
              <Text style={[styles.recordedLabel, {color: colors.textSecondary}]}>
                Recording saved ({formatTime(recordSecs || Math.floor((recordSecs || 0)))})
              </Text>
              <View style={styles.playbackBtns}>
                <Pressable style={[styles.playBtn, {borderColor: colors.primary}]} onPress={() => playRecording(audioPath)}>
                  <Text style={[styles.playBtnText, {color: colors.primary}]}>▶ Play</Text>
                </Pressable>
                <Pressable style={[styles.playBtn, {borderColor: colors.textSecondary}]} onPress={stopPlayback}>
                  <Text style={[styles.playBtnText, {color: colors.textSecondary}]}>■ Stop</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.saveBtn, {backgroundColor: colors.primary, opacity: saving ? 0.5 : 1}]}
                onPress={saveAndEnqueue}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save & Queue for Sync</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Previous recordings */}
        {recordings.length > 0 && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Recordings for this episode</Text>
            {recordings.map((rec, idx) => (
              <View key={rec.id} style={[styles.recItem, {borderColor: colors.border}]}>
                <View style={styles.recHeader}>
                  <Text style={[styles.recModule, {color: colors.textPrimary}]}>{rec.module}</Text>
                  <Text style={[styles.recStatus, {
                    color: rec.sync_status === 'SYNCED' ? '#16A34A' : rec.sync_status === 'NOT_SYNCED' ? '#D97706' : '#6B7280'
                  }]}>{rec.sync_status}</Text>
                </View>
                <Text style={[styles.recLang, {color: colors.textSecondary}]}>
                  Language: {rec.language} · Duration: {Math.floor(rec.duration_ms / 1000)}s
                </Text>
                {rec.transcript ? (
                  <Text style={[styles.recTranscript, {color: colors.textPrimary}]}>{rec.transcript}</Text>
                ) : (
                  <Text style={[styles.recTranscript, {color: colors.textSecondary, fontStyle: 'italic'}]}>
                    {rec.sync_status === 'SYNCED' ? 'No transcript available' : 'Transcript pending sync...'}
                  </Text>
                )}
                {rec.extracted_data ? (
                  <Text style={[styles.recExtracted, {color: colors.textSecondary}]}>
                    Extracted: {rec.extracted_data}
                  </Text>
                ) : null}
                <View style={styles.statusPipeline}>
                  <StatusBadge label="Recorded" done={true} color={colors.primary} />
                  <StatusArrow />
                  <StatusBadge
                    label="Uploaded"
                    done={rec.sync_status === 'SYNCED'}
                    pending={rec.sync_status === 'NOT_SYNCED'}
                    color={colors.primary}
                  />
                  <StatusArrow />
                  <StatusBadge
                    label="Transcribed"
                    done={!!rec.transcript}
                    pending={rec.sync_status === 'SYNCED' && !rec.transcript}
                    color={colors.primary}
                  />
                  <StatusArrow />
                  <StatusBadge
                    label="Extracted"
                    done={!!rec.extracted_data}
                    pending={!!(rec.transcript && !rec.extracted_data)}
                    color={colors.primary}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  label: {fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6},
  bodyText: {fontSize: 14, lineHeight: 20},
  option: {padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6},
  langRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  langBtn: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0'},
  cardTitle: {fontSize: 15, fontWeight: '700', marginBottom: 8},
  hint: {fontSize: 13, lineHeight: 18, marginBottom: 16},
  recordSection: {alignItems: 'center', paddingVertical: 16},
  timer: {fontSize: 32, fontWeight: '700', marginBottom: 16, fontVariant: ['tabular-nums']},
  recordBtn: {paddingHorizontal: 32, paddingVertical: 16, borderRadius: 50, alignItems: 'center'},
  recordBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  playbackSection: {marginTop: 16, alignItems: 'center', gap: 12},
  recordedLabel: {fontSize: 13},
  playbackBtns: {flexDirection: 'row', gap: 12},
  playBtn: {paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1},
  playBtnText: {fontWeight: '600', fontSize: 14},
  saveBtn: {padding: 16, borderRadius: 12, alignItems: 'center', width: '100%'},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  recItem: {borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8},
  recHeader: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
  recModule: {fontSize: 13, fontWeight: '700'},
  recStatus: {fontSize: 11, fontWeight: '600'},
  recLang: {fontSize: 12, marginBottom: 6},
  recTranscript: {fontSize: 13, lineHeight: 18},
  recExtracted: {fontSize: 11, marginTop: 4, fontStyle: 'italic'},
  statusPipeline: {flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 2},
  statusBadge: {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1},
  statusBadgeText: {fontSize: 9, fontWeight: '600'},
  statusArrow: {fontSize: 10, color: '#94A3B8', marginHorizontal: 2},
});

function StatusBadge({
  label,
  done,
  pending,
  color,
}: {
  label: string;
  done: boolean;
  pending?: boolean;
  color: string;
}) {
  const bg = done ? color : pending ? 'transparent' : '#F1F5F9';
  const border = done ? color : pending ? '#D97706' : '#E2E8F0';
  const text = done ? '#fff' : pending ? '#D97706' : '#94A3B8';
  return (
    <View style={[styles.statusBadge, {backgroundColor: bg, borderColor: border}]}>
      <Text style={[styles.statusBadgeText, {color: text}]}>
        {done ? '\u2713' : pending ? '\u23F3' : '\u25CB'} {label}
      </Text>
    </View>
  );
}

function StatusArrow() {
  return <Text style={styles.statusArrow}>\u2192</Text>;
}
