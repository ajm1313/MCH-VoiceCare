"""Admin site registration for all apps — with list displays and filters."""
from django.contrib import admin

from apps.accounts.models import UserAccount, UserRoleScope
from apps.organisations.models import OrganisationUnit, FacilityCapability
from apps.clients.models import Person, Household, CaregiverLink
from apps.pregnancy.models import PregnancyEpisode, PregnancyObservation, PregnancyAssessment
from apps.newborn.models import BirthEpisode, NewbornEpisode, NewbornObservation, NewbornAssessment
from apps.immunisation.models import (
    ChildImmunisationRecord, VaccineDose, CWCSession, CWCSessionAttendance, DefaulterEpisode,
)
from apps.growth.models import GrowthMeasurement
from apps.referrals.models import Referral, ReferralStateLog
from apps.audit.models import AuditEvent
from apps.notifications.models import Notification, ActionRecord
from apps.communication.models import MessageTemplate, CommunicationLog
from apps.core.idempotency_models import IdempotencyRecord
from apps.core.config_models import SystemConfig
from apps.core.package_models import Package


# ── Accounts ──

@admin.register(UserAccount)
class UserAccountAdmin(admin.ModelAdmin):
    list_display = ("username", "full_name", "system_role", "organisation_unit", "is_active", "is_super_admin")
    list_filter = ("system_role", "is_active", "is_super_admin")
    search_fields = ("username", "full_name", "mobile_number", "email")


@admin.register(UserRoleScope)
class UserRoleScopeAdmin(admin.ModelAdmin):
    list_display = ("user", "role_code", "scope_unit")
    list_filter = ("role_code",)


# ── Organisations ──

@admin.register(OrganisationUnit)
class OrganisationUnitAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "unit_type", "facility_type", "status", "parent")
    list_filter = ("unit_type", "facility_type", "status")
    search_fields = ("name", "code")


@admin.register(FacilityCapability)
class FacilityCapabilityAdmin(admin.ModelAdmin):
    list_display = ("facility", "bemonc", "cemonc", "theatre", "blood", "specialist_obstetrics", "newborn_support", "verified_at", "verification_expires_at")
    list_filter = ("bemonc", "cemonc", "theatre", "blood", "specialist_obstetrics", "newborn_support")
    search_fields = ("facility__name",)


# ── Clients ──

@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ("full_name", "sex", "date_of_birth", "phone", "community", "preferred_language", "deceased")
    list_filter = ("sex", "preferred_language", "deceased", "communication_opt_out")
    search_fields = ("full_name", "national_id", "phone", "community")


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ("household_name", "head_person_name", "phone", "organisation_unit")
    search_fields = ("household_name", "head_person_name", "phone")


@admin.register(CaregiverLink)
class CaregiverLinkAdmin(admin.ModelAdmin):
    list_display = ("child", "caregiver", "relationship", "is_primary")
    list_filter = ("is_primary",)


# ── Pregnancy ──

@admin.register(PregnancyEpisode)
class PregnancyEpisodeAdmin(admin.ModelAdmin):
    list_display = ("woman", "status", "current_urgency", "lmp_date", "gravidity", "parity", "assigned_chps")
    list_filter = ("status", "current_urgency", "lmp_reliability")
    search_fields = ("woman__full_name", "assigned_chps", "assigned_worker")
    date_hierarchy = "lmp_date"


@admin.register(PregnancyObservation)
class PregnancyObservationAdmin(admin.ModelAdmin):
    list_display = ("episode", "recorded_at", "bp_systolic", "bp_diastolic", "fhr_bpm", "hb_g_dl", "capture_route", "human_confirmed")
    list_filter = ("capture_route", "human_confirmed")
    date_hierarchy = "recorded_at"


@admin.register(PregnancyAssessment)
class PregnancyAssessmentAdmin(admin.ModelAdmin):
    list_display = ("episode", "disposition", "rule_set_version", "assessed_at")
    list_filter = ("disposition",)


# ── Newborn ──

@admin.register(BirthEpisode)
class BirthEpisodeAdmin(admin.ModelAdmin):
    list_display = ("mother", "birth_datetime", "place_of_birth", "mode_of_delivery", "skilled_attendant")
    list_filter = ("mode_of_delivery", "skilled_attendant", "liquor_quality")
    date_hierarchy = "birth_datetime"


@admin.register(NewbornEpisode)
class NewbornEpisodeAdmin(admin.ModelAdmin):
    list_display = ("child", "status", "current_urgency", "birth_weight_g", "gestational_age_weeks", "apgar_1_min", "apgar_5_min")
    list_filter = ("status", "current_urgency", "kmc_status")
    search_fields = ("child__full_name",)


