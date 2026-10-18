from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from .models import *

def normalize_modifier(value: str) -> str:
    normalized = re.sub(r"\s+", " ", value.strip().upper())
    return MODIFIER_ALIASES.get(normalized, normalized)

def normalize_key(value: str) -> str:
    normalized = value.strip().upper()
    code_match = re.fullmatch(r"CODE:(\d+)", normalized)
    if code_match:
        code = int(code_match.group(1))
        # Hyprland's code:NNN syntax follows XKB keycodes, which are the
        # Linux evdev keycodes shifted by 8. This also makes code:47 and the
        # symbol ";" compare as the same physical key.
        return KEYCODE_NAMES.get(code - 8, f"CODE:{code}")
    normalized = KEY_ALIASES.get(normalized, normalized)
    return NAMED_KEY_LOOKUP.get(normalized, normalized)

def split_key(raw: str) -> tuple[list[str], list[str], str]:
    parts = [part.strip() for part in re.split(r"\s*\+\s*", raw.strip())]
    if not parts or not parts[-1]:
        raise ValueError(f"无法解析键位: {raw!r}")
    mods_raw = parts[:-1]
    mods_unique: dict[str, None] = {}
    for modifier in mods_raw:
        mods_unique[normalize_modifier(modifier)] = None
    mods = sorted(
        mods_unique,
        key=lambda modifier: (MODIFIER_ORDER.get(modifier, 1000), modifier),
    )
    return mods, mods_raw, normalize_key(parts[-1])

def action_arg(binding: RawBinding, index: int = 0) -> Any:
    return binding.action_args[index] if index < len(binding.action_args) else None

def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def shorten_description(text: str, limit: int = 16) -> str:
    short = re.split(r"[：:；;。]", text, maxsplit=1)[0].strip() or text
    return short if len(short) <= limit else f"{short[: limit - 1]}…"

def metadata_for(binding: RawBinding) -> tuple[str, str, str, str, str]:
    path = binding.action_path
    first = action_arg(binding)
    if path.endswith("exec_cmd"):
        command = str(first or "")
    elif path and binding.action_args:
        args = (
            binding.action_args[0]
            if len(binding.action_args) == 1
            else binding.action_args
        )
        command = f"{path}({compact_json(args)})"
    elif path:
        command = path
    else:
        command = str(first if first is not None else "未识别动作")

    if binding.description.strip():
        description = binding.description.strip()
        return (
            shorten_description(description),
            description,
            "",
            command,
            "description",
        )
    return "", "", "", command, "missing"

def trigger_signature(options: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        flag
        for flag in ("release", "long_press", "click", "drag")
        if options.get(flag)
    )

def active_flags(options: dict[str, Any]) -> tuple[str, ...]:
    return tuple(
        flag for flag in BOOLEAN_BIND_FLAGS if options.get(flag) is True
    )

def device_scope(options: dict[str, Any]) -> tuple[str, tuple[Any, ...]]:
    value = options.get("device")
    if not isinstance(value, dict):
        return "all devices", ("all",)
    names = tuple(
        sorted(
            str(name)
            for name in value.get("list", [])
            if isinstance(name, str) and name
        )
    )
    inclusive = value.get("inclusive", True) is not False
    if not names:
        return (
            "no devices" if inclusive else "all devices",
            ("include", ()) if inclusive else ("all",),
        )
    prefix = "only" if inclusive else "except"
    mode = "include" if inclusive else "exclude"
    return f"{prefix}: {', '.join(names)}", (mode, names)

def device_scopes_overlap(left: tuple[Any, ...], right: tuple[Any, ...]) -> bool:
    if left == ("all",) or right == ("all",):
        return True
    left_mode, left_names = left
    right_mode, right_names = right
    if left_mode == "include" and right_mode == "include":
        return bool(set(left_names) & set(right_names))
    if left_mode == "include":
        return bool(set(left_names) - set(right_names))
    if right_mode == "include":
        return bool(set(right_names) - set(left_names))
    return True

def scope_overlap(left: Binding, right: Binding) -> bool:
    if left.submap_universal or right.submap_universal:
        return True
    return left.submap == right.submap

def mods_overlap(left: Binding, right: Binding) -> bool:
    if left.options.get("ignore_mods") or right.options.get("ignore_mods"):
        return True
    return left.mods == right.mods

