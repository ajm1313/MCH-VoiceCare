---
title: MCH VoiceCare Implementation Specification
version: 0.2.0-draft
status: implementation-ready draft (stack-revised)
intended_audience:
  - AI code editors
  - React Native / mobile engineers
  - Django / backend engineers
  - ML engineers
  - clinical informatics engineers
source_basis: MCH VoiceCare technical summary (project document)
last_updated: 2026-08-08
---

# MCH VoiceCare — Implementation Specification

> **Stack revision note (v0.2.0):** The original v0.1.0 draft mandated native
> Kotlin + Jetpack Compose + Android FHIR SDK on mobile and Java 21 + Spring
> Boot 3.x + HAPI FHIR JPA on the central platform. After implementation
> review, the project owner has **approved** an alternative stack: **React
> Native (TypeScript)** for the facility app and **Django 5 + DRF** for the
> central platform. Sections 5.2, 6, 10, 11, 12, 17.3, and 22.2 have been
> updated to reflect this approved stack. **All clinical safety invariants
> (Section 3), rule governance (Section 4), domain model (Section 8),
> provenance (Section 9), referral workflow (Section 18), sync (Section 19),
> audit (Section 23), package signing (Section 24), and Definition of Done
> (Section 36) remain normative and unchanged.** The FHIR R4 REST API surface
> (Section 20.1) remains a MUST; it is served by a Django-backed FHIR-shaped
> REST layer rather than a HAPI FHIR JPA server. A project-specific FHIR
> Implementation Guide (Section 8.3) SHOULD still be produced before
> production integration.

## 1. Purpose

This document converts the current MCH VoiceCare technical concept into a concrete software specification that can be handed directly to an AI code editor or engineering team.

Normative terms:

- **MUST** = required for safety, interoperability, or scope.
- **MUST NOT** = prohibited.
- **SHOULD** = strong default unless an approved implementation reason exists.
- **MAY** = optional.

This is an implementation specification, not a clinical approval document. Clinical rules, thresholds, endpoint definitions, referral destinations, escalation time limits, and retention periods remain controlled by GHS-approved governance artifacts.

---

## 2. Product definition

MCH VoiceCare is an offline-first maternal risk decision-support and referral-coordination system for Northern Ghana.

The first deployable release MUST support:

1. structured maternal ANC data capture;
2. offline clinical validation;
3. deterministic, versioned danger-sign rules;
4. human-confirmed alerts and actions;
5. closed-loop referral coordination;
6. synchronized central records when connectivity is available;
7. DTMF/USSD patient interactions through ordinary mobile phones;
8. auditable provenance and role-based access.

The learned CatBoost clinical risk model is a separate capability and MUST remain disabled for care-changing decisions until local Ghanaian calibration, external evaluation, and governance gates are passed.

---

## 3. Non-negotiable safety invariants

The following invariants MUST be encoded as automated tests and release gates.

### 3.1 Rule-first clinical safety

- A GHS-approved current danger sign MUST be able to create or maintain an emergency alert without ML involvement.
- The ML model MUST NOT cancel, downgrade, suppress, or close a rule-based emergency alert.
- Remote self-report MAY increase urgency but MUST NOT downgrade a danger sign documented by a clinician.
- Missing remote answers MUST NOT be interpreted as reassuring evidence.
- An unknown form template, low-confidence safety-critical OCR field, missing required clinical field, or unsupported case MUST produce `ABSTAIN` or require manual confirmation; it MUST NOT silently produce a routine/green result.
- A clinician remains responsible for the care decision. All overrides MUST store actor, timestamp, reason, prior recommendation, and resulting action.

### 3.2 Model deployment safety

Supported clinical ML modes:

```text
RULES_ONLY   -> ML not executed for care.
SILENT       -> ML executes and is logged; result is hidden from clinicians and cannot alter workflow.
ASSISTED     -> validated ML result may escalate or prioritize care but cannot override approved rules.
```

Production default MUST be `RULES_ONLY` until formal approval enables `ASSISTED`.

Uncontrolled on-device learning MUST NOT be implemented.

### 3.3 Telephony safety

- Initial IVR MUST use professionally recorded prompts and DTMF input.
- Caller speech MUST NOT be recorded in the first release.
- Remote emergency responses MUST be processed server-side immediately and MUST NOT wait for facility-device synchronization.
- SMS/voicemail content MUST NOT disclose pregnancy status, diagnosis, danger signs, or other sensitive clinical information.

---

## 4. Clinical authority and rule governance

### 4.1 Source hierarchy

Executable clinical rules MUST implement the following hierarchy:

1. Ghana Safe Motherhood Protocol, 2016, as national baseline.
2. A current WHO recommendation supersedes an older conflicting provision.
3. Later GHS/MOH addenda enter production only after GHS clinical approval.

Each executable rule MUST persist:

```yaml
rule_id: string
rule_version: semver
source_title: string
source_organization: string
source_version: string
source_effective_date: date
approval_authority: string
approval_record_id: string
approved_at: datetime
logic_hash: sha256
status: draft|approved|retired
```

### 4.2 Rule package format

Clinical rules SHOULD be represented as FHIR-compatible artifacts using CQL plus FHIR `Library`, `PlanDefinition`, `ActivityDefinition`, and supporting `ValueSet`/`CodeSystem` resources where practical.

A release bundle MUST contain:

```text
/rules-bundle/
  manifest.json
  signature.ed25519
  fhir/
    Library-*.json
    PlanDefinition-*.json
    ValueSet-*.json
    CodeSystem-*.json
  cql/
    *.cql
  tests/
    *.json
```

`manifest.json` MUST contain version, effective date, minimum app version, artifact hashes, approval record, and rollback predecessor.

The Android app MUST verify bundle signature and hashes before activation.

---

## 5. System architecture

### 5.1 High-level flow

```text
MCH page scan / manual entry / DTMF / USSD
        |
        v
Structured observation + provenance
        |
        v
Clinical field validation
        |
        v
Versioned deterministic rule engine
        |
        +----> Emergency / priority rule alert
        |
        v
Optional calibrated CatBoost clinical risk model
        |
        v
Separate engagement-risk model
        |
        v
Suggested action + reasons + uncertainty
        |
        v
Human confirmation / override
        |
        v
Referral + transport workflow + audit trail
        |
        v
Local persistence + asynchronous central sync
```

### 5.2 Reference deployment

Use a two-project repository with the following logical components:

