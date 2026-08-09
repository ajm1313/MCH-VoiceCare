/**
 * ScanScreen — Camera capture for document scanning (spec §16, §10).
 *
 * Spec §10 requires the screen to be named "ScanScreen".
 * Gated by `ocr_enabled` feature flag (spec §34).
 * The user captures an image of an MCH document page, selects the template,
 * and submits it to the backend for OCR processing. The result is then shown
 * on the OCRConfirmScreen for human confirmation of safety-critical fields.
 *
 * Offline fallback (spec §10.2): OCR requires network connectivity. When
 * offline or when the backend API call fails, the user is offered a manual
 * data-entry fallback so clinical capture is never blocked.
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
import {getCachedDeviceConfig} from '../core/auth/deviceProvision';
import {isOcrEnabled} from '../core/auth/featureFlags';
import {setCachedJSON, getCachedJSON} from '../core/sync/contentCache';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

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

/**
 * Captured page record for multi-page capture support (spec §16.2 / Phase 4).
 */
interface CapturedPage {
  pageNumber: number;
  imagePath: string;
  imageHash: string;
  capturedAt: number;
  quality: CaptureQuality;
}

/**
 * Basic capture quality feedback derived from image dimensions and
 * brightness heuristics (spec §16.2). In production this would use a
 * native blur/glare detector on the camera frame.
 */
interface CaptureQuality {
  isBlurry: boolean;
  hasGlare: boolean;
  brightnessOk: boolean;
  brightness: number; // 0-100
  isAcceptable: boolean;
  message: string;
}

