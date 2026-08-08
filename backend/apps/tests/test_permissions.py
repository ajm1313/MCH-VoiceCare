"""
Tests for row-level permissions — org scoping, super admin bypass,
read-only enforcement (spec §21, §29).
"""
from django.test import TestCase
from django.contrib.auth import get_user_model

from apps.core.enums import SystemRole
from apps.organisations.models import OrganisationUnit
from apps.clients.models import Person, Household
from apps.core.permissions import (
    get_descendant_unit_ids,
    get_user_org_unit_ids,
    filter_queryset_by_org,
    user_can_write,
    user_can_manage_users,
)

UserAccount = get_user_model()


def _make_org(name, code, parent=None, unit_type="FACILITY"):
    return OrganisationUnit.objects.create(
        name=name, code=code, unit_type=unit_type, parent=parent,
    )


def _make_user(username, org, role=SystemRole.FACILITY_CLINICAL_USER, is_super_admin=False):
    return UserAccount.objects.create_user(
        username=username,
        password="testpass123",
        full_name=f"Test {username}",
        organisation_unit=org,
        system_role=role,
        is_super_admin=is_super_admin,
    )


class OrgHierarchyTests(TestCase):

    def setUp(self):
        self.region = _make_org("Northern Region", "NR", unit_type="REGION")
        self.district = _make_org("Tolon District", "TD", parent=self.region, unit_type="DISTRICT")
        self.subdistrict = _make_org("Sub-District A", "SDA", parent=self.district, unit_type="SUBDISTRICT")
        self.facility1 = _make_org("Facility 1", "F1", parent=self.subdistrict)
        self.facility2 = _make_org("Facility 2", "F2", parent=self.subdistrict)

    def test_descendant_ids_includes_all_children(self):
        ids = get_descendant_unit_ids(self.district)
        self.assertIn(self.district.id, ids)
        self.assertIn(self.subdistrict.id, ids)
        self.assertIn(self.facility1.id, ids)
        self.assertIn(self.facility2.id, ids)

    def test_descendant_ids_self_only_for_leaf(self):
        ids = get_descendant_unit_ids(self.facility1)
        self.assertEqual(len(ids), 1)
        self.assertIn(self.facility1.id, ids)

    def test_descendant_ids_none_input(self):
        self.assertEqual(get_descendant_unit_ids(None), [])


class UserScopeTests(TestCase):

    def setUp(self):
        self.region = _make_org("Northern Region", "NR", unit_type="REGION")
        self.district = _make_org("Tolon District", "TD", parent=self.region, unit_type="DISTRICT")
        self.subdistrict = _make_org("Sub-District A", "SDA", parent=self.district, unit_type="SUBDISTRICT")
        self.facility1 = _make_org("Facility 1", "F1", parent=self.subdistrict)
        self.facility2 = _make_org("Facility 2", "F2", parent=self.subdistrict)

    def test_super_admin_sees_all(self):
        user = _make_user("superadmin", self.region, SystemRole.SUPER_ADMIN, is_super_admin=True)
        self.assertIsNone(get_user_org_unit_ids(user))

    def test_facility_user_sees_own_only(self):
        user = _make_user("midwife", self.facility1, SystemRole.FACILITY_CLINICAL_USER)
        ids = get_user_org_unit_ids(user)
        self.assertEqual(ids, [self.facility1.id])

    def test_district_admin_sees_descendants(self):
        user = _make_user("district_admin", self.district, SystemRole.DISTRICT_ADMIN)
        ids = get_user_org_unit_ids(user)
        self.assertIn(self.district.id, ids)
        self.assertIn(self.subdistrict.id, ids)
        self.assertIn(self.facility1.id, ids)
        self.assertIn(self.facility2.id, ids)

    def test_regional_admin_sees_all_descendants(self):
        user = _make_user("regional_admin", self.region, SystemRole.REGIONAL_ADMIN)
        ids = get_user_org_unit_ids(user)
        self.assertIn(self.region.id, ids)
        self.assertIn(self.district.id, ids)
        self.assertIn(self.facility1.id, ids)

    def test_user_without_org_unit(self):
        user = _make_user("noorg", None, SystemRole.FACILITY_CLINICAL_USER)
        ids = get_user_org_unit_ids(user)
        self.assertEqual(ids, [])


class QuerysetFilterTests(TestCase):

    def setUp(self):
        self.region = _make_org("Northern Region", "NR", unit_type="REGION")
        self.district = _make_org("Tolon District", "TD", parent=self.region, unit_type="DISTRICT")
        self.facility1 = _make_org("Facility 1", "F1", parent=self.district)
        self.facility2 = _make_org("Facility 2", "F2", parent=self.district)

        self.hh1 = Household.objects.create(organisation_unit=self.facility1)
        self.hh2 = Household.objects.create(organisation_unit=self.facility2)
        self.p1 = Person.objects.create(
            full_name="Person 1", sex="FEMALE",
            household=self.hh1, organisation_unit=self.facility1,
        )
        self.p2 = Person.objects.create(
            full_name="Person 2", sex="MALE",
            household=self.hh2, organisation_unit=self.facility2,
        )

    def test_facility_user_only_sees_own(self):
        user = _make_user("midwife1", self.facility1, SystemRole.FACILITY_CLINICAL_USER)
        qs = filter_queryset_by_org(Person.objects.all(), user)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first(), self.p1)

    def test_district_admin_sees_all_in_district(self):
        user = _make_user("admin", self.district, SystemRole.DISTRICT_ADMIN)
        qs = filter_queryset_by_org(Person.objects.all(), user)
        self.assertEqual(qs.count(), 2)

    def test_super_admin_sees_all(self):
        user = _make_user("super", self.region, SystemRole.SUPER_ADMIN, is_super_admin=True)
        qs = filter_queryset_by_org(Person.objects.all(), user)
        self.assertEqual(qs.count(), 2)

    def test_user_without_org_sees_nothing(self):
        user = _make_user("noorg", None, SystemRole.FACILITY_CLINICAL_USER)
        qs = filter_queryset_by_org(Person.objects.all(), user)
        self.assertEqual(qs.count(), 0)


class PermissionCheckTests(TestCase):

    def test_facility_user_can_write(self):
        user = _make_user("midwife", _make_org("F", "F1"), SystemRole.FACILITY_CLINICAL_USER)
        self.assertTrue(user_can_write(user))

    def test_read_only_cannot_write(self):
        user = _make_user("reader", _make_org("F", "F2"), SystemRole.READ_ONLY)
        self.assertFalse(user_can_write(user))

    def test_super_admin_can_manage_users(self):
        user = _make_user("super", _make_org("R", "R1"), SystemRole.SUPER_ADMIN, is_super_admin=True)
        self.assertTrue(user_can_manage_users(user))

    def test_facility_user_cannot_manage_users(self):
        user = _make_user("midwife", _make_org("F", "F3"), SystemRole.FACILITY_CLINICAL_USER)
        self.assertFalse(user_can_manage_users(user))

    def test_district_admin_can_manage_users(self):
        user = _make_user("admin", _make_org("D", "D1"), SystemRole.DISTRICT_ADMIN)
        self.assertTrue(user_can_manage_users(user))