```text
mch-voicecare/
  backend/                      # Django 5 + DRF central platform
    apps/                       # Django apps (one per domain area)
      accounts/                 # auth, device provisioning, RBAC
      audit/                    # audit events (§23)
      clients/                  # patients/persons
      communication/            # telephony webhooks (§17)
      core/                     # config, packages, sync, decision service
      fhir/                     # FHIR R4 REST surface (§20.1)
      growth/                   # growth monitoring + rules
      immunisation/             # EPI schedule + defaulter tracing
      integrations/             # external system adapters
      newborn/                  # newborn episodes + rules
      notifications/            # alerts, emergency notifications
      organisations/            # org hierarchy (§21.1)
      pregnancy/                # pregnancy episodes + ANC rules
      referrals/                # referral state machine (§18.3)
      reports/                  # aggregate dashboards
      rules/                    # rule-engine service dispatch
      tests/                    # acceptance, golden, sync, security tests
    config/                     # Django settings, URL routing
    templates/                  # server-rendered admin/dashboard HTML
    static/
    requirements.txt
    Dockerfile
  mobile/                       # React Native facility app
    android/                    # native Android shell
    src/
      components/               # shared UI components
      config/                   # app config constants
      core/
        auth/                   # auth store, device provisioning
        db/                     # SQLite (SQLCipher) local persistence
        dedup/                  # person deduplication
        growth/                 # WHO LMS, growth assessment
        immunisation/           # schedule engine, reconciliation, tracing
        navigation/             # React Navigation types
        rules/                  # offline rule engine, rule package, unified decision
        services/               # clinician override
        sync/                   # outbox, engine, pull, config store, purge
        utils/                  # CSV parser, urgency mapping
      screens/                  # one file per screen (feature modules)
      theme/                    # colours, dark/light theme
    package.json
    tsconfig.json
  ml/                           # ML training/eval (separate, Phase 5)
    clinical-risk/
    engagement-risk/
    validation/
  ocr/                          # OCR templates + benchmark (Phase 4)
    templates/
    benchmark/
  infra/
    docker/
  docs/
    adr/
    runbooks/
    validation/
  MCH_VOICECARE_IMPLEMENTATION_SPEC.md
```

This repo structure reflects the approved React Native + Django stack. The `ml/`, `ocr/`, `infra/`, and `docs/` directories are created as Phase 4/5 work begins. The clinical and safety constraints above are normative.

---

## 6. Recommended technology stack

The project owner has approved a **React Native + Django** stack as the implementation technology. The clinical safety constraints in Sections 3–5 are normative and technology-independent; the stack below is the approved reference implementation.

### 6.1 Facility mobile application

- Framework: **React Native 0.76+** (single codebase, Android-first).
- Language: **TypeScript**.
- Minimum OS: **Android 10 / API 29**.
- UI: **React Native components + React Navigation** (native-stack).
- Local clinical data: **react-native-nitro-sqlite** (SQLCipher encrypted SQLite).
- Secure secrets: **react-native-keychain** (wraps Android Keystore under the hood).
- Background work: JS-level sync engine with persistent outbox queue; **MUST** survive app restarts via SQLite-backed outbox. A native foreground-service bridge SHOULD be added if long-running background sync is required on specific devices.
- Network: **fetch / axios** over HTTPS; consistent client wrapper.
- State management: **Zustand** for local stores; **@tanstack/react-query** for server-cache.
- Camera: **react-native-vision-camera** or **CameraX bridge** (Phase 4 OCR).
- Image preprocessing: **OpenCV** via native bridge or server-side preprocessing (Phase 4).
- OCR: PP-OCRv5 mobile runtime via native bridge, packaged only after benchmark validation (Phase 4).
- QR generation/scanning: **react-native-qrcode** or equivalent local library.

### 6.2 Central platform

Approved implementation:

- Runtime: **Python 3.12+**.
- Framework: **Django 5.x + Django REST Framework**.
- FHIR API: **Django-backed FHIR R4 REST surface** — DRF views that emit FHIR-conformant JSON for `Patient`, `Observation`, `Encounter`, `EpisodeOfCare`, `ServiceRequest`, `Task`, `Provenance`, `AuditEvent`, `Library`, `PlanDefinition`. A project-specific FHIR Implementation Guide (§8.3) SHOULD define profiles and required identifiers before production integration. If full HAPI FHIR JPA conformance is later required, a sidecar HAPI server MAY be added behind the same `/fhir/R4` base path.
- Database: **PostgreSQL 16+** (SQLite for local dev only).
- Async jobs: Django management commands + PostgreSQL-backed job queue initially; Celery/RabbitMQ only when throughput requires it.
- Object storage: S3-compatible, GHS-approved storage for temporary/approved binary artifacts.
- Authentication: **djangorestframework-simplejwt** (JWT) initially; standards-based OIDC provider with MFA for privileged roles SHOULD be integrated before production.
- API: HTTPS REST + FHIR R4 REST.
- Server-rendered admin: Django templates + Tailwind CSS for aggregate dashboards, monitoring, override log, and admin views.

The central platform MUST remain deployable under GHS-approved jurisdiction and security controls.

### 6.3 ML runtime

Clinical model family: **CatBoost**.

Because React Native does not have a native CatBoost runtime, clinical ML inference MUST run **server-side** as a Django service behind an adapter boundary. The mobile app MUST NOT execute clinical ML locally; it requests ML results via the sync/API layer only when the feature flag is not `RULES_ONLY`.

Adapter boundary (TypeScript, mobile side):

```typescript
interface ClinicalRiskInference {
  predict(input: ClinicalRiskInput): Promise<ClinicalRiskPrediction>;
  modelMetadata(): ModelMetadata;
}
```

Adapter boundary (Python, server side):

```python
class ClinicalRiskInference(Protocol):
    def predict(self, input: ClinicalRiskInput) -> ClinicalRiskPrediction: ...
    def model_metadata(self) -> ModelMetadata: ...
```

Reference server path: load a frozen CatBoost model (`catboost.CatBoostClassifier`) in a Django service process. Do not hard-wire business logic to one runtime implementation.

The model package MUST be signed and versioned independently of the app and the backend.

---

## 7. Device procurement baseline

The Android app MUST be validated on at least the following procurement floor:

```yaml
android_version: '10 or later'
cpu: '64-bit'
ram_gb: 4
storage_gb: 64
minimum_free_storage_gb: 2
rear_camera: '8 MP autofocus with flash'
video_or_capture_resolution: '720p or better'
battery_mah: 4000
screen_lock: 'hardware-backed'
```

