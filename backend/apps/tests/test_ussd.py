"""
Tests for USSD menu navigation (spec §17.5).

Tests:
- USSD menu tree construction
- Session start and handling
- Menu navigation (main → emergency → back)
- Emergency trigger via USSD selection
- USSD API endpoint
- Concatenated input parsing
"""
import json

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.enums import SystemRole
from apps.core.ussd_service import (
    USSDNavigator, USSDMenu, USSDOption, USSDSession,
    get_default_navigator, EMERGENCY_ACTION_MAP,
)
from apps.core.telephony_service import route_ussd_session
from apps.organisations.models import OrganisationUnit
from apps.accounts.models import UserAccount


def _make_org():
    return OrganisationUnit.objects.create(
        name="Test Facility", code="USSD001", unit_type="FACILITY",
    )


def _make_user(org):
    return UserAccount.objects.create_user(
        username="ussdtester", password="testpass123",
        organisation_unit=org, system_role=SystemRole.SUPER_ADMIN, is_super_admin=True,
    )


class USSDMenuTreeTest(TestCase):
    """Test USSD menu tree construction (spec §17.5)."""

    def test_build_menu_tree_has_main_menu(self):
        """The menu tree must have a main menu."""
        tree = USSDNavigator.build_menu_tree()
        self.assertIn("main", tree)
        self.assertIsInstance(tree["main"], USSDMenu)

    def test_main_menu_has_required_options(self):
        """Main menu must have: 1=Register concern, 2=Check appointment, 3=Emergency, 0=Help."""
        tree = USSDNavigator.build_menu_tree()
        main = tree["main"]
        keys = {opt.key for opt in main.options}
        self.assertIn("1", keys)
        self.assertIn("2", keys)
        self.assertIn("3", keys)
        self.assertIn("0", keys)

    def test_emergency_menu_has_required_options(self):
        """Emergency menu must have: 1=Bleeding, 2=Fever, 3=Headache, 4=Convulsions, 5=Other, 0=Back."""
        tree = USSDNavigator.build_menu_tree()
        emergency = tree["emergency"]
        keys = {opt.key for opt in emergency.options}
        self.assertIn("1", keys)
        self.assertIn("2", keys)
        self.assertIn("3", keys)
        self.assertIn("4", keys)
        self.assertIn("5", keys)
        self.assertIn("0", keys)

    def test_emergency_options_trigger_action(self):
        """Emergency menu options 1-5 must trigger the 'emergency' action."""
        tree = USSDNavigator.build_menu_tree()
        emergency = tree["emergency"]
        for opt in emergency.options:
            if opt.key in ("1", "2", "3", "4", "5"):
                self.assertEqual(opt.action, "emergency")
                self.assertIsNotNone(opt.action_data)
                self.assertIn("danger_sign", opt.action_data)
                self.assertIn("question_code", opt.action_data)

    def test_emergency_back_option_returns_to_main(self):
        """Emergency menu option 0 must navigate back to main."""
        tree = USSDNavigator.build_menu_tree()
        emergency = tree["emergency"]
        back_opt = next(opt for opt in emergency.options if opt.key == "0")
        self.assertEqual(back_opt.next_menu_id, "main")

    def test_emergency_action_map_has_all_signs(self):
        """EMERGENCY_ACTION_MAP must have all five emergency signs."""
        self.assertIn("emergency_bleeding", EMERGENCY_ACTION_MAP)
        self.assertIn("emergency_fever", EMERGENCY_ACTION_MAP)
        self.assertIn("emergency_headache", EMERGENCY_ACTION_MAP)
        self.assertIn("emergency_convulsions", EMERGENCY_ACTION_MAP)
        self.assertIn("emergency_other", EMERGENCY_ACTION_MAP)


class USSDSessionTest(TestCase):
    """Test USSD session management (spec §17.5)."""

    def setUp(self):
        # Reset the default navigator to ensure clean state
        import apps.core.ussd_service as ussd_mod
        ussd_mod._default_navigator = None
        self.navigator = USSDNavigator()

    def test_start_session(self):
        """start_session should create a session at the main menu."""
        session = self.navigator.start_session("0240000000", "english")
        self.assertEqual(session.phone_number, "0240000000")
        self.assertEqual(session.current_menu_id, "main")
        self.assertEqual(session.language, "english")
        self.assertIn("main", session.history)

    def test_get_session(self):
        """get_session should retrieve an existing session."""
        session = self.navigator.start_session("0240000000")
        retrieved = self.navigator.get_session(session.session_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.session_id, session.session_id)

    def test_get_session_not_found(self):
        """get_session should return None for non-existent session."""
        self.assertIsNone(self.navigator.get_session("nonexistent"))

    def test_end_session(self):
        """end_session should remove the session."""
        session = self.navigator.start_session("0240000000")
        self.navigator.end_session(session.session_id)
        self.assertIsNone(self.navigator.get_session(session.session_id))

    def test_get_current_menu(self):
        """get_current_menu should return the current menu."""
        session = self.navigator.start_session("0240000000")
        menu = self.navigator.get_current_menu(session)
        self.assertIsNotNone(menu)
        self.assertEqual(menu.menu_id, "main")


