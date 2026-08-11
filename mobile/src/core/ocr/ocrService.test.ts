/**
 * Tests for on-device OCR service (spec §16).
 *
 * Verifies:
 * - checkOcrAvailability returns correct structure
 * - recognizeText returns correct structure
 * - mapTextToFields extracts BP, weight, gestational age
 * - mapTextToFields handles empty text
 * - mapTextToFields handles unknown fields
 * - Fallback when no OCR engine available
 */
import {checkOcrAvailability, recognizeText, mapTextToFields} from './ocrService';

// Mock NativeModules
jest.mock('react-native', () => ({
  NativeModules: {
    OcrModule: {
      isAvailable: jest.fn(),
      recognizeText: jest.fn(),
    },
  },
  Platform: {OS: 'android'},
}));

describe('OCR Service', () => {
  describe('checkOcrAvailability', () => {
    it('returns available when OcrModule reports availability', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.OcrModule.isAvailable.mockResolvedValue({
        available: true,
        engine: 'mlkit',
      });

      const result = await checkOcrAvailability();
      expect(result.available).toBe(true);
      expect(result.engine).toBe('mlkit');
    });

    it('returns unavailable when no OCR engine', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.OcrModule.isAvailable.mockResolvedValue({
        available: false,
        engine: 'none',
      });

      const result = await checkOcrAvailability();
      expect(result.available).toBe(false);
      expect(result.engine).toBe('none');
    });
  });

  describe('recognizeText', () => {
    it('returns text and fields from OCR engine', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.OcrModule.recognizeText.mockResolvedValue({
        text: 'BP 120/80\nWeight 65kg',
        fields: [
          {key: 'block_0', value: 'BP 120/80', confidence: 0.9, bbox: ['0,0', '100,0']},
        ],
        confidence: 0.85,
        engine: 'mlkit',
      });

      const result = await recognizeText('base64data', 'template_1');
      expect(result.text).toBe('BP 120/80\nWeight 65kg');
      expect(result.engine).toBe('mlkit');
      expect(result.confidence).toBe(0.85);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].value).toBe('BP 120/80');
    });

    it('returns error result when engine is none', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.OcrModule.recognizeText.mockResolvedValue({
        text: '',
        fields: [],
        confidence: 0,
        engine: 'none',
        error: 'No OCR engine available',
      });

      const result = await recognizeText('base64data', 'template_1');
      expect(result.engine).toBe('none');
      expect(result.error).toBeDefined();
    });
  });

  describe('mapTextToFields', () => {
    const fieldDefs = [
      {key: 'bp_systolic', label: 'Systolic BP', type: 'number', safety_critical: true},
      {key: 'bp_diastolic', label: 'Diastolic BP', type: 'number', safety_critical: true},
      {key: 'weight_kg', label: 'Weight (kg)', type: 'number', safety_critical: false},
      {key: 'gestational_age_weeks', label: 'GA (weeks)', type: 'number', safety_critical: true},
    ];

    it('extracts BP from text', () => {
      const text = 'Patient Name: Ama\nBP: 120/80\nWeight: 65kg';
      const fields = mapTextToFields(text, fieldDefs);
      const systolic = fields.find(f => f.key === 'bp_systolic');
      const diastolic = fields.find(f => f.key === 'bp_diastolic');
      expect(systolic).toBeDefined();
      expect(systolic!.value).toBe('120');
      expect(diastolic).toBeDefined();
      expect(diastolic!.value).toBe('80');
    });

    it('extracts weight from text', () => {
      const text = 'Weight: 65.5 kg';
      const fields = mapTextToFields(text, fieldDefs);
      const weight = fields.find(f => f.key === 'weight_kg');
      expect(weight).toBeDefined();
      expect(weight!.value).toBe('65.5');
    });

    it('extracts gestational age', () => {
      const text = 'GA: 24 weeks';
      const fields = mapTextToFields(text, fieldDefs);
      const ga = fields.find(f => f.key === 'gestational_age_weeks');
      expect(ga).toBeDefined();
      expect(ga!.value).toBe('24');
    });

    it('returns empty array for empty text', () => {
      const fields = mapTextToFields('', fieldDefs);
      expect(fields).toHaveLength(0);
    });

    it('returns empty array for text with no recognizable fields', () => {
      const text = 'Patient visited the clinic today';
      const fields = mapTextToFields(text, fieldDefs);
      expect(fields).toHaveLength(0);
    });

    it('handles multiple BP readings (takes first)', () => {
      const text = 'BP: 140/95\nBP: 120/80';
      const fields = mapTextToFields(text, fieldDefs);
      const systolic = fields.find(f => f.key === 'bp_systolic');
      expect(systolic).toBeDefined();
      expect(systolic!.value).toBe('140');
    });
  });

  describe('ML Kit fallback (spec §16 — offline OCR)', () => {
    it('returns none engine when OcrModule throws and ML Kit not installed', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.OcrModule.recognizeText.mockRejectedValue(new Error('Native crash'));

      const result = await recognizeText('base64data', 'template_1');
      expect(result.engine).toBe('none');
      expect(result.error).toBeDefined();
    });

    it('returns none engine when no OCR available on iOS', async () => {
      // Temporarily mock Platform as iOS
      jest.doMock('react-native', () => ({
        NativeModules: {OcrModule: undefined},
        Platform: {OS: 'ios'},
      }));
      jest.resetModules();
      const {recognizeText: recognizeTextIos} = require('./ocrService');
      const result = await recognizeTextIos('base64data', 'template_1');
      expect(result.engine).toBe('none');
      expect(result.error).toBeDefined();
      jest.dontMock('react-native');
    });
  });

  describe('isOcrAvailable (sync)', () => {
    it('returns available when OcrModule is present on Android', () => {
      // Re-import with the default Android mock (not the iOS one from previous test)
      jest.resetModules();
      jest.doMock('react-native', () => ({
        NativeModules: {
          OcrModule: {
            isAvailable: jest.fn(),
            recognizeText: jest.fn(),
          },
        },
        Platform: {OS: 'android'},
      }));
      const {isOcrAvailable} = require('./ocrService');
      const result = isOcrAvailable();
      expect(result.available).toBe(true);
      expect(result.engine).toBe('mlkit');
      jest.dontMock('react-native');
    });
  });
});