Before support is frozen, test the app on the procurement-floor device and at least two locally common lower-cost devices.

---

## 8. Core domain model

### 8.1 Stable identifiers

The system MUST maintain:

- one stable `patient_id` per woman;
- one `pregnancy_episode_id` per pregnancy;
- one `referral_episode_id` per referral event.

UUIDv4 is the reference identifier format because it can be generated offline without coordination.

Each identifier MUST also be available as a FHIR `Identifier` with a system URI owned by the platform.

Example:

```json
{
  "system": "https://mchvoicecare.ghs.gov.gh/id/pregnancy",
  "value": "fbc0fd9d-5dc7-4a06-a27e-c98d4090d345"
}
```

### 8.2 Logical observation schema

All capture routes MUST normalize into the same logical observation contract before clinical evaluation.

```json
{
  "observationId": "uuid",
  "patientId": "uuid",
  "pregnancyEpisodeId": "uuid",
  "code": "string",
  "value": 160,
  "unit": "mmHg",
  "observedAt": "2026-08-07T10:15:00Z",
  "captureRoute": "MANUAL|OCR|IVR_DTMF|USSD|DEVICE_IMPORT",
  "sourceArtifactId": "optional-string",
  "templateVersion": "optional-string",
  "confidence": 0.98,
  "confirmedByHuman": true,
  "enteredBy": "user-or-system-id",
  "createdAt": "datetime"
}
```

Safety-critical fields MUST record whether they were human-confirmed.

### 8.3 FHIR mapping

Reference mappings:

| Domain concept | FHIR resource |
|---|---|
| Woman | `Patient` |
| Pregnancy episode | profiled `EpisodeOfCare` |
| ANC contact | `Encounter` |
| Vitals/labs/symptoms | `Observation` |
| Questionnaire answers | `QuestionnaireResponse` |
| Referral request | `ServiceRequest` |
| Referral workflow state | `Task` |
| Receiving-facility encounter | `Encounter` |
| Facility | `Organization` + `Location` |
| Clinical rule package | `Library` + `PlanDefinition` |
| Audit/provenance | `Provenance` + `AuditEvent` |

A project-specific FHIR Implementation Guide SHOULD define profiles and required identifiers before production integration.

---

## 9. Data provenance

Every clinically relevant datum MUST be traceable to source.

Minimum provenance fields:

```yaml
capture_route: MANUAL|OCR|IVR_DTMF|USSD|IMPORT
source_page_or_prompt: string|null
template_version: string|null
captured_at: datetime
captured_by: user_id|system_id
ocr_confidence: number|null
human_confirmed: boolean
correction_of: observation_id|null
correction_reason: string|null
device_id: string|null
```

Corrections SHOULD be append-only. Do not overwrite an original observation without preserving its history.

---

## 10. Facility application modules

Recommended source structure (React Native):

```text
mobile/src/
  components/             # shared UI components (SyncBanner, SearchFilter, etc.)
  config/                 # app config constants
  core/
    auth/                 # auth store, device provisioning, role checks
    db/                   # SQLite (SQLCipher) local persistence layer
    dedup/                # person deduplication
    growth/               # WHO LMS tables, growth assessment
    immunisation/         # schedule engine, reconciliation, defaulter tracing
    navigation/           # React Navigation route types
    rules/                # offline rule engine, rule package, unified decision
    services/             # clinician override
    sync/                 # outbox, sync engine, pull, config store, purge
    utils/                # CSV parser, urgency mapping
  screens/                # one file per screen — each screen is a feature module
  theme/                  # colours, dark/light theme tokens
```

Feature-to-screen mapping:

| Spec feature area | Screens |
|---|---|
| `:feature:patient` | `PersonListScreen`, `PersonFormScreen`, `PersonDetailScreen` |
| `:feature:pregnancy` | `PregnancyListScreen`, `PregnancyRegisterScreen`, `PregnancyDetailScreen`, `PregnancyObserveScreen`, `PregnancyAssessmentScreen`, `PregnancyCloseScreen`, `PregnancyTransferScreen` |
| `:feature:anc` | (covered by pregnancy observe + assessment screens) |
| `:feature:scan` | `ScanScreen`, `OcrConfirmScreen` (Phase 4 — to be built) |
| `:feature:rules` | `core/rules/offlineEngine.ts`, `core/rules/rulePackage.ts` |
| `:feature:risk` | `core/rules/unifiedDecision.ts` |
| `:feature:referral` | `ReferralCreateScreen`, `ReferralDetailScreen`, `ReferralListScreen`, `ReferralQrSlipScreen` |
| `:feature:worklist` | `TaskListScreen`, `DashboardScreen` |
| `:feature:settings` | `SyncStatusScreen`, `LoginScreen` |
| `:feature:audit` | `AuditListScreen` |

### 10.1 Facility user roles

Primary facility users:

- midwife;
- CHO.

The facility app SHOULD start with English-only UI.

### 10.2 Required offline workflows

The facility app MUST allow the following without internet connectivity:

1. authenticate using a previously provisioned account/session under approved offline rules;
2. search locally assigned patients;
3. register or update a patient;
4. start/open a pregnancy episode;
5. manually enter ANC observations;
6. scan supported MCH book pages;
7. confirm OCR results;
8. run validation and approved clinical rules;
9. run clinical ML only if its feature mode is enabled;
10. display result, reasons, missing critical fields, rule/model versions, and uncertainty;
11. create a referral;
12. print or display referral slip data and QR payload;
13. record pre-referral actions;
14. record override reasons;
15. queue all changes for later sync;
16. show last successful sync time and pending/error counts.

---

## 11. Clinical input validation

Validation runs before rule/model execution.

Validation types:

```text
TYPE        -> correct scalar/category/date type
UNIT        -> allowed unit or explicit unit conversion
RANGE       -> plausible physiological/domain range
REQUIRED    -> required field for current workflow
CROSS_FIELD -> values are mutually coherent
CONFIDENCE  -> OCR confidence meets field-specific threshold
TEMPLATE    -> page/template version is known and supported
```

Validation outcome:

```typescript
enum ValidationDisposition {
    PASS = 'PASS',
    CONFIRM_REQUIRED = 'CONFIRM_REQUIRED',
    BLOCK_AND_REENTER = 'BLOCK_AND_REENTER',
    ABSTAIN = 'ABSTAIN',
}
```

