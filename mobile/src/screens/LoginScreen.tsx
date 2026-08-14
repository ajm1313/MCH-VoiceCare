/**
 * Login screen — SEC-001. Credentials are submitted to the auth store
 * which stores the token in the OS keychain.
 *
 * Biometric login (spec §22): if the device supports fingerprint/face
 * unlock and the user has previously opted in, a biometric login button
 * is shown. On success, the stored JWT is retrieved from the keychain.
 *
 * UX-003: premium calm-clinical restyle using the shared UI primitives
 * and theme tokens. The clinical behaviour (auth, biometric, keychain)
 * is unchanged.
 */
import React, {useState, useEffect, useCallback} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useAuthStore} from '../core/auth/authStore';
import {useTheme} from '../theme/useTheme';
import {brand} from '../theme/colors';
import {border, radius, space, elevation} from '../theme/tokens';
import {Icon} from '../components/ui/Icon';
import {AppText} from '../components/ui/Text';
import {Field} from '../components/ui/Input';
import {Button} from '../components/ui/Button';
import {
  checkBiometricAvailability,
  hasBiometricCredentials,
  biometricLogin,
  storeCredentialsWithBiometric,
  type BiometricAvailability,
} from '../core/auth/biometricAuth';
import {setFlagSecureSync} from '../core/security/ScreenSecurity';

