#!/usr/bin/env python3
"""Run the Omarchy compatibility audit against the checked-in snapshot."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SNAPSHOT = PROJECT / "tests" / "fixtures" / "omarchy" / "quattro"
sys.path.insert(0, str(PROJECT / "src"))

from hypr_keymap.analysis import analyze, build_submap_index
from hypr_keymap.extractor import extract_bindings


def lua_bin_directory() -> str:
    for command in ("lua", "lua5.4", "lua5.3", "lua5.2", "luajit"):
        path = shutil.which(command)
        if path:
            return str(Path(path).parent)
    raise RuntimeError("no Lua interpreter found")


def prepare_config(root: Path) -> Path:
    merged = root / "merged"
    default = merged / "default"
    default.mkdir(parents=True)

    shutil.copytree(SNAPSHOT / "config" / "hypr", merged / "hypr")
    shutil.copytree(SNAPSHOT / "default" / "hypr", default / "hypr")
    shutil.copytree(SNAPSHOT / "default" / "omarchy", default / "omarchy")

    entry = merged / "hyprland.lua"
    shutil.copy2(SNAPSHOT / "config" / "hypr" / "hyprland.lua", entry)
    return entry


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="hypr-keymap-omarchy-") as temporary:
        root = Path(temporary)
        entry = prepare_config(root)
        home = root / "home"
        overrides = {
            "HOME": str(home),
            "XDG_CONFIG_HOME": str(home / ".config"),
            "XDG_STATE_HOME": str(home / ".local" / "state"),
            "OMARCHY_PATH": str(root / "merged"),
            "PATH": f"{lua_bin_directory()}:/usr/bin:/bin",
        }
        previous = {key: os.environ.get(key) for key in overrides}
        try:
            os.environ.update(overrides)
            bindings, diagnostics = analyze(extract_bindings(entry), entry)
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    duplicate_groups = [
        issue for issue in diagnostics if issue.code == "duplicate-binding"
    ]
    unknown_keys = [issue for issue in diagnostics if issue.code == "unknown-key"]
    missing_descriptions = [binding for binding in bindings if not binding.title]
    missing_combos = {binding.combo for binding in missing_descriptions}
    expected_missing = {
        "SWITCH:ON:LID SWITCH",
        "SWITCH:OFF:LID SWITCH",
        "SWITCH:ON:APPLE SMC POWER/LID EVENTS",
        "SWITCH:OFF:APPLE SMC POWER/LID EVENTS",
    }

    assert len(bindings) >= 242, f"expected at least 242 bindings, got {len(bindings)}"
    assert not build_submap_index(bindings), "Omarchy snapshot unexpectedly has submaps"
    assert len(duplicate_groups) == 2, (
        f"expected 2 duplicate groups, got {len(duplicate_groups)}"
    )
    assert len(unknown_keys) >= 23, (
        f"expected at least 23 unknown-key warnings, got {len(unknown_keys)}"
    )
    assert missing_combos == expected_missing, (
        f"unexpected missing descriptions: {sorted(missing_combos)}"
    )

    duplicate_combos = {issue.params["combo"] for issue in duplicate_groups}
    assert duplicate_combos == {"Alt + Tab", "Alt + Shift + Tab"}

    focus = next(
        binding for binding in bindings if binding.title == "Focus on next window"
    )
    assert Path(focus.source).name == "tiling.lua", focus.source
    assert focus.line == 55, f"unexpected source line for focus binding: {focus.line}"

    print(
        "Omarchy snapshot passed: "
        f"{len(bindings)} bindings, "
        f"{len(duplicate_groups)} duplicate groups, "
        f"{len(unknown_keys)} unknown-key warnings, "
        f"{len(missing_descriptions)} missing descriptions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