Safety-critical values that are OCR-derived MUST require confirmation unless field-specific validation has been clinically approved to allow otherwise.

---

## 12. Clinical rule engine contract

### 12.1 Input

The rule engine receives a snapshot of normalized, validated observations plus pregnancy context.

```typescript
interface RuleEvaluationInput {
    patientId: string;
    pregnancyEpisodeId: string;
    encounterId: string;
    observations: ClinicalObservation[];
    gestationalAgeWeeks: number | null;
    now: string;  // ISO-8601 instant
}
```

### 12.2 Output

```typescript
interface RuleEvaluationResult {
    disposition: ClinicalDisposition;
    firedRules: FiredRule[];
    missingCriticalFields: string[];
    bundleVersion: string;
    evaluatedAt: string;  // ISO-8601 instant
}

enum ClinicalDisposition {
    EMERGENCY_NOW = 'EMERGENCY_NOW',
    PRIORITY_REVIEW = 'PRIORITY_REVIEW',
    ROUTINE = 'ROUTINE',
    ABSTAIN = 'ABSTAIN',
}
```

### 12.3 Fired rule

```json
{
  "ruleId": "GHS-SMP-2016-EXAMPLE",
  "ruleVersion": "1.2.0",
  "severity": "EMERGENCY",
  "reasonCode": "string",
  "reasonText": "short clinician-readable explanation",
  "sourceTitle": "string",
  "sourceVersion": "string",
  "sourceEffectiveDate": "date"
}
```

---

## 13. Clinical ML specification

### 13.1 Prediction targets

Primary target:

> New severe maternal outcome within 7 days of assessment or before the next planned contact, whichever occurs first.

Secondary target:

> Severe maternal outcome through delivery and 42 days after pregnancy ends.

The label set MUST use clinically adjudicated severe outcomes and MUST NOT use a synthetic red/amber/green label.

Maternal death alone MUST NOT be the only training target.

### 13.2 Prediction modes

Two evaluated modes are required:

```text
CORE_ANC
  Uses scan-confirmed or manually entered ANC data.

ENRICHED
  Adds valid DTMF/USSD inputs when available.
```

If one model supports missing auxiliary fields, performance MUST still be reported and calibrated separately for core-only and enriched records.

### 13.3 Feature contract

All model features MUST be defined in a version-controlled dictionary:

```yaml
feature_id: systolic_bp
source_codes:
  - fhir_code_or_internal_code
value_type: numeric
unit: mmHg
allowed_missing: false
capture_routes:
  - MANUAL
  - OCR
prediction_time_constraint: 'must exist before prediction timestamp'
preprocessing: 'none'
```

Model training and inference MUST use the same frozen feature-contract version.

### 13.4 Prediction output

```json
{
  "modelId": "clinical-catboost-7d",
  "modelVersion": "0.0.0-research",
  "featureContractVersion": "1.0.0",
  "mode": "CORE_ANC",
  "probability": 0.0,
  "thresholdId": "optional-approved-threshold",
  "riskBand": "NOT_SHOWN|PRIORITY|HIGH",
  "reasonCodes": [],
  "missingCriticalFields": [],
  "outOfDistribution": false,
  "abstained": false,
  "evaluatedAt": "datetime"
}
```

The UI MUST display model version and model mode when a clinical model result is visible.

### 13.5 Required comparators

Validation MUST compare CatBoost against:

- elastic-net logistic regression — mandatory transparent baseline;
- Explainable Boosting Machine;
- XGBoost or LightGBM.

All candidates MUST use identical patient/pregnancy splits and external holdouts.

### 13.6 Required clinical evaluation metrics

Do not use overall accuracy as the primary safety metric.

Required reporting:

- sensitivity at emergency/high-risk operating thresholds;
- specificity;
- precision-recall area;
- positive predictive value;
- negative predictive value;
- calibration slope;
- calibration intercept;
- Brier score;
- structured false-negative review;
- clinical decision-curve net benefit;
- alert/referral workload;
- subgroup performance by region, facility type, age, parity, language, disability, and capture route;
- temporal and geographic external validation.

---

## 14. Engagement-risk model

The engagement model is clinically separate from medical severity.

Target examples:

- missed ANC;
- failed referral;
- unreachable contact;
- inability to reach care.

Allowed actions:

- reminder;
- call;
- CHO outreach;
- home visit prioritization.

The engagement model MUST NOT diagnose clinical severity or downgrade clinical urgency.

---

## 15. Unified clinical decision result

Application logic SHOULD combine rule, ML, and engagement outputs into one immutable result object.

```json
{
  "decisionId": "uuid",
  "patientId": "uuid",
  "pregnancyEpisodeId": "uuid",
  "encounterId": "uuid",
  "clinicalDisposition": "EMERGENCY_NOW|PRIORITY_REVIEW|ROUTINE|ABSTAIN",
  "ruleResult": {},
  "clinicalRiskResult": null,
  "engagementRiskResult": null,
  "reasons": [],
  "missingCriticalFields": [],
  "requiresHumanConfirmation": true,
  "createdAt": "datetime"
}
```

Decision precedence MUST be:

```text
ABSTAIN due to unsafe/insufficient data -> manual review before routine classification
EMERGENCY rule -> EMERGENCY_NOW regardless of ML
PRIORITY rule -> at least PRIORITY_REVIEW
Validated ML -> may escalate, never de-escalate rule result
Engagement risk -> affects outreach only
```

---

## 16. OCR and scanning specification

### 16.1 Scope

The OCR pipeline MUST operate on versioned Ghana MCH Record Book templates.

Do not implement an end-to-end vision model that directly emits a referral decision.

### 16.2 Processing pipeline

```text
Camera guidance
 -> blur/glare detection
 -> orientation correction
 -> dewarping
 -> template/version detection
 -> geometric alignment
 -> region-of-interest extraction
 -> checkbox/mark detection
 -> printed-field OCR
 -> constrained handwritten number recognition
 -> type/unit/range validation
 -> mandatory confirmation when required
 -> normalized observation + provenance
```

### 16.3 Extraction strategy

- Printed text: PP-OCRv5 mobile as the starting model.
- Checkboxes/marks: classical image processing on fixed regions.
- Handwritten digits/dates/BP/lab values: locally validated constrained recognizer.
- Handwritten free text: research-only recognizer or manual transcription.
- Unconfirmed free text MUST NOT be fed directly into clinical scoring.

