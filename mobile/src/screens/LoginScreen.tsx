/**
 * Login screen — SEC-001. Credentials are submitted to the auth store
 * which stores the token in the OS keychain.
 */
import React, {useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useAuthStore} from '../core/auth/authStore';
import {brand, lightColors} from '../theme/colors';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const {login, isLoading, error} = useAuthStore();

  const handleLogin = () => {
    if (username && password) {
      login(username, password);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}>
        {/* Banner with logo */}
        <View style={styles.banner}>
          <Image
            source={require('../../assets/brand/logo-dark-mode.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Offline-first decision support for frontline health workers
        </Text>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          {/* Username */}
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter your username"
              placeholderTextColor={lightColors.textSecondary}
              editable={!isLoading}
            />
          </View>

          {/* Password */}
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Enter your password"
              placeholderTextColor={lightColors.textSecondary}
              editable={!isLoading}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword(s => !s)}
              hitSlop={8}>
              <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <Pressable
            style={({pressed}) => [
              styles.button,
              pressed && styles.buttonPressed,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          © {new Date().getFullYear()} MCH VoiceCare · Secure Health Platform
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BANNER_HEIGHT = 180;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  inner: {
    flex: 1,
  },
  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: brand.navy,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 240,
    height: 110,
  },
  tagline: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 28,
    lineHeight: 19,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 24,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: brand.navy,
  },
  cardSubtitle: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textSecondary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: lightColors.border,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: lightColors.textPrimary,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  eyeText: {
    fontSize: 13,
    fontWeight: '600',
    color: brand.teal,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
  },
  button: {
    backgroundColor: brand.teal,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: brand.teal,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{scale: 0.98}],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    fontSize: 12,
    color: lightColors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
});
