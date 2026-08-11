# Firebase Cloud Messaging (FCM) Setup

This guide explains how to configure Firebase Cloud Messaging for the MCH VoiceCare Android app.

## Prerequisites

- A Google account with access to [Firebase Console](https://console.firebase.google.com)
- The MCH VoiceCare Android app package name: `com.mchvoicecare`

## Steps

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add Project** → name it `mch-voicecare`
3. Disable Google Analytics (not required for FCM)

### 2. Add an Android App

1. In the Firebase project, click **Add App** → Android
2. Enter package name: `com.mchvoicecare`
3. Download `google-services.json`
4. Replace `mobile/android/app/google-services.json` with the downloaded file

### 3. Verify Dependencies

The following are already configured in `build.gradle`:

**Project-level** (`mobile/android/build.gradle`):
```gradle
classpath("com.google.gms:google-services:4.4.2")
```

**App-level** (`mobile/android/app/build.gradle`):
```gradle
plugins {
    id("com.google.gms.google-services")
}
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.4.0"))
    implementation("com.google.firebase:firebase-messaging")
}
```

### 4. Notification Channels

The app creates two notification channels on startup:

| Channel | ID | Importance | Use |
|---|---|---|---|
| General | `mch_voicecare_general` | LOW | Tasks, sync status |
| Urgent | `mch_voicecare_urgent` | HIGH | Referral alerts, emergencies |

### 5. Topic Subscriptions

The app subscribes to these FCM topics on login:

- `all_users` — global broadcast
- `org_{orgUnitId}` — facility-scoped notifications
- `region_{regionId}` — region-scoped notifications (if applicable)

### 6. Privacy Compliance (spec §26)

**Notification bodies MUST NOT include clinical details.** The app sanitizes
notification content before display. Only generic messages like "You have a
new task" are shown. Clinical details are only visible inside the authenticated app.

### 7. Backend Integration

To send a push notification from the backend:

```python
# Using the Firebase Admin SDK
from firebase_admin import messaging

message = messaging.Message(
    notification=messaging.Notification(
        title="New Task",
        body="You have 1 new item in your worklist",  # sanitized — no clinical data
    ),
    topic=f"org_{org_unit_id}",
)
messaging.send(message)
```

### 8. Testing

To test without Firebase:
- The app gracefully handles missing FCM configuration
- `getFcmToken()` returns `{ token: "", error: "FCM not available" }`
- All notification features are no-ops when FCM is unavailable
