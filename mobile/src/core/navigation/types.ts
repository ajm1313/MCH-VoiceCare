/**
 * Navigation route param types for the native-stack navigator.
 */
export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  // Pregnancy
  PregnancyList: undefined;
  PregnancyRegister: undefined;
  PregnancyDetail: { episodeId: string };
  PregnancyObserve: { episodeId: string };
  VoiceRecord: { episodeId: string };
  PregnancyAssessment: { assessmentId: string };
  PregnancyClose: { episodeId: string };
  PregnancyTransfer: { episodeId: string };
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
  // Notifications
  TaskList: undefined;
  NotificationDetail: { notificationId: string };
  // Referrals
  ReferralList: undefined;
  ReferralDetail: { referralId: string };
  ReferralCreate: { pregnancyEpisodeId?: string; newbornEpisodeId?: string } | undefined;
  ReferralQrSlip: { referralId: string };
  CapabilityList: undefined;
  CapabilityForm: { capabilityId?: string };
  // Profiling
  ProfileList: undefined;
  ProfileDetail: { profileId: string };
  ProfileGenerate: undefined;
  // Clients
  PersonList: undefined;
  PersonDetail: { personId: string };
  PersonForm: { personId?: string };
  HouseholdList: undefined;
  HouseholdForm: { householdId?: string };
  // Communications
  CampaignList: undefined;
  CampaignDetail: { campaignId: string };
  CampaignForm: { campaignId?: string };
  TemplateList: undefined;
  TemplateForm: { templateId?: string };
  TemplateDetail: { templateId: string };
  // Reporting
  ReportList: undefined;
  ReportDetail: { reportId: string };
  ReportGenerate: undefined;
  ScheduledReportForm: { scheduledId?: string };
  // Admin
  IntegrationList: undefined;
  IntegrationForm: { integrationId?: string };
  OrgUnitList: undefined;
  OrgUnitForm: { orgUnitId?: string };
  OrgUnitDelete: { orgUnitId: string };
  UserList: undefined;
  UserForm: { userId?: string };
  RoleScopeAssign: { userId: string };
  AuditList: undefined;
  // System
  SyncStatus: undefined;
  Monitoring: undefined;
  ClinicianOverride: { episodeId: string; episodeType: string; priorRecommendation: string };
  // OCR (spec §16)
  OCRScan: { patientId: string; episode?: string };
  OCRConfirm: { jobId: string };
};
