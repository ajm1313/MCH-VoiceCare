package com.mchvoicecare.mch_voicecare_mobile.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage

/**
 * Push notification native module using Firebase Cloud Messaging (spec §27).
 *
 * Provides:
 * - FCM token registration and retrieval
 * - Topic subscription for broadcast notifications
 * - Local notification display for foreground messages
 * - Notification channel management (Android 8+)
 *
 * Security (spec §26): notification content MUST NOT include clinical
 * details (diagnosis, danger signs, pregnancy status). Only generic
 * messages like "You have a new task" or "Sync completed" are shown.
 */
@ReactModule(name = PushNotificationModule.NAME)
class PushNotificationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PushNotificationModule"
        const val CHANNEL_ID = "mch_voicecare_general"
        const val CHANNEL_ID_URGENT = "mch_voicecare_urgent"
    }

    override fun getName(): String = NAME

    /**
     * Get the FCM token for this device.
     *
     * @param promise Resolves with { token: string }
     */
    @ReactMethod
    fun getToken(promise: Promise) {
        try {
            val task = FirebaseMessaging.getInstance().token
            Thread {
                try {
                    val token = com.google.android.gms.tasks.Tasks.await(task)
                    val map = Arguments.createMap()
                    map.putString("token", token)
                    promise.resolve(map)
                } catch (e: Exception) {
                    val map = Arguments.createMap()
                    map.putString("token", "")
                    map.putString("error", e.message ?: "Failed to get token")
                    promise.resolve(map)
                }
            }.start()
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putString("token", "")
            map.putString("error", e.message ?: "FCM not available")
            promise.resolve(map)
        }
    }

    /**
     * Subscribe to an FCM topic.
     *
     * @param topic   Topic name (e.g. "facility_001", "region_northern")
     * @param promise Resolves with { success: boolean }
     */
    @ReactMethod
    fun subscribeToTopic(topic: String, promise: Promise) {
        try {
            val task = FirebaseMessaging.getInstance().subscribeToTopic(topic)
            Thread {
                try {
                    com.google.android.gms.tasks.Tasks.await(task)
                    val map = Arguments.createMap()
                    map.putBoolean("success", true)
                    promise.resolve(map)
                } catch (e: Exception) {
                    val map = Arguments.createMap()
                    map.putBoolean("success", false)
                    map.putString("error", e.message ?: "Subscribe failed")
                    promise.resolve(map)
                }
            }.start()
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putBoolean("success", false)
            map.putString("error", e.message ?: "FCM not available")
            promise.resolve(map)
        }
    }

    /**
     * Unsubscribe from an FCM topic.
     *
     * @param topic   Topic name
     * @param promise Resolves with { success: boolean }
     */
    @ReactMethod
    fun unsubscribeFromTopic(topic: String, promise: Promise) {
        try {
            val task = FirebaseMessaging.getInstance().unsubscribeFromTopic(topic)
            Thread {
                try {
                    com.google.android.gms.tasks.Tasks.await(task)
                    val map = Arguments.createMap()
                    map.putBoolean("success", true)
                    promise.resolve(map)
                } catch (e: Exception) {
                    val map = Arguments.createMap()
                    map.putBoolean("success", false)
                    promise.resolve(map)
                }
            }.start()
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putBoolean("success", false)
            promise.resolve(map)
        }
    }

    /**
     * Create notification channels (Android 8+).
     * Must be called on app startup.
     */
    @ReactMethod
    fun createNotificationChannels(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val manager = reactApplicationContext.getSystemService(
                    Context.NOTIFICATION_SERVICE
                ) as NotificationManager

                // General channel — low importance
                val generalChannel = NotificationChannel(
                    CHANNEL_ID,
                    "MCH VoiceCare Notifications",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "General notifications (tasks, sync status)"
                    setShowBadge(false)
                }

                // Urgent channel — high importance (for referral alerts)
                val urgentChannel = NotificationChannel(
                    CHANNEL_ID_URGENT,
                    "MCH VoiceCare Urgent Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Urgent clinical alerts (referrals, emergencies)"
                    setShowBadge(true)
                    enableVibration(true)
                }

                manager.createNotificationChannel(generalChannel)
                manager.createNotificationChannel(urgentChannel)
            }
            val map = Arguments.createMap()
            map.putBoolean("success", true)
            promise.resolve(map)
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putBoolean("success", false)
            map.putString("error", e.message ?: "Failed to create channels")
            promise.resolve(map)
        }
    }

    /**
     * Display a local notification (for foreground FCM messages).
     *
     * Security (spec §26): the notification body MUST be sanitized —
     * no clinical details. The JS layer is responsible for sanitization
     * before calling this method.
     *
     * @param title       Notification title
     * @param body        Notification body (sanitized — no clinical data)
     * @param urgent      If true, uses the urgent channel with high importance
     * @param promise     Resolves with { success: boolean }
     */
    @ReactMethod
    fun showLocalNotification(title: String, body: String, urgent: Boolean, promise: Promise) {
        try {
            val context = reactApplicationContext
            val channelId = if (urgent) CHANNEL_ID_URGENT else CHANNEL_ID

            val notificationBuilder = NotificationCompat.Builder(context, channelId)
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
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(notificationId, notificationBuilder.build())

            val map = Arguments.createMap()
            map.putBoolean("success", true)
            promise.resolve(map)
        } catch (e: Exception) {
            val map = Arguments.createMap()
            map.putBoolean("success", false)
            map.putString("error", e.message ?: "Failed to show notification")
            promise.resolve(map)
        }
    }
}
