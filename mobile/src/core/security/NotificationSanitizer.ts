/**
 * NotificationSanitizer — removes PHI from notification text (spec §22.2).
 *
 * Notifications MUST NOT expose patient names, IDs, or clinical details.
 * Instead of "Referral for [patient name]", show "New referral received".
 *
 * This module provides:
 *   - sanitizeNotificationText(text): strips known PHI patterns and replaces
 *     with generic placeholders.
 *   - getGenericNotificationText(type): returns a pre-approved generic message
 *     for a given notification type.
 */

/** Generic notification messages by type — no PHI. */
const GENERIC_MESSAGES: Record<string, string> = {
  referral_created: 'New referral received',
  referral_acknowledged: 'Referral acknowledged',
  referral_escalated: 'Referral escalation required',
  referral_completed: 'Referral completed',
  emergency_alert: 'Emergency alert — action required',
  danger_sign_detected: 'Danger sign detected — review required',
  task_assigned: 'New task assigned',
  task_overdue: 'Task overdue',
  sync_complete: 'Sync complete',
  sync_error: 'Sync error occurred',
  default: 'New notification',
};

/**
 * Patterns that may contain PHI. Each entry is a regex that matches a
 * potential PHI leak. Matched text is replaced with a generic placeholder.
 */
const PHI_PATTERNS: Array<{pattern: RegExp; replacement: string}> = [
  // Patient names after "for" or "Patient:" — e.g. "Referral for John Doe"
  {pattern: /\bfor\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g, replacement: 'for a patient'},
  // "Patient: <name>"
  {pattern: /Patient:\s*\S+/gi, replacement: 'Patient: [redacted]'},
  // Patient IDs — UUIDs
  {pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[ID redacted]'},
  // MRN-like patterns (alphanumeric, 6+ chars after "MRN")
  {pattern: /\bMRN[:\s]*[A-Z0-9]{6,}/gi, replacement: 'MRN: [redacted]'},
  // Phone numbers (Ghana format: 0XX XXX XXXX or +233...)
  {pattern: /(\+233|0)\d{2}\s?\d{3}\s?\d{4}/g, replacement: '[phone redacted]'},
  // Clinical values — BP readings
  {pattern: /\b\d{2,3}\/\d{2,3}\s?mmHg\b/gi, replacement: '[vital redacted]'},
  // Temperature readings
  {pattern: /\b\d{2}\.\d\s?°?C\b/gi, replacement: '[vital redacted]'},
  // Haemoglobin values
  {pattern: /\bHb[:\s]*\d+\.?\d*\s?g\/dL\b/gi, replacement: '[lab redacted]'},
  // Diagnosis text after "Diagnosis:" or "Dx:"
  {pattern: /\b(Diagnosis|Dx)[:\s]+[^,;\n]+/gi, replacement: 'Diagnosis: [redacted]'},
];

/**
 * Sanitize notification text by removing patient names, IDs, and clinical details.
 *
 * @param text The raw notification text that may contain PHI.
 * @returns Sanitized text with PHI replaced by generic placeholders.
 */
export function sanitizeNotificationText(text: string): string {
  if (!text) {
    return text;
  }

  let sanitized = text;

  for (const {pattern, replacement} of PHI_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Get a pre-approved generic notification message for a notification type.
 *
 * This is the preferred approach — use a known-safe message rather than
 * attempting to sanitize arbitrary text.
 *
 * @param type The notification type key (e.g. 'referral_created').
 * @returns A generic, PHI-free notification message.
 */
export function getGenericNotificationText(type: string): string {
  return GENERIC_MESSAGES[type] || GENERIC_MESSAGES.default;
}

/**
 * Check if notification text contains potential PHI.
 *
 * @param text The notification text to check.
 * @returns true if potential PHI is detected.
 */
export function containsPHI(text: string): boolean {
  if (!text) {
    return false;
  }
  for (const {pattern} of PHI_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
