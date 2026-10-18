# hypr-keymap

Generate a self-contained HTML audit of a Hyprland Lua key binding file.

```bash
uv run hypr-keymap --open
```

Install the command globally with:

```bash
uv tool install --editable .
```

To keep it under the existing `mxbin` command directory, symlink
`~/.mxbin/hypr-keymap` to the installed executable from `uv tool dir --bin`.

Search from the page with `/` or `Ctrl+K`. Supported field filters include
`key:super+r`, `submap:resize`, `flag:repeating`, `device:`, `command:` and
`action:`.

The interface defaults to English. Use the `EN / 中文` switch in the header to
change locale; the choice is stored locally and `#lang=zh` also makes a shared
URL open in Chinese. Binding descriptions are always displayed exactly as
written in the Hyprland config and are never translated.

Chord searches accept equivalent spellings such as `SUPER A`, `SUPER + A`,
`super+a` and `key:super+a`.

In submap member view, entry keys support double-click navigation. Entry and
exit main keys share an accent outline, their required modifiers use a separate
color, and ordinary submap members keep the normal binding style.

Run the browser smoke test with:

```bash
node tests/ui_smoke.mjs
```

The smoke test is self-contained: `tests/fixtures/binds.lua` provides the
submap and diagnostics scenarios without depending on a personal Hyprland
configuration.

Layout:

- `src/hypr_keymap/models.py`: shared data structures and key constants
- `src/hypr_keymap/extractor.py`: restricted Lua binding capture
- `src/hypr_keymap/analysis.py`: normalization, flags, duplicate and submap checks
- `src/hypr_keymap/render.py`: payload generation and asset embedding
- `src/hypr_keymap/cli.py`: command-line entry point
- `src/hypr_keymap/assets/`: HTML, CSS, JavaScript and Lua assets
  - `i18n.js`: English and Chinese UI strings; Hyprland descriptions stay raw
- `tests/fixtures/`: repeatable Lua inputs for browser and diagnostics tests
