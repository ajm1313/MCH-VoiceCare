package com.mchvoicecare.mch_voicecare_mobile.biometric

import android.app.Activity
import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.Executors

/**
 * Biometric authentication native module (spec §22).
 *
 * Provides fingerprint and face unlock using AndroidX Biometric library,
 * which handles the BiometricPrompt API on Android 10+ and falls back to
 * FingerprintManager on older devices.
 *
 * Security:
 * - Biometric authentication is optional and supplements JWT login.
 * - On success, the app retrieves stored credentials from the OS keychain
 *   (react-native-keychain) using the biometric-gated key.
 * - No biometric data is stored or transmitted — only the authentication
 *   result (success/failure) is returned to JS.
 */
@ReactModule(name = BiometricModule.NAME)
class BiometricModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "BiometricModule"
    }

    override fun getName(): String = NAME

    /**
     * Check if biometric authentication is available on the device.
     *
     * @param promise Resolves with:
     *   available: boolean
     *   biometryType: "fingerprint" | "face" | "iris" | "none"
     *   status: "available" | "unavailable" | "none_enrolled" | "no_hardware"
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            val context = reactApplicationContext
            val biometricManager = BiometricManager.from(context)

            val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
            val canAuthenticate = biometricManager.canAuthenticate(authenticators)

            val map = Arguments.createMap()

            when (canAuthenticate) {
                BiometricManager.BIOMETRIC_SUCCESS -> {
                    map.putBoolean("available", true)
                    map.putString("biometryType", detectBiometryType(context))
                    map.putString("status", "available")
                }
                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> {
                    map.putBoolean("available", false)
                    map.putString("biometryType", "none")
                    map.putString("status", "no_hardware")
                }
                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> {
                    map.putBoolean("available", false)
                    map.putString("biometryType", "none")
                    map.putString("status", "unavailable")
                }
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                    map.putBoolean("available", false)
                    map.putString("biometryType", detectBiometryType(context))
                    map.putString("status", "none_enrolled")
                }
                else -> {
                    map.putBoolean("available", false)
                    map.putString("biometryType", "none")
                    map.putString("status", "unavailable")
                }
            }

            promise.resolve(map)
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putBoolean("available", false)
            map.putString("biometryType", "none")
            map.putString("status", "error: ${e.message}")
            promise.resolve(map)
        }
    }

    /**
     * Prompt the user for biometric authentication.
     *
     * @param title       Dialog title (e.g. "Authenticate")
     * @param subtitle    Dialog subtitle (e.g. "Use your fingerprint to login")
     * @param description Optional description
     * @param promise     Resolves with { success: boolean, error?: string }
     */
    @ReactMethod
    fun authenticate(title: String, subtitle: String, description: String, promise: Promise) {
        try {
            val activity = currentActivity
            if (activity == null || activity !is FragmentActivity) {
                promise.resolve(createAuthResult(false, "Activity not available"))
                return
            }

            val executor = Executors.newSingleThreadExecutor()

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setDescription(description)
                .setNegativeButtonText("Cancel")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.BIOMETRIC_WEAK
                )
                .build()

            val biometricPrompt = BiometricPrompt(activity, executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        promise.resolve(createAuthResult(true, null))
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        val errorMsg = when (errorCode) {
                            BiometricPrompt.ERROR_USER_CANCELED -> "User canceled"
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON -> "User canceled"
                            BiometricPrompt.ERROR_CANCELED -> "Authentication canceled"
                            BiometricPrompt.ERROR_LOCKOUT -> "Too many attempts. Try again later."
                            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "Biometric locked. Use password."
                            BiometricPrompt.ERROR_HW_NOT_PRESENT -> "No biometric hardware"
                            BiometricPrompt.ERROR_HW_UNAVAILABLE -> "Biometric hardware unavailable"
                            BiometricPrompt.ERROR_NO_BIOMETRICS -> "No biometrics enrolled"
                            BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL -> "No device credential set"
                            else -> errString.toString()
                        }
                        promise.resolve(createAuthResult(false, errorMsg))
                    }

                    override fun onAuthenticationFailed() {
                        // Called on each failed attempt — don't resolve here,
                        // let the user retry or cancel.
                    }
                })

            biometricPrompt.authenticate(promptInfo)

        } catch (e: Exception) {
            promise.resolve(createAuthResult(false, e.message ?: "Authentication error"))
        }
    }

    /**
     * Detect the type of biometric available (fingerprint, face, iris).
     */
    private fun detectBiometryType(context: Context): String {
        try {
            val packageManager = context.packageManager
            if (packageManager.hasSystemFeature("android.hardware.fingerprint")) {
                return "fingerprint"
            }
            if (packageManager.hasSystemFeature("android.hardware.biometrics.face") ||
                packageManager.hasSystemFeature("android.hardware.face")) {
                return "face"
            }
            if (packageManager.hasSystemFeature("android.hardware.biometrics.iris") ||
                packageManager.hasSystemFeature("android.hardware.iris")) {
                return "iris"
            }
        } catch (e: Exception) {
            // Ignore
        }
        return "none"
    }

    private fun createAuthResult(success: Boolean, error: String?): ReadableMap {
        val map = Arguments.createMap()
        map.putBoolean("success", success)
        if (error != null) {
            map.putString("error", error)
        }
        return map
    }
}
