# MCH VoiceCare

**Maternal & Child Health VoiceCare** — a clinical decision-support platform for community health workers (CHWs) in Ghana, covering pregnancy, newborn, immunisation, and growth-monitoring workflows with offline-first mobile capture, server-side ML/rule-engine risk stratification, and multi-channel referral & notification capabilities.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Repository Structure](#repository-structure)
3. [Prerequisites](#prerequisites)
4. [Backend Setup (Django)](#backend-setup-django)
5. [Mobile App Setup (React Native)](#mobile-app-setup-react-native)
6. [Running the Full Stack](#running-the-full-stack)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Project Documentation](#project-documentation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile App (React Native)             │
│  Offline-first SQLite · Rule-engine · OCR · IVR/USSD     │
│  Pregnancy · Newborn · Immunisation · Growth · Referrals  │
└───────────────┬─────────────────────────────────────────┘
                │ REST API (JWT) + FHIR R4 + Sync outbox
┌───────────────▼─────────────────────────────────────────┐
│                  Backend (Django 5 + DRF)                 │
│  16 apps · 39 models · ML service · Rule packages         │
│  OCR service · Telephony · FHIR · Web dashboard           │
│  Django Admin · Monitoring · Aggregate dashboards         │
└───────────────┬─────────────────────────────────────────┘
                │ PostgreSQL (prod) / SQLite (dev)
                │ Redis (caching, optional)
```

**Key features:**
- **Offline-first mobile** — full clinical workflows work without connectivity; sync queue with retry
- **Risk stratification** — server-side ML model + rule-engine with RED/ORANGE/AMBER/GREEN/GREY urgency
- **OCR** — scan paper MCH cards/prescriptions; confidence thresholds configurable
- **Telephony** — IVR/DTMF and USSD follow-up calls for illiterate users
- **FHIR R4** — interoperability endpoint for EHR integration
- **Referrals** — QR-token-based with acknowledgment tracking and escalation
- **MFA** — TOTP-based multi-factor authentication for admin accounts
- **Audit** — full audit trail of all clinical and administrative actions
- **Package management** — signed rule/ML packages with activation & rollback

---

## Repository Structure

```
MCH-VoiceCare/
├── backend/                    # Django 5 + Django REST Framework
│   ├── apps/                   # 16 Django apps
│   │   ├── accounts/           # Users, roles, MFA
│   │   ├── audit/              # Audit events
│   │   ├── clients/            # Persons, households, caregivers
│   │   ├── communication/      # Campaigns, templates, logs
│   │   ├── core/               # Config, packages, ML, OCR, telephony, signing
│   │   ├── fhir/               # FHIR R4 endpoint
│   │   ├── growth/             # Growth measurements
│   │   ├── immunisation/       # CWC, vaccines, defaulters
│   │   ├── integrations/       # External system configs, import batches
│   │   ├── newborn/            # Birth episodes, newborn episodes, observations
│   │   ├── notifications/      # Alerts, action records
│   │   ├── organisations/      # Org units, facility capabilities
│   │   ├── pregnancy/          # Pregnancy episodes, observations, assessments
│   │   ├── referrals/          # Referrals, state logs
│   │   └── reports/            # Reports, scheduled reports
│   ├── config/                 # Settings, URLs, admin registration
│   ├── ml/                     # ML model artifacts
│   ├── static/                 # CSS, images
│   ├── templates/              # Django templates (web dashboard)
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile
├── mobile/                     # React Native (TypeScript)
│   ├── src/
│   │   ├── core/               # DB, sync, rules, navigation, utils
│   │   ├── screens/            # 30+ screens
│   │   └── theme/              # Colors, branding
│   ├── android/
│   ├── assets/
│   └── package.json
├── AGENTS.md                   # Build/test commands, architecture notes
├── MCH_VOICECARE_IMPLEMENTATION_SPEC.md  # Full product specification
└── railway.json                # Railway deployment config
```

---

## Prerequisites

### Backend
- **Python 3.11+** (tested on 3.13)
- **pip** (Python package manager)
- **Node.js 18+** and **npm** (for Tailwind CSS compilation only)

### Mobile
- **Node.js 18+** and **npm** or **yarn**
- **JDK 17** (Java Development Kit)
- **Android Studio** (with Android SDK 34+)
- **React Native CLI** environment

### Optional (production)
- **PostgreSQL 14+**
- **Redis 7+**

---

## Backend Setup (Django)

### 1. Clone and enter the project

```bash
git clone https://github.com/ajm1313/MCH-VoiceCare.git
cd MCH-VoiceCare/backend
```

### 2. Create and activate a virtual environment

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Install Node dependencies (for Tailwind CSS)

```bash
npm install
```

### 5. Compile Tailwind CSS

```bash
npx tailwindcss -i ./static/src/tailwind.css -o ./static/css/tailwind.css --minify
```

> If the source CSS file doesn't exist, the pre-compiled `static/css/tailwind.css` is already included.

### 6. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your settings. Key variables:

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (use SQLite for dev, PostgreSQL for prod)
DATABASE_URL=sqlite:///db.sqlite3

# JWT
JWT_SIGNING_KEY=your-jwt-signing-key

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081

# CSRF (add browser preview origins if needed)
CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

### 7. Run database migrations

```bash
python manage.py migrate
```

### 8. Create a superuser

```bash
python manage.py createsuperuser
```

Follow the prompts to set username, password, and other details.

### 9. Load initial data (optional)

```bash
python manage.py loaddata apps/core/fixtures/initial_data.json
```

> This loads default SystemConfig, rule packages, and reference data. Skip if the fixture doesn't exist.

### 10. Start the development server

```bash
python manage.py runserver 0.0.0.0:8000
```

The backend is now running at:
- **Web dashboard:** http://localhost:8000/dashboard/
- **Django admin:** http://localhost:8000/admin/
- **API root:** http://localhost:8000/api/v1/
- **FHIR endpoint:** http://localhost:8000/fhir/R4/

Log in with the superuser credentials you created in step 8.

---

## Mobile App Setup (React Native)

### 1. Enter the mobile directory

```bash
cd MCH-VoiceCare/mobile
```

### 2. Install dependencies

```bash
npm install
```

> If you use yarn: `yarn install`

### 3. Set up the Android emulator or physical device

1. Open **Android Studio**
2. Go to **Tools → Device Manager**
3. Create a virtual device (Pixel 7, API 34) or connect a physical device via USB debugging
4. Start the emulator or confirm your device appears in `adb devices`

### 4. Start Metro bundler

```bash
npx react-native start
```

Leave this terminal running.

### 5. Build and run the app

In a **new terminal**:

```bash
cd MCH-VoiceCare/mobile
npx react-native run-android
```

The app will install on the emulator/device and launch automatically.

### 6. Configure backend URL (if needed)

If the backend is not on `localhost:8000`, edit the API base URL in:

```
mobile/src/core/api/client.ts
```

Change the `BASE_URL` to point to your backend (e.g., `http://10.0.2.2:8000` for Android emulator, or your machine's IP for a physical device).

---

## Running the Full Stack

You need **three terminals** running:

| Terminal | Command | Purpose |
|----------|---------|---------|
| 1 | `cd backend && python manage.py runserver 0.0.0.0:8000` | Django backend |
| 2 | `cd mobile && npx react-native start` | Metro bundler |
| 3 | `cd mobile && npx react-native run-android` | Build & install app |

Once all three are running:
1. Open the **web dashboard** at http://localhost:8000/dashboard/ — log in with your superuser
2. Open the **mobile app** on the emulator/device — register a new CHW account or log in
3. Create persons, pregnancy episodes, observations, referrals — they sync to the backend

---

## Testing

### Backend tests (664 tests)

```bash
cd backend
python manage.py test apps.tests --noinput
```

Or to run a specific app's tests:

```bash
python manage.py test apps.pregnancy.tests --noinput
python manage.py test apps.newborn.tests --noinput
python manage.py test apps.core.tests --noinput
```

### Mobile tests (71 tests)

```bash
cd mobile
npx jest src/core/ --no-coverage
```

### Run all tests

```bash
# Backend
cd backend && python manage.py test apps.tests --noinput

# Mobile
cd mobile && npx jest --no-coverage
```

---

## Deployment

### Backend (Railway)

The project includes `railway.json` for Railway deployment:

1. Push the repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project from the GitHub repo
3. Set the root directory to `backend/`
4. Railway will detect the `Dockerfile` and build automatically
5. Set environment variables in Railway's dashboard:
   - `SECRET_KEY` — generate a secure key
   - `DEBUG=False`
   - `DATABASE_URL` — Railway will provide a PostgreSQL URL
   - `JWT_SIGNING_KEY` — generate a secure key
   - `ALLOWED_HOSTS` — your Railway domain
6. Run migrations: `python manage.py migrate` (Railway's console or a release command)

### Backend (Docker)

```bash
cd backend
docker build -t mch-voicecare-backend .
docker run -p 8000:8000 \
  -e SECRET_KEY=your-key \
  -e DEBUG=False \
  -e DATABASE_URL=postgres://user:pass@host:5432/dbname \
  mch-voicecare-backend
```

### Mobile (APK build)

```bash
cd mobile
cd android
.\gradlew assembleRelease
```

The APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

> You'll need to configure signing keys for a production release. See the [React Native signing docs](https://reactnative.dev/docs/signed-apk-android).

---

## Project Documentation

- **[MCH_VOICECARE_IMPLEMENTATION_SPEC.md](MCH_VOICECARE_IMPLEMENTATION_SPEC.md)** — Full product specification (40+ sections covering clinical workflows, data models, ML pipeline, telephony, FHIR, security, and compliance)
- **[AGENTS.md](AGENTS.md)** — Build/test commands, architecture decisions, and development notes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.1, Django REST Framework, SimpleJWT, django-guardian |
| Database | SQLite (dev), PostgreSQL (prod) |
| ML | scikit-learn, joblib (model artifacts in `backend/ml/`) |
| Mobile | React Native 0.76, TypeScript, SQLite (op-sqlite) |
| CSS | Tailwind CSS (DaisyUI components) |
| Auth | JWT + TOTP MFA |
| API | REST + FHIR R4 |
| Deployment | Railway, Docker |

---

## License

This project is proprietary. All rights reserved.