### 16.4 Template registry

```yaml
template_id: gh-mch-book-anc-page-x
template_version: '2026.1'
active_from: date
status: active|retired|research
page_dimensions: string
regions:
  - field_code: systolic_bp
    bbox: [x, y, width, height]
    recognizer: handwritten_numeric
    safety_critical: true
```

Unknown pages MUST route to manual entry.

### 16.5 OCR quality metrics

Benchmark at field level, not page-level character accuracy.

Required metrics:

- exact-match rate by field;
- abnormal-value sensitivity;
- false-normal rate;
- confirmation rate;
- failure rate by template, device, facility/region, and writer group;
- processing latency.

---

## 17. Telephony / DTMF / USSD specification

### 17.1 Channels

Patient-facing channels:

- IVR using recorded prompts + DTMF;
- USSD structured selections.

Supported patient languages in first release:

- Dagbani;
- Gonja;
- English.

The same keypad meanings SHOULD be retained across languages.

### 17.2 Prompt lifecycle

Prompts MUST be:

1. clinically approved;
2. professionally recorded by humans;
3. independently back-translated;
4. comprehension-tested with pregnant women and midwives;
5. versioned.

```yaml
prompt_id: string
prompt_version: string
language: dagbani|gonja|english
audio_asset_id: string
question_code: string
allowed_keys: ['1','2','3']
repeat_key: '9'
back_key: '0'
human_help_key: '*'
```

### 17.3 Telephony provider abstraction

Because the live Ghana telecom/aggregator provider is not fixed, implement:

```python
from typing import Protocol

class TelephonyGateway(Protocol):
    def verify_webhook(self, request: RawWebhook) -> VerifiedTelephonyEvent: ...
    def begin_call(self, call: OutboundCallRequest) -> str:  # ProviderCallId
        ...
    def send_neutral_sms(self, request: NeutralSmsRequest) -> str:  # ProviderMessageId
        ...
```

No business logic may depend directly on a single provider SDK.

### 17.4 Remote emergency path

When a DTMF/USSD response triggers an approved emergency rule:

1. persist the remote observation centrally;
2. create an emergency alert centrally;
3. repeat approved emergency advice to the caller;
4. notify the assigned facility role;
5. initiate referral/escalation workflow according to configured policy;
6. sync the event to the facility app later.

---

## 18. Referral and transport workflow

### 18.1 Referral routing principle

A red alert SHOULD route to the nearest currently verified capable facility, not automatically to the next administrative level.

Facility capability registry SHOULD include:

```yaml
facility_id: string
capabilities:
  maternity_triage_24_7: boolean
  bemonc: boolean
  cemonc: boolean
  theatre: boolean
  blood: boolean
  specialist_obstetrics: boolean
  newborn_support: boolean
primary_referral_destination_id: string|null
backup_referral_destination_id: string|null
verified_at: datetime
verification_expires_at: datetime
```

### 18.2 Role-based contacts

Contact data MUST be role-based and time-bounded.

Example:

```yaml
contact_role: RECEIVING_MATERNITY_TRIAGE
facility_id: string
phone: string
verified_at: datetime
expires_at: datetime
```

Do not hard-code personal telephone numbers in app source or rule bundles.

### 18.3 Referral state machine

Reference state machine:

```text
DRAFT
 -> REQUESTED
 -> RECEIVING_FACILITY_NOTIFIED
 -> ACCEPTED
 -> TRANSPORT_REQUESTED
 -> IN_TRANSIT
 -> ARRIVED
 -> DISPOSITION_RECORDED
 -> CLOSED
```

Exceptional states:

```text
DECLINED
NO_ACK_ESCALATED
TRANSPORT_UNAVAILABLE
CANCELLED_BY_CLINICIAN
LOST_TO_FOLLOWUP
```

A referral MUST NOT become `CLOSED` until the receiving facility records arrival plus disposition/outcome, unless an authorized documented exception workflow is used.

### 18.4 Escalation cascade

Default workflow:

1. notify local midwife/CHO and provide approved emergency advice;
2. contact receiving maternity/triage line and obtain acceptance;
3. activate National Ambulance Service through `112` and configured local transport coordination;
4. after the configured GHS-approved acknowledgment timeout, escalate to backup destination and district on-call supervisor;
5. if ambulance unavailable, invoke configured district-approved alternative transport path;
6. close only after receiving-facility result is recorded.

The exact timeout values MUST be configuration, not source-code constants.

### 18.5 Referral slip payload

The app SHOULD generate a printable/human-readable referral slip with:

- patient identifier;
- pregnancy episode identifier;
- referral episode identifier;
- destination;
- urgency;
- pre-referral care;
- QR code;
- short human-readable code.

Do not place unnecessary clinical details in the QR payload. Prefer an opaque lookup token or signed compact identifier.

---

## 19. Central synchronization

### 19.1 Offline-first principles

- Facility capture is local-first.
- Remote DTMF/USSD events are central-first.
- Synchronization is bidirectional.
- All records MUST use stable identifiers generated before sync.
- Sync status MUST be visible to the user.

### 19.2 Local outbox

Each local write SHOULD append an outbox item:

```json
{
  "eventId": "uuid",
  "entityType": "Observation",
  "entityId": "uuid",
  "operation": "UPSERT",
  "localVersion": 4,
  "createdAt": "datetime",
  "syncStatus": "PENDING|IN_FLIGHT|SYNCED|ERROR",
  "retryCount": 0
}
```

### 19.3 Idempotency

Central write APIs MUST accept an `Idempotency-Key` equal to the event ID or equivalent unique token.

The server MUST return the same success result for duplicate replay of the same idempotency key.

### 19.4 Conflict handling

Use explicit conflict policies:

- Clinical observations: append-only; corrections create a replacement relationship instead of destructive overwrite.
- Referral task/workflow: optimistic concurrency using FHIR `meta.versionId` / ETag or equivalent version token.
- Administrative configuration: server-authoritative; signed bundles/configuration are downloaded and activated locally.
- Patient identity conflicts: do not auto-merge; place in reconciliation queue.

### 19.5 Retry

Background sync SHOULD use exponential backoff with jitter and network constraints through the SQLite-backed outbox sync engine.

No clinical alert already visible on-device may disappear solely because sync failed.

---

## 20. API surface

### 20.1 FHIR API

Base path:

```text
/fhir/R4
```

FHIR REST SHOULD be the canonical CRUD interface for standardized clinical resources.

