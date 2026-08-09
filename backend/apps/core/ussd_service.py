"""
USSD menu navigation service (spec §17.5).

Provides structured USSD menu navigation for patient-facing interactions.
USSD sessions track the current menu, navigation history, and language.

Default menu tree:
- Main Menu: 1=Register concern, 2=Check appointment, 3=Emergency, 0=Help
- Emergency: 1=Bleeding, 2=Fever, 3=Headache, 4=Convulsions, 5=Other, 0=Back
- Each emergency option triggers the telephony emergency path (spec §17.4)
"""
import uuid
from dataclasses import dataclass, field
from typing import Optional

from django.utils import timezone


# ── USSD data structures ──

@dataclass
class USSDOption:
    """A single option in a USSD menu."""
    key: str
    label: str
    next_menu_id: Optional[str] = None  # Navigate to this menu
    action: Optional[str] = None  # Trigger this action (e.g., "emergency")
    action_data: Optional[dict] = None  # Data for the action


@dataclass
class USSDMenu:
    """A USSD menu with options."""
    menu_id: str
    title: str
    options: list = field(default_factory=list)  # list of USSDOption
    parent_menu_id: Optional[str] = None
    is_end: bool = False  # If True, this is a terminal menu (session ends)


@dataclass
class USSDSession:
    """A USSD session tracking navigation state."""
    session_id: str
    phone_number: str
    current_menu_id: str
    language: str = "english"
    history: list = field(default_factory=list)  # list of menu_ids visited
    state: dict = field(default_factory=dict)  # arbitrary session state
    started_at: str = ""
    last_action: Optional[str] = None
    last_action_data: Optional[dict] = None


# ── Emergency action mapping ──
# Maps emergency menu selections to danger sign codes for the telephony
# emergency path (spec §17.4)
EMERGENCY_ACTION_MAP = {
    "emergency_bleeding": {"danger_sign": "bleeding", "question_code": "DANGER_BLEEDING"},
    "emergency_fever": {"danger_sign": "fever", "question_code": "DANGER_FEVER"},
    "emergency_headache": {"danger_sign": "severe_headache", "question_code": "DANGER_HEADACHE"},
    "emergency_convulsions": {"danger_sign": "convulsion", "question_code": "DANGER_CONVULSIONS"},
    "emergency_other": {"danger_sign": "other_danger", "question_code": "DANGER_OTHER"},
}


