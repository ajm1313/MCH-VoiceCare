package com.mchvoicecare

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.os.Bundle
import android.view.WindowManager

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(null)
        // FLAG_SECURE prevents clinical data from appearing in recent-app
        // previews and blocks screenshots (spec §22.2).
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