def validate_flags(raw: RawBinding, key: str) -> list[Diagnostic]:
    issues: list[Diagnostic] = []
    for name, value in raw.options.items():
        if name not in KNOWN_BIND_FLAGS:
            issues.append(
                Diagnostic(
                    "warning",
                    "unknown-bind-flag",
                    f"未知 bind flag：{name}",
                    f"第 {raw.line} 行包含未知 flag {name!r}，请确认拼写和 Hyprland 版本。",
                    key=key,
                    binding_ids=[raw.index],
                )
            )
            continue
        if name in BOOLEAN_BIND_FLAGS and not isinstance(value, bool):
            issues.append(
                Diagnostic(
                    "warning",
                    "invalid-bind-flag-type",
                    f"bind flag 类型错误：{name}",
                    f"第 {raw.line} 行的 {name} 应为 boolean，实际为 {type(value).__name__}。",
                    key=key,
                    binding_ids=[raw.index],
                )
            )
        if name in STRING_BIND_FLAGS and not isinstance(value, str):
            issues.append(
                Diagnostic(
                    "warning",
                    "invalid-bind-flag-type",
                    f"bind flag 类型错误：{name}",
                    f"第 {raw.line} 行的 {name} 应为 string，实际为 {type(value).__name__}。",
                    key=key,
                    binding_ids=[raw.index],
                )
            )

    device = raw.options.get("device")
    if device is not None:
        if not isinstance(device, dict):
            issues.append(
                Diagnostic(
                    "warning",
                    "invalid-device-flag",
                    "device flag 类型错误",
                    f"第 {raw.line} 行的 device 应为 table。",
                    key=key,
                    binding_ids=[raw.index],
                )
            )
        else:
            names = device.get("list")
            if not isinstance(names, list) or not all(
                isinstance(name, str) for name in names
            ):
                issues.append(
                    Diagnostic(
                        "warning",
                        "invalid-device-flag",
                        "device.list 类型错误",
                        f"第 {raw.line} 行的 device.list 应为字符串数组。",
                        key=key,
                        binding_ids=[raw.index],
                    )
                )
            if "inclusive" in device and not isinstance(device["inclusive"], bool):
                issues.append(
                    Diagnostic(
                        "warning",
                        "invalid-device-flag",
                        "device.inclusive 类型错误",
                        f"第 {raw.line} 行的 device.inclusive 应为 boolean。",
                        key=key,
                        binding_ids=[raw.index],
                    )
                )

    description = raw.options.get("description")
    desc = raw.options.get("desc")
    if (
        isinstance(description, str)
        and isinstance(desc, str)
        and description.strip() != desc.strip()
    ):
        issues.append(
            Diagnostic(
                "warning",
                "conflicting-description-flags",
                "description 与 desc 不一致",
                f"第 {raw.line} 行同时设置了不同的 description 和 desc；Hyprland 使用 description。",
                key=key,
                binding_ids=[raw.index],
            )
        )

    if raw.options.get("click") and raw.options.get("drag"):
        issues.append(
            Diagnostic(
                "warning",
                "conflicting-trigger-flags",
                "click 与 drag 同时启用",
                f"第 {raw.line} 行同时设置 click 和 drag，松开时的触发条件相互冲突。",
                key=key,
                binding_ids=[raw.index],
            )
        )
    if raw.options.get("release") and (
        raw.options.get("click") or raw.options.get("drag")
    ):
        issues.append(
            Diagnostic(
                "warning",
                "redundant-trigger-flags",
                "release 与 click/drag 重复",
                f"第 {raw.line} 行设置了 release 和 click/drag；click/drag 本身就在松开时触发。",
                key=key,
                binding_ids=[raw.index],
            )
        )
    if raw.options.get("long_press") and (
        raw.options.get("click") or raw.options.get("drag")
    ):
        issues.append(
            Diagnostic(
                "warning",
                "conflicting-trigger-flags",
                "long_press 与 click/drag 同时启用",
                f"第 {raw.line} 行同时设置长按和鼠标点击/拖动触发，实际优先级可能不符合预期。",
                key=key,
                binding_ids=[raw.index],
            )
        )
    return issues

