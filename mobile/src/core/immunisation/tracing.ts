/**
 * Defaulter tracing workflow — mobile offline port of backend §31.
 *
 * Implements the multi-step tracing workflow for defaulters:
 * - TRACE-01: Open defaulter episode and assign to CHP
 * - TRACE-02: First attempt (SMS/IVR reminder)
 * - TRACE-03: Second attempt (phone call) after 3 days
 * - TRACE-04: Third attempt (home visit) after 7 days
 * - TRACE-05: Community locator after 14 days
 * - TRACE-06: Escalate to sub-district after 21 days
 * - TRACE-07: Close as LOST_TO_FOLLOW_UP after 28 days
 * - TRACE-08: Close as CAUGHT_UP when child is vaccinated
 *
 * Backend source: backend/apps/immunisation/tracing.py
 */
import { query, getDb } from '../db/database';
import { getConfigJSON, getConfigNumber } from '../sync/configStore';

export const TracingMethod = {
  NONE: 'NONE',
  SMS: 'SMS',
  IVR: 'IVR',
  PHONE_CALL: 'PHONE_CALL',
  HOME_VISIT: 'HOME_VISIT',
  COMMUNITY_LOCATOR: 'COMMUNITY_LOCATOR',
} as const;

export const TraceOutcome = {
  CONTACTED: 'CONTACTED',
  NO_ANSWER: 'NO_ANSWER',
  WRONG_NUMBER: 'WRONG_NUMBER',
  MOVED: 'MOVED',
  REFUSED: 'REFUSED',
  LOCATED: 'LOCATED',
} as const;

export const DefaulterStatus = {
  OPEN: 'OPEN',
  TRACING: 'TRACING',
  CAUGHT_UP: 'CAUGHT_UP',
  LOST_TO_FOLLOW_UP: 'LOST_TO_FOLLOW_UP',
  TRANSFERRED: 'TRANSFERRED',
  DECEASED: 'DECEASED',
} as const;

interface TracingStepConfig {
  method: string;
  delayDays: number;
  label: string;
}

const DEFAULT_TRACING_TIMELINE: Record<number, TracingStepConfig> = {
  1: { method: TracingMethod.SMS, delayDays: 0, label: 'TRACE-01: SMS/IVR reminder' },
  2: { method: TracingMethod.PHONE_CALL, delayDays: 3, label: 'TRACE-02: Phone call' },
  3: { method: TracingMethod.HOME_VISIT, delayDays: 7, label: 'TRACE-03: Home visit' },
  4: { method: TracingMethod.COMMUNITY_LOCATOR, delayDays: 14, label: 'TRACE-04: Community locator' },
  5: { method: 'ESCALATION', delayDays: 21, label: 'TRACE-05: Escalate to sub-district' },
  6: { method: 'CLOSE', delayDays: 28, label: 'TRACE-06: Close as lost to follow-up' },
};

function getTracingTimeline(): Record<number, TracingStepConfig> {
  const configured = getConfigJSON('CFG_TRACING_ATTEMPTS', null as any);
  if (configured && typeof configured === 'object' && 'steps' in (configured as any)) {
    return (configured as any).steps;
  }
  return DEFAULT_TRACING_TIMELINE;
}

export interface TracingStep {
  stepNumber: number;
  method: string;
  label: string;
  dueDate: string;
  isOverdue: boolean;
}

