package com.mchvoicecare.mch_voicecare_mobile.security

import android.app.Activity
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.module.annotations.ReactModule

/**
 * ScreenSecurity native module — exposes FLAG_SECURE toggling to JS (spec §22.2).
 *
 * FLAG_SECURE prevents:
 *   - Screenshots of the app content
 *   - Content appearing in the recent-apps switcher
 *   - Content from being captured by screen mirroring/recording
 *
 * This module allows the JS layer to dynamically enable/disable FLAG_SECURE
 * on the current activity window.
 */
@ReactModule(name = ScreenSecurityModule.NAME)
class ScreenSecurityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ScreenSecurity"
    }

    override fun getName(): String = NAME

    /**
     * Enable or disable FLAG_SECURE on the current activity window.
     *
     * @param enabled true to set FLAG_SECURE (block screenshots), false to clear it.
     * @param promise resolves with true if the flag was applied, false if no activity.
     */
    @ReactMethod
    fun setFlagSecure(enabled: Boolean, promise: Promise) {
        val activity: Activity? = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }

        try {
            activity.runOnUiThread {
                if (enabled) {
                    activity.window.setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE
                    )
                } else {
                    activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCREEN_SECURITY_ERROR", "Failed to set FLAG_SECURE: ${e.message}", e)
        }
    }

    /**
     * Check whether FLAG_SECURE is currently set on the activity window.
     *
     * @param promise resolves with true if FLAG_SECURE is set, false otherwise.
     */
    @ReactMethod
    fun isFlagSecureSet(promise: Promise) {
        val activity: Activity? = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }

        try {
            val flags = activity.window.attributes.flags
            val isSecure = (flags and WindowManager.LayoutParams.FLAG_SECURE) != 0
            promise.resolve(isSecure)
        } catch (e: Exception) {
            promise.reject("SCREEN_SECURITY_ERROR", "Failed to check FLAG_SECURE: ${e.message}", e)
        }
    }
}