class USSDNavigator:
    """
    Navigates USSD menu trees for patient interactions (spec §17.5).

    Manages sessions, handles input, and triggers actions (including
    the telephony emergency path for emergency selections).
    """

    # In-memory session store (production would use Redis or DB)
    _sessions: dict = {}

    def __init__(self, menu_tree: Optional[dict] = None):
        self.menu_tree = menu_tree if menu_tree is not None else self.build_menu_tree()

    @staticmethod
    def build_menu_tree() -> dict:
        """
        Construct the full default USSD menu tree.

        Main Menu: 1=Register concern, 2=Check appointment, 3=Emergency, 0=Help
        Emergency: 1=Bleeding, 2=Fever, 3=Headache, 4=Convulsions, 5=Other, 0=Back
        """
        return {
            "main": USSDMenu(
                menu_id="main",
                title="MCH VoiceCare — Main Menu",
                options=[
                    USSDOption(key="1", label="Register concern", next_menu_id="register_concern"),
                    USSDOption(key="2", label="Check appointment", next_menu_id="check_appointment"),
                    USSDOption(key="3", label="Emergency", next_menu_id="emergency"),
                    USSDOption(key="0", label="Help", next_menu_id="help"),
                ],
            ),
            "register_concern": USSDMenu(
                menu_id="register_concern",
                title="Register a concern",
                parent_menu_id="main",
                options=[
                    USSDOption(key="1", label="Pregnancy concern", next_menu_id="pregnancy_concern"),
                    USSDOption(key="2", label="Child health concern", next_menu_id="child_concern"),
                    USSDOption(key="0", label="Back", next_menu_id="main"),
                ],
            ),
            "pregnancy_concern": USSDMenu(
                menu_id="pregnancy_concern",
                title="Pregnancy concern",
                parent_menu_id="register_concern",
                options=[
                    USSDOption(key="1", label="Danger signs", next_menu_id="danger_signs"),
                    USSDOption(key="0", label="Back", next_menu_id="register_concern"),
                ],
            ),
            "danger_signs": USSDMenu(
                menu_id="danger_signs",
                title="Danger signs — select your symptom",
                parent_menu_id="pregnancy_concern",
                options=[
                    USSDOption(key="1", label="Bleeding", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_bleeding"]),
                    USSDOption(key="2", label="Fever", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_fever"]),
                    USSDOption(key="3", label="Headache", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_headache"]),
                    USSDOption(key="4", label="Convulsions", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_convulsions"]),
                    USSDOption(key="5", label="Other", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_other"]),
                    USSDOption(key="0", label="Back", next_menu_id="pregnancy_concern"),
                ],
            ),
            "child_concern": USSDMenu(
                menu_id="child_concern",
                title="Child health concern",
                parent_menu_id="register_concern",
                options=[
                    USSDOption(key="1", label="Fever", action="emergency", action_data={"danger_sign": "fever", "question_code": "DANGER_FEVER"}),
                    USSDOption(key="2", label="Difficulty breathing", action="emergency", action_data={"danger_sign": "breathing", "question_code": "DANGER_BREATHING"}),
                    USSDOption(key="0", label="Back", next_menu_id="register_concern"),
                ],
            ),
            "emergency": USSDMenu(
                menu_id="emergency",
                title="EMERGENCY — select your symptom",
                parent_menu_id="main",
                options=[
                    USSDOption(key="1", label="Bleeding", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_bleeding"]),
                    USSDOption(key="2", label="Fever", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_fever"]),
                    USSDOption(key="3", label="Headache", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_headache"]),
                    USSDOption(key="4", label="Convulsions", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_convulsions"]),
                    USSDOption(key="5", label="Other", action="emergency", action_data=EMERGENCY_ACTION_MAP["emergency_other"]),
                    USSDOption(key="0", label="Back", next_menu_id="main"),
                ],
            ),
            "check_appointment": USSDMenu(
                menu_id="check_appointment",
                title="Check appointment",
                parent_menu_id="main",
                is_end=True,
                options=[],
            ),
            "help": USSDMenu(
                menu_id="help",
                title="Help — Call your nearest health facility or 112 for emergencies.",
                parent_menu_id="main",
                is_end=True,
                options=[],
            ),
        }

    def get_current_menu(self, session: USSDSession) -> Optional[USSDMenu]:
        """Get the current menu for a session."""
        return self.menu_tree.get(session.current_menu_id)

    def start_session(self, phone_number: str, language: str = "english") -> USSDSession:
        """Start a new USSD session."""
        session_id = f"ussd-{uuid.uuid4().hex[:12]}"
        session = USSDSession(
            session_id=session_id,
            phone_number=phone_number,
            current_menu_id="main",
            language=language,
            history=["main"],
            started_at=timezone.now().isoformat(),
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[USSDSession]:
        """Retrieve an existing session by ID."""
        return self._sessions.get(session_id)

    def end_session(self, session_id: str) -> None:
        """End and remove a session."""
        self._sessions.pop(session_id, None)

    def handle_input(self, session: USSDSession, user_input: str) -> tuple:
        """
        Handle user input for a USSD session.

        Args:
            session: The active USSD session
            user_input: The user's input (single key for menu navigation)

        Returns:
            (response_text, is_end) — the USSD response text and whether
            the session should end.
        """
        menu = self.get_current_menu(session)
        if menu is None:
            return ("Invalid session. Please try again.", True)

        # Handle empty input (initial menu display)
        if not user_input:
            return (self._render_menu(menu), menu.is_end)

        # Find the matching option
        selected = None
        for opt in menu.options:
            if opt.key == user_input:
                selected = opt
                break

        if selected is None:
            return (f"Invalid input. {self._render_menu(menu)}", False)

        # Handle action (e.g., emergency trigger)
        if selected.action:
            session.last_action = selected.action
            session.last_action_data = selected.action_data or {}
            if selected.action == "emergency":
                return self._handle_emergency(session, selected.action_data or {})

        # Handle navigation
        if selected.next_menu_id:
            session.history.append(session.current_menu_id)
            session.current_menu_id = selected.next_menu_id
            next_menu = self.menu_tree.get(selected.next_menu_id)
            if next_menu:
                return (self._render_menu(next_menu), next_menu.is_end)

        # No action or navigation — end session
        return ("Thank you for using MCH VoiceCare.", True)

    def _render_menu(self, menu: USSDMenu) -> str:
        """Render a menu as USSD text."""
        lines = [menu.title]
        for opt in menu.options:
            lines.append(f"{opt.key}. {opt.label}")
        return "\n".join(lines)

    def _handle_emergency(self, session: USSDSession, action_data: dict) -> tuple:
        """
        Handle an emergency selection — triggers the telephony emergency path.

        In production, this would:
        1. Persist the remote observation centrally (spec §17.4 step 1)
        2. Create an emergency alert centrally (spec §17.4 step 2)
        3. Repeat approved emergency advice to the caller (spec §17.4 step 3)
        4. Notify the assigned facility role (spec §17.4 step 4)
        5. Initiate referral/escalation workflow (spec §17.4 step 5)

        The actual emergency cascade is triggered by the API view which
        delegates to the communication telephony emergency path.
        """
        danger_sign = action_data.get("danger_sign", "unknown")
        question_code = action_data.get("question_code", "")
        session.state["emergency"] = {
            "danger_sign": danger_sign,
            "question_code": question_code,
            "triggered_at": timezone.now().isoformat(),
        }
        advice = (
            "EMERGENCY DETECTED. Stay calm. Help is being arranged. "
            "Go to the nearest health facility immediately. "
            "Call 112 for ambulance."
        )
        return (advice, True)


# ── Module-level singleton navigator ──
_default_navigator: Optional[USSDNavigator] = None


def get_default_navigator() -> USSDNavigator:
    """Get the default USSD navigator instance."""
    global _default_navigator
    if _default_navigator is None:
        _default_navigator = USSDNavigator()
    return _default_navigator
