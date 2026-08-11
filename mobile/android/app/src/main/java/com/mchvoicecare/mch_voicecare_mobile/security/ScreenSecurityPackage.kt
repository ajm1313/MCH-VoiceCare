package com.mchvoicecare.mch_voicecare_mobile.security

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native package that registers the ScreenSecurity native module.
 *
 * This package is added to the list of packages in MainApplication.kt
 * so that NativeModules.ScreenSecurity is available from JS.
 */
class ScreenSecurityPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(ScreenSecurityModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
