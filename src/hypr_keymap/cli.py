from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

from .analysis import analyze
from .extractor import extract_bindings
from .models import TOOL_VERSION, HyprKeymapError
from .render import print_diagnostics, render_html

def usage_error(message: str) -> "NoReturn":
    raise HyprKeymapError(message)

def discover_config(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit).expanduser()
        if not path.is_file():
            usage_error(f"找不到 Hyprland Lua 配置文件: {path}")
        return path.resolve()

    home = Path.home()
    config_home = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config"))
    hypr_dirs = [
        config_home / "hypr",
        Path.cwd() / "hypr",
    ]
    candidates = [
        *(directory / "hyprland.lua" for directory in hypr_dirs),
        *(directory / "configs" / "binds.lua" for directory in hypr_dirs),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    usage_error(
        "找不到 Hyprland Lua 入口；请传入路径，例如: "
        "hypr-keymap ~/.config/hypr/hyprland.lua"
    )

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "读取 Hyprland Lua 按键配置，按 submap、触发阶段、device 和全部"
            " bind flags 检查重叠，并生成自包含网页。"
        ),
        epilog=(
            "新增绑定后无需修改本工具。推荐使用 Hyprland 原生 flags："
            'hl.bind(..., { description = "功能说明" })，'
            "没有 description 的绑定仍会生成，并显示动作路径、原始命令和配置行号，"
            "但不会自动生成功能描述。"
        ),
    )
    parser.add_argument(
        "config",
        nargs="?",
        help=(
            "Hyprland Lua 入口路径；默认查找 ~/.config/hypr/hyprland.lua，"
            "并兼容旧的 binds.lua 路径"
        ),
    )
    parser.add_argument(
        "-o",
        "--output",
        help="HTML 输出路径；默认 ~/.cache/hypr-keymap/index.html，使用 - 输出到 stdout",
    )
    parser.add_argument(
        "--module-root",
        dest="module_roots",
        action="append",
        type=Path,
        help="额外的 Lua 模块搜索根，可重复；用于 Omarchy 等多目录配置",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="只检查并输出诊断，不生成网页；发现错误时退出码为 1",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="生成后用 xdg-open 打开网页",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {TOOL_VERSION}",
    )
    return parser.parse_args(argv)

def default_output() -> Path:
    cache_root = Path(
        os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")
    ).expanduser()
    return cache_root / "hypr-keymap" / "index.html"

def _run(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    source = discover_config(args.config)
    raw_bindings = extract_bindings(source, args.module_roots)
    bindings, diagnostics = analyze(raw_bindings, source)
    errors = sum(issue.severity == "error" for issue in diagnostics)

    print_diagnostics(source, bindings, diagnostics)
    if args.check:
        return 1 if errors else 0

    html = render_html(bindings, diagnostics, source)
    if args.output == "-":
        sys.stdout.write(html)
        return 0

    output = Path(args.output).expanduser() if args.output else default_output()
    output = output.resolve()
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html, encoding="utf-8")
    except OSError as exc:
        usage_error(f"无法写入网页 {output}: {exc}")

    print(f"网页: {output}")
    if args.open:
        opener = shutil.which("xdg-open")
        if not opener:
            print("hypr-keymap: 未找到 xdg-open，网页已生成但未自动打开", file=sys.stderr)
        else:
            subprocess.Popen(
                [opener, str(output)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
    else:
        print("提示: 使用 --open 可在生成后自动打开")
    return 0


def main(argv: list[str] | None = None) -> int:
    try:
        return _run(argv)
    except HyprKeymapError as exc:
        print(f"hypr-keymap: {exc}", file=sys.stderr)
        return 2
