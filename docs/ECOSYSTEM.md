# Ecosystem research

Last updated: 2026-10-18

This document records the GitHub and Reddit landscape reviewed before the first
public release. Links and project capabilities change; re-check them before
publishing launch material.

## Method

- GitHub repository search:
  - `hyprland keybind`
  - `hyprland keymap`
  - `hyprland shortcut viewer`
- GitHub API inspection of the closest project (`kosa12/hyprKCS`)
- Reddit JSON search returned HTTP 403/429 from the current network.
- Reddit RSS search succeeded for `hyprland keybind` with 50 results.

## Closest project: hyprKCS

- GitHub: https://github.com/kosa12/hyprKCS
- Reddit announcement: https://www.reddit.com/r/hyprland/comments/1qsv3nf/hyprkcs_lightweight_keybind_manager_for_hyprland/
- Omarchy announcement: https://www.reddit.com/r/omarchy/comments/1qxo7tt/hyprkcs_lightweight_keybind_manager_for_hyprland/
- Reddit update with density map and XKB support: https://www.reddit.com/r/hyprland/comments/1rh4t3t/hyprkcs_lightweight_keybind_manager_for_hyprland/

hyprKCS is a Rust/GTK4 keybind manager. Its documented features include:

- Parse `hyprland.conf` and sourced files
- Resolve Hyprland variables
- Search, edit, delete, and export keybinds
- Conflict detection and conflict-resolution wizard
- Submap management
- Visual keyboard map and key-density map
- Native XKB layout resolution
- `bindd` descriptions and Omarchy theme integration
- Backups, diffs, macro builder, HUD, and CLI search

As of repository push date `2026-05-09`:

- Its README describes `hyprland.conf` and sourced files as the configuration
  input.
- Its source tree contains a traditional parser under `src/parser/`.
- Searches for `lua` and `hl.bind` in the repository returned no matching code.

It should therefore be treated as a **traditional Hyprland `.conf` manager and
editor**, not as a Lua `require`-graph auditor.

## GitHub landscape

| Project | Focus | Overlap with hypr-keymap | Difference |
|---|---|---|---|
| [hyprKCS](https://github.com/kosa12/hyprKCS) | GTK4 keybind manager/editor | Visual keyboard, duplicates, submaps, Omarchy support | Traditional `.conf` parser; editing-first; native GUI |
| [HyprBind](https://github.com/ry2x/HyprBind) | Simple keybind viewer | Keybinding browsing | No Lua audit or HTML report |
| [rofi-hyprland-keybinds-cheatsheet](https://github.com/jason9075/rofi-hyprland-keybinds-cheatsheet) | Rofi cheatsheet | Searchable keybind reference | Launcher-specific UI |
| [hyprland-keybind-menu](https://github.com/kolbenhans/hyprland-keybind-menu) | Searchable/executable Lua keybind menu | Explicit focus on Hyprland Lua configuration | Execution menu rather than full keymap audit |
| [hyprkeybind-show](https://github.com/val7tools/hyprkeybind-show) | CLI listing with source locations and stock comparison | Source locations, chord filtering | Terminal-oriented; no keyboard audit UI |
| [OmarKEYs](https://github.com/romills/OmarKEYs) | Live Hyprland keymap overlay | Keyboard-focused presentation | Overlay instead of a static audit report |
| [Hyprfindr](https://www.reddit.com/r/hyprland/comments/1mwqwxs/hyprfindr_a_simple_hyprland_utility_tool_that/) | Simple keybind search | Search by action | Minimal notification-style output |

## Reddit discussions

- [Simple "all hyprland keybinds" menu](https://www.reddit.com/r/hyprland/comments/1tg1f11/simple_all_hyprland_keybinds_menu/)
  - Uses `hyprctl binds -j`, `jq`, and Rofi.
  - Runtime listing, not source-aware static analysis.
- [Update on my Hyprland Config UI](https://www.reddit.com/r/hyprland/comments/1ok5rj0/update_on_my_hyprland_config_ui_keybinds_comments/)
  - Parses multiple files from one entrypoint and writes edits back.
  - Editor-oriented, with UI forms and disabling of entries.
- [hyprKCS announcement](https://www.reddit.com/r/hyprland/comments/1qsv3nf/hyprkcs_lightweight_keybind_manager_for_hyprland/)
  - The closest feature match: conflicts, submaps, visual keyboard, and editing.
- [HyprKenso keybind cheatsheet](https://www.reddit.com/r/unixporn/comments/1qxmuxd/added_a_cheatsheet_of_the_keybinds_to_hyprkenso/)
  - Embedded cheatsheet inside an existing Hyprland shell.
- [Caelestia keybind menu](https://www.reddit.com/r/unixporn/comments/1v41idj/caelestia_better_clipboard_history_emoji_picker/)
  - Keybind list integrated into a Quickshell action menu.
- [Is there a way to get such a keybinds sheet without any shell?](https://www.reddit.com/r/linux4noobs/comments/1n0qtew/is_there_a_way_to_get_such_keybinds_sheet_without/)
  - Direct evidence of demand for a standalone visual keybind sheet.

## Positioning

Do not claim that this is the first Hyprland keybinding viewer, the only tool
with submaps, or the only tool with conflict detection. hyprKCS already covers
those areas for traditional `.conf` configurations.

The defensible positioning is:

> A Lua-aware, read-only Hyprland keymap auditor that resolves `require`
> graphs, preserves real source locations, and generates a self-contained
> interactive HTML report.

Distinctive combination:

- Lua entry files, `hl.bind`, wrapper APIs, module caching, and multiple roots
- Real file and line attribution across modules and wrappers
- Bind flags, devices, trigger phases, and submap-aware diagnostics
- No application installation needed to read the generated report
- English and Chinese interface
- Omarchy compatibility demonstrated against a pinned configuration snapshot

## Launch angle

Avoid leading with “another Hyprland keybind viewer.” Lead with the concrete
Omarchy result:

> I built a Lua-aware Hyprland keymap auditor. It found Omarchy's stacked
> ALT+TAB bindings and independently reproduced the behavior tracked in
> Omarchy issue #7561.

Also state clearly that:

- Omarchy intentionally stacks `cycle_next()` and `bring_to_top()`.
- The reverse chord has a known z-order issue.
- The upstream fix PR is #8576.
- This tool reports the structural duplication; it does not claim the stack was
  accidental.

Before posting, re-check the target subreddit's self-promotion rules and the
current state of Omarchy issue #7561 / PR #8576.