interface LocalDefaulterEpisode {
  id: string;
  child_id: string;
  child_name: string;
  defaulter_status: string;
  days_overdue: number;
  last_visit_date: string | null;
  next_due_date: string | null;
  reason: string | null;
  trace_status: string | null;
  traced_at: string | null;
  trace_notes: string | null;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(from: string, to: string): number {
  const d1 = new Date(from);
  const d2 = new Date(to);
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

/**
 * TRACE-01: Open a defaulter episode locally.
 * Does nothing if an open/tracing episode already exists for this child.
 */
export function openDefaulterEpisode(
  childId: string,
  childName: string,
  priority: string = 'P3',
  reasonCode: string = '',
): string | null {
  // Check for existing open episode
  const existing = query(
    `SELECT id FROM defaulter_episodes WHERE child_id = ? AND defaulter_status IN ('OPEN', 'TRACING') LIMIT 1`,
    [childId],
  );
  if (existing.length > 0) {
    return existing[0].id as string;
  }

  const id = `${childId}_${Date.now()}_def`;
  const now = new Date().toISOString();
  const nextReview = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

  const db = getDb();
  db.execute(
    `INSERT OR REPLACE INTO defaulter_episodes
     (id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, traced_at, trace_notes, sync_status)
     VALUES (?, ?, ?, 'OPEN', 0, ?, ?, ?, 'PENDING', NULL, NULL, 'NOT_SYNCED')`,
    [id, childId, childName, now, nextReview, reasonCode || 'Defaulter identified'],
  );

  return id;
}

/**
 * Record a tracing attempt on a defaulter episode.
 */
export function recordTracingAttempt(
  episodeId: string,
  method: string,
  outcome: string,
  notes: string = '',
): void {
  const now = new Date().toISOString();
  const db = getDb();

  let nextReviewDate: string;
  let newStatus: string;

  if (outcome === TraceOutcome.CONTACTED || outcome === TraceOutcome.LOCATED) {
    // Caregiver reached — schedule catch-up review in 7 days
    nextReviewDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    newStatus = DefaulterStatus.TRACING;
  } else {
    // Escalate to next tracing step
    newStatus = DefaulterStatus.TRACING;
    const nextStep = getNextTracingStep(episodeId);
    nextReviewDate = nextStep?.dueDate ?? new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  }

  db.execute(
    `UPDATE defaulter_episodes
     SET trace_status = ?, traced_at = ?, trace_notes = ?, next_due_date = ?, defaulter_status = ?
     WHERE id = ?`,
    [outcome, now, notes, nextReviewDate, newStatus, episodeId],
  );
}

/**
 * Determine the next tracing step based on the episode's current state.
 */
export function getNextTracingStep(episodeId: string): TracingStep | null {
  const rows = query(
    `SELECT id, child_id, trace_status, traced_at FROM defaulter_episodes WHERE id = ?`,
    [episodeId],
  );
  if (rows.length === 0) return null;

  const ep = rows[0];
  const openedAt = ep.traced_at as string ?? new Date().toISOString();
  const today = todayISO();
  const daysSinceOpen = daysBetween(openedAt, today);

  // Determine current step from trace_status (which stores the last method)
  const methodToStep: Record<string, number> = {
    PENDING: 0,
    SMS: 1,
    IVR: 1,
    NO_ANSWER: 1,
    CONTACTED: 1,
    PHONE_CALL: 2,
    HOME_VISIT: 3,
    COMMUNITY_LOCATOR: 4,
  };
  const currentStep = methodToStep[ep.trace_status as string] ?? 0;
  const nextStepNum = currentStep + 1;

  const timeline = getTracingTimeline();
  if (nextStepNum > 6) return null;

  const stepConfig = timeline[nextStepNum];
  if (!stepConfig) return null;

  const dueDate = new Date(new Date(openedAt).getTime() + stepConfig.delayDays * 86400000)
    .toISOString().split('T')[0];

  return {
    stepNumber: nextStepNum,
    method: stepConfig.method,
    label: stepConfig.label,
    dueDate,
    isOverdue: today > dueDate,
  };
}

/**
 * TRACE-05: Escalate defaulter episode to sub-district level.
 */
export function escalateToSubDistrict(episodeId: string): void {
  const db = getDb();
  db.execute(
    `UPDATE defaulter_episodes SET defaulter_status = 'TRACING', trace_notes = COALESCE(trace_notes, '') || ' [Escalated to sub-district]'
     WHERE id = ?`,
    [episodeId],
  );
}

/**
 * TRACE-07: Close episode as LOST_TO_FOLLOW_UP.
 */
export function closeAsLostToFollowUp(episodeId: string, notes: string = ''): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.execute(
    `UPDATE defaulter_episodes SET defaulter_status = 'LOST_TO_FOLLOW_UP', trace_notes = ?, traced_at = ?
     WHERE id = ?`,
    [notes || 'Auto-closed: 28 days elapsed without resolution', now, episodeId],
  );
}

/**
 * TRACE-08: Close episode as CAUGHT_UP when child has been vaccinated.
 */
export function closeAsCaughtUp(episodeId: string, childId: string, notes: string = ''): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.execute(
    `UPDATE defaulter_episodes SET defaulter_status = 'CAUGHT_UP', trace_notes = ?, traced_at = ?
     WHERE id = ?`,
    [notes || 'Child vaccinated; caught up.', now, episodeId],
  );

  // Reset child's missed session counter
  db.execute(
    'UPDATE immunisation_children SET overdue_count = 0 WHERE id = ?',
    [childId],
  );
}

/**
 * Close episode as TRANSFERRED.
 */
export function closeAsTransferred(episodeId: string, notes: string = ''): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.execute(
    `UPDATE defaulter_episodes SET defaulter_status = 'TRANSFERRED', trace_notes = ?, traced_at = ?
     WHERE id = ?`,
    [notes || 'Transferred to another facility', now, episodeId],
  );
}

/**
 * Close episode as DECEASED.
 */
export function closeAsDeceased(episodeId: string, notes: string = ''): void {
  const now = new Date().toISOString();
  const db = getDb();
  db.execute(
    `UPDATE defaulter_episodes SET defaulter_status = 'DECEASED', trace_notes = ?, traced_at = ?
     WHERE id = ?`,
    [notes || 'Death verified.', now, episodeId],
  );
}

/**
 * Get all episodes where the next review date has passed and status is still open/tracing.
 */
export function getOverdueTracingEpisodes(): LocalDefaulterEpisode[] {
  const today = todayISO();
  return query(
    `SELECT * FROM defaulter_episodes
     WHERE defaulter_status IN ('OPEN', 'TRACING') AND next_due_date < ?
     ORDER BY next_due_date`,
    [today],
  ) as unknown as LocalDefaulterEpisode[];
}

/**
 * Process all overdue tracing episodes — escalate or close as needed.
 * Designed to be called during background sync.
 */
export function processOverdueTracing(): { escalated: number; closed: number } {
  const today = todayISO();
  const episodes = getOverdueTracingEpisodes();
  let escalated = 0;
  let closed = 0;

  for (const ep of episodes) {
    const openedAt = ep.traced_at ?? today;
    const daysSinceOpen = daysBetween(openedAt, today);

    if (daysSinceOpen >= 28) {
      closeAsLostToFollowUp(ep.id);
      closed += 1;
    } else if (daysSinceOpen >= 21) {
      escalateToSubDistrict(ep.id);
      escalated += 1;
    } else {
      const nextStep = getNextTracingStep(ep.id);
      if (nextStep && nextStep.isOverdue) {
        const newReview = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
        const db = getDb();
        db.execute(
          'UPDATE defaulter_episodes SET next_due_date = ? WHERE id = ?',
          [newReview, ep.id],
        );
      }
    }
  }

  return { escalated, closed };
}
