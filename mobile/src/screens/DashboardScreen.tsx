/**
 * Dashboard screen — UX-003. Shows urgency summary cards and module
 * navigation. Sync queue depth badge reflects offline outbox state.
 *
 * All clinical modules are accessible from the dashboard:
 * Pregnancy, Newborn, Immunisation, Growth, Referrals, OCR, Voice,
 * plus support tools and admin modules.
 *
 * UX-003: restyled with the shared design system primitives and SVG
 * icons. Clinical behaviour, queries, navigation targets and
 * accessibility labels are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useAuthStore} from '../core/auth/authStore';
import {useIsAdmin, useIsSuperAdmin} from '../core/auth/useIsAdmin';
import {getQueueDepth} from '../core/sync/outbox';
import {subscribeToSyncDepth, syncFull} from '../core/sync/engine';
import {brand, urgency} from '../theme/colors';
import {useTheme} from '../theme/useTheme';
import {border, radius, space, elevation, pressedStyle, MIN_TOUCH} from '../theme/tokens';
import {checkRulePackageStatus, type RulePackageStatus} from '../core/rules/rulePackage';
import {query} from '../core/db/database';
import {getCachedDashboard} from '../core/sync/dashboardSync';
import {BottomTabBar} from '../components/BottomTabBar';
import {Icon, type IconName} from '../components/ui/Icon';
import {AppText} from '../components/ui/Text';
import {UrgencyBadge} from '../components/ui/Badge';
import {StatCard, SectionHeader, ListRow} from '../components/ui/Layout';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

type NavTarget =
  | 'TaskList'
  | 'SyncStatus'
  | 'PregnancyList'
  | 'NewbornList'
  | 'ImmunisationList'
  | 'GrowthList'
  | 'DefaulterList'
  | 'CWCSession'
  | 'ReferralList'
  | 'PersonList'
  | 'AuditList'
  | 'Scan';

interface UrgencyCard {
  key: 'RED' | 'ORANGE' | 'AMBER' | 'GREY';
  label: string;
  description: string;
  count: number;
}

interface ModuleEntry {
  label: string;
  desc: string;
  target: NavTarget;
  icon: IconName;
}

interface CareStage {
  title: string;
  icon: IconName;
  desc: string;
  accent: string;
  modules: ModuleEntry[];
}

export function DashboardScreen({navigation}: Props) {
  const {colors} = useTheme();
  const {user, logout} = useAuthStore();
  const isAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const [queueDepth, setQueueDepth] = useState(0);
  const [ruleStatus, setRuleStatus] = useState<RulePackageStatus>({
    isValid: false,
    isExpired: true,
    isSignatureVerified: false,
    version: null,
    warning: null,
  });
  const [counts, setCounts] = useState({RED: 0, ORANGE: 0, AMBER: 0, GREY: 0});
  const [quickStats, setQuickStats] = useState({overdueAssessments: 0, dosesDue: 0, defaulters: 0, pendingSync: 0});
  const [recentActivity, setRecentActivity] = useState<{label: string; sub: string; time: string; icon: IconName}[]>([]);
  const [analytics, setAnalytics] = useState({coverageRate: 0, totalChildren: 0, childrenWithDoses: 0, defaulterRate: 0, openDefaulters: 0});
  const [serverAggregate, setServerAggregate] = useState<any>(null);

  useEffect(() => {
    try {
      setQueueDepth(getQueueDepth());
      setRuleStatus(checkRulePackageStatus());
      setServerAggregate(getCachedDashboard());
    } catch {}
    const unsub = subscribeToSyncDepth(setQueueDepth);
    return unsub;
  }, []);

  useEffect(() => {
    try {
      const overdueRows = query(
        `SELECT COUNT(*) as cnt FROM notifications WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','OVERDUE') AND urgency IN ('RED','ORANGE')`,
      );
      const pendingRows = query(
        `SELECT COUNT(*) as cnt FROM outbox WHERE sync_status = 'NOT_SYNCED'`,
      );
      setQuickStats({
        overdueAssessments: Number((overdueRows[0] as any)?.cnt || 0),
        dosesDue: 0,
        defaulters: 0,
        pendingSync: Number((pendingRows[0] as any)?.cnt || 0),
      });

      const activities: {label: string; sub: string; time: string; icon: IconName}[] = [];
      const pregObs = query(`SELECT recorded_at FROM pregnancy_observations ORDER BY recorded_at DESC LIMIT 5`);
      for (const r of pregObs as any[]) {
        activities.push({label: 'Pregnancy observation', sub: 'Recorded', time: String(r.recorded_at || ''), icon: 'heart'});
      }
      activities.sort((a, b) => b.time.localeCompare(a.time));
      setRecentActivity(activities.slice(0, 5));
    } catch { /* */ }
  }, [queueDepth]);

  useEffect(() => {
    try {
      const activePregnancies = (query(`SELECT COUNT(*) as cnt FROM episodes WHERE module = 'pregnancy' AND status = 'OPEN'`)[0] as any)?.cnt || 0;
      const highRiskPregnancies = (query(`SELECT COUNT(*) as cnt FROM episodes WHERE module = 'pregnancy' AND status = 'OPEN' AND risk_class IN ('RED', 'ORANGE')`)[0] as any)?.cnt || 0;
      const totalObservations = (query(`SELECT COUNT(*) as cnt FROM pregnancy_observations`)[0] as any)?.cnt || 0;
      const highRiskRate = activePregnancies > 0 ? Math.round((highRiskPregnancies / activePregnancies) * 1000) / 10 : 0;
      setAnalytics({coverageRate: highRiskRate, totalChildren: activePregnancies, childrenWithDoses: highRiskPregnancies, defaulterRate: 0, openDefaulters: totalObservations});
    } catch { /* */ }
  }, [queueDepth]);

  useEffect(() => {
    try {
      const rows = query(
        `SELECT urgency, COUNT(*) as cnt FROM notifications
         WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'OVERDUE')
         GROUP BY urgency`,
      );
      const next = {RED: 0, ORANGE: 0, AMBER: 0, GREY: 0};
      for (const r of rows as any[]) {
        const k = String(r.urgency) as keyof typeof next;
        if (k in next) next[k] = Number(r.cnt) || 0;
      }
      setCounts(next);
    } catch { /* */ }
  }, [queueDepth]);

  const quickActions = [
    {label: 'Overdue', value: quickStats.overdueAssessments, icon: 'alertTriangle' as IconName, accent: urgency.AMBER, target: 'TaskList' as NavTarget},
    {label: 'Pending Sync', value: quickStats.pendingSync, icon: 'refresh' as IconName, accent: urgency.GREY, target: 'SyncStatus' as NavTarget},
  ];

  const cards: UrgencyCard[] = [
    {key: 'RED', label: 'Emergency', description: 'Immediate action', count: counts.RED},
    {key: 'ORANGE', label: 'Same day', description: 'Urgent today', count: counts.ORANGE},
    {key: 'AMBER', label: 'High risk', description: 'Enhanced follow-up', count: counts.AMBER},
    {key: 'GREY', label: 'Data missing', description: 'Assessment needed', count: counts.GREY},
  ];

  const careStages: CareStage[] = [
    {
      title: 'Pregnancy & Antenatal',
      icon: 'heart',
      desc: 'Active pregnancies, observations & assessments',
      accent: brand.teal,
      modules: [
        {label: 'Pregnancy', desc: 'Active episodes & assessments', target: 'PregnancyList', icon: 'heart'},
      ],
    },
    {
      title: 'Newborn Care',
      icon: 'baby',
      desc: 'Newborn episodes, observations & assessments',
      accent: '#7C3AED',
      modules: [
        {label: 'Newborn', desc: 'Newborn episodes & observations', target: 'NewbornList', icon: 'baby'},
      ],
    },
    {
      title: 'Child Health',
      icon: 'beaker',
      desc: 'Immunisation, growth monitoring & defaulter tracing',
      accent: '#059669',
      modules: [
        {label: 'Immunisation', desc: 'EPI schedule & vaccine doses', target: 'ImmunisationList', icon: 'beaker'},
        {label: 'Growth', desc: 'Growth measurements & charts', target: 'GrowthList', icon: 'clipboard'},
        {label: 'Defaulter Tracing', desc: 'Track & trace defaulters', target: 'DefaulterList', icon: 'search'},
        {label: 'CWC Sessions', desc: 'Child welfare clinic sessions', target: 'CWCSession', icon: 'home'},
      ],
    },
    {
      title: 'Referrals',
      icon: 'arrowRight',
      desc: 'Patient referral management & tracking',
      accent: urgency.RED,
      modules: [
        {label: 'Referrals', desc: 'Create & track referrals', target: 'ReferralList', icon: 'arrowRight'},
      ],
    },
    {
      title: 'Quick Capture',
      icon: 'clipboard',
      desc: 'OCR document scanning & voice recording',
      accent: '#6366F1',
      modules: [
        {label: 'OCR Scan', desc: 'Scan document with camera', target: 'Scan', icon: 'scan'},
        {label: 'Voice Record', desc: 'Select episode & record voice', target: 'PregnancyList', icon: 'heart'},
      ],
    },
  ];

  const allSupportModules: ModuleEntry[] = [
    {label: 'Tasks', desc: 'Open notifications & action items', target: 'TaskList', icon: 'clipboard'},
    {label: 'Clients', desc: 'Persons & households', target: 'PersonList', icon: 'users'},
    {label: 'Sync Status', desc: 'Last sync, queue & conflicts', target: 'SyncStatus', icon: 'refresh'},
    {label: 'Audit Log', desc: 'System audit trail', target: 'AuditList', icon: 'lock'},
  ];
  const supportModules: ModuleEntry[] = allSupportModules.filter(m =>
    m.label === 'Audit Log' ? isSuperAdmin : true,
  );

  const handleLogout = () => {
    const {hasUnsynced, count} = useAuthStore.getState().checkUnsyncedBeforeLogout();
    if (hasUnsynced) {
      Alert.alert(
        'Unsynchronised Data',
        `You have ${count} record${count > 1 ? 's' : ''} pending synchronisation. Signing out may lose this data.\n\nSign out anyway?`,
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Sign out anyway', style: 'destructive', onPress: () => logout(true).catch(() => {})},
        ],
      );
    } else {
      logout().catch(() => {});
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]} edges={['bottom']}>
      {/* ── Header ── */}
      <View style={[styles.header, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <View style={styles.headerLeft}>
          <AppText variant="h2" tone="primary">Welcome, {user?.fullName || user?.username}</AppText>
          <AppText variant="caption" tone="secondary" style={styles.role}>
            {(user?.systemRole || '').replace(/_/g, ' ')}
          </AppText>
        </View>
        <Pressable
          style={({pressed}) => [
            styles.logoutBtn,
            {backgroundColor: colors.primarySubtle},
            pressed && pressedStyle,
          ]}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sign out">
          <Icon name="arrowRight" size={16} color={colors.primary} strokeWidth={2} />
          <AppText variant="smallStrong" tone="brand">Sign out</AppText>
        </Pressable>
      </View>

      {/* ── Sync banner ── */}
      {queueDepth > 0 && (
        <Pressable
          style={({pressed}) => [
            styles.syncBanner,
            {backgroundColor: colors.warningSubtle, borderColor: colors.warning + '30'},
            pressed && pressedStyle,
          ]}
          onPress={() => syncFull()}
          accessibilityRole="button"
          accessibilityLabel={`${queueDepth} records pending sync. Tap to retry.`}>
          <Icon name="refresh" size={16} color={colors.warning} strokeWidth={2} />
          <AppText variant="smallStrong" style={{color: colors.warning, flex: 1}}>
            {queueDepth} record{queueDepth > 1 ? 's' : ''} pending sync — tap to retry
          </AppText>
        </Pressable>
      )}

      {/* ── Rule warning ── */}
      {ruleStatus.warning ? (
        <View style={[styles.ruleWarningBanner, {backgroundColor: colors.warningSubtle, borderColor: colors.warning + '30'}]}>
          <Icon name="alertTriangle" size={16} color={colors.warning} strokeWidth={2} />
          <AppText variant="small" style={{color: colors.warning, flex: 1}}>{ruleStatus.warning}</AppText>
        </View>
      ) : null}

      <FlatList
        data={cards}
        keyExtractor={(item) => item.key}
        renderItem={({item}) => (
          <View style={styles.urgencyRow}>
            <UrgencyBadge value={item.key} size="md" />
            <View style={styles.urgencyBody}>
              <AppText variant="bodyStrong" tone="primary">{item.label}</AppText>
              <AppText variant="caption" tone="secondary">{item.description}</AppText>
            </View>
            <AppText variant="h2" tone="primary" style={styles.urgencyCount}>{item.count}</AppText>
          </View>
        )}
        ListHeaderComponent={
          <View>
            {/* Analytics widgets */}
            {analytics.totalChildren > 0 ? (
              <View style={styles.sectionBlock}>
                <SectionHeader title="Pregnancy Analytics" />
                <View style={styles.statRow}>
                  <StatCard
                    label="High Risk"
                    value={`${analytics.coverageRate}%`}
                    caption={`${analytics.childrenWithDoses}/${analytics.totalChildren} pregnancies`}
                    icon="alertTriangle"
                    accentColor={urgency.AMBER}
                    style={styles.statFlex}
                  />
                  <StatCard
                    label="Observations"
                    value={String(analytics.openDefaulters)}
                    caption="Total recorded"
                    icon="clipboard"
                    accentColor={urgency.GREEN}
                    style={styles.statFlex}
                  />
                </View>
              </View>
            ) : null}

            {/* Server aggregate stats */}
            {serverAggregate ? (
              <View style={styles.sectionBlock}>
                <SectionHeader title="Server Overview" />
                <View style={styles.statRow}>
                  <StatCard
                    label="Active Preg"
                    value={String(serverAggregate.pregnancy.active)}
                    caption={serverAggregate.pregnancy.emergency > 0 ? `${serverAggregate.pregnancy.emergency} emergency` : undefined}
                    icon="heart"
                    accentColor={urgency.RED}
                    style={styles.statFlex}
                  />
                  <StatCard
                    label="Open Referrals"
                    value={String(serverAggregate.referrals.open)}
                    caption={serverAggregate.referrals.emergency > 0 ? `${serverAggregate.referrals.emergency} emergency` : undefined}
                    icon="arrowRight"
                    accentColor={urgency.AMBER}
                    style={styles.statFlex}
                  />
                </View>
              </View>
            ) : null}

            {/* Quick actions */}
            <View style={styles.sectionBlock}>
              <SectionHeader title="Quick Actions" />
              <View style={styles.statRow}>
                {quickActions.map(qa => (
                  <Pressable
                    key={qa.label}
                    style={({pressed}) => [
                      styles.statFlex,
                      pressed && pressedStyle,
                    ]}
                    onPress={() => (navigation as any).navigate(qa.target)}
                    accessibilityRole="button"
                    accessibilityLabel={`${qa.label}: ${qa.value}`}
                    accessibilityHint={`Go to ${qa.label}`}>
                    <StatCard
                      label={qa.label}
                      value={String(qa.value)}
                      icon={qa.icon}
                      accentColor={qa.accent}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.modules}>
            {/* Continuity of Care — all clinical modules */}
            <SectionHeader title="Continuity of Care" subtitle="Maternal & child health workflows" />

            {careStages.map((stage, si) => (
              <View key={si} style={styles.stageGroup}>
                <View style={[styles.stageHeader, {borderLeftColor: stage.accent, backgroundColor: colors.surface, ...elevation.sm}]}>
                  <View style={[styles.stageIconWrap, {backgroundColor: stage.accent + '15'}]}>
                    <Icon name={stage.icon} size={20} color={stage.accent} strokeWidth={1.75} />
                  </View>
                  <View style={styles.stageHeaderText}>
                    <AppText variant="bodyStrong" tone="primary">{stage.title}</AppText>
                    <AppText variant="caption" tone="secondary">{stage.desc}</AppText>
                  </View>
                </View>
                {stage.modules.map((m) => (
                  <ListRow
                    key={m.label}
                    icon={m.icon}
                    title={m.label}
                    subtitle={m.desc}
                    onPress={() => (navigation as any).navigate(m.target)}
                  />
                ))}
                {si < careStages.length - 1 ? (
                  <View style={styles.flowArrow}>
                    <Icon name="chevronDown" size={16} color={colors.primary + '60'} strokeWidth={2} />
                  </View>
                ) : null}
              </View>
            ))}

            {/* Recent Activity */}
            {recentActivity.length > 0 ? (
              <View style={styles.sectionBlock}>
                <SectionHeader title="Recent Activity" />
                {recentActivity.map((act, i) => (
                  <View key={i} style={[styles.activityRow, {borderBottomColor: colors.border + '50'}]}>
                    <View style={[styles.activityIconWrap, {backgroundColor: colors.primarySubtle}]}>
                      <Icon name={act.icon} size={16} color={colors.primary} strokeWidth={1.75} />
                    </View>
                    <View style={styles.activityBody}>
                      <AppText variant="smallStrong" tone="primary">{act.label}</AppText>
                      <AppText variant="caption" tone="secondary">{act.sub}</AppText>
                    </View>
                    <AppText variant="caption" tone="tertiary">{act.time}</AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Support Modules */}
            <View style={styles.sectionBlock}>
              <SectionHeader title={isAdmin ? 'Support & Administration' : 'Support Tools'} />
              {supportModules.map((m) => (
                <ListRow
                  key={m.label}
                  icon={m.icon}
                  title={m.label}
                  subtitle={m.desc}
                  onPress={() => (navigation as any).navigate(m.target)}
                />
              ))}
            </View>
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <BottomTabBar activeRoute="Dashboard" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[5],
    paddingVertical: space[4],
    borderBottomWidth: border.hairline,
    ...elevation.sm,
  },
  headerLeft: {flex: 1},
  role: {marginTop: 2, textTransform: 'capitalize'},
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    minHeight: MIN_TOUCH,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginHorizontal: space[4],
    marginTop: space[3],
    borderRadius: radius.md,
    borderWidth: border.thick,
  },
  ruleWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    marginHorizontal: space[4],
    borderRadius: radius.md,
    marginTop: space[2],
    borderWidth: border.thick,
  },
  list: {padding: space[4], gap: space[3]},
  sectionBlock: {marginBottom: space[4]},
  statRow: {flexDirection: 'row', gap: space[3]},
  statFlex: {flex: 1},
  urgencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: 'transparent',
    paddingVertical: space[3],
  },
  urgencyBody: {flex: 1},
  urgencyCount: {minWidth: 40, textAlign: 'right'},
  modules: {marginTop: space[6]},
  stageGroup: {marginBottom: space[3]},
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.md,
    borderLeftWidth: 4,
  },
  stageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageHeaderText: {flex: 1},
  flowArrow: {alignItems: 'center', paddingVertical: space[1]},
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: border.hairline,
  },
  activityIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: {flex: 1},
});
