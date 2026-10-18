# Omarchy quatro snapshot

This directory contains an unmodified snapshot of the Omarchy Hyprland
configuration used by the compatibility tests.

- Repository: https://github.com/omacom/omarchy
- Branch: `quattro`
- Commit: `a6dcc31b6429fcf25e9e6bf90179f84c602cbf4e`
- Release at capture time: `v4.0.5`
- Captured: 2026-10-18

Included paths:

- `config/hypr/**`
- `default/hypr/**`
- `default/omarchy/shortcuts`
- `LICENSE`

The files are downloaded directly from the pinned commit without modification.
The upstream MIT license is preserved in [`LICENSE`](LICENSE).

Omarchy splits its module roots between `config/hypr` and `default/hypr`.
To reproduce the audit, create a temporary merged root:

```bash
snapshot="$PWD/tests/fixtures/omarchy/quattro"
tmp="$(mktemp -d)"
mkdir -p "$tmp/default"
cp -a "$snapshot/config/hypr" "$tmp/hypr"
cp -a "$snapshot/default/hypr" "$tmp/default/hypr"
cp -a "$snapshot/default/omarchy" "$tmp/default/omarchy"
cp "$snapshot/config/hypr/hyprland.lua" "$tmp/hyprland.lua"

HOME="$tmp/home" \
XDG_CONFIG_HOME="$tmp/home/.config" \
XDG_STATE_HOME="$tmp/home/.local/state" \
OMARCHY_PATH="$tmp" \
hypr-keymap --check "$tmp/hyprland.lua"
```

At this commit the snapshot produces 242 binds. A small number of conditional
bindings can vary with installed commands and input-method state.

Run the checked-in regression test from the repository root:

```bash
uv run python tests/omarchy_snapshot.py
```

Generate and open the HTML audit:

```bash
uv run python tests/omarchy_snapshot.py --open
```
