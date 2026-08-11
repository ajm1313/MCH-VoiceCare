# MCH VoiceCare FHIR R4 Implementation Guide

**Version:** 1.0.0  
**Status:** Implementation-ready  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-08-09  

## 1. Overview

This Implementation Guide (IG) defines how MCH VoiceCare maps its domain model
to FHIR R4 resources for interoperability with external health information
systems (HIS), DHIS2, and national health data exchanges.

The FHIR REST API surface is served at `/fhir/R4/` and provides CRUD operations
for 11 resource types covering the full maternal and child health workflow.

### 1.1 Scope

This IG covers:
- Resource profiles for all 11 supported FHIR resource types
- Code system mappings (LOINC, SNOMED CT, HL7 v3 ActCode)
- Search parameters
- Provenance and audit trail mapping
- Security and access control
- Conformance/capability statement

### 1.2 Out of Scope

- FHIR R5 resources (R4 only for first release)
- GraphQL-based FHIR queries (REST only)
- FHIR Subscriptions (not required for first release)
- Bulk data export ($export operation)

---

## 2. Capability Statement

**Endpoint:** `GET /fhir/R4/metadata`

The server returns a FHIR CapabilityStatement describing the supported
resources, interactions, and search parameters.

### Supported Interactions

| Interaction | Support |
|---|---|
| read | ✅ All resources |
| search | ✅ All resources |
| create | ❌ (write via REST API only) |
| update | ❌ (write via REST API only) |
| delete | ❌ (no FHIR deletes) |
| history | ❌ (not in first release) |

---

## 3. Resource Profiles

### 3.1 Patient (MCHVC-Patient)

**Source model:** `apps.clients.models.Person`  
**Endpoint:** `/fhir/R4/Patient` and `/fhir/R4/Patient/{id}`

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `id` | `Person.id` (UUID) | 1..1 | UUID string |
| `name.family` | `Person.full_name` | 1..1 | Single family name field |
| `name.use` | — | 1..1 | Fixed: `"official"` |
| `gender` | `Person.sex` | 0..1 | `male`, `female`, `unknown` |
| `birthDate` | `Person.date_of_birth` | 0..1 | ISO date (YYYY-MM-DD) |
| `telecom[phone]` | `Person.phone` | 0..1 | system=`phone` |
| `telecom[phone]` | `Person.alternate_phone` | 0..1 | system=`phone` |
| `address.text` | `Person.address` | 0..1 | |
| `address.city` | `Person.community` | 0..1 | |
| `communication.language` | `Person.preferred_language` | 0..1 | BCP 47 code (`en`, `dag`, `gjn`) |
| `meta.versionId` | `updated_at.timestamp()` | 1..1 | ETag for optimistic concurrency |
| `meta.lastUpdated` | `updated_at` | 1..1 | ISO datetime |

**Search Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Search by family name |
| `gender` | token | Filter by gender |
| `birthdate` | date | Filter by birth date |
| `_id` | token | Search by resource ID |

**Example:**

```json
{
  "resourceType": "Patient",
  "id": "a1b2c3d4-...",
  "name": [{"family": "Ama Mensah", "use": "official"}],
  "gender": "female",
  "birthDate": "1995-06-15",
  "telecom": [{"system": "phone", "value": "0241234567"}],
  "address": [{"text": "Tamale", "city": "Sagnarigu"}],
  "communication": [{"language": {"coding": [{"code": "en", "system": "urn:ietf:bcp:47"}]}}],
  "meta": {"versionId": "1723456789", "lastUpdated": "2026-08-09T10:00:00Z"}
}
```

---

### 3.2 Observation (MCHVC-Observation)

**Source models:** `PregnancyObservation`, `NewbornObservation`, `GrowthMeasurement`  
**Endpoint:** `/fhir/R4/Observation` and `/fhir/R4/Observation/{id}`

All observations use the `vital-signs` category and are multi-component
observations containing related vital signs from a single capture event.

#### 3.2.1 Pregnancy Vital Signs

| Component | LOINC Code | Display | Unit | UCUM Code |
|---|---|---|---|---|
| Systolic BP | 8480-6 | Systolic blood pressure | mmHg | mm[Hg] |
| Diastolic BP | 8867-4 | Diastolic blood pressure | mmHg | mm[Hg] |
| Body temperature | 8310-5 | Body temperature | Cel | Cel |
| Body weight | 29463-7 | Body weight | kg | kg |
| Fundal height | 11881-0 | Fundal height | cm | cm |
| Fetal heart rate | 55284-4 | Fetal heart rate | /min | /min |

