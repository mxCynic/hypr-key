# hypr-keymap

读取 Hyprland 的 Lua 配置，生成一个可交互、可搜索、可诊断的键盘布局审计网页。

`hypr-keymap` 面向已经将 Hyprland 配置迁移到 Lua 的用户。它不要求手工维护按键说明，也不依赖固定键位表：绑定描述直接读取 Hyprland 原生的 `description`，动作、命令、flags、submap 和配置来源都从真实 Lua 配置中提取。

## 项目目的

Hyprland 的 Lua 配置通常通过 `require` 分散在多个文件中，随着时间推移容易出现以下问题：

- 同一个按键组合被重复绑定
- 配置了冲突或冗余的触发 flags
- 某些按键只存在于 submap 中，难以从完整键盘布局中看出
- 修改绑定后，文档和实际配置逐渐不一致
- 仅查看 Lua 文件很难判断某个键最终绑定了什么

`hypr-keymap` 将配置转换成一个完整键盘页面，用于浏览、搜索和检查当前真实的 Keymap，同时提供自动化诊断。

## 核心功能

### 从 Hyprland 配置入口读取

只需要传入 `hyprland.lua`，工具会沿着 Lua `require` 关系加载绑定文件：

```lua
require("./configs/*")
```

支持：

- 相对路径：`require("./configs/binds.lua")`
- 点号模块名：`require("configs.function")`
- glob：`require("./configs/*")`
- 模块返回值与正常 Lua `require` 缓存
- 每个绑定保留真实的来源文件和行号，例如 `configs/binds.lua:20`

为避免执行配置根目录之外的模块，提取器只会加载入口目录中预扫描到的 Lua 文件。

### 交互式键盘审计

- 显示 ANSI 键盘、鼠标按键、多媒体键和功能键
- 点击任意按键查看对应的按键组合、命令、device 和 flags
- 支持 submap 总览、成员视图和双击进入/退出
- submap 入口与出口使用强调色，入口修饰键单独区分
- 普通 submap 成员保持和一般绑定一致的样式
- 支持键盘方向键导航和无障碍标签

### 搜索

页面内按 `/` 或 `Ctrl+K` 打开搜索。

支持普通文本搜索和字段过滤：

```text
SUPER A
SUPER + A
super+a
key:super+a
submap:resize
flag:repeating
device:keyboard
command:playerctl
action:window
```

### 配置诊断

网页底部会显示当前配置的诊断结果，包括：

- 重复按键组合
- 同作用域、触发阶段和 device 范围的重叠
- `ignore_mods`、`submap_universal` 等语义重叠
- 未知或类型错误的 bind flags
- `release`、`long_press`、`click`、`drag` 的组合冲突
- 重复修饰键和未知键名

使用 `--check` 可以在终端直接执行诊断，不生成网页。

### 中英文界面

- 默认界面为英文
- 页头可切换 English / 中文
- 语言选择会保存在浏览器本地，并通过 `#lang=zh` 写入 URL
- Hyprland 的 `description` 始终原样显示，不参与翻译

### 自包含网页

输出的 HTML 已内嵌样式、脚本和绑定数据，不需要本地服务器，也不会在运行时访问网络。

## 工作原理

工具使用受限 Lua 环境执行配置入口：

- `hl.bind()`、`hl.define_submap()` 等调用会被捕获
- `hl.dsp.*` 动作会保留动作路径和参数
- `hl.window_rule()`、`hl.monitor()` 等非按键调用由代理对象接收
- `require` 由工具自行解析，不依赖系统 Lua 模块路径

该过程只读取配置并构造审计数据，不会修改 Hyprland 状态，也不会执行绑定命令本身。

## 环境要求

- Linux
- Python 3.11 或更高版本
- Lua 5.1、5.2、5.3、5.4 或 LuaJIT
- [uv](https://docs.astral.sh/uv/)
- Chromium：仅运行 UI 回归测试时需要
- `xdg-open`：仅使用 `--open` 时需要

## 快速开始

在项目目录中运行：

```bash
uv sync
uv run hypr-keymap --open
```

不传路径时，工具默认查找：

```text
~/.config/hypr/hyprland.lua
```

也可以显式指定入口：

```bash
hypr-keymap ~/.config/hypr/hyprland.lua --open
```

默认输出：

```text
~/.cache/hypr-keymap/index.html
```

指定输出位置：

```bash
hypr-keymap ~/.config/hypr/hyprland.lua -o /tmp/keymap.html --open
```

只检查配置，不生成网页：

```bash
hypr-keymap ~/.config/hypr/hyprland.lua --check
```

检查模式下，发现 error 级诊断时退出码为 `1`。

## 配置建议

功能描述应直接写在 Hyprland 原生 `description` 中：

```lua
hl.bind(
  mainMod .. "Q",
  hl.dsp.exec_cmd("kitty"),
  { description = "打开终端" }
)
```

工具不会根据命令、动作路径或键名推断功能。没有 `description` 的绑定仍然会显示，但描述会保持为空。

## 构建

在仓库根目录生成 wheel 和源码包：

```bash
uv build
```

输出位于：

```text
dist/
├── hypr_keymap-1.10.0-py3-none-any.whl
└── hypr_keymap-1.10.0.tar.gz
```

如果需要离线构建：

```bash
uv build --offline
```

离线构建要求 `uv_build` 已存在于本地缓存。

## 安装

### Editable 安装

适合持续开发：

```bash
uv tool install --editable .
```

editable 模式下，修改 `src/hypr_keymap/` 后立即生效。依赖、入口点或构建配置变化时重新执行：

```bash
uv tool install --force --editable .
```

### Wheel 安装

适合固定版本运行：

```bash
uv build
uv tool install --force \
  dist/hypr_keymap-1.10.0-py3-none-any.whl
```

查看安装位置：

```bash
uv tool dir
uv tool dir --bin
```

默认命令入口：

```text
~/.local/bin/hypr-keymap
```

默认工具环境：

```text
~/.local/share/uv/tools/hypr-keymap/
```

