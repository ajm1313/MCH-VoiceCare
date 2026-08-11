"""
Shared enums used across MCH VoiceCare apps.
All enums use Django's TextChoices/IntegerChoices for DB compatibility.
"""
from django.db import models


class UrgencyLevel(models.TextChoices):
    """Clinical urgency classification (spec §12.2)."""
    EMERGENCY = "EMERGENCY", "Emergency"
    PRIORITY = "PRIORITY", "Priority Review"
    ROUTINE = "ROUTINE", "Routine"
    ABSTAIN = "ABSTAIN", "Abstain — Insufficient Data"


class RiskBand(models.TextChoices):
    """Risk band for clinical ML output (spec §13.4)."""
    NOT_SHOWN = "NOT_SHOWN", "Not Shown"
    LOW = "LOW", "Low"
    PRIORITY = "PRIORITY", "Priority"
    HIGH = "HIGH", "High"


class ClinicalDisposition(models.TextChoices):
    """Final clinical disposition (spec §12.2)."""
    EMERGENCY_NOW = "EMERGENCY_NOW", "Emergency Now"
    PRIORITY_REVIEW = "PRIORITY_REVIEW", "Priority Review"
    ROUTINE = "ROUTINE", "Routine"
    ABSTAIN = "ABSTAIN", "Abstain"


class CaptureRoute(models.TextChoices):
    """How data entered the system (spec §8.2)."""
    MANUAL = "MANUAL", "Manual Entry"
    OCR = "OCR", "OCR Scan"
    IVR_DTMF = "IVR_DTMF", "IVR/DTMF"
    USSD = "USSD", "USSD"
    DEVICE_IMPORT = "DEVICE_IMPORT", "Device Import"


class SyncStatus(models.TextChoices):
    """Synchronisation state for offline-first records."""
    NOT_SYNCED = "NOT_SYNCED", "Not Synced"
    PENDING = "PENDING", "Pending"
    IN_FLIGHT = "IN_FLIGHT", "In Flight"
    SYNCED = "SYNCED", "Synced"
    ERROR = "ERROR", "Error"


class EpisodeStatus(models.TextChoices):
    """Generic episode lifecycle status."""
    ACTIVE = "ACTIVE", "Active"
    CLOSED = "CLOSED", "Closed"
    TRANSFERRED = "TRANSFERRED", "Transferred"


class ReferralStatus(models.TextChoices):
    """Referral state machine (spec §18.3)."""
    DRAFT = "DRAFT", "Draft"
    REQUESTED = "REQUESTED", "Requested"
    RECEIVING_FACILITY_NOTIFIED = "RECEIVING_FACILITY_NOTIFIED", "Receiving Facility Notified"
    ACCEPTED = "ACCEPTED", "Accepted"
    TRANSPORT_REQUESTED = "TRANSPORT_REQUESTED", "Transport Requested"
    IN_TRANSIT = "IN_TRANSIT", "In Transit"
    ARRIVED = "ARRIVED", "Arrived"
    DISPOSITION_RECORDED = "DISPOSITION_RECORDED", "Disposition Recorded"
    CLOSED = "CLOSED", "Closed"
    # Exceptional states
    DECLINED = "DECLINED", "Declined"
    NO_ACK_ESCALATED = "NO_ACK_ESCALATED", "No Ack — Escalated"
    TRANSPORT_UNAVAILABLE = "TRANSPORT_UNAVAILABLE", "Transport Unavailable"
    CANCELLED_BY_CLINICIAN = "CANCELLED_BY_CLINICIAN", "Cancelled by Clinician"
    LOST_TO_FOLLOWUP = "LOST_TO_FOLLOWUP", "Lost to Follow-up"


class FacilityType(models.TextChoices):
    CHPS = "CHPS", "CHPS"
    HEALTH_CENTRE = "HEALTH_CENTRE", "Health Centre"
    DISTRICT_HOSPITAL = "DISTRICT_HOSPITAL", "District Hospital"
    REGIONAL_HOSPITAL = "REGIONAL_HOSPITAL", "Regional Hospital"
    TEACHING_HOSPITAL = "TEACHING_HOSPITAL", "Teaching Hospital"
    CLINIC = "CLINIC", "Clinic"
    MATERNITY_HOME = "MATERNITY_HOME", "Maternity Home"