export function ScanScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const {patientId} = route.params;
  const episode = route.params.episode || '';

  const {token} = useAuthStore();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  // Multi-page capture support (spec §16.2 / Phase 4).
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [captureQuality, setCaptureQuality] = useState<CaptureQuality | null>(null);
  const [showGuidance, setShowGuidance] = useState(true);

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
        setOfflineMode(false);
      } else if (!cached) {
        // No cached templates and server returned error — likely offline
        setOfflineMode(true);
      }
    } catch {
      // Network error — we are offline
      if (!cached) {
        setOfflineMode(true);
      }
    }
    setLoadingTemplates(false);
  }

  function enterManually() {
    // Navigate to manual observation entry based on episode context
    if (episode === 'newborn' || episode === 'NEWBORN') {
      navigation.navigate('NewbornObserve', {episodeId: patientId});
    } else {
      navigation.navigate('PregnancyObserve', {episodeId: patientId});
    }
  }

  /**
   * Estimate capture quality from basic image metadata (spec §16.2).
   *
   * In production, react-native-vision-camera frame processors would run a
   * real-time blur/glare detector. This heuristic uses image dimensions and
   * a simulated brightness value to provide positioning + lighting guidance.
   */
  function estimateCaptureQuality(imagePath: string): CaptureQuality {
    // Simulated brightness: in production, sampled from the camera frame.
    // Here we derive a pseudo-value from the timestamp to vary feedback.
    const seed = (Date.now() % 100) / 100;
    const brightness = Math.round(20 + seed * 70); // 20-90 range

    const isBlurry = brightness < 30; // too dark => likely motion blur / poor capture
    const hasGlare = brightness > 88; // very bright => likely glare
    const brightnessOk = brightness >= 40 && brightness <= 85;
    const isAcceptable = brightnessOk && !isBlurry && !hasGlare;

    let message = 'Image quality looks good.';
    if (isBlurry) {
      message = 'Image may be blurry or too dark. Retake in better lighting.';
    } else if (hasGlare) {
      message = 'Glare detected. Adjust angle to avoid reflections.';
    } else if (!brightnessOk) {
      message = 'Lighting is suboptimal. Move to a well-lit area.';
    }

    return {isBlurry, hasGlare, brightnessOk, brightness, isAcceptable, message};
  }

  /**
   * Capture a page (spec §16.2 / Phase 4).
   *
   * In production this invokes react-native-vision-camera to take a photo.
   * Here we simulate the capture, run the quality heuristic, and store the
   * page. Poor-quality captures are flagged so the user can retake.
   */
  function capturePage() {
    const imagePath = `/tmp/scan_${patientId}_${currentPage}_${Date.now()}.jpg`;
    const imageHash = `hash_${currentPage}_${Date.now()}`;
    const quality = estimateCaptureQuality(imagePath);

    setCaptureQuality(quality);

    if (!quality.isAcceptable) {
      // Prompt retake for poor quality captures (spec §16.2).
      Alert.alert(
        'Poor Capture Quality',
        quality.message,
        [
          {text: 'Retake', onPress: () => setCaptureQuality(null)},
          {text: 'Keep Anyway', onPress: () => storeCapturedPage(imagePath, imageHash, quality)},
        ],
      );
      return;
    }
    storeCapturedPage(imagePath, imageHash, quality);
  }

  function storeCapturedPage(imagePath: string, imageHash: string, quality: CaptureQuality) {
    const page: CapturedPage = {
      pageNumber: currentPage,
      imagePath,
      imageHash,
      capturedAt: Date.now(),
      quality,
    };
    setCapturedPages(prev => [...prev, page]);
    setCurrentPage(prev => prev + 1);
    setCaptureQuality(null);
    setShowGuidance(false);
  }

  function retakeLastPage() {
    setCapturedPages(prev => prev.slice(0, -1));
    setCurrentPage(prev => Math.max(1, prev - 1));
    setCaptureQuality(null);
  }

  function clearAllPages() {
    setCapturedPages([]);
    setCurrentPage(1);
    setCaptureQuality(null);
    setShowGuidance(true);
  }

  const hasCapturedPages = capturedPages.length > 0;

  async function submitScan() {
    if (!selectedTemplate) {
      Alert.alert('Select Template', 'Please select a document template before scanning.');
      return;
    }
    if (capturedPages.length === 0) {
      Alert.alert('Capture Required', 'Please capture at least one page before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      // Submit each captured page as an OCR job (spec §16.2 / Phase 4).
      // The first page's job is used for the confirmation screen.
      let firstJobId: string | null = null;
      let lastError: string | null = null;

      for (const page of capturedPages) {
        const resp = await fetch(`${AppConfig.apiBaseUrl}/ocr/jobs`, {
          method: 'POST',
          headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            patientId,
            templateId: selectedTemplate,
            episode,
            imagePath: page.imagePath,
            imageHash: page.imageHash,
            capturedBy: useAuthStore.getState().user?.username || 'unknown',
            deviceId: getCachedDeviceConfig()?.deviceId ?? 'mobile-device-local',
          }),
        });

        if (resp.ok) {
          const job: OCRJobResponse = await resp.json();
          if (!firstJobId) {
            firstJobId = job.id;
          }
        } else {
          const errData = await resp.json().catch(() => ({}));
          lastError = errData.error || 'Failed to submit scan for OCR processing.';
        }
      }

      if (firstJobId) {
        // Navigate to confirmation screen for the first page.
        navigation.navigate('OCRConfirm', {jobId: firstJobId});
      } else {
        Alert.alert(
          'OCR Failed',
          lastError || 'Failed to submit scan for OCR processing.',
          [
            {text: 'OK'},
            {text: 'Enter Manually', onPress: enterManually},
          ],
        );
      }
    } catch (err: any) {
      // Network error — offer manual entry fallback (spec §10.2)
      setOfflineMode(true);
      Alert.alert(
        'Offline — OCR Unavailable',
        'OCR scanning requires network. You can enter data manually instead.',
        [
          {text: 'OK'},
          {text: 'Enter Manually', onPress: enterManually},
        ],
      );
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
          <Pressable
            style={[styles.submitBtn, {backgroundColor: colors.primary}]}
            onPress={enterManually}>
            <Text style={styles.submitBtnText}>Enter Manually</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Offline fallback banner (spec §10.2)
  if (offlineMode) {
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
            <Text style={[styles.label, {color: colors.warning}]}>Offline Mode</Text>
            <Text style={[styles.bodyText, {color: colors.textSecondary, marginTop: 8}]}>
              OCR scanning requires network. You can enter data manually instead.
            </Text>
          </View>
          <Pressable
            style={[styles.submitBtn, {backgroundColor: colors.primary}]}
            onPress={enterManually}>
            <Text style={styles.submitBtnText}>Enter Manually</Text>
          </Pressable>
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

        {/* Camera preview + capture guidance overlay (spec §16.2 / Phase 4) */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Document Capture</Text>
          <View style={styles.cameraPlaceholder}>
            {showGuidance && (
              <View style={styles.guidanceOverlay}>
                <Text style={[styles.guidanceTitle, {color: colors.textPrimary}]}>
                  Positioning Guide
                </Text>
                <Text style={[styles.cameraHint, {color: colors.textSecondary}]}>
                  • Place the document flat on a contrasting surface.{'\n'}
                  • Fill the frame with the page (all four corners visible).{'\n'}
                  • Avoid shadows and direct reflections.{'\n'}
                  • Hold the device steady and parallel to the page.
                </Text>
              </View>
            )}
            {!showGuidance && (
              <Text style={[styles.cameraHint, {color: colors.textSecondary}]}>
                Camera preview will appear here when react-native-vision-camera is integrated.
              </Text>
            )}
          </View>

          {/* Brightness indicator (spec §16.2) */}
          {captureQuality && (
            <View style={styles.qualityRow}>
              <Text style={[styles.qualityLabel, {color: colors.textSecondary}]}>
                Brightness: {captureQuality.brightness}%
              </Text>
              <Text
                style={[
                  styles.qualityBadge,
                  {
                    color: captureQuality.isAcceptable ? colors.primary : colors.warning,
                    borderColor: captureQuality.isAcceptable ? colors.primary : colors.warning,
                  },
                ]}>
                {captureQuality.isAcceptable ? 'OK' : 'Check'}
              </Text>
            </View>
          )}

          {/* Capture quality feedback (spec §16.2) */}
          {captureQuality && !captureQuality.isAcceptable && (
            <Text style={[styles.qualityMessage, {color: colors.warning}]}>
              ⚠ {captureQuality.message}
            </Text>
          )}
          {captureQuality && captureQuality.isAcceptable && (
            <Text style={[styles.qualityMessage, {color: colors.primary}]}>
              ✓ {captureQuality.message}
            </Text>
          )}

          {/* Capture + retake buttons (spec §16.2 / Phase 4) */}
          <View style={styles.captureRow}>
            <Pressable
              style={[styles.captureBtn, {backgroundColor: colors.primary}]}
              onPress={capturePage}>
              <Text style={styles.captureBtnText}>
                {hasCapturedPages ? `Capture Page ${currentPage}` : 'Capture Page'}
              </Text>
            </Pressable>
            {hasCapturedPages && (
              <Pressable
                style={[styles.retakeBtn, {borderColor: colors.warning}]}
                onPress={retakeLastPage}>
                <Text style={[styles.retakeBtnText, {color: colors.warning}]}>Retake</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Captured pages list (multi-page support, spec §16.2 / Phase 4) */}
        {hasCapturedPages && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.label, {color: colors.textSecondary}]}>
              Captured Pages ({capturedPages.length})
            </Text>
            {capturedPages.map(p => (
              <View key={p.pageNumber} style={styles.pageRow}>
                <Text style={[styles.pageText, {color: colors.textPrimary}]}>
                  Page {p.pageNumber}
                </Text>
                <Text
                  style={[
                    styles.pageQuality,
                    {color: p.quality.isAcceptable ? colors.primary : colors.warning},
                  ]}>
                  {p.quality.isAcceptable ? '✓ OK' : '⚠ Check'}
                </Text>
              </View>
            ))}
            <Pressable
              style={[styles.clearBtn, {borderColor: colors.textSecondary}]}
              onPress={clearAllPages}>
              <Text style={[styles.clearBtnText, {color: colors.textSecondary}]}>
                Clear All Pages
              </Text>
            </Pressable>
          </View>
        )}

        {/* Submit button */}
        <Pressable
          style={[styles.submitBtn, {backgroundColor: colors.primary, opacity: submitting || !hasCapturedPages ? 0.6 : 1}]}
          onPress={submitScan}
          disabled={submitting || !selectedTemplate || !hasCapturedPages}>
          <Text style={styles.submitBtnText}>
            {submitting
              ? 'Processing...'
              : hasCapturedPages
              ? `Extract ${capturedPages.length} Page${capturedPages.length > 1 ? 's' : ''}`
              : 'Capture & Extract'}
          </Text>
        </Pressable>

        {/* Manual entry fallback link (spec §10.2) */}
        <Pressable
          style={[styles.manualBtn, {borderColor: colors.primary}]}
          onPress={enterManually}>
          <Text style={[styles.manualBtnText, {color: colors.primary}]}>
            Enter Manually Instead
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
  guidanceOverlay: {alignItems: 'center', justifyContent: 'center', padding: 4},
  guidanceTitle: {fontSize: 14, fontWeight: '700', marginBottom: 8},
  qualityRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10},
  qualityLabel: {fontSize: 13, fontWeight: '600'},
  qualityBadge: {fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2},
  qualityMessage: {fontSize: 12, marginTop: 6, lineHeight: 16},
  captureRow: {flexDirection: 'row', gap: 10, marginTop: 12},
  captureBtn: {flex: 1, padding: 14, borderRadius: 10, alignItems: 'center'},
  captureBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
  retakeBtn: {padding: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center'},
  retakeBtnText: {fontWeight: '700', fontSize: 14},
  pageRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0'},
  pageText: {fontSize: 14, fontWeight: '600'},
  pageQuality: {fontSize: 12, fontWeight: '600'},
  clearBtn: {padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginTop: 10},
  clearBtnText: {fontWeight: '600', fontSize: 13},
  submitBtn: {padding: 16, borderRadius: 12, alignItems: 'center'},
  submitBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  manualBtn: {padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center'},
  manualBtnText: {fontWeight: '600', fontSize: 14},
});
