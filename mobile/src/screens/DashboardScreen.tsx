/**
 * Dashboard screen — UX-003. Shows urgency summary cards and module
 * navigation. Sync queue depth badge reflects offline outbox state.
 *
 * All clinical modules are accessible from the dashboard:
 * Pregnancy, Newborn, Immunisation, Growth, Referrals, OCR, Voice,
 * plus support tools and admin modules.
 */
import React, {useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
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

  // All clinical care stages with their modules
  const careStages = [
    {
      title: 'Pregnancy & Antenatal',
      icon: '🤰',
      desc: 'Active pregnancies, observations & assessments',
      color: brand.teal,
      modules: [
        {label: 'Pregnancy', desc: 'Active episodes & assessments', target: 'PregnancyList' as const, icon: '🤰'},
      ],
    },
    {
      title: 'Newborn Care',
      icon: '👶',
      desc: 'Newborn episodes, observations & assessments',
      color: '#7C3AED',
      modules: [
        {label: 'Newborn', desc: 'Newborn episodes & observations', target: 'NewbornList' as const, icon: '👶'},
      ],
    },
    {
      title: 'Child Health',
      icon: '💉',
      desc: 'Immunisation, growth monitoring & defaulter tracing',
      color: '#059669',
      modules: [
        {label: 'Immunisation', desc: 'EPI schedule & vaccine doses', target: 'ImmunisationList' as const, icon: '💉'},
        {label: 'Growth', desc: 'Growth measurements & charts', target: 'GrowthList' as const, icon: '📈'},
        {label: 'Defaulter Tracing', desc: 'Track & trace defaulters', target: 'DefaulterList' as const, icon: '🔍'},
        {label: 'CWC Sessions', desc: 'Child welfare clinic sessions', target: 'CWCSession' as const, icon: '🏥'},
      ],
    },
    {
      title: 'Referrals',
      icon: '🚑',
      desc: 'Patient referral management & tracking',
      color: urgency.RED,
      modules: [
        {label: 'Referrals', desc: 'Create & track referrals', target: 'ReferralList' as const, icon: '🚑'},
      ],
    },
    {
      title: 'Quick Capture',
      icon: '📷',
      desc: 'OCR document scanning & voice recording',
      color: '#6366F1',
      modules: [
        {label: 'OCR Scan', desc: 'Select client & scan document', target: 'PersonList' as const, icon: '📷'},
        {label: 'Voice Record', desc: 'Select episode & record voice', target: 'PregnancyList' as const, icon: '🎤'},
      ],
    },
  ];

  const supportModules = [
    {label: 'Tasks', desc: 'Open notifications & action items', target: 'TaskList' as const, adminOnly: false, icon: '📋'},
    {label: 'Clients', desc: 'Persons & households', target: 'PersonList' as const, adminOnly: false, icon: '👤'},
    {label: 'Sync Status', desc: 'Last sync, queue & conflicts', target: 'SyncStatus' as const, adminOnly: false, icon: '⟳'},
    {label: 'Audit Log', desc: 'System audit trail', target: 'AuditList' as const, superAdminOnly: true, icon: '🔒'},
  ].filter(m => {
    if (m.superAdminOnly) return isSuperAdmin;
    if (m.adminOnly) return isAdmin;
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Welcome, {user?.fullName || user?.username}</Text>
          <Text style={styles.role}>{user?.systemRole?.replace(/_/g, ' ')}</Text>
        </View>
        <Pressable style={styles.logoutBtn} onPress={() => {
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
                <View style={styles.analyticsRow}>
                  <View style={[styles.quickCard, {borderTopColor: urgency.ORANGE}]}>
                    <Text style={styles.quickIcon}>⚠️</Text>
                    <Text style={styles.analyticsValue}>{analytics.coverageRate}%</Text>
                    <Text style={styles.quickLabel}>High Risk</Text>
                    <View style={styles.analyticsBarBg}>
                      <View style={[styles.analyticsBarFill, {width: `${analytics.coverageRate}%`, backgroundColor: analytics.coverageRate > 30 ? urgency.RED : analytics.coverageRate > 15 ? urgency.ORANGE : urgency.GREEN}]} />
                    </View>
                    <Text style={styles.analyticsSub}>{analytics.childrenWithDoses}/{analytics.totalChildren} pregnancies</Text>
                  </View>
                  <View style={[styles.quickCard, {borderTopColor: urgency.GREEN}]}>
                    <Text style={styles.quickIcon}>📝</Text>
                    <Text style={styles.analyticsValue}>{analytics.openDefaulters}</Text>
                    <Text style={styles.quickLabel}>Observations</Text>
                    <Text style={styles.analyticsSub}>Total recorded</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Server aggregate stats */}
            {serverAggregate && (
              <View style={styles.analyticsContainer}>
                <Text style={styles.sectionTitle}>Server Overview</Text>
                <View style={styles.analyticsRow}>
                  <View style={[styles.quickCard, {borderTopColor: urgency.RED}]}>
                    <Text style={styles.quickIcon}>🤰</Text>
                    <Text style={styles.analyticsValue}>{serverAggregate.pregnancy.active}</Text>
                    <Text style={styles.quickLabel}>Active Preg</Text>
                    {serverAggregate.pregnancy.emergency > 0 && (
                      <Text style={[styles.analyticsSub, {color: urgency.RED}]}>{serverAggregate.pregnancy.emergency} emergency</Text>
                    )}
                  </View>
                  <View style={[styles.quickCard, {borderTopColor: urgency.AMBER}]}>
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
            {/* Continuity of Care — all clinical modules */}
            <Text style={styles.sectionTitle}>Continuity of Care</Text>
            <Text style={styles.sectionSubtitle}>Maternal & child health workflows</Text>

            {careStages.map((stage, si) => (
              <View key={si} style={styles.stageGroup}>
                <View style={[styles.stageHeader, {borderLeftColor: stage.color}]}>
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
                    <View style={styles.moduleLeft}>
                      <Text style={styles.moduleIcon}>{m.icon}</Text>
                      <View>
                        <Text style={styles.moduleLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.label}</Text>
                        <Text style={styles.moduleDesc} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.desc}</Text>
                      </View>
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
                <View style={styles.moduleLeft}>
                  <Text style={styles.moduleIcon}>{m.icon}</Text>
                  <View>
                    <Text style={styles.moduleLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.label}</Text>
                    <Text style={styles.moduleDesc} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{m.desc}</Text>
                  </View>
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
  container: {flex: 1, backgroundColor: '#F0F4F8'},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: {flex: 1},
  greeting: {fontSize: 20, fontWeight: '800', color: '#0F172A'},
  role: {fontSize: 12, color: '#64748B', marginTop: 2, textTransform: 'capitalize'},
  logoutBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: brand.teal + '15',
    borderRadius: 20,
  },
  logout: {fontSize: 13, color: brand.teal, fontWeight: '700'},
  syncBanner: {
    backgroundColor: urgency.AMBER + '18',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: urgency.AMBER + '30',
  },
  syncText: {fontSize: 13, color: urgency.AMBER, fontWeight: '600'},
  ruleWarningBanner: {
    backgroundColor: urgency.ORANGE + '15',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: urgency.ORANGE + '30',
  },
  ruleWarningText: {fontSize: 12, color: urgency.ORANGE, fontWeight: '600'},
  list: {padding: 16, gap: 10},
  quickActions: {flexDirection: 'row', gap: 10, marginBottom: 16},
  analyticsContainer: {marginBottom: 16},
  analyticsRow: {flexDirection: 'row', gap: 10},
  quickCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3,
    borderRadius: 14,
    padding: 14,
    minHeight: 100,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  quickIcon: {fontSize: 24, marginBottom: 4},
  quickValue: {fontSize: 26, fontWeight: '800', color: '#0F172A'},
  quickLabel: {fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600'},
  activityRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F050'},
  activityIcon: {fontSize: 20, marginRight: 12},
  activityBody: {flex: 1},
  activityLabel: {fontSize: 14, fontWeight: '600', color: '#0F172A'},
  activitySub: {fontSize: 11, color: '#64748B', marginTop: 1},
  activityTime: {fontSize: 11, color: '#94A3B8'},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  dot: {width: 12, height: 12, borderRadius: 6, marginRight: 14},
  cardBody: {flex: 1},
  cardLabel: {fontSize: 14, fontWeight: '700', color: '#0F172A'},
  cardDesc: {fontSize: 12, color: '#64748B', marginTop: 2},
  cardCount: {fontSize: 30, fontWeight: '800', color: '#0F172A'},
  modules: {marginTop: 24},
  sectionTitle: {fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4},
  sectionSubtitle: {fontSize: 12, color: '#64748B', marginBottom: 16},
  stageGroup: {marginBottom: 12},
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stageIcon: {fontSize: 24, marginRight: 12},
  stageHeaderText: {flex: 1},
  stageTitle: {fontSize: 15, fontWeight: '800', color: '#0F172A'},
  stageDesc: {fontSize: 11, color: '#64748B', marginTop: 1},
  flowArrow: {alignItems: 'center', paddingVertical: 4},
  flowArrowText: {fontSize: 18, color: brand.teal + '60'},
  moduleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    minHeight: 60,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  moduleLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  moduleIcon: {fontSize: 22, marginRight: 12},
  moduleLabel: {fontSize: 15, fontWeight: '700', color: '#0F172A'},
  moduleDesc: {fontSize: 12, color: '#64748B', marginTop: 2},
  arrow: {fontSize: 24, color: '#CBD5E1'},
  analyticsValue: {fontSize: 26, fontWeight: '800', color: '#0F172A', marginTop: 4},
  analyticsBarBg: {height: 5, borderRadius: 3, backgroundColor: '#E2E8F060', marginTop: 8, overflow: 'hidden', width: '100%'},
  analyticsBarFill: {height: '100%', borderRadius: 3},
  analyticsSub: {fontSize: 10, color: '#64748B', marginTop: 4},
});
