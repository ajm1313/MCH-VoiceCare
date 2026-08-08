/**
 * OCRScanScreen — Camera capture for document scanning (spec §16).
 *
 * GATED by `ocr_enabled` feature flag (spec §34).
 * The user captures an image of an MCH document page, selects the template,
 * and submits it to the backend for OCR processing. The result is then shown
 * on the OCRConfirmScreen for human confirmation of safety-critical fields.
 */
import React, {useState, useEffect} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import {isOcrEnabled} from '../core/auth/featureFlags';
import {setCachedJSON, getCachedJSON} from '../core/sync/contentCache';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OCRScan'>;

interface DocumentTemplate {
  id: string;
  templateId: string;
  name: string;
  pageType: string;
  version: string;
  fieldDefinitions: Array<{
    key: string;
    label: string;
    type: string;
    safety_critical: boolean;
  }>;
}

interface OCRJobResponse {
  id: string;
  status: string;
  extractedFields: Array<{
    key: string;
    value: string;
    confidence: number;
    safety_critical: boolean;
    human_confirmed: boolean;
  }>;
  hasUnconfirmedSafetyCritical: boolean;
}

export function OCRScanScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const {patientId} = route.params;
  const episode = route.params.episode || '';

  const {token} = useAuthStore();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Feature flag gate (spec §34)
  const ocrEnabled = isOcrEnabled();

  useEffect(() => {
    if (ocrEnabled) {
      loadTemplates();
    } else {
      setLoadingTemplates(false);
    }
  }, [ocrEnabled]);

  async function loadTemplates() {
    // Try cached templates first
    const cached = getCachedJSON<DocumentTemplate[]>('ocr_templates');
    if (cached && cached.length > 0) {
      setTemplates(cached);
      setLoadingTemplates(false);
    }

    // Fetch from server
    try {
      const resp = await fetch(`${AppConfig.apiBaseUrl}/ocr/templates`, {
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      });
      if (resp.ok) {
        const data = await resp.json();
        const list = data.results || [];
        setTemplates(list);
        setCachedJSON('ocr_templates', list, '1', 24);
      }
    } catch {
      // Use cached if available
    }
    setLoadingTemplates(false);
  }

  async function submitScan() {
    if (!selectedTemplate) {
      Alert.alert('Select Template', 'Please select a document template before scanning.');
      return;
    }

    setSubmitting(true);
    try {
      // In production, this would capture an image via react-native-vision-camera
      // and upload it. For now, we simulate the capture and submit with a placeholder.
      const resp = await fetch(`${AppConfig.apiBaseUrl}/ocr/jobs`, {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          patientId,
          templateId: selectedTemplate,
          episode,
          imagePath: `/tmp/scan_${Date.now()}.jpg`,
          imageHash: 'placeholder_hash',
          capturedBy: useAuthStore.getState().user?.username || 'unknown',
          deviceId: 'mobile-device',
        }),
      });

      if (resp.ok) {
        const job: OCRJobResponse = await resp.json();
        // Navigate to confirmation screen
        navigation.navigate('OCRConfirm', {jobId: job.id});
      } else {
        const errData = await resp.json().catch(() => ({}));
        Alert.alert('OCR Failed', errData.error || 'Failed to submit scan for OCR processing.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? String(err));
    }
    setSubmitting(false);
  }

  // Feature flag gate: show disabled view if OCR is not enabled
  if (!ocrEnabled) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, {color: colors.textPrimary}]}>Scan Document</Text>
        </View>
        <View style={styles.content}>
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: colors.textSecondary}]}>Feature Unavailable</Text>
            <Text style={[styles.bodyText, {color: colors.textSecondary, marginTop: 8}]}>
              Document scanning (OCR) is not enabled in this deployment.
              Use manual data entry instead.
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>Scan Document</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Template selector */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Document Template *</Text>
          {loadingTemplates ? (
            <Text style={[styles.bodyText, {color: colors.textSecondary}]}>Loading templates...</Text>
          ) : templates.length === 0 ? (
            <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
              No templates available. Connect to sync.
            </Text>
          ) : (
            templates.map(t => (
              <Pressable
                key={t.id}
                style={[
                  styles.option,
                  {
                    borderColor: selectedTemplate === t.id ? colors.primary : '#E2E8F0',
                    backgroundColor: selectedTemplate === t.id ? colors.primary + '10' : 'transparent',
                  },
                ]}
                onPress={() => setSelectedTemplate(t.id)}>
                <Text style={[styles.optionTitle, {color: colors.textPrimary}]}>{t.name}</Text>
                <Text style={[styles.optionSub, {color: colors.textSecondary}]}>
                  {t.pageType} · v{t.version}
                </Text>
                {t.fieldDefinitions.some(f => f.safety_critical) && (
                  <Text style={[styles.warning, {color: colors.warning}]}>
                    ⚠ Contains safety-critical fields requiring confirmation
                  </Text>
                )}
              </Pressable>
            ))
          )}
        </View>

        {/* Camera preview placeholder */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Document Capture</Text>
          <View style={styles.cameraPlaceholder}>
            <Text style={[styles.cameraHint, {color: colors.textSecondary}]}>
              Camera preview will appear here when react-native-vision-camera is integrated.
              Position the document within the frame.
            </Text>
          </View>
        </View>

        {/* Submit button */}
        <Pressable
          style={[styles.submitBtn, {backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1}]}
          onPress={submitScan}
          disabled={submitting || !selectedTemplate}>
          <Text style={styles.submitBtnText}>
            {submitting ? 'Processing...' : 'Capture & Extract'}
          </Text>
        </Pressable>
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
  option: {padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8},
  optionTitle: {fontSize: 15, fontWeight: '600'},
  optionSub: {fontSize: 12, marginTop: 2},
  warning: {fontSize: 11, marginTop: 4, fontWeight: '600'},
  cameraPlaceholder: {
    height: 200,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cameraHint: {fontSize: 13, textAlign: 'center', lineHeight: 18},
  submitBtn: {padding: 16, borderRadius: 12, alignItems: 'center'},
  submitBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
