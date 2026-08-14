/**
 * Navigation route param types for the native-stack navigator.
 *
 * Only spec-required clinical screens are included (spec §10).
 * Old admin/management screens have been removed — those are
 * backend Django admin functions, not mobile app screens.
 */
export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  // Pregnancy (spec §10)
  PregnancyList: undefined;
  PregnancyRegister: undefined;
  PregnancyDetail: { episodeId: string };
  PregnancyObserve: { episodeId: string };
  PregnancyAssessment: { assessmentId: string };
  PregnancyClose: { episodeId: string };
  PregnancyTransfer: { episodeId: string };
  VoiceRecord: { episodeId: string };
  // Newborn
  NewbornList: undefined;
  NewbornRegister: undefined;
  NewbornDetail: { episodeId: string };
  NewbornObserve: { episodeId: string };
  NewbornClose: { episodeId: string };
  NewbornTransfer: { episodeId: string };
  // Immunisation
  ImmunisationList: undefined;
  ImmunisationRegister: undefined;
  ImmunisationChildDetail: { childId: string };
  ImmunisationRecordDose: { childId: string };
  DefaulterList: undefined;
  DefaulterDetail: { defaulterId: string };
  DefaulterTrace: { defaulterId: string };
  CWCSession: undefined;
  CWCDetail: { sessionId: string };
  // Growth
  GrowthList: undefined;
  GrowthDetail: { childId: string };
  GrowthRecord: { childId: string };
  GrowthChart: { childId: string };
  // Notifications / Worklist (spec §10)
  TaskList: undefined;
  NotificationDetail: { notificationId: string };
  // Referrals (spec §18)
  ReferralList: undefined;
  ReferralDetail: { referralId: string };
  ReferralCreate: { pregnancyEpisodeId?: string; newbornEpisodeId?: string } | undefined;
  ReferralQrSlip: { referralId: string };
  // Clients / Patients (spec §10)
  PersonList: undefined;
  PersonDetail: { personId: string };
  PersonForm: { personId?: string };
  // System
  SyncStatus: undefined;
  AuditList: undefined;
  ClinicianOverride: { episodeId: string; episodeType: string; priorRecommendation: string };
  // OCR (spec §16, §10 — screen named "ScanScreen")
  Scan: { patientId?: string; episode?: string };
  OCRConfirm: {
    jobId: string;
    localFields?: Array<{
      key: string;
      value: string;
      confidence: number;
      safety_critical: boolean;
      human_confirmed: boolean;
    }>;
    localEngine?: string;
  };
};
