from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

TOOL_VERSION = "1.10.0"


class HyprKeymapError(RuntimeError):
    """Expected user-facing error while reading or rendering a keymap."""


MODIFIER_ALIASES = {
    "CONTROL": "CTRL",
    "CONTROL_L": "CTRL",
    "CONTROL_R": "CTRL",
    "WIN": "SUPER",
    "LOGO": "SUPER",
    "META": "SUPER",
    "MOD4": "SUPER",
    "MOD1": "ALT",
}
MODIFIER_ORDER = {
    "SUPER": 10,
    "CTRL": 20,
    "ALT": 30,
    "SHIFT": 40,
    "CAPS": 50,
    "MOD2": 60,
    "MOD3": 70,
    "MOD5": 80,
}

KEYCODE_NAMES = {
    1: "ESCAPE",
    2: "1",
    3: "2",
    4: "3",
    5: "4",
    6: "5",
    7: "6",
    8: "7",
    9: "8",
    10: "9",
    11: "0",
    12: "-",
    13: "=",
    14: "BACKSPACE",
    15: "TAB",
    16: "Q",
    17: "W",
    18: "E",
    19: "R",
    20: "T",
    21: "Y",
    22: "U",
    23: "I",
    24: "O",
    25: "P",
    26: "[",
    27: "]",
    28: "ENTER",
    29: "CTRL",
    30: "A",
    31: "S",
    32: "D",
    33: "F",
    34: "G",
    35: "H",
    36: "J",
    37: "K",
    38: "L",
    39: ";",
    40: "'",
    41: "`",
    42: "SHIFT",
    43: "\\",
    44: "Z",
    45: "X",
    46: "C",
    47: "V",
    48: "B",
    49: "N",
    50: "M",
    51: ",",
    52: ".",
    53: "/",
    54: "SHIFT",
    55: "NUMPAD*",
    56: "ALT",
    57: "SPACE",
    58: "CAPS",
    59: "F1",
    60: "F2",
    61: "F3",
    62: "F4",
    63: "F5",
    64: "F6",
    65: "F7",
    66: "F8",
    67: "F9",
    68: "F10",
    69: "NUMLOCK",
    70: "SCROLL_LOCK",
    71: "NUMPAD7",
    72: "NUMPAD8",
    73: "NUMPAD9",
    74: "NUMPAD-",
    75: "NUMPAD4",
    76: "NUMPAD5",
    77: "NUMPAD6",
    78: "NUMPAD+",
    79: "NUMPAD1",
    80: "NUMPAD2",
    81: "NUMPAD3",
    82: "NUMPAD0",
    83: "NUMPAD.",
    86: "<",
    87: "F11",
    88: "F12",
    96: "NUMPADENTER",
    97: "CTRL",
    98: "/",
    99: "PRINT",
    100: "ALT",
    102: "HOME",
    103: "ARROW_UP",
    104: "PAGE_UP",
    105: "ARROW_LEFT",
    106: "ARROW_RIGHT",
    107: "END",
    108: "ARROW_DOWN",
    109: "PAGE_DOWN",
    110: "INSERT",
    111: "DELETE",
    112: "XF86AudioMute",
    113: "XF86AudioLowerVolume",
    114: "XF86AudioRaiseVolume",
    115: "XF86PowerOff",
    116: "NUMPAD=",
    117: "NUMPAD(",
    118: "NUMPAD)",
    119: "PAUSE",
    121: "NUMPAD,",
    125: "SUPER",
    126: "SUPER",
    127: "COMPOSE",
}

KEY_ALIASES = {
    "ESC": "ESCAPE",
    "RETURN": "ENTER",
    "PGUP": "PAGE_UP",
    "PGDN": "PAGE_DOWN",
    "DEL": "DELETE",
    "INS": "INSERT",
    "SCROLLLOCK": "SCROLL_LOCK",
    "UP": "ARROW_UP",
    "DOWN": "ARROW_DOWN",
    "LEFT": "ARROW_LEFT",
    "RIGHT": "ARROW_RIGHT",
    "SPACEBAR": "SPACE",
    "GRAVE": "`",
    "GRAVEACCENT": "`",
    "MINUS": "-",
    "EQUAL": "=",
    "LEFTBRACE": "[",
    "RIGHTBRACE": "]",
    "BRACKETLEFT": "[",
    "BRACKETRIGHT": "]",
    "BACKSLASH": "\\",
    "SEMICOLON": ";",
    "APOSTROPHE": "'",
    "COMMA": ",",
    "PERIOD": ".",
    "SLASH": "/",
}

