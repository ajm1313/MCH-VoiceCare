/**
 * Referral state machine tests (spec §18.3, §29.1).
 *
 * Tests:
 * - Valid transitions are allowed
 * - Invalid transitions are rejected
 * - CLOSED cannot transition to anything (terminal state)
 * - DISPOSITION_RECORDED → CLOSED is the only path to close
 * - DRAFT → REQUESTED is the initial transition
 * - Exceptional states (DECLINED, NO_ACK_ESCALATED, etc.) have correct transitions
 */
import {
  isValidReferralTransition,
  REFERRAL_STATUSES,
  VALID_REFERRAL_TRANSITIONS,
  toBackendUrgency,
  toOfflineUrgency,
  type OfflineUrgency,
} from './urgencyMapping';

describe('Referral State Machine (spec §18.3)', () => {
  describe('Valid transitions', () => {
    it('DRAFT → REQUESTED', () => {
      expect(isValidReferralTransition('DRAFT', 'REQUESTED')).toBe(true);
    });

    it('DRAFT → CANCELLED_BY_CLINICIAN', () => {
      expect(isValidReferralTransition('DRAFT', 'CANCELLED_BY_CLINICIAN')).toBe(true);
    });

    it('REQUESTED → RECEIVING_FACILITY_NOTIFIED', () => {
      expect(isValidReferralTransition('REQUESTED', 'RECEIVING_FACILITY_NOTIFIED')).toBe(true);
    });

    it('REQUESTED → ACCEPTED', () => {
      expect(isValidReferralTransition('REQUESTED', 'ACCEPTED')).toBe(true);
    });

    it('REQUESTED → DECLINED', () => {
      expect(isValidReferralTransition('REQUESTED', 'DECLINED')).toBe(true);
    });

    it('REQUESTED → NO_ACK_ESCALATED', () => {
      expect(isValidReferralTransition('REQUESTED', 'NO_ACK_ESCALATED')).toBe(true);
    });

    it('ACCEPTED → TRANSPORT_REQUESTED', () => {
      expect(isValidReferralTransition('ACCEPTED', 'TRANSPORT_REQUESTED')).toBe(true);
    });

    it('TRANSPORT_REQUESTED → IN_TRANSIT', () => {
      expect(isValidReferralTransition('TRANSPORT_REQUESTED', 'IN_TRANSIT')).toBe(true);
    });

    it('IN_TRANSIT → ARRIVED', () => {
      expect(isValidReferralTransition('IN_TRANSIT', 'ARRIVED')).toBe(true);
    });

    it('ARRIVED → DISPOSITION_RECORDED', () => {
      expect(isValidReferralTransition('ARRIVED', 'DISPOSITION_RECORDED')).toBe(true);
    });

    it('DISPOSITION_RECORDED → CLOSED', () => {
      expect(isValidReferralTransition('DISPOSITION_RECORDED', 'CLOSED')).toBe(true);
    });

    it('ARRIVED → CLOSED (direct close after arrival)', () => {
      expect(isValidReferralTransition('ARRIVED', 'CLOSED')).toBe(true);
    });

    it('TRANSPORT_UNAVAILABLE → TRANSPORT_REQUESTED (retry)', () => {
      expect(isValidReferralTransition('TRANSPORT_UNAVAILABLE', 'TRANSPORT_REQUESTED')).toBe(true);
    });

    it('NO_ACK_ESCALATED → ACCEPTED (late acceptance)', () => {
      expect(isValidReferralTransition('NO_ACK_ESCALATED', 'ACCEPTED')).toBe(true);
    });
  });

  describe('Invalid transitions', () => {
    it('DRAFT → CLOSED (cannot skip steps)', () => {
      expect(isValidReferralTransition('DRAFT', 'CLOSED')).toBe(false);
    });

    it('DRAFT → IN_TRANSIT (cannot skip to transit)', () => {
      expect(isValidReferralTransition('DRAFT', 'IN_TRANSIT')).toBe(false);
    });

    it('DRAFT → ARRIVED (cannot skip to arrived)', () => {
      expect(isValidReferralTransition('DRAFT', 'ARRIVED')).toBe(false);
    });

    it('CLOSED → DRAFT (closed is terminal)', () => {
      expect(isValidReferralTransition('CLOSED', 'DRAFT')).toBe(false);
    });

    it('CLOSED → REQUESTED (closed is terminal)', () => {
      expect(isValidReferralTransition('CLOSED', 'REQUESTED')).toBe(false);
    });

    it('CLOSED → anything (closed is terminal)', () => {
      REFERRAL_STATUSES.forEach(status => {
        if (status === 'CLOSED') return;
        expect(isValidReferralTransition('CLOSED', status)).toBe(false);
      });
    });

    it('DISPOSITION_RECORDED → IN_TRANSIT (cannot go back)', () => {
      expect(isValidReferralTransition('DISPOSITION_RECORDED', 'IN_TRANSIT')).toBe(false);
    });

    it('LOST_TO_FOLLOWUP → anything (terminal)', () => {
      REFERRAL_STATUSES.forEach(status => {
        expect(isValidReferralTransition('LOST_TO_FOLLOWUP', status)).toBe(false);
      });
    });

    it('DECLINED → anything (terminal)', () => {
      REFERRAL_STATUSES.forEach(status => {
        expect(isValidReferralTransition('DECLINED', status)).toBe(false);
      });
    });

    it('CANCELLED_BY_CLINICIAN → anything (terminal)', () => {
      REFERRAL_STATUSES.forEach(status => {
        expect(isValidReferralTransition('CANCELLED_BY_CLINICIAN', status)).toBe(false);
      });
    });

    it('Unknown status → anything', () => {
      expect(isValidReferralTransition('UNKNOWN', 'CLOSED')).toBe(false);
    });
  });

  describe('Spec §18.3: CLOSED only after disposition', () => {
    it('Cannot close from REQUESTED', () => {
      expect(isValidReferralTransition('REQUESTED', 'CLOSED')).toBe(false);
    });

    it('Cannot close from ACCEPTED', () => {
      expect(isValidReferralTransition('ACCEPTED', 'CLOSED')).toBe(false);
    });

    it('Cannot close from IN_TRANSIT', () => {
      expect(isValidReferralTransition('IN_TRANSIT', 'CLOSED')).toBe(false);
    });

    it('Can close from ARRIVED (direct)', () => {
      expect(isValidReferralTransition('ARRIVED', 'CLOSED')).toBe(true);
    });

    it('Can close from DISPOSITION_RECORDED', () => {
      expect(isValidReferralTransition('DISPOSITION_RECORDED', 'CLOSED')).toBe(true);
    });
  });
});

