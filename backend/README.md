# MCH VoiceCare — Backend

Python/Django backend for the MCH VoiceCare Maternal & Child Health Risk Decision Support system.

## Tech Stack

- **Framework:** Django 5.x + Django REST Framework
- **Auth:** JWT (SimpleJWT) with token blacklisting
- **UI:** DaisyUI + Tailwind CSS (server-rendered templates)
- **Database:** PostgreSQL 16+ (SQLite for dev)
- **Deployment:** Railway (Docker)

## Quick Start

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment variables
cp .env.example .env
# Edit .env as needed

# 4. Run migrations
python manage.py migrate

# 5. Create superuser
python manage.py createsuperuser

# 6. Build CSS (optional — CDN fallback in templates)
# npm install && npm run build:css

# 7. Run server
python manage.py runserver
```

## API Endpoints

All API endpoints are under `/api/v1/`:

| Path | Description |
|------|-------------|
| `accounts/auth/login/` | JWT login (POST) |
| `accounts/auth/token/refresh/` | Refresh JWT (POST) |
| `accounts/auth/profile/` | Current user profile (GET) |
| `accounts/auth/logout/` | Logout with blacklisting (POST) |
| `accounts/users/` | User CRUD |
| `organisations/units/` | Organisation hierarchy |
| `clients/persons/` | Person CRUD + search |
| `pregnancy/episodes/` | Pregnancy episodes |
| `newborn/episodes/` | Newborn episodes |
| `immunisation/children/` | Immunisation records |
| `growth/measurements/` | Growth measurements |
| `referrals/` | Referral management |
| `audit/events/` | Audit log (read-only) |

## Project Structure

```
backend/
├── config/           # Django project settings
│   ├── settings/     # base.py, production.py
│   ├── urls.py       # Root URL routing
│   ├── api_urls.py   # API URL routing
│   └── web_urls.py   # Web URL routing
├── apps/
│   ├── core/         # Shared enums, base models, utils
│   ├── accounts/     # User auth, roles, JWT
│   ├── organisations/# Org hierarchy
│   ├── clients/      # Person, Household
│   ├── pregnancy/    # ANC episodes, observations, rules
│   ├── newborn/      # Newborn episodes, observations, rules
│   ├── immunisation/ # CWC, vaccines, defaulters
│   ├── growth/       # Growth monitoring
│   ├── referrals/    # Closed-loop referrals
│   ├── audit/        # Append-only audit trail
│   ├── notifications/# Alerts and actions
│   ├── communication/# Campaigns, templates, logs
│   ├── reports/      # Generated and scheduled reports
│   ├── integrations/ # External system configs
│   └── rules/        # Shared rule engine entry point
├── templates/        # DaisyUI server-rendered templates
├── static/           # CSS source and built assets
├── manage.py
├── requirements.txt
├── Dockerfile
└── tailwind.config.js
```

## Mobile App Integration

The mobile app (React Native) expects:
- `POST /api/v1/accounts/auth/login/` → `{ token, refreshToken, expiresAt, user }`
- `POST /api/v1/accounts/auth/token/refresh/` → `{ token, refreshToken, expiresAt }`
- `GET /api/v1/accounts/auth/profile/` → user profile with role + location
- `POST /api/v1/accounts/auth/logout/` → blacklists refresh token
- All clinical endpoints support `Idempotency-Key` header for sync
