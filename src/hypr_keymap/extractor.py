from __future__ import annotations

import json
import os
import shutil
import subprocess
from importlib.resources import files
from pathlib import Path

from .models import HyprKeymapError, RawBinding

LUA_EXTRACTOR = files("hypr_keymap.assets").joinpath("lua_extractor.lua").read_text(encoding="utf-8")

def find_lua() -> str:
    for command in ("lua", "lua5.4", "lua5.3", "lua5.2", "luajit"):
        path = shutil.which(command)
        if path:
            return path
    raise HyprKeymapError("需要 Lua 解释器来读取 Hyprland Lua 配置；未找到 lua")

def config_root_for(path: Path) -> Path:
    return path.parent.parent if path.parent.name == "configs" else path.parent

def default_module_roots(path: Path) -> list[Path]:
    config_root = config_root_for(path)
    roots = [config_root]

    config_home = Path(
        os.environ.get("XDG_CONFIG_HOME") or (Path.home() / ".config")
    ).expanduser()
    try:
        config_root.resolve().relative_to(config_home.resolve())
    except ValueError:
        pass
    else:
        roots.append(config_home)

    omarchy_path = Path(
        os.environ.get("OMARCHY_PATH") or "/usr/share/omarchy"
    ).expanduser()
    if omarchy_path.is_dir():
        roots.append(omarchy_path)
    return roots

def normalize_module_roots(path: Path, module_roots: list[Path] | None) -> list[Path]:
    roots = [config_root_for(path)]
    if module_roots:
        roots.extend(module_roots)
    else:
        roots = default_module_roots(path)

    normalized: list[Path] = []
    seen: set[Path] = set()
    for root in roots:
        resolved = root.expanduser().resolve()
        if resolved.is_dir() and resolved not in seen:
            normalized.append(resolved)
            seen.add(resolved)
    return normalized

def extract_bindings(
    path: Path,
    module_roots: list[Path] | None = None,
) -> list[RawBinding]:
    lua = find_lua()
    roots = normalize_module_roots(path, module_roots)
    lua_files = sorted(
        {
            str(candidate.resolve())
            for root in roots
            for candidate in root.rglob("*.lua")
            if candidate.is_file()
        }
    )
    if any("\n" in candidate for candidate in lua_files):
        raise HyprKeymapError("Lua 配置路径中包含换行符，无法传给提取器")
    env = os.environ.copy()
    env["HYPR_KEYMAP_LUA_FILES"] = "\n".join(lua_files)
    env["HYPR_KEYMAP_LUA_ROOTS"] = "\n".join(str(root) for root in roots)
    process = subprocess.run(
        [lua, "-", str(path)],
        input=LUA_EXTRACTOR,
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )
    if process.returncode != 0:
        detail = process.stderr.strip() or process.stdout.strip() or "未知 Lua 错误"
        raise HyprKeymapError(f"读取 {path} 失败: {detail}")

    records: list[RawBinding] = []
    for line in process.stdout.splitlines():
        if not line.startswith("HYPR_KEYMAP\t"):
            continue
        try:
            item = json.loads(line.split("\t", 1)[1])
        except json.JSONDecodeError as exc:
            raise HyprKeymapError(f"Lua 提取结果不是有效 JSON: {exc}")

        action_path = str(item.get("action_path") or "")
        action_args = item.get("action_args")
        if not isinstance(action_args, list):
            action_args = []
        options = item.get("options")
        if not isinstance(options, dict):
            options = {}

        source_path = Path(str(item.get("source") or path).removeprefix("@"))
        line_number = int(item.get("line") or 0)
        records.append(
            RawBinding(
                index=len(records) + 1,
                key_raw=str(item.get("key") or ""),
                line=line_number,
                source=str(source_path),
                action_path=action_path,
                action_args=action_args,
                options=options,
                options_type=str(item.get("options_type") or "nil"),
                description=str(item.get("description") or ""),
                submap=str(item.get("submap") or "global"),
                enabled=bool(item.get("enabled", True)),
            )
        )

    if not records:
        raise HyprKeymapError(f"{path} 中没有找到 hl.bind() 调用")
    return records
