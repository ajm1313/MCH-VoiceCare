/**
 * On-device OCR service (spec §16).
 *
 * Provides offline text recognition using Google ML Kit via
 * @react-native-ml-kit/text-recognition. Falls back to the native
 * OcrModule (custom bridge) if available, and finally to a no-OCR
 * fallback when neither is present.
 *
 * Safety (spec §16.3): all extracted fields MUST be human-confirmed
 * on the OCRConfirmScreen, regardless of confidence. Safety-critical
 * fields (BP, weight, gestational age) are flagged for mandatory
 * confirmation.
 */
import {NativeModules, Platform} from 'react-native';

const {OcrModule} = NativeModules;

// Lazy-load @react-native-ml-kit/text-recognition
let _mlKitLib: any = null;
function getMlKitLib(): any {
  if (_mlKitLib === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _mlKitLib = require('@react-native-ml-kit/text-recognition');
    } catch {
      _mlKitLib = undefined;
    }
  }
  return _mlKitLib;
}

export interface OcrField {
  key: string;
  value: string;
  confidence: number;
  bbox?: string[];
}

export interface OcrResult {
  text: string;
  fields: OcrField[];
  confidence: number;
  engine: 'mlkit' | 'tesseract' | 'paddle' | 'none';
  error?: string;
}

export interface OcrAvailability {
  available: boolean;
  engine: string;
}

/**
 * Check if on-device OCR is available.
 *
 * OCR is available if either:
 * 1. The custom native OcrModule is loaded, OR
 * 2. @react-native-ml-kit/text-recognition is installed
 */
export function isOcrAvailable(): OcrAvailability {
  // Check custom native module first
  if (OcrModule && Platform.OS === 'android') {
    return {available: true, engine: 'mlkit'};
  }
  // Check ML Kit library
  const mlKit = getMlKitLib();
  if (mlKit && Platform.OS === 'android') {
    return {available: true, engine: 'mlkit'};
  }
  return {available: false, engine: 'none'};
}

/**
 * Check if on-device OCR is available (async).
 *
 * This performs a more thorough check that may involve native calls.
 */
export async function checkOcrAvailability(): Promise<OcrAvailability> {
  // Check custom native module first
  if (OcrModule && Platform.OS === 'android') {
    try {
      const result = await OcrModule.isAvailable();
      return {
        available: result.available as boolean,
        engine: result.engine as string,
      };
    } catch {
      // Fall through to ML Kit check
    }
  }

  // Check ML Kit library
  const mlKit = getMlKitLib();
  if (mlKit && Platform.OS === 'android') {
    return {available: true, engine: 'mlkit'};
  }

  return {available: false, engine: 'none'};
}

/**
 * Recognize text from an image using ML Kit (offline, spec §16).
 *
 * This function tries two OCR engines in order:
 * 1. Custom native OcrModule (if available) — provides field-aware extraction
 * 2. @react-native-ml-kit/text-recognition — provides raw text recognition
 *
 * When using ML Kit directly, the raw text is passed through mapTextToFields()
 * for field extraction based on the template definitions.
 *
 * @param imageBase64OrPath  Base64-encoded image OR file:// path
 * @param templateId         Document template ID for field-aware extraction
 * @returns OcrResult with text, fields, confidence, and engine info
 */