#### 3.2.2 Newborn Vital Signs

| Component | LOINC Code | Display | Unit | UCUM Code |
|---|---|---|---|---|
| Body temperature | 8310-5 | Body temperature | Cel | Cel |
| Respiratory rate | 9279-1 | Respiratory rate | /min | /min |
| Body weight | 29463-7 | Body weight | g | g |
| Bilirubin | 42719-7 | Bilirubin | mg/dL | mg/dL |

#### 3.2.3 Growth Measurements

| Component | LOINC Code | Display | Unit | UCUM Code |
|---|---|---|---|---|
| Body weight | 29463-7 | Body weight | kg | kg |
| Body height (standing) | 8302-2 | Body height | cm | cm |
| Body height (lying) | 8306-5 | Body height --lying | cm | cm |
| MUAC | 56072-9 | Mid-upper arm circumference | mm | mm |

**Search Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `patient` | reference | Search by subject (Patient) |
| `category` | token | Filter by category (vital-signs) |
| `date` | date | Filter by effective date |
| `code` | token | Filter by LOINC code |
| `_id` | token | Search by resource ID |

---

### 3.3 EpisodeOfCare (MCHVC-EpisodeOfCare)

**Source models:** `PregnancyEpisode`, `NewbornEpisode`  
**Endpoint:** `/fhir/R4/EpisodeOfCare` and `/fhir/R4/EpisodeOfCare/{id}`

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `status` | `episode.status` | 1..1 | `active` / `finished` |
| `type` | — | 1..1 | `pregnancy-episode` or `newborn-episode` |
| `patient` | `episode.woman` / `episode.child` | 1..1 | Reference to Patient |
| `careManager` | `episode.assigned_worker` | 0..1 | Display name |
| `period.start` | `episode.created_at` | 0..1 | ISO datetime |
| `period.end` | `episode.closed_at` | 0..1 | ISO datetime |

**Status Mapping:**

| MCHVC Status | FHIR Status |
|---|---|
| `ACTIVE` | `active` |
| `CLOSED` | `finished` |
| `TRANSFERRED` | `finished` |

**Type Code System:** `http://terminology.hl7.org/CodeSystem/v3-ActCode`

---

### 3.4 Encounter (MCHVC-Encounter)

**Source models:** `PregnancyAssessment`, `NewbornAssessment`  
**Endpoint:** `/fhir/R4/Encounter` and `/fhir/R4/Encounter/{id}`

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `status` | — | 1..1 | Fixed: `"finished"` |
| `class` | — | 1..1 | `AMB` (ambulatory) |
| `type` | — | 1..1 | `clinical-assessment` |
| `subject` | assessment.episode.patient | 1..1 | Reference to Patient |
| `episodeOfCare` | assessment.episode | 0..1 | Reference to EpisodeOfCare |
| `period.start` | `assessment.assessed_at` | 0..1 | ISO datetime |
| `period.end` | `assessment.assessed_at` | 0..1 | ISO datetime |

---

### 3.5 ServiceRequest (MCHVC-ServiceRequest)

**Source model:** `Referral`  
**Endpoint:** `/fhir/R4/ServiceRequest` and `/fhir/R4/ServiceRequest/{id}`

The ServiceRequest represents the referral order itself.

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `status` | `referral.status` | 1..1 | See status map below |
| `intent` | — | 1..1 | Fixed: `"order"` |
| `priority` | `referral.urgency` | 1..1 | See priority map below |
| `subject` | `referral.patient` | 1..1 | Reference to Patient |
| `code` | — | 1..1 | `referral` (v3-ActCode) |
| `reasonCode` | `referral.referral_reason` | 0..1 | Text reason |
| `requester` | `referral.created_by` | 0..1 | Display name |
| `performer` | `referral.destination_facility` | 0..1 | Reference to Organization |

**Status Mapping:**

| MCHVC Referral Status | FHIR ServiceRequest Status |
|---|---|
| `DRAFT` | `draft` |
| `REQUESTED` | `active` |
| `RECEIVING_FACILITY_NOTIFIED` | `active` |
| `ACCEPTED` | `active` |
| `TRANSPORT_REQUESTED` | `active` |
| `IN_TRANSIT` | `active` |
| `ARRIVED` | `active` |
| `DISPOSITION_RECORDED` | `completed` |
| `CLOSED` | `completed` |
| `DECLINED` | `revoked` |
| `NO_ACK_ESCALATED` | `entered-in-error` |
| `TRANSPORT_UNAVAILABLE` | `entered-in-error` |

