/**
 * Clinical input validation — MCHVC-SPEC-001 v1.1 §11.
 *
 * Centralised validation module that performs 7 validation types on
 * clinical observations before they are committed or synced:
 *
 *   TYPE         — correct scalar / category / date type
 *   UNIT         — allowed unit or convertible
 *   RANGE        — plausible physiological range
 *   REQUIRED     — required fields present
 *   CROSS_FIELD  — mutual coherence between related fields
 *   CONFIDENCE   — OCR confidence meets threshold
 *   TEMPLATE     — template version is known
 *
 * Returns a disposition:
 *   PASS               — all checks passed
 *   CONFIRM_REQUIRED   — confidence low; human confirmation needed
 *   BLOCK_AND_REENTER  — required field failed; must re-enter
 *   ABSTAIN            — critical fields missing; cannot classify
 */

// --- Enums ---

export enum ValidationType {
  TYPE = 'TYPE',
  UNIT = 'UNIT',
  RANGE = 'RANGE',
  REQUIRED = 'REQUIRED',
  CROSS_FIELD = 'CROSS_FIELD',
  CONFIDENCE = 'CONFIDENCE',
  TEMPLATE = 'TEMPLATE',
}

export enum ValidationDisposition {
  PASS = 'PASS',
  CONFIRM_REQUIRED = 'CONFIRM_REQUIRED',
  BLOCK_AND_REENTER = 'BLOCK_AND_REENTER',
  ABSTAIN = 'ABSTAIN',
}

// --- Interfaces ---

export interface FailingCheck {
  type: ValidationType;
  field: string;
  message: string;
}

export interface ValidationResult {
  disposition: ValidationDisposition;
  failingChecks: FailingCheck[];
}

export type FieldType = 'number' | 'string' | 'boolean' | 'category' | 'date';

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  allowedCategories?: string[];
  allowedUnits?: string[];
  unitField?: string;
  min?: number;
  max?: number;
  ocrConfidenceField?: string;
  ocrConfidenceThreshold?: number;
  templateVersionField?: string;
  knownTemplateVersions?: string[];
}

// --- Defaults ---

const DEFAULT_OCR_CONFIDENCE_THRESHOLD = 0.8;

// --- Validation helpers ---

function isNullOrUndefined(value: any): boolean {
  return value === null || value === undefined;
}

function checkType(field: string, value: any, def: FieldDef): FailingCheck | null {
  if (isNullOrUndefined(value)) return null;
  switch (def.type) {
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { type: ValidationType.TYPE, field, message: `${field} must be a number` };
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        return { type: ValidationType.TYPE, field, message: `${field} must be a string` };
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { type: ValidationType.TYPE, field, message: `${field} must be a boolean` };
      }
      break;
    case 'category':
      if (def.allowedCategories && !def.allowedCategories.includes(String(value))) {
        return {
          type: ValidationType.TYPE,
          field,
          message: `${field} must be one of: ${def.allowedCategories.join(', ')}`,
        };
      }
      break;
    case 'date': {
      if (typeof value !== 'string' || isNaN(Date.parse(value))) {
        return { type: ValidationType.TYPE, field, message: `${field} must be a valid ISO date string` };
      }
      break;
    }
  }
  return null;
}

function checkUnit(field: string, value: any, def: FieldDef, fields: Record<string, any>): FailingCheck | null {
  if (!def.allowedUnits || !def.unitField) return null;
  if (isNullOrUndefined(value)) return null;
  const unit = fields[def.unitField];
  if (isNullOrUndefined(unit)) {
    return { type: ValidationType.UNIT, field, message: `${def.unitField} is required when ${field} is provided` };
  }
  if (!def.allowedUnits.includes(String(unit))) {
    return {
      type: ValidationType.UNIT,
      field,
      message: `${def.unitField} must be one of: ${def.allowedUnits.join(', ')}`,
    };
  }
  return null;
}

function checkRange(field: string, value: any, def: FieldDef): FailingCheck | null {
  if (def.type !== 'number' || isNullOrUndefined(value)) return null;
  const num = Number(value);
  if (def.min !== undefined && num < def.min) {
    return { type: ValidationType.RANGE, field, message: `${field}=${num} is below minimum ${def.min}` };
  }
  if (def.max !== undefined && num > def.max) {
    return { type: ValidationType.RANGE, field, message: `${field}=${num} is above maximum ${def.max}` };
  }
  return null;
}

