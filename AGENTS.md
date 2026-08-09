# MCH VoiceCare — Agent Guide

## Project Overview

MCH VoiceCare is a maternal and child health (MCH) digital health application for Northern Ghana.
It supports offline-first clinical capture, deterministic danger-sign rules, closed-loop referrals,
FHIR R4 interoperability, OCR document scanning, telephony (IVR/USSD), and server-side clinical ML.

**Tech stack:**
- **Backend:** Django 5 + DRF + PostgreSQL (SQLite for tests)
- **Mobile:** React Native + TypeScript + Zustand + React Query
- **ML:** CatBoost (server-side only, behind adapter)

## Build & Test Commands

### Backend

```bash
# Run all backend tests
cd backend && python manage.py test apps.tests --noinput

# Run a specific test module
cd backend && python manage.py test apps.tests.test_fhir --noinput

# Run migrations
cd backend && python manage.py migrate

# Start dev server
cd backend && python manage.py runserver

# Train CatBoost model (requires catboost + numpy)
cd backend && python manage.py train_catboost --data /path/to/data.csv --output ml/models/model.cbm
```

### Mobile

```bash
# Run mobile core tests
cd mobile && npx jest src/core/ --no-coverage

# Run all mobile tests
cd mobile && npx jest --no-coverage

# Start Metro bundler
cd mobile && npx react-native start

# Build Android
cd mobile && npx react-native run-android
```

## Key Architecture Decisions

1. **Offline-first:** Facility capture is local-first on SQLite; sync is bidirectional.
2. **Adapter boundaries:** OCR, telephony, and CatBoost ML are all behind Protocol-based adapters (spec §10.7-10.9).
3. **Non-downgrade invariant:** ML can escalate but NEVER de-escalate rule-based emergencies (spec §3.1).
4. **Default RULES_ONLY:** Clinical ML defaults to RULES_ONLY; ASSISTED mode requires governance approval (spec §3.2).
5. **FHIR R4:** REST surface at `/fhir/R4/` with 10 resource types (Patient, Observation, Encounter, EpisodeOfCare, ServiceRequest, Task, Provenance, AuditEvent, Library, PlanDefinition).
6. **Webhook security:** Telephony webhooks use HMAC-SHA256 signature verification (spec §22).
7. **MFA required for privileged roles:** Super/regional/district/sub-district admins must enable TOTP MFA (spec §22).

## Test Count

- Backend: 664 tests (all passing)
- Mobile: 206 tests (all passing)

## Implementation Phases

- **Phase 0:** Signature verification, clinical thresholds config, feature flags (complete)
- **Phase 1:** FHIR R4 REST surface — 9 resource types (complete)
- **Phase 2:** OCR scanning + template registry + human confirmation (complete)
- **Phase 3:** Telephony prompt packs + gateway adapter + webhook security (complete)
- **Phase 4:** CatBoost server-side inference + training pipeline (complete)
- **Phase 5:** Production hardening — MFA, ML monitoring, security tests (complete)

## Critical Safety Invariants (spec §3.1)

- ML MUST NOT cancel, downgrade, suppress, or close a rule-based emergency alert.
- Missing critical fields MUST produce ABSTAIN, not routine.
- Safety-critical OCR fields MUST be human-confirmed.
- No caller speech is recorded in the first release.
- Remote DTMF/USSD events are central-first.