@admin.register(NewbornObservation)
class NewbornObservationAdmin(admin.ModelAdmin):
    list_display = ("newborn", "recorded_at", "temperature_c", "respiratory_rate_min", "current_weight_g", "capture_route", "human_confirmed")
    list_filter = ("capture_route", "human_confirmed")
    date_hierarchy = "recorded_at"


@admin.register(NewbornAssessment)
class NewbornAssessmentAdmin(admin.ModelAdmin):
    list_display = ("episode", "disposition", "rule_set_version", "assessed_at")
    list_filter = ("disposition",)


# ── Immunisation ──

@admin.register(ChildImmunisationRecord)
class ChildImmunisationRecordAdmin(admin.ModelAdmin):
    list_display = ("child", "cwc_card_number", "residence_status", "current_chps")
    search_fields = ("child__full_name", "cwc_card_number")


@admin.register(VaccineDose)
class VaccineDoseAdmin(admin.ModelAdmin):
    list_display = ("child_record", "vaccine_code", "vaccine_name", "dose_number", "administration_date", "administered_by")
    list_filter = ("vaccine_code", "route_site")
    search_fields = ("vaccine_name", "batch_lot", "product_name")
    date_hierarchy = "administration_date"


@admin.register(CWCSession)
class CWCSessionAdmin(admin.ModelAdmin):
    list_display = ("facility_name", "session_date", "session_type", "status", "expected_count")
    list_filter = ("session_type", "status")


@admin.register(CWCSessionAttendance)
class CWCSessionAttendanceAdmin(admin.ModelAdmin):
    list_display = ("session", "child", "attended")


@admin.register(DefaulterEpisode)
class DefaulterEpisodeAdmin(admin.ModelAdmin):
    list_display = ("child_record", "trace_status", "created_at")
    list_filter = ("trace_status",)


# ── Growth ──

@admin.register(GrowthMeasurement)
class GrowthMeasurementAdmin(admin.ModelAdmin):
    list_display = ("child", "measurement_date", "weight_kg", "length_cm", "muac_mm", "measurement_position", "measurement_quality")
    list_filter = ("measurement_position", "measurement_quality", "feeding_status")
    date_hierarchy = "measurement_date"


# ── Referrals ──

@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ("patient", "status", "urgency", "referring_facility", "destination_facility", "transport_mode", "acknowledged_at", "arrived_at")
    list_filter = ("status", "urgency", "transport_mode")
    search_fields = ("patient__full_name", "referral_reason")
    date_hierarchy = "created_at"


@admin.register(ReferralStateLog)
class ReferralStateLogAdmin(admin.ModelAdmin):
    list_display = ("referral", "from_status", "to_status", "actor", "created_at")
    list_filter = ("to_status",)


# ── Audit ──

@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("actor", "action", "purpose", "entity_type", "occurred_at")
    list_filter = ("action", "purpose", "entity_type")
    search_fields = ("actor", "action", "entity_id")
    date_hierarchy = "occurred_at"
    readonly_fields = [f.name for f in AuditEvent._meta.get_fields()]


# ── Notifications ──

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "urgency", "related_entity_type", "created_at")
    list_filter = ("status", "urgency", "related_entity_type")


@admin.register(ActionRecord)
class ActionRecordAdmin(admin.ModelAdmin):
    list_display = ("notification", "action_type", "recorded_by", "created_at")


# ── Communication ──

@admin.register(MessageTemplate)
class MessageTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "channel", "language", "status")
    list_filter = ("channel", "language", "status")


@admin.register(CommunicationLog)
class CommunicationLogAdmin(admin.ModelAdmin):
    list_display = ("campaign", "recipient", "status", "sent_at")
    list_filter = ("status",)


# ── Core ──

@admin.register(IdempotencyRecord)
class IdempotencyRecordAdmin(admin.ModelAdmin):
    list_display = ("key", "request_method", "request_path", "response_status", "created_at")
    date_hierarchy = "created_at"


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ("id", "clinical_ml_mode", "ocr_enabled", "ivr_dtmf_enabled", "ussd_enabled", "speech_capture_enabled")
    list_filter = ("clinical_ml_mode", "ocr_enabled", "ivr_dtmf_enabled", "ussd_enabled")


@admin.register(Package)
class PackageAdmin(admin.ModelAdmin):
    list_display = ("package_id", "package_type", "version", "status", "created_at")
    list_filter = ("package_type", "status")
    search_fields = ("package_id", "version")