class OrganisationUnitType(models.TextChoices):
    REGION = "REGION", "Region"
    DISTRICT = "DISTRICT", "District"
    SUBDISTRICT = "SUBDISTRICT", "Sub-district"
    FACILITY = "FACILITY", "Facility"


class Sex(models.TextChoices):
    MALE = "MALE", "Male"
    FEMALE = "FEMALE", "Female"
    UNKNOWN = "UNKNOWN", "Unknown"


class YesNoUnknown(models.TextChoices):
    YES = "YES", "Yes"
    NO = "NO", "No"
    UNKNOWN = "UNKNOWN", "Unknown"


class Language(models.TextChoices):
    ENGLISH = "en", "English"
    DAGBANI = "dag", "Dagbani"
    GONJA = "gjn", "Gonja"


class NotificationClass(models.TextChoices):
    EMERGENCY = "EMERGENCY", "Emergency"
    REFERRAL = "REFERRAL", "Referral"
    APPOINTMENT = "APPOINTMENT", "Appointment"
    DEFAULTER = "DEFAULTER", "Defaulter"
    SYSTEM = "SYSTEM", "System"


class NotificationStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    ACTED = "ACTED", "Acted Upon"
    DISMISSED = "DISMISSED", "Dismissed"


class DefaulterStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    TRACED = "TRACED", "Traced"
    RESOLVED = "RESOLVED", "Resolved"
    LOST = "LOST", "Lost to Follow-up"


class TraceStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    CONTACTED = "CONTACTED", "Contacted"
    FAILED = "FAILED", "Failed"


class CWCSessionType(models.TextChoices):
    FIXED = "FIXED", "Fixed Session"
    OUTREACH = "OUTREACH", "Outreach"
    MOBILE = "MOBILE", "Mobile"


class CWCSessionStatus(models.TextChoices):
    PLANNED = "PLANNED", "Planned"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class CampaignChannel(models.TextChoices):
    SMS = "SMS", "SMS"
    USSD = "USSD", "USSD"
    IVR = "IVR", "IVR"
    PUSH = "PUSH", "Push Notification"


class CampaignStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SCHEDULED = "SCHEDULED", "Scheduled"
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class ReportType(models.TextChoices):
    ANC_COVERAGE = "ANC_COVERAGE", "ANC Coverage"
    REFERRAL_OUTCOMES = "REFERRAL_OUTCOMES", "Referral Outcomes"
    IMMUNISATION_COVERAGE = "IMMUNISATION_COVERAGE", "Immunisation Coverage"
    GROWTH_SUMMARY = "GROWTH_SUMMARY", "Growth Summary"
    DEFAULTER_ANALYSIS = "DEFAULTER_ANALYSIS", "Defaulter Analysis"
    CUSTOM = "CUSTOM", "Custom"


class ReportStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    GENERATING = "GENERATING", "Generating"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class ImportStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PROCESSING = "PROCESSING", "Processing"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class IntegrationType(models.TextChoices):
    DHIS2 = "DHIS2", "DHIS2"
    FHIR = "FHIR", "FHIR Server"
    TELEPHONY = "TELEPHONY", "Telephony Gateway"
    SMS_GATEWAY = "SMS_GATEWAY", "SMS Gateway"


class SystemRole(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    REGIONAL_ADMIN = "REGIONAL_ADMIN", "Regional Administrator"
    DISTRICT_ADMIN = "DISTRICT_ADMIN", "District Administrator"
    SUBDISTRICT_ADMIN = "SUBDISTRICT_ADMIN", "Sub-district Administrator"
    FACILITY_CLINICAL_USER = "FACILITY_CLINICAL_USER", "Facility Clinical User"
    READ_ONLY = "READ_ONLY", "Read Only"


class MLMode(models.TextChoices):
    """Clinical ML deployment modes (spec §3.2)."""
    RULES_ONLY = "RULES_ONLY", "Rules Only"
    SILENT = "SILENT", "Silent"
    ASSISTED = "ASSISTED", "Assisted"