function checkRequired(field: string, value: any, def: FieldDef): FailingCheck | null {
  if (!def.required) return null;
  if (isNullOrUndefined(value) || value === '') {
    return { type: ValidationType.REQUIRED, field, message: `${field} is required` };
  }
  return null;
}

function checkCrossField(fields: Record<string, any>): FailingCheck[] {
  const failures: FailingCheck[] = [];
  // Blood pressure coherence: systolic must exceed diastolic
  const sys = fields['bp_systolic_mm_hg'] ?? fields['bp_systolic'];
  const dia = fields['bp_diastolic_mm_hg'] ?? fields['bp_diastolic'];
  if (sys != null && dia != null && sys <= dia) {
    failures.push({
      type: ValidationType.CROSS_FIELD,
      field: 'bp_systolic_mm_hg',
      message: 'Systolic blood pressure must be greater than diastolic',
    });
  }
  return failures;
}

function checkConfidence(fields: Record<string, any>, fieldDefs: FieldDef[]): FailingCheck | null {
  for (const def of fieldDefs) {
    if (!def.ocrConfidenceField) continue;
    const confidence = fields[def.ocrConfidenceField];
    if (isNullOrUndefined(confidence)) continue;
    const threshold = def.ocrConfidenceThreshold ?? DEFAULT_OCR_CONFIDENCE_THRESHOLD;
    if (typeof confidence === 'number' && confidence < threshold) {
      return {
        type: ValidationType.CONFIDENCE,
        field: def.ocrConfidenceField,
        message: `OCR confidence ${confidence} is below threshold ${threshold}`,
      };
    }
  }
  return null;
}

function checkTemplate(fields: Record<string, any>, fieldDefs: FieldDef[]): FailingCheck | null {
  for (const def of fieldDefs) {
    if (!def.templateVersionField) continue;
    const version = fields[def.templateVersionField];
    if (isNullOrUndefined(version)) continue;
    if (def.knownTemplateVersions && !def.knownTemplateVersions.includes(String(version))) {
      return {
        type: ValidationType.TEMPLATE,
        field: def.templateVersionField,
        message: `Template version ${version} is not in known versions: ${def.knownTemplateVersions.join(', ')}`,
      };
    }
  }
  return null;
}

// --- Main entry point ---

/**
 * Validate a clinical observation against a set of field definitions.
 *
 * Returns PASS if all checks pass, BLOCK_AND_REENTER if required fields fail,
 * CONFIRM_REQUIRED if confidence is low, ABSTAIN if critical fields are missing.
 */
export function validateObservation(
  fields: Record<string, any>,
  fieldDefs: FieldDef[],
): ValidationResult {
  const failingChecks: FailingCheck[] = [];

  let hasRequiredFailure = false;
  let hasConfidenceFailure = false;
  let hasCriticalMissing = false;

  for (const def of fieldDefs) {
    const value = fields[def.name];

    // REQUIRED
    const reqFail = checkRequired(def.name, value, def);
    if (reqFail) {
      failingChecks.push(reqFail);
      hasRequiredFailure = true;
      if (def.required) {
        hasCriticalMissing = true;
      }
    }

    // TYPE (only if value is present)
    const typeFail = checkType(def.name, value, def);
    if (typeFail) failingChecks.push(typeFail);

    // UNIT
    const unitFail = checkUnit(def.name, value, def, fields);
    if (unitFail) failingChecks.push(unitFail);

    // RANGE
    const rangeFail = checkRange(def.name, value, def);
    if (rangeFail) failingChecks.push(rangeFail);
  }

  // CROSS_FIELD
  failingChecks.push(...checkCrossField(fields));

  // CONFIDENCE
  const confFail = checkConfidence(fields, fieldDefs);
  if (confFail) {
    failingChecks.push(confFail);
    hasConfidenceFailure = true;
  }

  // TEMPLATE
  const templateFail = checkTemplate(fields, fieldDefs);
  if (templateFail) failingChecks.push(templateFail);

  // Determine disposition
  let disposition: ValidationDisposition;
  if (hasCriticalMissing) {
    disposition = ValidationDisposition.BLOCK_AND_REENTER;
  } else if (hasConfidenceFailure) {
    disposition = ValidationDisposition.CONFIRM_REQUIRED;
  } else if (failingChecks.length > 0) {
    disposition = ValidationDisposition.BLOCK_AND_REENTER;
  } else {
    disposition = ValidationDisposition.PASS;
  }

  return { disposition, failingChecks };
}