class USSDNavigationTest(TestCase):
    """Test USSD menu navigation (spec §17.5)."""

    def setUp(self):
        import apps.core.ussd_service as ussd_mod
        ussd_mod._default_navigator = None
        self.navigator = USSDNavigator()

    def test_initial_input_shows_main_menu(self):
        """Empty input should show the main menu."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "")
        self.assertIn("Main Menu", text)
        self.assertFalse(is_end)

    def test_navigate_to_emergency(self):
        """Selecting 3 from main menu should navigate to emergency."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "3")
        self.assertIn("EMERGENCY", text)
        self.assertFalse(is_end)
        self.assertEqual(session.current_menu_id, "emergency")

    def test_navigate_to_register_concern(self):
        """Selecting 1 from main menu should navigate to register_concern."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "1")
        self.assertIn("Register", text)
        self.assertEqual(session.current_menu_id, "register_concern")

    def test_navigate_to_check_appointment(self):
        """Selecting 2 from main menu should navigate to check_appointment (end)."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "2")
        self.assertTrue(is_end)

    def test_navigate_to_help(self):
        """Selecting 0 from main menu should navigate to help (end)."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "0")
        self.assertIn("Help", text)
        self.assertTrue(is_end)

    def test_invalid_input(self):
        """Invalid input should show error and re-render menu."""
        session = self.navigator.start_session("0240000000")
        text, is_end = self.navigator.handle_input(session, "9")
        self.assertIn("Invalid", text)
        self.assertFalse(is_end)

    def test_emergency_bleeding_trigger(self):
        """Selecting 1 from emergency menu should trigger emergency action."""
        session = self.navigator.start_session("0240000000")
        # Navigate to emergency first
        self.navigator.handle_input(session, "3")
        # Select bleeding
        text, is_end = self.navigator.handle_input(session, "1")
        self.assertTrue(is_end)
        self.assertIn("EMERGENCY", text)
        self.assertEqual(session.last_action, "emergency")
        self.assertEqual(session.state.get("emergency", {}).get("danger_sign"), "bleeding")

    def test_emergency_fever_trigger(self):
        """Selecting 2 from emergency menu should trigger fever emergency."""
        session = self.navigator.start_session("0240000000")
        self.navigator.handle_input(session, "3")
        text, is_end = self.navigator.handle_input(session, "2")
        self.assertTrue(is_end)
        self.assertEqual(session.state.get("emergency", {}).get("danger_sign"), "fever")

    def test_emergency_back_to_main(self):
        """Selecting 0 from emergency menu should go back to main."""
        session = self.navigator.start_session("0240000000")
        self.navigator.handle_input(session, "3")
        text, is_end = self.navigator.handle_input(session, "0")
        self.assertFalse(is_end)
        self.assertEqual(session.current_menu_id, "main")

    def test_navigation_history(self):
        """Navigation history should track visited menus."""
        session = self.navigator.start_session("0240000000")
        self.navigator.handle_input(session, "3")
        self.assertIn("main", session.history)
        self.assertEqual(session.current_menu_id, "emergency")


class USSDRoutingTest(TestCase):
    """Test USSD routing through telephony_service (spec §17.5)."""

    def setUp(self):
        import apps.core.ussd_service as ussd_mod
        ussd_mod._default_navigator = None

    def test_route_initial_request(self):
        """Initial USSD request (empty text) should show main menu."""
        text, is_end = route_ussd_session("test-sess-001", "0240000000", "")
        self.assertIn("Main Menu", text)
        self.assertFalse(is_end)

    def test_route_concatenated_input(self):
        """Concatenated input '3*1' should navigate to emergency then trigger bleeding."""
        text, is_end = route_ussd_session("test-sess-002", "0240000000", "3*1")
        self.assertTrue(is_end)
        self.assertIn("EMERGENCY", text)

    def test_route_single_level(self):
        """Single level input '3' should navigate to emergency menu."""
        text, is_end = route_ussd_session("test-sess-003", "0240000000", "3")
        self.assertIn("EMERGENCY", text)
        self.assertFalse(is_end)


class USSDAPIEndpointTest(TestCase):
    """Test the USSD API endpoint (spec §17.5)."""

    def setUp(self):
        import apps.core.ussd_service as ussd_mod
        ussd_mod._default_navigator = None
        self.org = _make_org()
        self.user = _make_user(self.org)
        self.client = APIClient()

    def test_ussd_endpoint_initial(self):
        """POST /api/v1/telephony/ussd with empty text should show main menu."""
        resp = self.client.post(
            "/api/v1/telephony/ussd",
            data={
                "sessionId": "api-sess-001",
                "phoneNumber": "0240000000",
                "text": "",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("Main Menu", data["text"])
        self.assertEqual(data["responseType"], "CONTINUE")

    def test_ussd_endpoint_emergency(self):
        """POST /api/v1/telephony/ussd with '3*1' should trigger emergency."""
        resp = self.client.post(
            "/api/v1/telephony/ussd",
            data={
                "sessionId": "api-sess-002",
                "phoneNumber": "0240000000",
                "text": "3*1",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("EMERGENCY", data["text"])
        self.assertEqual(data["responseType"], "END")

    def test_ussd_endpoint_missing_session_id(self):
        """POST without sessionId should return 400."""
        resp = self.client.post(
            "/api/v1/telephony/ussd",
            data={"phoneNumber": "0240000000", "text": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_ussd_endpoint_single_level(self):
        """POST with '3' should show emergency menu (CONTINUE)."""
        resp = self.client.post(
            "/api/v1/telephony/ussd",
            data={
                "sessionId": "api-sess-003",
                "phoneNumber": "0240000000",
                "text": "3",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("EMERGENCY", data["text"])
        self.assertEqual(data["responseType"], "CONTINUE")