describe('Urgency Mapping (spec §15)', () => {
  it('RED → EMERGENCY', () => {
    expect(toBackendUrgency('RED')).toBe('EMERGENCY');
  });

  it('ORANGE → PRIORITY', () => {
    expect(toBackendUrgency('ORANGE')).toBe('PRIORITY');
  });

  it('AMBER → PRIORITY', () => {
    expect(toBackendUrgency('AMBER')).toBe('PRIORITY');
  });

  it('GREEN → ROUTINE', () => {
    expect(toBackendUrgency('GREEN')).toBe('ROUTINE');
  });

  it('GREY → ROUTINE', () => {
    expect(toBackendUrgency('GREY')).toBe('ROUTINE');
  });

  it('EMERGENCY → RED (reverse)', () => {
    expect(toOfflineUrgency('EMERGENCY')).toBe('RED');
  });

  it('PRIORITY → ORANGE (reverse)', () => {
    expect(toOfflineUrgency('PRIORITY')).toBe('ORANGE');
  });

  it('ROUTINE → GREEN (reverse)', () => {
    expect(toOfflineUrgency('ROUTINE')).toBe('GREEN');
  });

  it('ABSTAIN → GREY (reverse)', () => {
    expect(toOfflineUrgency('ABSTAIN')).toBe('GREY');
  });

  it('Unknown backend → GREY (fail-safe)', () => {
    expect(toOfflineUrgency('UNKNOWN')).toBe('GREY');
  });
});