export async function recognizeText(
  imageBase64OrPath: string,
  templateId: string,
): Promise<OcrResult> {
  // Try custom native OcrModule first
  if (OcrModule && Platform.OS === 'android') {
    try {
      const result = await OcrModule.recognizeText(imageBase64OrPath, templateId);
      return {
        text: result.text || '',
        fields: (result.fields || []).map((f: any) => ({
          key: f.key,
          value: f.value,
          confidence: f.confidence,
          bbox: f.bbox,
        })),
        confidence: result.confidence || 0,
        engine: result.engine || 'mlkit',
        error: result.error,
      };
    } catch (err: any) {
      // Fall through to ML Kit
    }
  }

  // Try @react-native-ml-kit/text-recognition
  const mlKit = getMlKitLib();
  if (mlKit && Platform.OS === 'android') {
    try {
      // ML Kit text recognition accepts a file URI or path
      const imageUri = imageBase64OrPath.startsWith('file://')
        ? imageBase64OrPath
        : imageBase64OrPath.startsWith('data:')
          ? imageBase64OrPath
          : `file://${imageBase64OrPath}`;

      const result = await mlKit.TextRecognition.recognize(imageUri);

      // ML Kit returns blocks/lines/elements with text
      const fullText = result.text || '';
      const blocks = result.blocks || [];

      // Calculate average confidence from blocks (if available)
      let totalConfidence = 0;
      let confidenceCount = 0;
      for (const block of blocks) {
        if (block.confidence) {
          totalConfidence += block.confidence;
          confidenceCount++;
        }
      }
      const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0.8;

      return {
        text: fullText,
        fields: [], // Fields are extracted by mapTextToFields() using template defs
        confidence: avgConfidence,
        engine: 'mlkit',
      };
    } catch (err: any) {
      return {
        text: '',
        fields: [],
        confidence: 0,
        engine: 'none',
        error: err?.message || 'ML Kit text recognition failed',
      };
    }
  }

  // No OCR engine available
  return {
    text: '',
    fields: [],
    confidence: 0,
    engine: 'none',
    error: 'OCR not available on this device',
  };
}

/**
 * Map raw OCR text blocks to structured fields based on template definitions.
 *
 * This applies simple regex-based field extraction for common MCH fields.
 * The backend's template-aware extraction is more sophisticated, but this
 * provides offline field extraction when no network is available.
 */
export function mapTextToFields(
  text: string,
  fieldDefinitions: Array<{key: string; label: string; type: string; safety_critical: boolean}>,
): OcrField[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const fields: OcrField[] = [];

  // Common patterns for MCH record book fields (case-insensitive)
  const patterns: Record<string, RegExp> = {
    bp_systolic: /(?:BP|bp|blood\s*pressure)[:\s]*(\d{2,3})\s*\/\s*\d{2,3}/i,
    bp_diastolic: /(?:BP|bp|blood\s*pressure)[:\s]*\d{2,3}\s*\/\s*(\d{2,3})/i,
    weight_kg: /(?:wt|weight|wt\.?)[:\s]*(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|KG|Kg)?/i,
    height_cm: /(?:ht|height|ht\.?)[:\s]*(\d{2,3}(?:\.\d{1,2})?)\s*(?:cm|CM|Cm)?/i,
    gestational_age_weeks: /(?:GA|ga|gestational\s*age)[:\s]*(\d{1,2})\s*(?:weeks?|wks?|w)?/i,
    temperature_c: /(?:temp|temperature)[:\s]*(\d{2}(?:\.\d)?)\s*(?:°?C|c)?/i,
    pulse_bpm: /(?:pulse|PR|hr|heart\s*rate)[:\s]*(\d{2,3})\s*(?:bpm|BPM)?/i,
  };

  for (const def of fieldDefinitions) {
    const pattern = patterns[def.key];
    if (pattern) {
      for (const line of lines) {
        const match = line.match(pattern);
        if (match && match[1]) {
          fields.push({
            key: def.key,
            value: match[1],
            confidence: 0.75, // heuristic extraction — lower confidence
          });
          break;
        }
      }
    }
  }

  // Also extract standalone number lines as generic fields
  for (let i = 0; i < lines.length; i++) {
    const numMatch = lines[i].match(/^(\d{1,4}(?:\.\d{1,2})?)$/);
    if (numMatch && fields.length < fieldDefinitions.length) {
      const unmatchedDef = fieldDefinitions.find(
        d => !fields.some(f => f.key === d.key),
      );
      if (unmatchedDef) {
        fields.push({
          key: unmatchedDef.key,
          value: numMatch[1],
          confidence: 0.5, // very low confidence — needs human confirmation
        });
      }
    }
  }

  return fields;
}
