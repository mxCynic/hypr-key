from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from importlib.resources import files
from pathlib import Path
from typing import Any

from .analysis import build_submap_index
from .models import Binding, Diagnostic, TOOL_VERSION

ASSET_ROOT = files("hypr_keymap.assets")
HTML_TEMPLATE = ASSET_ROOT.joinpath("index.html").read_text(encoding="utf-8")
HTML_STYLE = ASSET_ROOT.joinpath("style.css").read_text(encoding="utf-8")
HTML_I18N = ASSET_ROOT.joinpath("i18n.js").read_text(encoding="utf-8")
HTML_SCRIPT = ASSET_ROOT.joinpath("app.js").read_text(encoding="utf-8")

def render_html(
    bindings: list[Binding],
    diagnostics: list[Diagnostic],
    source: Path,
) -> str:
    source_root = source.resolve().parent

    def display_source(value: str) -> str:
        try:
            return str(Path(value).resolve().relative_to(source_root))
        except ValueError:
            return str(value)

    duplicate_groups = len({binding.duplicate_group for binding in bindings if binding.duplicate_group})
    errors = sum(issue.severity == "error" for issue in diagnostics)
    warnings = sum(issue.severity == "warning" for issue in diagnostics)
    key_count = len(
        {
            binding.key
            for binding in bindings
            if binding.device != "mouse"
        }
    )
    submaps = build_submap_index(bindings)
    payload = {
        "tool_version": TOOL_VERSION,
        "source_path": str(source),
        "source_name": source.name,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "stats": {
            "bindings": len(bindings),
            "keys": key_count,
            "duplicate_groups": duplicate_groups,
            "submaps": len(submaps),
            "errors": errors,
            "warnings": warnings,
        },
        "submaps": submaps,
        "diagnostics": [
            {
                "severity": issue.severity,
                "code": issue.code,
                "title": issue.title,
                "message": issue.message,
                "params": issue.params,
                "key": issue.key,
                "binding_ids": issue.binding_ids,
                "locations": [
                    {
                        "source": display_source(binding.source),
                        "line": binding.line,
                    }
                    for binding in sorted(
                        {
                            (binding.source, binding.line): binding
                            for binding in bindings
                            if binding.id in issue.binding_ids
                        }.values(),
                        key=lambda binding: (binding.source, binding.line),
                    )
                ],
                "lines": sorted(
                    {
                        binding.line
                        for binding in bindings
                        if binding.id in issue.binding_ids
                    }
                ),
            }
            for issue in diagnostics
        ],
        "bindings": [
            {
                "id": binding.id,
                "raw_key": binding.key_raw,
                "key": binding.key,
                "mods": binding.mods,
                "combo": binding.combo,
                "line": binding.line,
                "source": binding.source,
                "source_display": display_source(binding.source),
                "action_path": binding.action_path,
                "action_args": binding.action_args,
                "title": binding.title,
                "short": binding.short,
                "detail": binding.detail,
                "command": binding.command,
                "enabled": binding.enabled,
                "device": binding.device,
                "system": binding.key.startswith("XF86"),
                "duplicate_group": binding.duplicate_group,
                "annotation_source": binding.annotation_source,
                "submap": binding.submap,
                "submap_universal": binding.submap_universal,
                "trigger": list(binding.trigger),
                "trigger_label": binding.trigger_label,
                "flags": list(binding.flags),
                "device_scope": binding.device_scope,
            }
            for binding in bindings
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace(
        "</", "<\\/"
    )
    return (
        HTML_TEMPLATE.replace("__STYLE__", HTML_STYLE)
        .replace("__I18N__", HTML_I18N)
        .replace("__SCRIPT__", HTML_SCRIPT)
        .replace("__PAYLOAD__", encoded)
    )

def print_diagnostics(
    source: Path,
    bindings: list[Binding],
    diagnostics: list[Diagnostic],
) -> None:
    duplicate_groups = len({binding.duplicate_group for binding in bindings if binding.duplicate_group})
    warnings = sum(issue.severity == "warning" for issue in diagnostics)
    annotation_counts = Counter(binding.annotation_source for binding in bindings)
    print(f"来源: {source}")
    print(f"绑定: {len(bindings)} 个，重复: {duplicate_groups} 组，警告: {warnings} 个")
    print(f"Submap: {len(build_submap_index(bindings))} 个")
    print(
        "描述: "
        f"description {annotation_counts['description']}，"
        f"缺失 {annotation_counts['missing']}"
    )
    if not diagnostics:
        print("OK: 未发现重复键位或明显配置问题")
        return
    for issue in diagnostics:
        label = "ERROR" if issue.severity == "error" else "WARN"
        print(f"{label}: {issue.title}")
        print(f"  {issue.message}")