### 20.2 Application APIs

Reference non-FHIR endpoints:

```text
POST /api/v1/auth/device-provision
GET  /api/v1/config/bootstrap
GET  /api/v1/packages/rules/latest
GET  /api/v1/packages/models/latest
POST /api/v1/sync/batch
POST /api/v1/telephony/webhooks/{provider}
POST /api/v1/referrals/{id}/acknowledge
POST /api/v1/referrals/{id}/transport
POST /api/v1/referrals/{id}/arrival
POST /api/v1/referrals/{id}/disposition
GET  /api/v1/facilities/{id}/referral-options
GET  /api/v1/worklists/my
```

### 20.3 Batch sync contract

```json
{
  "deviceId": "string",
  "lastServerCursor": "optional-string",
  "events": [
    {
      "eventId": "uuid",
      "resourceType": "Observation",
      "resource": {}
    }
  ]
}
```

Response:

```json
{
  "acceptedEventIds": [],
  "rejectedEvents": [
    {
      "eventId": "uuid",
      "code": "VALIDATION_ERROR|CONFLICT|UNAUTHORIZED",
      "message": "string"
    }
  ],
  "serverChanges": [],
  "nextServerCursor": "string"
}
```

---

## 21. Access control

Access MUST combine geographic scope and functional role.

### 21.1 Organization hierarchy

Represent facilities using an organization path:

```text
Region / District / Sub-district / Facility
```

### 21.2 Default access model

| User level | Default scope | Default view |
|---|---|---|
| Facility midwife/CHO | exact facility + assigned incoming/outgoing referrals | identified clinical records |
| Sub-district administrator | descendant facilities | aggregate supervision/referral operations |
| District administrator | descendant sub-districts/facilities | aggregate programme/referral/transport |
| Regional administrator | descendant districts | aggregate monitoring/exception queues |
| National administrator | all regions | aggregate national monitoring/config/system health |

Identified access above facility level MUST require a named, purpose-bound role such as active referral, clinical supervision, investigation, or audit.

### 21.3 Authorization model

Implement RBAC + geographic attributes.

Reference claim set:

```json
{
  "sub": "user-id",
  "roles": ["MIDWIFE"],
  "organizationId": "facility-id",
  "organizationPath": "/northern/tolon/subdistrict-x/facility-y",
  "purposes": ["DIRECT_CARE"],
  "exp": 0
}
```

Every identifiable record view and export MUST be audit logged.

Shared accounts and a universal unrestricted national account MUST NOT exist.

---

## 22. Authentication and device security

### 22.1 Device provisioning

Each facility device MUST be registered centrally and assigned:

- `device_id`;
- facility/organization;
- public key or device-bound credential;
- minimum supported app version;
- revocation status.

### 22.2 Local protections

- Use **react-native-keychain** (wraps Android Keystore) for device keys and local secret wrapping.
- Use **SQLCipher** (via react-native-nitro-sqlite) for encrypted local clinical persistence.
- Require hardware-backed screen lock on procurement devices.
- Auto-lock the app after configured inactivity.
- Do not expose sensitive data in notification text or Android recent-app snapshots.
- Disable app data backup (`android:allowBackup="false"`) unless an approved encrypted backup design exists.

### 22.3 Transport security

- TLS 1.2+ minimum; TLS 1.3 preferred.
- Certificate validation MUST NOT be bypassed.
- Privileged admin roles SHOULD require MFA when online.

---

## 23. Audit specification

Audit events MUST cover:

- login/logout;
- patient search/open;
- record create/update/correction;
- OCR extraction and human correction;
- rule evaluation;
- ML inference execution and display state;
- clinician confirmation/override;
- referral creation/state change;
- telephony emergency event;
- identifiable export;
- rules/model/config package activation/rollback;
- permission changes.

Minimum audit event:

```json
{
  "auditId": "uuid",
  "actorId": "string",
  "actorRole": "string",
  "action": "string",
  "patientId": "optional-uuid",
  "pregnancyEpisodeId": "optional-uuid",
  "referralEpisodeId": "optional-uuid",
  "deviceId": "optional-string",
  "facilityId": "optional-string",
  "timestamp": "datetime",
  "purpose": "DIRECT_CARE|REFERRAL|SUPERVISION|AUDIT|ADMIN",
  "metadata": {}
}
```

Audit records SHOULD be append-only and protected from routine user modification.

---

## 24. Package management and rollback

The following are separately versioned packages:

- clinical rule bundle;
- clinical ML model;
- engagement model;
- OCR model(s);
- MCH template definitions;
- telephony prompt pack;
- referral capability/contact directory;
- application configuration.

Each package MUST have:

```yaml
package_id: string
package_type: string
version: semver
created_at: datetime
effective_from: datetime|null
minimum_app_version: string
sha256: string
signature: string
signing_key_id: string
previous_version: string|null
status: staged|active|retired|revoked
```

Activation MUST be transactional. If validation fails, the previous active package remains in use.

The app MUST retain at least one known-good rollback version for critical rules/configuration when storage permits.

---

## 25. Data retention and images

The source document leaves final OCR source-image retention unresolved pending GHS/PRAAD decision.

Therefore implementation MUST support policy-driven image lifecycle rather than a hard-coded period.

```yaml
scan_retention_mode: LEGAL_RECORD|TEMPORARY_WORKING_COPY
scan_temporary_retention_hours: configurable
purge_requires:
  - verified_extraction
  - human_confirmation
  - successful_sync
  - qa_window_elapsed
```

If images are classified as legal medical records, retention MUST follow the approved GHS/PRAAD schedule. If classified as temporary OCR working copies, purge after the approved workflow conditions and QA window.

Caller audio MUST NOT be stored in the first release.

---

## 26. Privacy and consent

The product MUST support recording preferences for:

- IVR/DTMF/USSD contact;
- preferred language;
- safe calling times;
- shared-phone status;
- optional secondary use/model-training consent or approved waiver status.

Care consent and model-training/research authorization MUST be separate concepts.

Refusal of optional secondary use MUST NOT block clinical care.

---

## 27. Monitoring and observability

### 27.1 Technical monitoring

Central dashboards SHOULD track:

- API error rate and latency;
- sync success/failure rate;
- backlog depth;
- telephony webhook failures;
- referral acknowledgment delays;
- package rollout status;
- device last-sync time;
- crash-free sessions;
- storage pressure.

### 27.2 Clinical safety monitoring