KEY_DISPLAY = {
    "ESCAPE": "Esc",
    "BACKSPACE": "Backspace",
    "TAB": "Tab",
    "ENTER": "Enter",
    "CAPS": "Caps",
    "SPACE": "Space",
    "PAGE_UP": "PgUp",
    "PAGE_DOWN": "PgDn",
    "ARROW_UP": "↑",
    "ARROW_DOWN": "↓",
    "ARROW_LEFT": "←",
    "ARROW_RIGHT": "→",
    "SCROLL_LOCK": "ScrLk",
    "PRINT": "Print",
    "INSERT": "Insert",
    "DELETE": "Delete",
    "mouse:272": "鼠标左键",
    "mouse:273": "鼠标右键",
    "mouse_down": "滚轮 ↓",
    "mouse_up": "滚轮 ↑",
}

XF86_KEYS = {
    "XF86AudioMute",
    "XF86AudioLowerVolume",
    "XF86AudioRaiseVolume",
    "XF86AudioMicMute",
    "XF86MonBrightnessDown",
    "XF86MonBrightnessUp",
    "XF86AudioPrev",
    "XF86AudioPlay",
    "XF86AudioPause",
    "XF86AudioNext",
    "XF86PowerOff",
    "XF86KbdBrightnessUp",
    "XF86KbdBrightnessDown",
    "XF86KbdLightOnOff",
    "XF86TouchpadToggle",
    "XF86TouchpadOn",
    "XF86TouchpadOff",
    "XF86Eject",
    "XF86Calculator",
}

NAMED_KEYS = {
    *"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    *"0123456789",
    "`",
    "-",
    "=",
    "[",
    "]",
    "\\",
    ";",
    "'",
    ",",
    ".",
    "/",
    "ESCAPE",
    "BACKSPACE",
    "TAB",
    "ENTER",
    "CAPS",
    "SPACE",
    "PRINT",
    "INSERT",
    "DELETE",
    "HOME",
    "END",
    "PAGE_UP",
    "PAGE_DOWN",
    "ARROW_UP",
    "ARROW_DOWN",
    "ARROW_LEFT",
    "ARROW_RIGHT",
    "SCROLL_LOCK",
    "PAUSE",
    "MENU",
    "SUPER",
    "CTRL",
    "ALT",
    "SHIFT",
    "mouse:272",
    "mouse:273",
    "mouse_down",
    "mouse_up",
    *XF86_KEYS,
    *(f"F{number}" for number in range(1, 25)),
}
NAMED_KEY_LOOKUP = {key.upper(): key for key in NAMED_KEYS}
SWITCH_KEY_PATTERN = re.compile(r"^SWITCH:(?:ON|OFF):.+$")


def is_known_key(key: str) -> bool:
    return (
        key in NAMED_KEYS
        or key.startswith("CODE:")
        or SWITCH_KEY_PATTERN.fullmatch(key) is not None
    )

BOOLEAN_BIND_FLAGS = (
    "repeating",
    "locked",
    "release",
    "non_consuming",
    "auto_consuming",
    "mouse",
    "transparent",
    "ignore_mods",
    "dont_inhibit",
    "long_press",
    "submap_universal",
    "click",
    "drag",
    "allow_input_capture",
)
STRING_BIND_FLAGS = ("description", "desc")
KNOWN_BIND_FLAGS = {
    *BOOLEAN_BIND_FLAGS,
    *STRING_BIND_FLAGS,
    "device",
}


@dataclass
class RawBinding:
    index: int
    key_raw: str
    line: int
    source: str
    action_path: str
    action_args: list[Any]
    options: dict[str, Any]
    options_type: str
    description: str
    submap: str
    enabled: bool


@dataclass
class Binding:
    id: int
    key_raw: str
    key: str
    mods: list[str]
    mods_raw: list[str]
    line: int
    source: str
    action_path: str
    action_args: list[Any]
    options: dict[str, Any]
    description: str
    enabled: bool
    short: str
    title: str
    detail: str
    command: str
    annotation_source: str
    device: str
    submap: str
    submap_universal: bool
    trigger: tuple[str, ...]
    flags: tuple[str, ...]
    device_scope: str
    device_signature: tuple[Any, ...]
    duplicate_group: int | None = None

    @property
    def combo(self) -> str:
        parts = [display_modifier(modifier) for modifier in self.mods]
        parts.append(display_key(self.key))
        return " + ".join(parts)

    @property
    def trigger_label(self) -> str:
        return " + ".join(self.trigger) if self.trigger else "press"


@dataclass
class Diagnostic:
    severity: str
    code: str
    title: str
    message: str
    key: str | None = None
    binding_ids: list[int] = field(default_factory=list)
    params: dict[str, Any] = field(default_factory=dict)


def display_modifier(modifier: str) -> str:
    return {
        "SUPER": "Super",
        "CTRL": "Ctrl",
        "ALT": "Alt",
        "SHIFT": "Shift",
    }.get(modifier, modifier)


def display_key(key: str) -> str:
    return KEY_DISPLAY.get(key, key)
