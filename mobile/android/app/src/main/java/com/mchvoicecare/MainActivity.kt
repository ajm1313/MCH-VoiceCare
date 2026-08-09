package com.mchvoicecare

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle
import android.view.WindowManager

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
        // Set FLAG_SECURE at startup as a default security measure (spec §22.2).
        // The JS ScreenSecurity module can toggle this dynamically via the
        // ScreenSecurityModule native bridge.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }

    override fun getMainComponentName(): String {
        return "MCHVoiceCare"
    }

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return DefaultReactActivityDelegate(
            this,
            mainComponentName,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        )
    }
}