export function LoginScreen() {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const {login, isLoading, error} = useAuthStore();

  // Biometric state (spec §22)
  const [biometricAvail, setBiometricAvail] = useState<BiometricAvailability | null>(null);
  const [hasStoredBioCreds, setHasStoredBioCreds] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    // Clear FLAG_SECURE on login screen so the soft keyboard works.
    // FLAG_SECURE blocks the keyboard on some Android devices (Samsung, etc.),
    // causing it to flash and disappear immediately.
    try { setFlagSecureSync(false); } catch {}
  }, []);

  useEffect(() => {
    checkBiometricAvailability().then(avail => {
      setBiometricAvail(avail);
      if (avail.available) {
        hasBiometricCredentials().then(setHasStoredBioCreds);
      }
    });
  }, []);

  const handleLogin = () => {
    try {
      if (username && password) {
        login(username, password).then(success => {
          if (success && biometricAvail?.available) {
            const { token, refreshToken, expiresAt, user } = useAuthStore.getState();
            if (token && refreshToken && user) {
              storeCredentialsWithBiometric(
                username,
                JSON.stringify({ token, refreshToken, expiresAt, user }),
              );
            }
          }
        }).catch(() => {});
      }
    } catch {
      // Synchronous error in login handler — prevent crash
    }
  };

  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    try {
      const creds = await biometricLogin();
      if (creds) {
        await login(creds.username, creds.token, true);
      }
    } catch {
      // Biometric login failed — user can fall back to manual login
    } finally {
      setBiometricLoading(false);
    }
  }, [login]);

  return (
    <View style={[styles.container, {backgroundColor: colors.background, paddingTop: insets.top}]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}>

        {/* ── Brand banner ── */}
        <View style={styles.banner}>
          <View style={styles.bannerGlow} />
          <Image
            source={require('../../assets/brand/logo-dark-mode.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <AppText variant="caption" tone="inherit" style={styles.bannerTagline}>
            Maternal &amp; Child Health
          </AppText>
        </View>

        {/* ── Tagline ── */}
        <AppText variant="small" tone="secondary" style={styles.tagline}>
          Offline-first decision support for frontline health workers
        </AppText>

        {/* ── Card ── */}
        <View style={[styles.card, {backgroundColor: colors.surface, ...elevation.lg}]}>
          <AppText variant="overline" tone="secondary" style={styles.cardOverline}>
            Welcome
          </AppText>
          <AppText variant="h2" tone="primary" style={styles.cardTitle}>
            Sign in to your account
          </AppText>
          <AppText variant="small" tone="secondary" style={styles.cardSubtitle}>
            Use your facility credentials to continue.
          </AppText>

          {/* Username */}
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            icon="user"
            containerStyle={styles.field}
          />

          {/* Password */}
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="Enter your password"
            editable={!isLoading}
            icon="lock"
            trailing={{
              icon: showPassword ? 'eyeOff' : 'eye',
              onPress: () => setShowPassword(s => !s),
              accessibilityLabel: showPassword ? 'Hide password' : 'Show password',
            }}
            containerStyle={styles.field}
          />

          {/* Error */}
          {error ? (
            <View style={[styles.errorBox, {backgroundColor: colors.dangerSubtle, borderColor: colors.danger + '30'}]}>
              <Icon name="alertCircle" size={18} color={colors.danger} strokeWidth={2} />
              <AppText variant="small" tone="danger" style={styles.errorText}>
                {error}
              </AppText>
            </View>
          ) : null}

          {/* Submit */}
          <Button
            label="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading}
            iconRight="arrowRight"
            fullWidth
            style={styles.submitBtn}
          />

          {/* Biometric login (spec §22) */}
          {biometricAvail?.available && hasStoredBioCreds ? (
            <Pressable
              style={({pressed}) => [
                styles.biometricButton,
                {
                  backgroundColor: colors.primarySubtle,
                  borderColor: colors.primary + '40',
                  borderWidth: border.thick,
                },
                pressed && styles.biometricPressed,
                biometricLoading && styles.buttonDisabled,
              ]}
              onPress={handleBiometricLogin}
              disabled={biometricLoading || isLoading}
              accessibilityRole="button"
              accessibilityLabel={`Use ${biometricAvail.biometryType === 'face' ? 'Face' : 'Fingerprint'} to sign in`}>
              {biometricLoading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <>
                  <Icon
                    name={biometricAvail.biometryType === 'face' ? 'faceId' : 'fingerprint'}
                    size={20}
                    color={colors.primary}
                    strokeWidth={1.75}
                  />
                  <AppText variant="bodyStrong" tone="primary">
                    Use {biometricAvail.biometryType === 'face' ? 'Face' : 'Fingerprint'} to Sign In
                  </AppText>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {/* ── Footer ── */}
        <AppText variant="caption" tone="tertiary" style={styles.footer}>
          © {new Date().getFullYear()} MCH VoiceCare · Secure Health Platform
        </AppText>
      </ScrollView>
    </View>
  );
}

const BANNER_HEIGHT = 200;

const styles = StyleSheet.create({
  container: {flex: 1},
  scrollView: {flex: 1},
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: brand.navy,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
    overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: brand.teal + '30',
  },
  logoImage: {width: 240, height: 110},
  bannerTagline: {
    color: 'rgba(255,255,255,0.55)',
    marginTop: space[1],
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '600',
  },
  tagline: {
    marginTop: space[5],
    textAlign: 'center',
    paddingHorizontal: space[7],
    lineHeight: 20,
  },
  card: {
    borderRadius: radius.xl,
    padding: space[6],
    marginHorizontal: space[6],
    marginTop: space[6],
  },
  cardOverline: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 11,
    fontWeight: '700',
  },
  cardTitle: {
    marginTop: space[1],
    fontSize: 20,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: space[1],
    marginBottom: space[5],
  },
  field: {marginBottom: space[4]},
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    borderWidth: border.thick,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    marginBottom: space[3],
  },
  errorText: {flex: 1},
  submitBtn: {marginTop: space[1]},
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    borderRadius: radius.md,
    paddingVertical: space[3],
    marginTop: space[3],
  },
  biometricPressed: {opacity: 0.85, transform: [{scale: 0.98}]},
  buttonDisabled: {opacity: 0.6},
  footer: {
    textAlign: 'center',
    marginTop: space[6],
    marginBottom: space[2],
  },
});