def analyze(raw_bindings: list[RawBinding], source: Path) -> tuple[list[Binding], list[Diagnostic]]:
    bindings: list[Binding] = []
    diagnostics: list[Diagnostic] = []

    for raw in raw_bindings:
        try:
            mods, mods_raw, key = split_key(raw.key_raw)
        except ValueError as exc:
            diagnostics.append(
                Diagnostic(
                    "error",
                    "unparseable-key",
                    "无法解析键位",
                    str(exc),
                    binding_ids=[raw.index],
                )
            )
            continue

        if raw.options_type not in {"nil", "table"}:
            diagnostics.append(
                Diagnostic(
                    "warning",
                    "invalid-bind-options",
                    f"bind 参数格式错误：{raw.key_raw}",
                    (
                        f"第 {raw.line} 行的第三个参数是 {raw.options_type}；"
                        "Hyprland 的 bind flags 必须写在表里，例如 "
                        '{ description = "功能说明" }。'
                    ),
                    key=key,
                    binding_ids=[raw.index],
                )
            )

        diagnostics.extend(validate_flags(raw, key))
        short, title, detail, command, annotation_source = metadata_for(raw)
        device = "mouse" if key.startswith("mouse") or raw.options.get("mouse") else "keyboard"
        submap_universal = bool(raw.options.get("submap_universal"))
        device_scope_label, device_signature = device_scope(raw.options)
        bindings.append(
            Binding(
                id=raw.index,
                key_raw=raw.key_raw,
                key=key,
                mods=mods,
                mods_raw=mods_raw,
                line=raw.line,
                source=raw.source,
                action_path=raw.action_path,
                action_args=raw.action_args,
                options=raw.options,
                description=raw.description,
                enabled=raw.enabled,
                short=short,
                title=title,
                detail=detail,
                command=command,
                device=device,
                annotation_source=annotation_source,
                submap=raw.submap,
                submap_universal=submap_universal,
                trigger=trigger_signature(raw.options),
                flags=active_flags(raw.options),
                device_scope=device_scope_label,
                device_signature=device_signature,
            )
        )

    groups: dict[
        tuple[str, tuple[str, ...], str, tuple[str, ...], tuple[Any, ...]],
        list[Binding],
    ] = defaultdict(list)
    for binding in bindings:
        if binding.enabled:
            context = "global" if binding.submap_universal else binding.submap
            mods = ("*",) if binding.options.get("ignore_mods") else tuple(binding.mods)
            groups[
                (
                    context,
                    mods,
                    binding.key,
                    binding.trigger,
                    binding.device_signature,
                )
            ].append(binding)

    duplicate_groups = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        duplicate_groups += 1
        for binding in group:
            binding.duplicate_group = duplicate_groups
        combo = group[0].combo
        context = "universal" if group[0].submap_universal else group[0].submap
        trigger = group[0].trigger_label
        details = "；".join(
            f"第 {binding.line} 行：{binding.title or '未提供 description'}"
            for binding in group
        )
        diagnostics.append(
            Diagnostic(
                "error",
                "duplicate-binding",
                f"重复键位：{combo}（{context} · {trigger}）",
                f"同一作用域、触发阶段和按键组合被绑定 {len(group)} 次。{details}",
                key=group[0].key,
                binding_ids=[binding.id for binding in group],
            )
        )

    enabled_bindings = [binding for binding in bindings if binding.enabled]
    for index, left in enumerate(enabled_bindings):
        for right in enabled_bindings[index + 1 :]:
            if left.key != right.key or left.trigger != right.trigger:
                continue
            if not scope_overlap(left, right) or not mods_overlap(left, right):
                continue
            if not device_scopes_overlap(
                left.device_signature, right.device_signature
            ):
                continue
            if (
                left.duplicate_group is not None
                and left.duplicate_group == right.duplicate_group
            ):
                continue

            reasons: list[str] = []
            if left.mods != right.mods and (
                left.options.get("ignore_mods")
                or right.options.get("ignore_mods")
            ):
                reasons.append("ignore_mods 使修饰键范围重叠")
            if (
                not (left.submap_universal and right.submap_universal)
                and (left.submap_universal or right.submap_universal)
            ):
                reasons.append("submap_universal 使作用域重叠")
            if left.device_signature != right.device_signature:
                reasons.append("device 范围重叠")
            if not reasons:
                continue

            diagnostics.append(
                Diagnostic(
                    "warning",
                    "semantic-overlap",
                    f"绑定语义可能重叠：{left.combo}",
                    (
                        f"第 {left.line} 行与第 {right.line} 行使用相同按键和触发阶段 "
                        f"{left.trigger_label}；" + "；".join(reasons) + "。"
                    ),
                    key=left.key,
                    binding_ids=[left.id, right.id],
                )
            )

    for binding in bindings:
        if not binding.enabled:
            diagnostics.append(
                Diagnostic(
                    "warning",
                    "disabled-binding",
                    f"已禁用的绑定：{binding.combo}",
                    f"第 {binding.line} 行的绑定调用了 set_enabled(false)。",
                    key=binding.key,
                    binding_ids=[binding.id],
                )
            )
        if len(binding.mods_raw) != len(set(map(normalize_modifier, binding.mods_raw))):
            diagnostics.append(
                Diagnostic(
                    "warning",
                    "duplicate-modifier",
                    f"重复修饰键：{binding.key_raw}",
                    f"第 {binding.line} 行包含重复的修饰键，Hyprland 可能忽略重复项。",
                    key=binding.key,
                    binding_ids=[binding.id],
                )
            )
        if binding.key not in NAMED_KEYS and not binding.key.startswith("CODE:"):
            diagnostics.append(
                Diagnostic(
                    "warning",
                    "unknown-key",
                    f"无法验证键名：{binding.key_raw}",
                    "这个键名不在内置的常见键盘键列表中，请确认拼写和当前 Hyprland 版本支持。",
                    key=binding.key,
                    binding_ids=[binding.id],
                )
            )

    return bindings, diagnostics

def build_submap_index(bindings: list[Binding]) -> list[dict[str, Any]]:
    names = sorted(
        {
            binding.submap
            for binding in bindings
            if binding.enabled and binding.submap != "global"
        }
    )
    result: list[dict[str, Any]] = []
    for name in names:
        members = [
            binding for binding in bindings if binding.enabled and binding.submap == name
        ]
        entries = [
            binding
            for binding in bindings
            if binding.enabled
            and binding.action_path.endswith(".submap")
            and binding.action_args
            and binding.action_args[0] == name
        ]
        resets = [
            binding
            for binding in members
            if binding.action_path.endswith(".submap")
            and binding.action_args
            and binding.action_args[0] == "reset"
        ]
        result.append(
            {
                "name": name,
                "binding_ids": [binding.id for binding in members],
                "entry_binding_ids": [binding.id for binding in entries],
                "reset_binding_ids": [binding.id for binding in resets],
            }
        )
    return result
