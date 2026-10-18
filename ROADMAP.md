# Roadmap

Last updated: 2026-10-18  
Current version: `1.10.0`  
Status: implementation complete for the current scope; preparing the first
public GitHub release.

## Completed

### Configuration loading

- Load from a single Hyprland Lua entry file such as `hyprland.lua`
- Resolve the Lua `require` graph, including:
  - relative paths
  - dotted module names
  - glob imports such as `require("./configs/*")`
  - module caching and exported return values
- Support multiple module roots with repeatable `--module-root`
- Automatically include applicable `XDG_CONFIG_HOME` and `OMARCHY_PATH` roots
- Share global state across modules, including wrapper APIs such as `o.bind`
- Preserve the real calling file and line number through binding wrappers
- Restrict Lua loading to files beneath configured module roots

### Analysis

- Normalize modifiers, key aliases, code keys, and special XF86 keys
- Recognize Hyprland hardware switches (`switch:on:*`, `switch:off:*`)
- Analyze scopes, submaps, trigger phases, devices, and bind flags
- Detect duplicate key combinations and semantic overlaps
- Preserve per-file source locations in diagnostics
- Read descriptions only from Hyprland's native `description` field

### Web interface

- Complete ANSI keyboard plus mouse, media, and system keys
- Interactive search with chord and field filters
- Submap overview, entry/exit navigation, and member views
- Distinct styling for submap entries, exits, and required modifiers
- English UI by default with a persisted English/Chinese switch
- Self-contained HTML output with embedded styles, scripts, and data

### Omarchy validation

- Full Omarchy `quattro` Hyprland configuration snapshot checked into tests
- Source: `omacom/omarchy`
- Commit: `a6dcc31b6429fcf25e9e6bf90179f84c602cbf4e`
- Release at capture time: `v4.0.5`
- Pulled: 2026-10-18
- Result: 242 bindings, 2 duplicate groups, 0 unknown-key warnings, 4 missing
  descriptions
- Duplicate groups:
  - `ALT + TAB` at `tiling.lua:55` and `tiling.lua:57`
  - `ALT + SHIFT + TAB` at `tiling.lua:56` and `tiling.lua:58`
- Known Omarchy issue: [#7561](https://github.com/omacom/omarchy/issues/7561)
- Proposed fix: [PR #8576](https://github.com/omacom/omarchy/pull/8576)
- Main UI and duplicate-diagnostic screenshots are stored in `docs/`

The two Omarchy groups are intentional stacked dispatchers. The reverse chord
has a known z-order bug; this project reports the structural duplication but
does not claim it was accidental.

### Verification

```bash
node tests/ui_smoke.mjs
uv run python tests/omarchy_snapshot.py
uv build
```

The browser test covers localization, search, aliases, submap navigation,
diagnostics, long key names, and responsive layouts. The Omarchy test covers
the Lua module graph, wrapper APIs, special keys, source locations, and expected
diagnostic counts.

## Current decisions

- Keep the repository/tool name `hypr-keymap`.
  - `Flopet/hypr-keymap` is a Noctalia keymap plugin.
  - It does not implement submap navigation or this project's audit model.
- Describe the Lua feature as `require` graph resolution, not as a rendered
  dependency graph. No module graph visualization is currently shipped.
- Keep the Omarchy fixture as an upstream configuration snapshot used for
  compatibility and regression testing.
- Use `docs/ECOSYSTEM.md` as the maintained comparison and launch-positioning
  record.
- Do not translate binding descriptions; they remain exactly as configured.

## Known limitations

- The analyzer executes config in a proxy environment and cannot inspect live
  compositor state such as current windows, devices, or workspaces.
- Only Lua Hyprland configurations are supported.
- Key-name validation is broader than before but cannot enumerate every
  keysym provided by every XKB version.
- Stacked dispatchers on the same chord are reported as duplicate groups even
  when the composition is intentional.
- Screenshot capture is currently a manual development step.
- The project has no root `LICENSE`, GitHub Actions workflow, or configured Git
  remote yet.

## Next milestone

**Goal:** publish a credible `v1.10.0` GitHub release and use the Omarchy audit
as a reproducible case study for community launch.

### P0 — release readiness

1. Choose and add the project license.
2. Add `.github/workflows/ci.yml` to run:
   - Python syntax/build checks
   - `node tests/ui_smoke.mjs`
   - `uv run python tests/omarchy_snapshot.py`
   - `uv build`
3. Add GitHub/project metadata such as repository URL and topics in
   `pyproject.toml`.
4. Create the GitHub repository and add the remote; push `main` only after
   reviewing the local history.
5. Add a short release note describing features, the Omarchy finding, and known
   limitations.
6. Prepare a launch post for Reddit/Omarchy communities with:
   - one main screenshot
   - the duplicate-diagnostics screenshot
   - issue #7561 and PR #8576 links
   - the comparison in `docs/ECOSYSTEM.md`
   - clear wording that the stacked binds are intentional but expose a known
     reverse-cycling bug

### P1 — follow-up

1. Re-check Omarchy PR #8576 and refresh the pinned snapshot after a relevant
   upstream change.
2. Distinguish intentional multi-dispatcher stacks from accidental duplicates
   in diagnostics while still surfacing the known reverse-order risk.
3. Make screenshot generation reproducible from the checked-in Omarchy fixture.
4. Add CI coverage across supported Lua versions where practical.
5. Decide whether to publish the package to PyPI in addition to GitHub releases.

### Deferred

- Visual Lua module dependency graph
- GUI for editing keybindings
- Runtime `hyprctl` integration
- TUI or launcher-specific frontends

## Next work order

1. License decision
2. CI workflow
3. GitHub repository metadata and remote
4. Release notes and Reddit draft
5. Push/release
6. Track Omarchy PR and refresh the case study when appropriate
