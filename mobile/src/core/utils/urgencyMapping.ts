/**
 * Urgency mapping between offline rule engine classification (RED/ORANGE/AMBER/GREEN/GREY)
 * and backend UrgencyLevel enum (EMERGENCY/PRIORITY/ROUTINE/ABSTAIN).
 *
 * The offline engine uses the 5-class system for clinical display. When syncing
 * to the backend, we map to the 4-class backend enum. When pulling from the
 * backend, we map back for local display.
 */

export type OfflineUrgency = 'RED' | 'ORANGE' | 'AMBER' | 'GREEN' | 'GREY';
export type BackendUrgency = 'EMERGENCY' | 'PRIORITY' | 'ROUTINE' | 'ABSTAIN';

const OFFLINE_TO_BACKEND: Record<OfflineUrgency, BackendUrgency> = {
  RED: 'EMERGENCY',
  ORANGE: 'PRIORITY',
  AMBER: 'PRIORITY',
  GREEN: 'ROUTINE',
  GREY: 'ROUTINE',
};

const BACKEND_TO_OFFLINE: Record<BackendUrgency, OfflineUrgency> = {
  EMERGENCY: 'RED',
  PRIORITY: 'ORANGE',
  ROUTINE: 'GREEN',
  ABSTAIN: 'GREY',
};

export function toBackendUrgency(offline: OfflineUrgency): BackendUrgency {
  return OFFLINE_TO_BACKEND[offline] ?? 'ROUTINE';
}

export function toOfflineUrgency(backend: string): OfflineUrgency {
  return BACKEND_TO_OFFLINE[backend as BackendUrgency] ?? 'GREY';
}

export const REFERRAL_STATUSES = [
  'DRAFT',
  'REQUESTED',
  'RECEIVING_FACILITY_NOTIFIED',
  'ACCEPTED',
  'TRANSPORT_REQUESTED',
  'IN_TRANSIT',
  'ARRIVED',
  'DISPOSITION_RECORDED',
  'CLOSED',
  'DECLINED',
  'NO_ACK_ESCALATED',
  'TRANSPORT_UNAVAILABLE',
  'CANCELLED_BY_CLINICIAN',
  'LOST_TO_FOLLOWUP',
] as const;

export type ReferralStatus = typeof REFERRAL_STATUSES[number];

export const VALID_REFERRAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REQUESTED', 'CANCELLED_BY_CLINICIAN'],
  REQUESTED: ['RECEIVING_FACILITY_NOTIFIED', 'ACCEPTED', 'DECLINED', 'NO_ACK_ESCALATED', 'CANCELLED_BY_CLINICIAN'],
  RECEIVING_FACILITY_NOTIFIED: ['ACCEPTED', 'DECLINED', 'NO_ACK_ESCALATED', 'CANCELLED_BY_CLINICIAN'],
  ACCEPTED: ['TRANSPORT_REQUESTED', 'ARRIVED', 'DECLINED', 'CANCELLED_BY_CLINICIAN'],
  TRANSPORT_REQUESTED: ['IN_TRANSIT', 'ARRIVED', 'TRANSPORT_UNAVAILABLE', 'CANCELLED_BY_CLINICIAN'],
  IN_TRANSIT: ['ARRIVED', 'LOST_TO_FOLLOWUP'],
  ARRIVED: ['DISPOSITION_RECORDED', 'CLOSED'],
  DISPOSITION_RECORDED: ['CLOSED'],
  TRANSPORT_UNAVAILABLE: ['TRANSPORT_REQUESTED', 'CANCELLED_BY_CLINICIAN'],
  NO_ACK_ESCALATED: ['ACCEPTED', 'DECLINED', 'CANCELLED_BY_CLINICIAN'],
};

export function isValidReferralTransition(from: string, to: string): boolean {
  const allowed = VALID_REFERRAL_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export const REFERRAL_ACTIONS: {label: string; status: ReferralStatus}[] = [
  {label: 'Submit Request', status: 'REQUESTED'},
  {label: 'Acknowledge', status: 'ACCEPTED'},
  {label: 'Request Transport', status: 'TRANSPORT_REQUESTED'},
  {label: 'Mark In Transit', status: 'IN_TRANSIT'},
  {label: 'Mark Arrived', status: 'ARRIVED'},
  {label: 'Record Disposition', status: 'DISPOSITION_RECORDED'},
  {label: 'Close', status: 'CLOSED'},
  {label: 'Decline', status: 'DECLINED'},
  {label: 'Cancel', status: 'CANCELLED_BY_CLINICIAN'},
];