**Priority Mapping:**

| MCHVC Urgency | FHIR Priority |
|---|---|
| `EMERGENCY` | `stat` |
| `PRIORITY` | `urgent` |
| `ROUTINE` | `routine` |
| `ABSTAIN` | `routine` |

---

### 3.6 Task (MCHVC-Task)

**Source model:** `Referral`  
**Endpoint:** `/fhir/R4/Task` and `/fhir/R4/Task/{id}`

The Task resource tracks the workflow state of a referral, complementing
the ServiceRequest. While ServiceRequest represents the order, Task
represents the workflow execution.

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `status` | `referral.status` | 1..1 | See status map |
| `intent` | — | 1..1 | `order` (for non-draft) or `draft` |
| `priority` | `referral.urgency` | 1..1 | See priority map |
| `basedOn` | `referral` | 1..1 | Reference to ServiceRequest |
| `for` | `referral.patient` | 1..1 | Reference to Patient |
| `owner` | `referral.destination_facility` | 0..1 | Reference to Organization |

---

### 3.7 Immunization (MCHVC-Immunization)

**Source model:** `VaccineDose`  
**Endpoint:** `/fhir/R4/Immunization` and `/fhir/R4/Immunization/{id}`

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `status` | — | 1..1 | Fixed: `"completed"` |
| `vaccineCode` | `dose.vaccine_code` | 1..1 | Code + display name |
| `patient` | `dose.child_record.child` | 1..1 | Reference to Patient |
| `occurrenceDateTime` | `dose.administration_date` | 1..1 | ISO date |
| `lotNumber` | `dose.batch_lot` | 0..1 | |
| `performer.actor` | `dose.administered_by` | 0..1 | Display name |
| `doseQuantity` | `dose.dose_number` | 0..1 | value + unit="dose" |

---

### 3.8 Provenance (MCHVC-Provenance)

**Source model:** `AuditEvent`  
**Endpoint:** `/fhir/R4/Provenance` and `/fhir/R4/Provenance/{id}`

Provenance resources track the creation and modification history of all
clinical resources, supporting the audit requirements in spec §23.

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `target` | `event.entity_type/entity_id` | 0..* | References to affected resources |
| `recorded` | `event.occurred_at` | 1..1 | ISO datetime |
| `agent.type` | — | 1..1 | `author` (provenance-participant-type) |
| `agent.who` | `event.actor` | 1..1 | Display name |
| `agent.role` | `event.actor_role` | 0..1 | |
| `activity` | `event.action` | 0..1 | CodeableConcept |

---

### 3.9 AuditEvent (MCHVC-AuditEvent)

**Source model:** `AuditEvent`  
**Endpoint:** `/fhir/R4/AuditEvent` and `/fhir/R4/AuditEvent/{id}`

FHIR AuditEvent resources provide a standards-based audit log for external
compliance and monitoring systems.

---

### 3.10 Library (MCHVC-Library)

**Source model:** `Package` (type=RULE_BUNDLE)  
**Endpoint:** `/fhir/R4/Library` and `/fhir/R4/Library/{id}`

Represents the clinical rule bundle as a FHIR Library resource for
interoperability with CDS Hooks and clinical decision support systems.

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `name` | `pkg.package_id` | 1..1 | |
| `version` | `pkg.version` | 1..1 | Semantic version |
| `status` | `pkg.status` | 1..1 | `active` or `draft` |
| `type` | — | 1..1 | `logic-library` |
| `url` | — | 1..1 | `urn:mchvc:library:{id}:{version}` |

---

### 3.11 PlanDefinition (MCHVC-PlanDefinition)

**Source model:** `Package` (type=RULE_BUNDLE)  
**Endpoint:** `/fhir/R4/PlanDefinition` and `/fhir/R4/PlanDefinition/{id}`

Represents the clinical rule bundle as a FHIR PlanDefinition for
interoperability with CDS Hooks and clinical decision support systems.

| FHIR Element | Source Field | Cardinality | Notes |
|---|---|---|---|
| `name` | `pkg.package_id` | 1..1 | |
| `version` | `pkg.version` | 1..1 | Semantic version |
| `status` | `pkg.status` | 1..1 | `active` or `draft` |
| `library` | — | 1..1 | Reference to associated Library |

---

## 4. Code Systems

### 4.1 LOINC Codes (Observation components)

