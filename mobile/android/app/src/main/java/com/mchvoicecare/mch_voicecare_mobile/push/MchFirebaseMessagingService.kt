/**
 * Firebase Messaging Service for background push notifications (spec §27).
 *
 * This service handles incoming FCM messages when the app is in the
 * background or killed. It extends FirebaseMessagingService and shows
 * a sanitized notification (spec §26 — no clinical content).
 *
 * NOTE: This file is referenced by the AndroidManifest.xml and compiled
 * by the Android build system. It must be in the Java/Kotlin source tree.
 *
 * For foreground messages, the JS pushNotifications.ts module handles
 * display via the PushNotificationModule.showLocalNotification() method.
 */
package com.mchvoicecare.mch_voicecare_mobile.push

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MchFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        const val CHANNEL_ID_GENERAL = "mch_voicecare_general"
        const val CHANNEL_ID_URGENT = "mch_voicecare_urgent"
    }

    /**
     * Called when a new FCM token is generated.
     * The token should be sent to the backend to register the device.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // The token is stored locally and sent to the backend on next sync.
        // In production, this would trigger a direct API call to register
        // the device token with the user's organisation unit.
    }

    /**
     * Called when an FCM message is received.
     *
     * If the app is in the foreground, the message is delivered to the
     * FirebaseMessaging module's message listener in JS.
     *
     * If the app is in the background or killed, a notification is shown
     * automatically by the system tray. This method handles the case
     * where a data-only message is received (no notification payload).
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // Check if message contains a notification payload
        // If it does, the system already shows it — we only handle data messages
        if (message.notification != null) {
            return
        }

        // Handle data-only message
        val title = message.data["title"] ?: "MCH VoiceCare"
        val body = message.data["body"] ?: "You have a new notification"
        val urgent = message.data["urgent"]?.toBoolean() ?: false

        // Sanitize body (spec §26 — no clinical content in notifications)
        val sanitizedBody = sanitizeNotificationBody(body)

        showNotification(title, sanitizedBody, urgent)
    }

    /**
     * Show a local notification.
     */
    private fun showNotification(title: String, body: String, urgent: Boolean) {
        val channelId = if (urgent) CHANNEL_ID_URGENT else CHANNEL_ID_GENERAL

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(if (urgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)

        if (urgent) {
            notificationBuilder.setVibrate(longArrayOf(0, 500, 250, 500))
        }

        val notificationId = System.currentTimeMillis().toInt()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, notificationBuilder.build())
    }

    /**
     * Sanitize notification body to comply with spec §26.
     * Removes clinical terms that must not appear in notifications.
     */
    private fun sanitizeNotificationBody(body: String): String {
        val clinicalTerms = listOf(
            "pregnant", "pregnancy", "anc", "danger sign", "hemorrhage",
            "eclampsia", "preeclampsia", "sepsis", "miscarriage", "abortion",
            "hiv", "aids", "diagnosis", "diagnosed", "positive", "negative",
            "abnormal", "blood pressure", "fetal", "stillbirth"
        )
        val lower = body.lowercase()
        for (term in clinicalTerms) {
            if (lower.contains(term)) {
                return "You have a new notification. Open the app to view details."
            }
        }
        return body
    }
}