For approved pilots, track:

- alert counts and rate;
- rule/model disagreement;
- overrides and reasons;
- referral acceptance;
- transport activation;
- arrival confirmation;
- time to care;
- false negatives;
- calibration drift;
- missingness drift;
- subgroup performance.

Do not expose patient identifiers in general-purpose application logs.

---

## 28. Proposed engineering performance targets

These are engineering targets for implementation planning, not claims from the source document. They MUST be validated on the procurement-floor device and local networks.

| Operation | Proposed target |
|---|---:|
| App cold start | <= 4 s |
| Local patient search | <= 300 ms for local index |
| Clinical validation | <= 100 ms |
| Rule evaluation | <= 150 ms |
| Clinical ML inference | <= 500 ms after model load |
| Single-page OCR end-to-end | <= 8 s on baseline device |
| QR generation | <= 200 ms |
| Sync batch of 100 small resources on usable 3G | <= 10 s excluding retries |
| Installed app + bundled active models | <= 800 MB |
| Temporary scan cache | configurable, default cap <= 500 MB |

Failure to meet an engineering target is not automatically a clinical failure, but safety-critical latency and storage regressions MUST block release when they interfere with care workflow.

---

## 29. Testing strategy

### 29.1 Unit tests

Required areas:

- field validation;
- unit conversion;
- rule precedence;
- emergency non-downgrade invariant;
- model mode gating;
- referral state transitions;
- sync idempotency;
- permission checks;
- package signature verification;
- QR payload validation.

### 29.2 Rule golden tests

Every approved rule MUST include positive, negative, boundary, missing-data, and conflict scenarios.

Example test structure:

```json
{
  "caseId": "rule-example-boundary-001",
  "input": {},
  "expected": {
    "firedRuleIds": ["RULE-ID"],
    "disposition": "EMERGENCY_NOW"
  }
}
```

A rule bundle MUST NOT activate if any golden test fails.

### 29.3 OCR tests

- gold-standard manually adjudicated crops;
- multiple device cameras;
- blur/glare/orientation variants;
- handwritten numeric fields;
- abnormal-value sensitivity;
- forced confirmation of low-confidence safety-critical values.

### 29.4 Offline/sync tests

Test at minimum:

- 24+ hours offline followed by resync;
- duplicate event replay;
- interrupted upload;
- device clock skew;
- concurrent referral updates;
- patient identity collision;
- package update interrupted midway;
- remote DTMF emergency while facility device is offline.

### 29.5 Security tests

- authorization boundary tests for every role/scope combination;
- local storage inspection;
- notification leakage;
- API penetration testing;
- audit log tamper resistance;
- revoked device behavior;
- expired contact/config package behavior.

---

## 30. ML lifecycle and release gates

### 30.1 Data constraints

Production validation MUST use outcome-linked Ghanaian data.

External/open datasets MAY be used for:

- schema development;
- software pipeline testing;
- external pretraining when predictor timing and endpoints match;
- research comparison.

They MUST NOT be treated as proof of Northern Ghana clinical performance.

The UCI Maternal Health Risk dataset MUST NOT be used to train the production clinical model.

### 30.2 Required evaluation split design

- split by woman and pregnancy;
- hold out whole facilities or regions;
- include a later temporal holdout;
- use identical splits for all comparator models.

### 30.3 Deployment sequence

```text
1. RULES_ONLY production rollout
2. prospective outcome collection
3. train + validate models
4. SILENT prospective evaluation
5. supervised pilot with clinician-visible predictions
6. governance/clinical/FDA approval
7. ASSISTED mode production
```

If CatBoost fails agreed validation gates, keep `RULES_ONLY` and do not silently swap to another model family.

---

## 31. Data science repository contract

Recommended ML layout:

```text
ml/clinical-risk/
  configs/
  data_contracts/
  src/
    features/
    train/
    calibrate/
    evaluate/
    export/
  tests/
  reports/
  model_cards/
```

Every model artifact MUST have a model card containing:

- training data sources;
- target definition;
- prediction-time definition;
- feature-contract version;
- train/validation/test split definition;
- subgroup metrics;
- calibration method;
- operating thresholds;
- known limitations;
- clinical approval status;
- package hash;
- rollback instructions.

---

## 32. Referral capability directory maintenance

The system MUST support periodic re-verification of:

- primary referral destination;
- backup referral destination;
- maternity/triage role contacts;
- ambulance/transport coordination contacts;
- facility capabilities;
- acknowledgment/escalation time limits.

The source document recommends quarterly verification. The implementation SHOULD therefore support an expiry date and an operational queue for expired entries.

An expired critical referral route MUST be visibly flagged to administrators and SHOULD prevent silent routing based on stale capability data.

---

## 33. Configuration that MUST NOT be hard-coded

The following MUST be externally configurable and versioned:

- rule bundle version;
- model mode (`RULES_ONLY`, `SILENT`, `ASSISTED`);
- risk model package version;
- clinical thresholds;
- OCR confidence thresholds by field;
- supported MCH template versions;
- referral destinations;
- referral capability flags;
- escalation acknowledgment timeouts;
- role contact numbers;
- patient-language prompt packs;
- scan retention policy;
- sync batch size/retry settings;
- analytics feature flags.

---

## 34. Feature flags

Reference feature flags:

```yaml
clinical_ml_mode: RULES_ONLY
engagement_model_enabled: false
ocr_enabled: true
ivr_dtmf_enabled: true
ussd_enabled: true
speech_capture_enabled: false
remote_emergency_cascade_enabled: true
print_referral_slip_enabled: true
```

`speech_capture_enabled` MUST be `false` in the first release.

---

## 35. Suggested implementation phases

### Phase 0 — Repository and platform foundations

Deliver:

- monorepo;
- CI/CD;
- React Native app shell;
- Django/DRF + PostgreSQL stack;
- FHIR R4 REST surface;
- OIDC integration;
- shared API contracts;
- signed package mechanism;
- audit framework.

### Phase 1 — Structured offline ANC capture

Deliver:

- patient/pregnancy/encounter workflows;
- manual observations;
- validation framework;
- local FHIR persistence;
- outbox sync;
- worklist;
- access control.

### Phase 2 — Rule engine and closed-loop referral

Deliver:

- versioned clinical rule bundle;
- decision result UI;
- emergency/priority workflow;
- referral state machine;
- capability directory;
- QR referral slip;
- arrival/disposition closure.

