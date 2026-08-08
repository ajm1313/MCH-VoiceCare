/**
 * Dashboard screen — UX-003. Shows urgency summary cards and module
 * navigation. Sync queue depth badge reflects offline outbox state.
 */
import React, {useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useAuthStore} from '../core/auth/authStore';
import {useIsAdmin, useIsSuperAdmin} from '../core/auth/useIsAdmin';
import {getQueueDepth} from '../core/sync/outbox';
import {subscribeToSyncDepth, syncFull} from '../core/sync/engine';
import {brand, urgency, lightColors} from '../theme/colors';
import {checkRulePackageStatus} from '../core/rules/rulePackage';
import {query} from '../core/db/database';
import {getCachedDashboard} from '../core/sync/dashboardSync';
import {BottomTabBar} from '../components/BottomTabBar';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

interface UrgencyCard {
  key: string;
  label: string;
  color: string;
  description: string;
  count: number;
}

export function DashboardScreen({navigation}: Props) {
  const {user, logout} = useAuthStore();
  const isAdmin = useIsAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const [queueDepth, setQueueDepth] = useState(getQueueDepth());
  const ruleStatus = checkRulePackageStatus();
  const [counts, setCounts] = useState({RED: 0, ORANGE: 0, AMBER: 0, GREY: 0});
  const [quickStats, setQuickStats] = useState({overdueAssessments: 0, dosesDue: 0, defaulters: 0, pendingSync: 0});
  const [recentActivity, setRecentActivity] = useState<{label: string; sub: string; time: string; icon: string}[]>([]);
  const [analytics, setAnalytics] = useState({coverageRate: 0, totalChildren: 0, childrenWithDoses: 0, defaulterRate: 0, openDefaulters: 0});
  const [serverAggregate, setServerAggregate] = useState(getCachedDashboard());

  useEffect(() => {
    const unsub = subscribeToSyncDepth(setQueueDepth);
    setServerAggregate(getCachedDashboard());
    return unsub;
  }, []);

  useEffect(() => {
    try {
      // Quick stats from local DB
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

      // Recent activity feed
      const activities: {label: string; sub: string; time: string; icon: string}[] = [];
      const pregObs = query(`SELECT recorded_at FROM pregnancy_observations ORDER BY recorded_at DESC LIMIT 5`);
      for (const r of pregObs as any[]) {
        activities.push({label: 'Pregnancy observation', sub: 'Recorded', time: String(r.recorded_at || ''), icon: '🤰'});
      }
      activities.sort((a, b) => b.time.localeCompare(a.time));
      setRecentActivity(activities.slice(0, 5));
    } catch { /* */ }
  }, [queueDepth]);

  useEffect(() => {
    try {
      // Analytics: pregnancy-focused stats
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
    {label: 'Overdue', value: quickStats.overdueAssessments, icon: '⚠️', color: urgency.ORANGE, target: 'TaskList' as const},
    {label: 'Pending Sync', value: quickStats.pendingSync, icon: '⟳', color: urgency.GREY, target: 'SyncStatus' as const},
  ];

  const cards: UrgencyCard[] = [
    {key: 'RED', label: 'RED — Emergency', color: urgency.RED, description: 'Immediate action', count: counts.RED},
    {key: 'ORANGE', label: 'ORANGE — Same day', color: urgency.ORANGE, description: 'Urgent today', count: counts.ORANGE},
    {key: 'AMBER', label: 'AMBER — High risk', color: urgency.AMBER, description: 'Enhanced follow-up', count: counts.AMBER},
    {key: 'GREY', label: 'GREY — Data missing', color: urgency.GREY, description: 'Assessment needed', count: counts.GREY},
  ];

  const careStages = [
    {
      title: 'Pregnancy & Antenatal',
      icon: '🤰',
      desc: 'Active pregnancies, observations & assessments',
      modules: [
        {label: 'Pregnancy', desc: 'Active episodes & assessments', target: 'PregnancyList' as const},
        {label: 'Profiling', desc: 'Pregnancy risk profiling', target: 'ProfileList' as const},
      ],
    },
  ];

  const supportModules = [
    {label: 'Tasks', desc: 'Open notifications & action items', target: 'TaskList' as const, adminOnly: false},
    {label: 'Referrals', desc: 'Patient referral management', target: 'ReferralList' as const, adminOnly: false},
    {label: 'Clients', desc: 'Persons & households', target: 'PersonList' as const, adminOnly: false},
    {label: 'Households', desc: 'Household registry', target: 'HouseholdList' as const, adminOnly: false},
    {label: 'Campaigns', desc: 'Communication campaigns', target: 'CampaignList' as const, adminOnly: true},
    {label: 'Templates', desc: 'Message templates', target: 'TemplateList' as const, adminOnly: true},
    {label: 'Reports', desc: 'Report generation & viewing', target: 'ReportList' as const, adminOnly: false},
    {label: 'Integrations', desc: 'External system configs', target: 'IntegrationList' as const, superAdminOnly: true},
    {label: 'Org Units', desc: 'Organisation structure', target: 'OrgUnitList' as const, adminOnly: true},
    {label: 'Users', desc: 'User account management', target: 'UserList' as const, superAdminOnly: true},
    {label: 'Audit Log', desc: 'System audit trail', target: 'AuditList' as const, superAdminOnly: true},
    {label: 'Sync Status', desc: 'Last sync, queue & conflicts', target: 'SyncStatus' as const, adminOnly: false},
    {label: 'Monitoring', desc: 'System health & clinical safety', target: 'Monitoring' as const, adminOnly: true},
  ].filter(m => {
    if (m.superAdminOnly) return isSuperAdmin;
    if (m.adminOnly) return isAdmin;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome, {user?.fullName || user?.username}</Text>
          <Text style={styles.role}>{user?.systemRole}</Text>
        </View>
        <Pressable onPress={() => {
          const {hasUnsynced, count} = useAuthStore.getState().checkUnsyncedBeforeLogout();
          if (hasUnsynced) {
            Alert.alert(
              'Unsynchronised Data',
              `You have ${count} record${count > 1 ? 's' : ''} pending synchronisation. Signing out may lose this data.\n\nSign out anyway?`,
              [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Sign out anyway', style: 'destructive', onPress: () => logout(true)},
              ],
            );
          } else {
            logout();
          }
        }}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>

      {queueDepth > 0 && (
        <Pressable
          style={styles.syncBanner}
          onPress={() => syncFull()}>
          <Text style={styles.syncText}>
            {queueDepth} record{queueDepth > 1 ? 's' : ''} pending sync — tap to retry
          </Text>
        </Pressable>
      )}

      {ruleStatus.warning && (
        <View style={styles.ruleWarningBanner}>
          <Text style={styles.ruleWarningText}>{ruleStatus.warning}</Text>
        </View>
      )}

      <FlatList
        data={cards}
        keyExtractor={(item) => item.key}
        renderItem={({item}) => (
          <View style={styles.card}>
            <View style={[styles.dot, {backgroundColor: item.color}]} />
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
            </View>
            <Text style={styles.cardCount}>{item.count}</Text>
          </View>
        )}
        ListHeaderComponent={
          <View>
            {/* Analytics widgets */}
            {analytics.totalChildren > 0 && (
              <View style={styles.analyticsContainer}>
                <Text style={styles.sectionTitle}>Pregnancy Analytics</Text>
                {/* High-risk rate */}
                <View style={[styles.quickCard, {borderTopColor: urgency.ORANGE, borderTopWidth: 3}]}>
                  <Text style={styles.quickIcon}>⚠️</Text>
                  <Text style={styles.analyticsValue}>{analytics.coverageRate}%</Text>
                  <Text style={styles.quickLabel}>High Risk</Text>
                  <View style={styles.analyticsBarBg}>
                    <View style={[styles.analyticsBarFill, {width: `${analytics.coverageRate}%`, backgroundColor: analytics.coverageRate > 30 ? urgency.RED : analytics.coverageRate > 15 ? urgency.ORANGE : urgency.GREEN}]} />
                  </View>
                  <Text style={styles.analyticsSub}>{analytics.childrenWithDoses}/{analytics.totalChildren} pregnancies</Text>
                </View>
                {/* Total observations */}
                <View style={[styles.quickCard, {borderTopColor: urgency.GREEN, borderTopWidth: 3}]}>
                  <Text style={styles.quickIcon}>📝</Text>
                  <Text style={styles.analyticsValue}>{analytics.openDefaulters}</Text>
                  <Text style={styles.quickLabel}>Observations</Text>
                  <Text style={styles.analyticsSub}>Total recorded</Text>
                </View>
              </View>
            )}

            {/* Server aggregate stats */}
            {serverAggregate && (
              <View style={styles.analyticsContainer}>
                <Text style={styles.sectionTitle}>Server Overview</Text>
                <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
                  <View style={[styles.quickCard, {borderTopColor: urgency.RED, borderTopWidth: 3, flex: 0}]}>
                    <Text style={styles.quickIcon}>🤰</Text>
                    <Text style={styles.analyticsValue}>{serverAggregate.pregnancy.active}</Text>
                    <Text style={styles.quickLabel}>Active Preg</Text>
                    {serverAggregate.pregnancy.emergency > 0 && (
                      <Text style={[styles.analyticsSub, {color: urgency.RED}]}>{serverAggregate.pregnancy.emergency} emergency</Text>
                    )}
                  </View>
                  <View style={[styles.quickCard, {borderTopColor: urgency.AMBER, borderTopWidth: 3, flex: 0}]}>
                    <Text style={styles.quickIcon}>🔗</Text>
                    <Text style={styles.analyticsValue}>{serverAggregate.referrals.open}</Text>
                    <Text style={styles.quickLabel}>Open Referrals</Text>
                    {serverAggregate.referrals.emergency > 0 && (
                      <Text style={[styles.analyticsSub, {color: urgency.RED}]}>{serverAggregate.referrals.emergency} emergency</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
            {quickActions.map(qa => (
              <Pressable
                key={qa.label}
                style={[styles.quickCard, {borderTopColor: qa.color}]}
                onPress={() => navigation.navigate(qa.target)}
                accessibilityRole="button"
                accessibilityLabel={`${qa.label}: ${qa.value}`}
                accessibilityHint={`Go to ${qa.label}`}>
                <Text style={styles.quickIcon} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{qa.icon}</Text>
                <Text style={styles.quickValue} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{qa.value}</Text>
                <Text style={styles.quickLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{qa.label}</Text>
              </Pressable>
            ))}
          </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.modules}>
            {/* Continuity of Care */}
            <Text style={styles.sectionTitle}>Continuity of Care</Text>
            <Text style={styles.sectionSubtitle}>Antenatal pregnancy management</Text>

            {careStages.map((stage, si) => (
              <View key={si} style={styles.stageGroup}>
                <View style={styles.stageHeader}>
                  <Text style={styles.stageIcon}>{stage.icon}</Text>
                  <View style={styles.stageHeaderText}>
                    <Text style={styles.stageTitle}>{stage.title}</Text>
                    <Text style={styles.stageDesc}>{stage.desc}</Text>
                  </View>
                </View>
                {stage.modules.map((m) => (
                  <Pressable
                    key={m.label}
                    style={styles.moduleCard}
                    onPress={() => navigation.navigate(m.target)}
                    accessibilityRole="button"
                    accessibilityLabel={m.label}
                    accessibilityHint={m.desc}>
                    <View>
                      <Text style={styles.moduleLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.label}</Text>
                      <Text style={styles.moduleDesc} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.desc}</Text>
                    </View>
                    <Text style={styles.arrow} allowFontScaling={true} maxFontSizeMultiplier={1.5}>›</Text>
                  </Pressable>
                ))}
                {si < careStages.length - 1 && <View style={styles.flowArrow}>
                  <Text style={styles.flowArrowText}>↓</Text>
                </View>}
              </View>
            ))}

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, {marginTop: 24}]}>Recent Activity</Text>
                {recentActivity.map((act, i) => (
                  <View key={i} style={styles.activityRow}>
                    <Text style={styles.activityIcon}>{act.icon}</Text>
                    <View style={styles.activityBody}>
                      <Text style={styles.activityLabel}>{act.label}</Text>
                      <Text style={styles.activitySub}>{act.sub}</Text>
                    </View>
                    <Text style={styles.activityTime}>{act.time}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Support Modules */}
            <Text style={[styles.sectionTitle, {marginTop: 24}]}>
              {isAdmin ? 'Support & Administration' : 'Support Tools'}
            </Text>
            {supportModules.map((m) => (
              <Pressable
                key={m.label}
                style={styles.moduleCard}
                onPress={() => navigation.navigate(m.target)}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                accessibilityHint={m.desc}>
                <View>
                  <Text style={styles.moduleLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.label}</Text>
                  <Text style={styles.moduleDesc} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.desc}</Text>
                </View>
                <Text style={styles.arrow} allowFontScaling={true} maxFontSizeMultiplier={1.5}>›</Text>
              </Pressable>
            ))}
          </View>
        }
        contentContainerStyle={styles.list}
      />
      <BottomTabBar activeRoute="Dashboard" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  greeting: {fontSize: 18, fontWeight: '700', color: lightColors.textPrimary},
  role: {fontSize: 12, color: lightColors.textSecondary, marginTop: 2},
  logout: {fontSize: 14, color: brand.teal, fontWeight: '600'},
  syncBanner: {
    backgroundColor: urgency.AMBER + '20',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  syncText: {fontSize: 13, color: urgency.AMBER, fontWeight: '600'},
  ruleWarningBanner: {
    backgroundColor: urgency.ORANGE + '20',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  ruleWarningText: {fontSize: 13, color: urgency.ORANGE, fontWeight: '600'},
  list: {padding: 16, gap: 10},
  quickActions: {flexDirection: 'row', gap: 8, marginBottom: 16},
  quickCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderTopWidth: 3,
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
  },
  quickIcon: {fontSize: 22, marginBottom: 4},
  quickValue: {fontSize: 24, fontWeight: '800', color: lightColors.textPrimary},
  quickLabel: {fontSize: 11, color: lightColors.textSecondary, marginTop: 2},
  activityRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: lightColors.border + '40'},
  activityIcon: {fontSize: 18, marginRight: 10},
  activityBody: {flex: 1},
  activityLabel: {fontSize: 14, fontWeight: '600', color: lightColors.textPrimary},
  activitySub: {fontSize: 11, color: lightColors.textSecondary, marginTop: 1},
  activityTime: {fontSize: 11, color: lightColors.textSecondary},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  dot: {width: 10, height: 10, borderRadius: 5, marginRight: 12},
  cardBody: {flex: 1},
  cardLabel: {fontSize: 14, fontWeight: '600', color: lightColors.textPrimary},
  cardDesc: {fontSize: 12, color: lightColors.textSecondary, marginTop: 2},
  cardCount: {fontSize: 28, fontWeight: '800', color: lightColors.textPrimary},
  modules: {marginTop: 24},
  sectionTitle: {fontSize: 16, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 4},
  sectionSubtitle: {fontSize: 12, color: lightColors.textSecondary, marginBottom: 16},
  flowConnector: {width: 2, height: 12, backgroundColor: brand.teal + '40', alignSelf: 'center', marginBottom: 4},
  stageGroup: {marginBottom: 8},
  stageHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4},
  stageIcon: {fontSize: 22, marginRight: 10},
  stageHeaderText: {flex: 1},
  stageTitle: {fontSize: 15, fontWeight: '700', color: brand.navy},
  stageDesc: {fontSize: 11, color: lightColors.textSecondary, marginTop: 1},
  flowArrow: {alignItems: 'center', paddingVertical: 4},
  flowArrowText: {fontSize: 18, color: brand.teal + '80'},
  moduleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    minHeight: 56,
  },
  moduleLabel: {fontSize: 15, fontWeight: '600', color: lightColors.textPrimary},
  moduleDesc: {fontSize: 12, color: lightColors.textSecondary, marginTop: 2},
  arrow: {fontSize: 24, color: lightColors.textSecondary},
  analyticsContainer: {marginBottom: 16},
  analyticsValue: {fontSize: 24, fontWeight: '800', color: lightColors.textPrimary, marginTop: 4},
  analyticsBarBg: {height: 4, borderRadius: 2, backgroundColor: lightColors.border + '40', marginTop: 8, overflow: 'hidden'},
  analyticsBarFill: {height: '100%', borderRadius: 2},
  analyticsSub: {fontSize: 10, color: lightColors.textSecondary, marginTop: 4},
});