| LOINC Code | Display | Used In |
|---|---|---|
| 8480-6 | Systolic blood pressure | Pregnancy, Newborn |
| 8867-4 | Diastolic blood pressure | Pregnancy |
| 8310-5 | Body temperature | Pregnancy, Newborn |
| 29463-7 | Body weight | Pregnancy, Newborn, Growth |
| 11881-0 | Fundal height | Pregnancy |
| 55284-4 | Fetal heart rate | Pregnancy |
| 9279-1 | Respiratory rate | Newborn |
| 42719-7 | Bilirubin | Newborn |
| 8302-2 | Body height (standing) | Growth |
| 8306-5 | Body height --lying | Growth |
| 56072-9 | Mid-upper arm circumference | Growth |

**System:** `http://loinc.org`

### 4.2 HL7 v3 ActCode (Episode/Referral types)

| Code | Display | Used In |
|---|---|---|
| pregnancy-episode | Pregnancy episode | EpisodeOfCare.type |
| newborn-episode | Newborn care episode | EpisodeOfCare.type |
| referral | Referral | ServiceRequest.code |

**System:** `http://terminology.hl7.org/CodeSystem/v3-ActCode`

### 4.3 Observation Category

| Code | Display |
|---|---|
| vital-signs | Vital Signs |

**System:** `http://terminology.hl7.org/CodeSystem/observation-category`

### 4.4 BCP 47 Language Codes

| Code | Language |
|---|---|
| en | English |
| dag | Dagbani |
| gjn | Gonja |

**System:** `urn:ietf:bcp:47`

---

## 5. Security

### 5.1 Authentication

All FHIR endpoints require JWT Bearer token authentication:

```
Authorization: Bearer <access_token>
```

Tokens are obtained from `/api/v1/accounts/auth/login/`.

### 5.2 Authorization

Access is scoped by the user's organisation unit. Users can only access
FHIR resources for patients within their organisational hierarchy
(facility → sub-district → district → region).

### 5.3 Audit

All FHIR read operations are audited via the `log_audit()` service,
creating `AuditEvent` records that are also exposed as FHIR `Provenance`
and `AuditEvent` resources.

### 5.4 Provenance

Every clinical resource has an associated `Provenance` resource that
records who created/modified it, when, and from what source (manual entry,
OCR, telephony, sync).

---

## 6. Conformance

The server's conformance is declared via the FHIR CapabilityStatement
at `GET /fhir/R4/metadata`. Clients SHOULD read this before interacting
with the API to discover supported resources and search parameters.

---

## 7. Integration Examples

### 7.1 Retrieve all pregnancy observations for a patient

```
GET /fhir/R4/Observation?patient={patientId}&category=vital-signs
Accept: application/fhir+json
Authorization: Bearer <token>
```

### 7.2 Retrieve active pregnancy episodes

```
GET /fhir/R4/EpisodeOfCare?patient={patientId}&status=active
Accept: application/fhir+json
Authorization: Bearer <token>
```

### 7.3 Retrieve emergency referrals

```
GET /fhir/R4/ServiceRequest?patient={patientId}&priority=stat
Accept: application/fhir+json
Authorization: Bearer <token>
```

### 7.4 Retrieve immunization history

```
GET /fhir/R4/Immunization?patient={patientId}
Accept: application/fhir+json
Authorization: Bearer <token>
```

### 7.5 Retrieve audit trail for a patient

```
GET /fhir/R4/Provenance?target=Patient/{patientId}
Accept: application/fhir+json
Authorization: Bearer <token>
```

---

## 8. Error Handling

Errors are returned as FHIR `OperationOutcome` resources:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "details": {"text": "Resource not found"}
    }
  ]
}
```

| HTTP Status | FHIR Code | Description |
|---|---|---|
| 400 | invalid | Malformed request |
| 401 | security | Authentication required |
| 403 | forbidden | Insufficient permissions |
| 404 | not-found | Resource not found |
| 500 | exception | Internal server error |

---

## 9. Versioning

All resources include `meta.versionId` and `meta.lastUpdated` for
optimistic concurrency control (spec §19.4). Clients SHOULD use
`If-Match` headers with ETags for conflict detection.

---

## 10. Limitations

1. **Read-only via FHIR:** Write operations are performed via the REST API
   (`/api/v1/`), not via FHIR. This ensures business rules, validation,
   and audit logging are enforced consistently.
2. **No FHIR Subscriptions:** Real-time notifications are handled via
   FCM push notifications, not FHIR Subscriptions.
3. **No bulk export:** The `$export` operation is not supported in the
   first release.
4. **Single-patient search:** Searches are org-scoped; cross-organization
   searches are not permitted.