### Phase 3 — IVR/DTMF and USSD

Deliver:

- provider adapter;
- Dagbani/Gonja/English prompt packs;
- structured answer mapping;
- remote emergency server-side cascade;
- consent/contact preference controls.

### Phase 4 — OCR

Deliver:

- react-native-vision-camera guided capture;
- template registry;
- image quality checks;
- PP-OCRv5 mobile integration;
- constrained handwriting recognizer;
- human confirmation workflow;
- benchmark suite.

### Phase 5 — Clinical ML research and silent validation

Deliver:

- feature contracts;
- CatBoost training pipeline;
- elastic-net/EBM/XGBoost-or-LightGBM comparators;
- calibration and evaluation pipeline;
- signed model package;
- `SILENT` mobile inference;
- model monitoring.

### Phase 6 — Governed assisted deployment

Only after approvals and validation gates:

- enable `ASSISTED` mode;
- expose model result/reasons to clinicians;
- monitor false negatives, calibration, subgroup performance, workload, and net benefit.

---

## 36. Definition of done for first deployable release

The first deployable release is complete when all of the following are true:

- offline patient/pregnancy/ANC capture works on procurement-floor Android hardware;
- supported MCH templates can be scanned or manually entered;
- safety-critical OCR fields can be confirmed or rejected;
- approved signed rule bundle executes fully offline;
- an emergency rule cannot be downgraded by any other component;
- clinician confirmation/override is audited;
- referral can be created offline;
- referral destination/capability data are versioned and visible;
- referral state can be synchronized and closed by receiving-facility disposition;
- DTMF/USSD remote answers map to the common data schema;
- remote emergency answers trigger central alerting immediately;
- no caller speech is recorded;
- role/geographic access controls are enforced;
- identifiable views/exports are audited;
- package update/rollback works;
- sync handles duplication, interruption, and conflict safely;
- CatBoost is either disabled or operating only in `SILENT` mode unless formally approved.

---

## 37. Explicit non-goals for first release

Do not implement the following in the first production release:

- autonomous ML referral decisions;
- ML override of deterministic clinical rules;
- end-to-end image-to-referral model;
- caller speech recording;
- free-speech clinical capture for urgent decision-making;
- on-device model training/online learning;
- production training using only external/open data;
- a universal unrestricted national admin account;
- hard-coded referral contacts or timeouts;
- silent assignment of low risk when essential data are missing.

---

## 38. Open implementation blockers requiring governance input

These items remain unresolved in the project document and MUST be resolved before final production configuration:

1. **Pilot geography:** Northern Region only or wider northern belt including Savannah, North East, Upper East, and Upper West.
2. **Referral directory:** verified primary/backup destinations, role contacts, ambulance/transport options, and acknowledgment time limits for every booking facility.
3. **Image retention:** whether OCR source images are legal medical-record components or temporary working copies, and the approved retention window.
4. **Research authorization:** GHS-ERC protocol and consent/waiver basis for prospective outcome collection and model development.
5. **Training environment jurisdiction:** approved hosting location and governance for pseudonymized model-development data.
6. **Final clinical endpoint dictionary:** exact diagnoses, measurements, and procedures defining the 7-day severe maternal outcome and secondary 42-day outcome.
7. **ML approval gates:** numeric minimum performance, calibration, subgroup, false-negative, and workload criteria required for `ASSISTED` mode.

These MUST remain configuration/governance inputs and MUST NOT be guessed by the engineering team.

---

## 39. AI code-editor execution rules

An AI code editor implementing this project SHOULD follow this order:

1. Generate the repo structure in Section 5.2.
2. Define shared domain contracts and FHIR profiles before UI/business logic.
3. Implement stable IDs, provenance, audit, and sync first.
4. Implement validation and deterministic rule interfaces before ML interfaces.
5. Enforce clinical decision precedence as executable unit tests.
6. Implement referral state machine before transport/provider integrations.
7. Keep telephony behind an adapter.
8. Keep OCR behind field-level extractor interfaces.
9. Keep CatBoost behind `ClinicalRiskInference` and default feature flag to `RULES_ONLY`.
10. Do not invent clinical thresholds, rules, endpoints, contact numbers, or retention periods. Use placeholders and configuration contracts until approved values are provided.

### 39.1 Required coding convention for safety-critical components

Each safety-critical class/function SHOULD include:

- explicit input/output types;
- no implicit null-to-normal coercion;
- deterministic error states;
- unit tests for missing/invalid data;
- structured audit events;
- version metadata where the result depends on a rule/model/configuration package.

### 39.2 Preferred failure behavior

Use fail-safe behavior:

```text
unknown -> require confirmation / abstain
missing critical value -> abstain or request value
invalid package signature -> keep previous valid package
sync failure -> retain local record and retry
model runtime failure -> fall back to deterministic rules
OCR uncertainty -> request manual confirmation
referral route stale -> warn and require verified routing rather than silently assume
```

---

## 40. Minimal acceptance-test matrix

| Scenario | Expected result |
|---|---|
| Approved emergency danger sign entered manually while offline | immediate `EMERGENCY_NOW`, fully on-device |
| Same case with ML predicting low probability | remains `EMERGENCY_NOW` |
| Critical BP OCR value low-confidence | confirmation required before scoring |
| Unknown MCH page template | no guessed extraction; manual entry path |
| Facility offline for 24h | full capture/rules/referral workflow still usable |
| Duplicate sync replay | no duplicate clinical event |
| DTMF remote danger response while facility app offline | central emergency alert and escalation begins immediately |
| Missing optional IVR answers | not treated as normal/reassuring |
| CatBoost package missing/corrupt | rules continue; ML result unavailable |
| Clinical ML feature flag `RULES_ONLY` | no care-changing ML output |
| National programme admin opens aggregate dashboard | no patient identifiers by default |
| Referral accepted then patient arrives | receiving facility records arrival/disposition, referring facility receives closure after sync |
| Referral contact expired | visible stale-data warning; no silent trust of contact |
| App receives invalidly signed rule bundle | reject bundle and keep prior active version |

---

## 41. Final implementation principle

Build the production system in this order of trust:

```text
verified source data
  > clinically validated structured fields
  > approved deterministic rules
  > human-confirmed action
  > locally validated ML augmentation
```

The safest first production release is an offline structured-capture, approved-rule, and closed-loop-referral platform. OCR and ML are modular augmentations whose outputs are provenance-aware, reviewable, and independently disableable.
