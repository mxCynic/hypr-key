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
    for command in ("lua", "lua5.4", "lua5.3", "luajit"):
        path = shutil.which(command)
        if path:
            return path
    raise HyprKeymapError("需要 Lua 解释器来读取 Hyprland Lua 配置；未找到 lua")

def extract_bindings(path: Path) -> list[RawBinding]:
    lua = find_lua()
    config_root = path.parent.parent if path.parent.name == "configs" else path.parent
    lua_files = sorted(
        str(candidate.resolve())
        for candidate in config_root.rglob("*.lua")
        if candidate.is_file()
    )
    if any("\n" in candidate for candidate in lua_files):
        raise HyprKeymapError("Lua 配置路径中包含换行符，无法传给提取器")
    env = os.environ.copy()
    env["HYPR_KEYMAP_LUA_FILES"] = "\n".join(lua_files)
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
