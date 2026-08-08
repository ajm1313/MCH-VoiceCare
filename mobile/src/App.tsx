/**
 * MCH VoiceCare mobile app shell — DEC-007 offline-first.
 *
 * Wires navigation, database init, auth restore, and background sync.
 * All screens function without connectivity; the outbox queue drains
 * when network becomes available (SYNC-001..SYNC-010).
 */
import React, {useEffect, useState} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {darkColors, lightColors} from './theme/colors';
import {initDatabaseEncrypted} from './core/db/database';
import {startBackgroundSync, stopBackgroundSync, syncFull, setPostFunction} from './core/sync/engine';
import {setGetFunction} from './core/sync/pull';
import {setConfigGetFunction} from './core/sync/configStore';
import {setDashboardGetFunction} from './core/sync/dashboardSync';
import {setWorklistGetFunction} from './core/sync/worklistSync';
import {useAuthStore} from './core/auth/authStore';
import {provisionDevice} from './core/auth/deviceProvision';
import type {RootStackParamList} from './core/navigation/types';

import {LoginScreen} from './screens/LoginScreen';
import {DashboardScreen} from './screens/DashboardScreen';
import {PregnancyListScreen} from './screens/PregnancyListScreen';
import {PregnancyRegisterScreen} from './screens/PregnancyRegisterScreen';
import {PregnancyDetailScreen} from './screens/PregnancyDetailScreen';
import {PregnancyObserveScreen} from './screens/PregnancyObserveScreen';
import {VoiceRecordScreen} from './screens/VoiceRecordScreen';
import {NewbornListScreen} from './screens/NewbornListScreen';
import {NewbornRegisterScreen} from './screens/NewbornRegisterScreen';
import {NewbornDetailScreen} from './screens/NewbornDetailScreen';
import {NewbornObserveScreen} from './screens/NewbornObserveScreen';
import {ImmunisationListScreen} from './screens/ImmunisationListScreen';
import {ImmunisationRegisterScreen} from './screens/ImmunisationRegisterScreen';
import {ImmunisationChildDetailScreen} from './screens/ImmunisationChildDetailScreen';
import {ImmunisationRecordDoseScreen} from './screens/ImmunisationRecordDoseScreen';
import {GrowthListScreen} from './screens/GrowthListScreen';
import {GrowthDetailScreen} from './screens/GrowthDetailScreen';
import {GrowthRecordScreen} from './screens/GrowthRecordScreen';
import {GrowthChartScreen} from './screens/GrowthChartScreen';
import {TaskListScreen} from './screens/TaskListScreen';
import {NotificationDetailScreen} from './screens/NotificationDetailScreen';
import {CWCSessionScreen} from './screens/CWCSessionScreen';
import {CWCDetailScreen} from './screens/CWCDetailScreen';
import {SyncStatusScreen} from './screens/SyncStatusScreen';
import {PregnancyAssessmentScreen} from './screens/PregnancyAssessmentScreen';
import {PregnancyCloseScreen} from './screens/PregnancyCloseScreen';
import {PregnancyTransferScreen} from './screens/PregnancyTransferScreen';
import {NewbornCloseScreen} from './screens/NewbornCloseScreen';
import {NewbornTransferScreen} from './screens/NewbornTransferScreen';
import {DefaulterListScreen} from './screens/DefaulterListScreen';
import {DefaulterDetailScreen} from './screens/DefaulterDetailScreen';
import {DefaulterTraceScreen} from './screens/DefaulterTraceScreen';
import {ReferralListScreen} from './screens/ReferralListScreen';
import {ReferralCreateScreen} from './screens/ReferralCreateScreen';
import {ReferralDetailScreen} from './screens/ReferralDetailScreen';
import {ReferralQrSlipScreen} from './screens/ReferralQrSlipScreen';
import {ClinicianOverrideScreen} from './screens/ClinicianOverrideScreen';
import {MonitoringScreen} from './screens/MonitoringScreen';
import {OCRScanScreen} from './screens/OCRScanScreen';
import {OCRConfirmScreen} from './screens/OCRConfirmScreen';
import {ProfileListScreen} from './screens/ProfileListScreen';
import {ProfileDetailScreen} from './screens/ProfileDetailScreen';
import {PersonListScreen} from './screens/PersonListScreen';
import {PersonDetailScreen} from './screens/PersonDetailScreen';
import {HouseholdListScreen} from './screens/HouseholdListScreen';
import {CampaignListScreen} from './screens/CampaignListScreen';
import {CampaignDetailScreen} from './screens/CampaignDetailScreen';
import {TemplateListScreen} from './screens/TemplateListScreen';
import {ReportListScreen} from './screens/ReportListScreen';
import {ReportDetailScreen} from './screens/ReportDetailScreen';
import {IntegrationListScreen} from './screens/IntegrationListScreen';
import {OrgUnitListScreen} from './screens/OrgUnitListScreen';
import {UserListScreen} from './screens/UserListScreen';
import {AuditListScreen} from './screens/AuditListScreen';
import {CapabilityListScreen} from './screens/CapabilityListScreen';
import {CapabilityFormScreen} from './screens/CapabilityFormScreen';
import {ProfileGenerateScreen} from './screens/ProfileGenerateScreen';
import {PersonFormScreen} from './screens/PersonFormScreen';
import {HouseholdFormScreen} from './screens/HouseholdFormScreen';
import {CampaignFormScreen} from './screens/CampaignFormScreen';
import {TemplateFormScreen} from './screens/TemplateFormScreen';
import {TemplateDetailScreen} from './screens/TemplateDetailScreen';
import {ReportGenerateScreen} from './screens/ReportGenerateScreen';
import {ScheduledReportFormScreen} from './screens/ScheduledReportFormScreen';
import {IntegrationFormScreen} from './screens/IntegrationFormScreen';
import {OrgUnitFormScreen} from './screens/OrgUnitFormScreen';
import {UserFormScreen} from './screens/UserFormScreen';
import {RoleScopeAssignScreen} from './screens/RoleScopeAssignScreen';
import {OrgUnitDeleteScreen} from './screens/OrgUnitDeleteScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const {user, restoreSession} = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Wire HTTP functions for sync subsystems
      const httpGet = async (url: string, headers: Record<string, string>) => {
        const resp = await fetch(url, {headers});
        return {
          ok: resp.ok,
          status: resp.status,
          json: () => resp.json(),
        };
      };
      const httpPost = async (url: string, body: unknown, headers: Record<string, string>) => {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...headers},
          body: JSON.stringify(body),
        });
        return {
          ok: resp.ok,
          status: resp.status,
          json: () => resp.json(),
        };
      };
      setPostFunction(httpPost);
      setGetFunction(httpGet);
      setConfigGetFunction(httpGet);
      setDashboardGetFunction(httpGet);
      setWorklistGetFunction(httpGet);

      await initDatabaseEncrypted();
      await restoreSession();
      // Provision device after session restore (best-effort, non-blocking)
      provisionDevice().catch(() => {});
      startBackgroundSync();
      setReady(true);
      syncFull().catch(() => {});
    })();

    return () => stopBackgroundSync();
  }, [restoreSession]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <NavigationContainer
        theme={{
          dark: isDark,
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.textPrimary,
            border: colors.border,
            notification: colors.primary,
          },
          fonts: {
            regular: {fontFamily: 'System', fontWeight: '400'},
            medium: {fontFamily: 'System', fontWeight: '500'},
            bold: {fontFamily: 'System', fontWeight: '700'},
            heavy: {fontFamily: 'System', fontWeight: '800'},
          },
        }}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {backgroundColor: colors.surface},
            headerTintColor: colors.textPrimary,
            headerShadowVisible: false,
          }}>
          {!user ? (
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{headerShown: false}}
            />
          ) : (
            <>
              <Stack.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{title: 'Dashboard'}}
              />
              <Stack.Screen
                name="PregnancyList"
                component={PregnancyListScreen}
                options={{title: 'Pregnancies'}}
              />
              <Stack.Screen
                name="PregnancyRegister"
                component={PregnancyRegisterScreen}
                options={{title: 'Register Pregnancy'}}
              />
              <Stack.Screen
                name="PregnancyDetail"
                component={PregnancyDetailScreen}
                options={{title: 'Episode'}}
              />
              <Stack.Screen
                name="PregnancyObserve"
                component={PregnancyObserveScreen}
                options={{title: 'Observation'}}
              />
              <Stack.Screen
                name="VoiceRecord"
                component={VoiceRecordScreen}
                options={{title: 'Voice Observation'}}
              />
              <Stack.Screen
                name="NewbornList"
                component={NewbornListScreen}
                options={{title: 'Newborns'}}
              />
              <Stack.Screen
                name="NewbornRegister"
                component={NewbornRegisterScreen}
                options={{title: 'Register Newborn'}}
              />
              <Stack.Screen
                name="NewbornDetail"
                component={NewbornDetailScreen}
                options={{title: 'Newborn'}}
              />
              <Stack.Screen
                name="NewbornObserve"
                component={NewbornObserveScreen}
                options={{title: 'Observation'}}
              />
              <Stack.Screen
                name="ImmunisationList"
                component={ImmunisationListScreen}
                options={{title: 'Immunisation'}}
              />
              <Stack.Screen
                name="ImmunisationRegister"
                component={ImmunisationRegisterScreen}
                options={{title: 'Register Child'}}
              />
              <Stack.Screen
                name="ImmunisationChildDetail"
                component={ImmunisationChildDetailScreen}
                options={{title: 'Child'}}
              />
              <Stack.Screen
                name="ImmunisationRecordDose"
                component={ImmunisationRecordDoseScreen}
                options={{title: 'Record Dose'}}
              />
              <Stack.Screen
                name="GrowthList"
                component={GrowthListScreen}
                options={{title: 'Growth'}}
              />
              <Stack.Screen
                name="GrowthDetail"
                component={GrowthDetailScreen}
                options={{title: 'Growth Detail'}}
              />
              <Stack.Screen
                name="GrowthRecord"
                component={GrowthRecordScreen}
                options={{title: 'Measurement'}}
              />
              <Stack.Screen
                name="GrowthChart"
                component={GrowthChartScreen}
                options={{title: 'Growth Charts'}}
              />
              <Stack.Screen
                name="TaskList"
                component={TaskListScreen}
                options={{title: 'Tasks'}}
              />
              <Stack.Screen
                name="NotificationDetail"
                component={NotificationDetailScreen}
                options={{title: 'Notification'}}
              />
              <Stack.Screen
                name="CWCSession"
                component={CWCSessionScreen}
                options={{title: 'CWC Sessions'}}
              />
              <Stack.Screen
                name="CWCDetail"
                component={CWCDetailScreen}
                options={{title: 'CWC Session'}}
              />
              <Stack.Screen
                name="PregnancyAssessment"
                component={PregnancyAssessmentScreen}
                options={{title: 'Assessment'}}
              />
              <Stack.Screen
                name="PregnancyClose"
                component={PregnancyCloseScreen}
                options={{title: 'Close Pregnancy'}}
              />
              <Stack.Screen
                name="PregnancyTransfer"
                component={PregnancyTransferScreen}
                options={{title: 'Transfer Pregnancy'}}
              />
              <Stack.Screen
                name="NewbornClose"
                component={NewbornCloseScreen}
                options={{title: 'Close Newborn'}}
              />
              <Stack.Screen
                name="NewbornTransfer"
                component={NewbornTransferScreen}
                options={{title: 'Transfer Newborn'}}
              />
              <Stack.Screen
                name="DefaulterList"
                component={DefaulterListScreen}
                options={{title: 'Defaulters'}}
              />
              <Stack.Screen
                name="DefaulterDetail"
                component={DefaulterDetailScreen}
                options={{title: 'Defaulter'}}
              />
              <Stack.Screen
                name="DefaulterTrace"
                component={DefaulterTraceScreen}
                options={{title: 'Trace Defaulter'}}
              />
              <Stack.Screen
                name="ReferralList"
                component={ReferralListScreen}
                options={{title: 'Referrals'}}
              />
              <Stack.Screen
                name="ReferralCreate"
                component={ReferralCreateScreen}
                options={{title: 'New Referral'}}
              />
              <Stack.Screen
                name="ReferralDetail"
                component={ReferralDetailScreen}
                options={{title: 'Referral'}}
              />
              <Stack.Screen
                name="ReferralQrSlip"
                component={ReferralQrSlipScreen}
                options={{title: 'Referral Slip'}}
              />
              <Stack.Screen
                name="ClinicianOverride"
                component={ClinicianOverrideScreen}
                options={{title: 'Clinical Override'}}
              />
              <Stack.Screen
                name="OCRScan"
                component={OCRScanScreen}
                options={{title: 'Scan Document'}}
              />
              <Stack.Screen
                name="OCRConfirm"
                component={OCRConfirmScreen}
                options={{title: 'Confirm OCR Results'}}
              />
              <Stack.Screen
                name="ProfileList"
                component={ProfileListScreen}
                options={{title: 'Profiles'}}
              />
              <Stack.Screen
                name="ProfileDetail"
                component={ProfileDetailScreen}
                options={{title: 'Profile'}}
              />
              <Stack.Screen
                name="PersonList"
                component={PersonListScreen}
                options={{title: 'Persons'}}
              />
              <Stack.Screen
                name="PersonDetail"
                component={PersonDetailScreen}
                options={{title: 'Person'}}
              />
              <Stack.Screen
                name="HouseholdList"
                component={HouseholdListScreen}
                options={{title: 'Households'}}
              />
              <Stack.Screen
                name="CampaignList"
                component={CampaignListScreen}
                options={{title: 'Campaigns'}}
              />
              <Stack.Screen
                name="CampaignDetail"
                component={CampaignDetailScreen}
                options={{title: 'Campaign'}}
              />
              <Stack.Screen
                name="TemplateList"
                component={TemplateListScreen}
                options={{title: 'Templates'}}
              />
              <Stack.Screen
                name="ReportList"
                component={ReportListScreen}
                options={{title: 'Reports'}}
              />
              <Stack.Screen
                name="ReportDetail"
                component={ReportDetailScreen}
                options={{title: 'Report'}}
              />
              <Stack.Screen
                name="IntegrationList"
                component={IntegrationListScreen}
                options={{title: 'Integrations'}}
              />
              <Stack.Screen
                name="OrgUnitList"
                component={OrgUnitListScreen}
                options={{title: 'Organisation Units'}}
              />
              <Stack.Screen
                name="UserList"
                component={UserListScreen}
                options={{title: 'Users'}}
              />
              <Stack.Screen
                name="AuditList"
                component={AuditListScreen}
                options={{title: 'Audit Log'}}
              />
              <Stack.Screen name="CapabilityList" component={CapabilityListScreen} options={{title: 'Capabilities'}} />
              <Stack.Screen name="CapabilityForm" component={CapabilityFormScreen} options={{title: 'Capability'}} />
              <Stack.Screen name="ProfileGenerate" component={ProfileGenerateScreen} options={{title: 'Generate Profiles'}} />
              <Stack.Screen name="PersonForm" component={PersonFormScreen} options={{title: 'Person'}} />
              <Stack.Screen name="HouseholdForm" component={HouseholdFormScreen} options={{title: 'Household'}} />
              <Stack.Screen name="CampaignForm" component={CampaignFormScreen} options={{title: 'Campaign'}} />
              <Stack.Screen name="TemplateForm" component={TemplateFormScreen} options={{title: 'Template'}} />
              <Stack.Screen name="TemplateDetail" component={TemplateDetailScreen} options={{title: 'Template Detail'}} />
              <Stack.Screen name="ReportGenerate" component={ReportGenerateScreen} options={{title: 'Generate Report'}} />
              <Stack.Screen name="ScheduledReportForm" component={ScheduledReportFormScreen} options={{title: 'Scheduled Report'}} />
              <Stack.Screen name="IntegrationForm" component={IntegrationFormScreen} options={{title: 'Integration'}} />
              <Stack.Screen name="OrgUnitForm" component={OrgUnitFormScreen} options={{title: 'Org Unit'}} />
              <Stack.Screen name="OrgUnitDelete" component={OrgUnitDeleteScreen} options={{title: 'Delete Org Unit'}} />
              <Stack.Screen name="UserForm" component={UserFormScreen} options={{title: 'User'}} />
              <Stack.Screen name="RoleScopeAssign" component={RoleScopeAssignScreen} options={{title: 'Assign Role'}} />
              <Stack.Screen
                name="SyncStatus"
                component={SyncStatusScreen}
                options={{title: 'Sync Status'}}
              />
              <Stack.Screen
                name="Monitoring"
                component={MonitoringScreen}
                options={{title: 'System Health'}}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
