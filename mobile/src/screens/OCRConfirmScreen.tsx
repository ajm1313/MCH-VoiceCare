/**
 * OCRConfirmScreen — Human confirmation of OCR-extracted fields (spec §16.6).
 *
 * Safety-critical OCR fields MUST be human-confirmed before entering clinical
 * scoring (spec §16.3, §16.6). The user reviews each extracted field, can
 * correct values, and must explicitly confirm safety-critical fields.
 *
 * Unknown templates or low-confidence fields route to manual entry (spec §16.4).
 */
import React, {useState, useEffect} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import {getConfigNumber} from '../core/sync/configStore';
import {apiFetch} from '../core/security/secureFetch';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OCRConfirm'>;

interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
  unit: string | null;
  safety_critical: boolean;
  human_confirmed: boolean;
  corrected_value: string | null;
  validation_errors?: string[];
}

interface OCRJob {
  id: string;
  status: string;
  templateName: string | null;
  extractedFields: ExtractedField[];
  hasUnconfirmedSafetyCritical: boolean;
}

export function OCRConfirmScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const {jobId} = route.params;
  const {token} = useAuthStore();

  const [job, setJob] = useState<OCRJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [fieldConfirmations, setFieldConfirmations] = useState<Record<string, boolean>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    loadJob();
  }, [jobId]);

  async function loadJob() {
    try {
      const resp = await apiFetch(`${AppConfig.apiBaseUrl}/ocr/jobs/${jobId}`, {
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      });
      if (resp.ok) {
        const data: OCRJob = await resp.json();
        setJob(data);
        // Initialize field confirmations for safety-critical fields
        const initConf: Record<string, boolean> = {};
        for (const f of data.extractedFields) {
          if (f.safety_critical) {
            initConf[f.key] = false;
          }
        }
        setFieldConfirmations(initConf);
      } else {
        // Server returned an error — likely offline or job unavailable
        setLoadFailed(true);
      }
    } catch {
      // Network error — cannot load OCR results offline (spec §10.2)
      setLoadFailed(true);
    }
    setLoading(false);
  }

  function enterManually() {
    // Navigate to manual observation entry
    navigation.navigate('PregnancyObserve', {episodeId: ''});
  }

  function updateCorrection(key: string, value: string) {
    setCorrections(prev => ({...prev, [key]: value}));
  }

  function toggleFieldConfirmation(key: string, value: boolean) {
    setFieldConfirmations(prev => ({...prev, [key]: value}));
  }

  function canConfirm(): boolean {
    if (!job) return false;
    // All safety-critical fields must be individually confirmed
    for (const f of job.extractedFields) {
      if (f.safety_critical && !fieldConfirmations[f.key]) {
        return false;
      }
    }
    return true;
  }

  async function confirmJob() {
    if (!job) return;
    if (!canConfirm()) {
      Alert.alert(
        'Confirmation Required',
        'All safety-critical fields must be individually confirmed before proceeding.',
      );
      return;
    }

    setConfirming(true);
    try {
      const resp = await apiFetch(`${AppConfig.apiBaseUrl}/ocr/jobs/${jobId}/confirm`, {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          confirmedBy: useAuthStore.getState().user?.username || 'unknown',
          fieldCorrections: corrections,
        }),
      });
      if (resp.ok) {
        Alert.alert('Confirmed', 'OCR fields have been confirmed and saved.', [
          {text: 'OK', onPress: () => navigation.goBack()},
        ]);
      } else {
        Alert.alert(
          'Error',
          'Failed to confirm OCR results.',
          [
            {text: 'OK'},
            {text: 'Enter Manually', onPress: enterManually},
          ],
        );
      }
    } catch {
      Alert.alert(
        'Offline',
        'Network error during confirmation. Please enter data manually.',
        [
          {text: 'OK'},
          {text: 'Enter Manually', onPress: enterManually},
        ],
      );
    }
    setConfirming(false);
  }

  async function rejectJob() {
    if (!job) return;
    Alert.alert(
      'Reject Extraction',
      'Are you sure you want to reject this extraction? You will need to re-scan or enter data manually.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setConfirming(true);
            try {
              const resp = await apiFetch(`${AppConfig.apiBaseUrl}/ocr/jobs/${jobId}/reject`, {
                method: 'POST',
                headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: JSON.stringify({
                  rejectedBy: useAuthStore.getState().user?.username || 'unknown',
                  reason: 'User rejected extraction',
                }),
              });
              if (resp.ok) {
                Alert.alert('Rejected', 'OCR extraction has been rejected.', [
                  {text: 'OK', onPress: () => navigation.goBack()},
                ]);
              }
            } catch {
              Alert.alert(
                'Offline',
                'Network error during rejection. Please enter data manually.',
                [
                  {text: 'OK'},
                  {text: 'Enter Manually', onPress: enterManually},
                ],
              );
            }
            setConfirming(false);
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, {color: colors.textPrimary}]}>Confirm OCR Results</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, {color: colors.textPrimary}]}>Confirm OCR Results</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: loadFailed ? colors.warning : colors.textSecondary}]}>
              {loadFailed ? 'Offline' : 'Not Found'}
            </Text>
            <Text style={[styles.bodyText, {color: colors.textSecondary, marginTop: 8}]}>
              {loadFailed
                ? 'Cannot load OCR results offline. Please enter data manually.'
                : 'OCR job not found.'}
            </Text>
          </View>
          {loadFailed && (
            <Pressable
              style={[styles.manualBtn, {borderColor: colors.primary}]}
              onPress={enterManually}>
              <Text style={[styles.manualBtnText, {color: colors.primary}]}>
                Enter Manually
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const safetyCriticalThreshold = getConfigNumber('OCR_CONFIDENCE_SAFETY_CRITICAL', 0.85);
  const nonSafetyThreshold = getConfigNumber('OCR_CONFIDENCE_NON_SAFETY', 0.80);

  const safetyCriticalFields = job.extractedFields.filter(f => f.safety_critical);
  const nonSafetyFields = job.extractedFields.filter(f => !f.safety_critical);

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Confirm OCR Results</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Job status */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Extraction Status</Text>
          <Text style={[styles.bodyText, {color: colors.textPrimary}]}>
            Template: {job.templateName || 'Unknown'}
          </Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            Status: {job.status}
          </Text>
          {job.hasUnconfirmedSafetyCritical && (
            <Text style={[styles.warning, {color: colors.warning}]}>
              ⚠ Safety-critical fields require confirmation before clinical use
            </Text>
          )}
        </View>

        {/* Safety-critical fields (spec §16.6) */}
        {safetyCriticalFields.length > 0 && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: colors.warning}]}>
              Safety-Critical Fields — Confirmation Required
            </Text>
            {safetyCriticalFields.map(field => (
              <View key={field.key} style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, {color: colors.textPrimary}]}>
                    {field.key.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <View style={[styles.confidenceBadge, {
                    backgroundColor: field.confidence >= safetyCriticalThreshold ? '#16A34A' : '#EA580C',
                  }]}>
                    <Text style={styles.confidenceText}>
                      {(field.confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>

                <TextInput
                  style={[styles.input, {borderColor: '#E2E8F0', color: colors.textPrimary}]}
                  value={corrections[field.key] ?? field.corrected_value ?? field.value}
                  onChangeText={text => updateCorrection(field.key, text)}
                  placeholder={field.value}
                />

                {field.validation_errors && field.validation_errors.length > 0 && (
                  <View style={styles.errorList}>
                    {field.validation_errors.map((err, i) => (
                      <Text key={i} style={[styles.errorText, {color: colors.danger}]}>
                        ⚠ {err}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.confirmRow}>
                  <Text style={[styles.confirmLabel, {color: colors.textSecondary}]}>
                    I confirm this value is correct
                  </Text>
                  <Switch
                    value={fieldConfirmations[field.key] || false}
                    onValueChange={val => toggleFieldConfirmation(field.key, val)}
                    trackColor={{false: '#E2E8F0', true: colors.primary}}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Non-safety-critical fields */}
        {nonSafetyFields.length > 0 && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Other Extracted Fields
            </Text>
            {nonSafetyFields.map(field => (
              <View key={field.key} style={styles.fieldRow}>
                <View style={styles.fieldHeader}>
                  <Text style={[styles.fieldLabel, {color: colors.textPrimary}]}>
                    {field.key.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                  <View style={[styles.confidenceBadge, {
                    backgroundColor: field.confidence >= nonSafetyThreshold ? '#16A34A' : '#EA580C',
                  }]}>
                    <Text style={styles.confidenceText}>
                      {(field.confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, {borderColor: '#E2E8F0', color: colors.textPrimary}]}
                  value={corrections[field.key] ?? field.corrected_value ?? field.value}
                  onChangeText={text => updateCorrection(field.key, text)}
                  placeholder={field.value}
                />
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.rejectBtn, {borderColor: colors.danger, opacity: confirming ? 0.6 : 1}]}
            onPress={rejectJob}
            disabled={confirming}>
            <Text style={[styles.rejectBtnText, {color: colors.danger}]}>Reject</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, {
              backgroundColor: canConfirm() ? colors.primary : '#E2E8F0',
              opacity: confirming ? 0.6 : 1,
            }]}
            onPress={confirmJob}
            disabled={confirming || !canConfirm()}>
            <Text style={styles.confirmBtnText}>
              {confirming ? 'Saving...' : 'Confirm All'}
            </Text>
          </Pressable>
        </View>

        {!canConfirm() && safetyCriticalFields.length > 0 && (
          <Text style={[styles.hint, {color: colors.textSecondary}]}>
            Confirm each safety-critical field above to enable the Confirm button.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  label: {fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8},
  bodyText: {fontSize: 14, lineHeight: 20},
  warning: {fontSize: 12, marginTop: 6, fontWeight: '600'},
  fieldRow: {marginBottom: 16},
  fieldHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  fieldLabel: {fontSize: 13, fontWeight: '600', flex: 1},
  confidenceBadge: {paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4},
  confidenceText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  input: {borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14},
  errorList: {marginTop: 4, marginBottom: 4},
  errorText: {fontSize: 11, marginBottom: 2},
  confirmRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8},
  confirmLabel: {fontSize: 13, flex: 1},
  actionRow: {flexDirection: 'row', gap: 12, marginTop: 8},
  rejectBtn: {flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center'},
  rejectBtnText: {fontWeight: '700', fontSize: 14},
  confirmBtn: {flex: 1, padding: 14, borderRadius: 12, alignItems: 'center'},
  confirmBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
  hint: {fontSize: 12, textAlign: 'center', marginTop: 4},
  manualBtn: {padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center'},
  manualBtnText: {fontWeight: '600', fontSize: 14},
});
