# Frontend audit

Baseline: 103 bindings, 14 submaps.

## P0

| ID | Issue | Target | Verification | Status |
|---|---|---|---|---|
| P0-1 | 87 key buttons all enter the tab order; no arrow-key navigation | One roving Tab stop plus arrow-key grid navigation | Only one main keyboard button has `tabindex=0`; arrows move focus across key geometry | Done — ArrowRight A→S, ArrowDown S→Z; one keyboard Tab stop |
| P0-2 | Key accessible names only contain the key label | Include bound function names and binding count | F1 announces its mute function, not just "F1" | Done — F1 announces “切换音频静音；切换游戏模式” |
| P0-3 | Dimmed keys remain tabbable and search results have no navigation | Dimmed keys get `tabindex=-1`; search results support arrow navigation | Search/submap modes do not leave unrelated keys in the Tab order; search results navigate with arrows | Done — listbox options navigate with arrows, Enter moves focus to detail title, zero dimmed key Tab stops |
| P0-4 | 93 text elements are below 10px | Raise meaningful UI text to a readable size | Key hints and technical metadata are at least 10px where layout permits | Done — zero visible text below 10px |
| P0-5 | Some normal text has insufficient contrast | Meet WCAG AA 4.5:1 for normal text | Unbound keys and faint labels measure at least 4.5:1 | Done — unbound keys 5.56:1, faint labels 5.89:1 |

## P1

| ID | Issue | Status |
|---|---|---|
| P1-1 | Keyboard needs horizontal scrolling at 1366px and below | Done — keyboard auto-fits at 1440/1366; narrower layouts show an explicit horizontal-scroll hint |
| P1-2 | Large submap collections still consume first-screen space | Done — lists over 6 submaps collapse by default; 14-submap case moves keyboard top from ~638px to ~486px |
| P1-3 | `aria-live` wraps the entire detail panel | Done — detail panel is no longer live; a visually hidden status region announces concise updates |
| P1-4 | Search lacks standard combobox/listbox semantics | Done — combobox controls the listbox, tracks `aria-expanded`/`aria-activedescendant`, supports arrows, and closes on selection |

## P2

| ID | Issue | Status |
|---|---|---|
| P2-1 | Search/submap/selected-key state is not stored in URL history | Done — `q`, `filter`, `submap`, `key` are stored in the hash; Back restores search state |
| P2-2 | A few empty states interpolate config-derived names through `innerHTML` | Pending — low risk for trusted local configs, but should use `textContent` |
| P2-3 | No automated browser regression tests | Done — `tests/ui_smoke.mjs` covers popover, selection, fields, filters, URL, layout, collapse and mobile drawer |

## Search command palette

| Step | Feature | Status |
|---|---|---|
| 1 | Compact results anchored below the search input | Done |
| 2 | Query retained after selecting a result | Done |
| 3 | Active result auto-scrolls into view | Done |
| 4 | `/`, `Ctrl+K`, arrow keys and Esc shortcuts | Done |
| 5 | Mobile fixed result drawer | Done |
| 6 | Field syntax (`key:`, `submap:`, `flag:`, `device:`, `command:`, `action:`) | Done |
| 7 | Weighted ranking and match highlighting | Done — chord spellings with/without `+` normalize to the same key combination |
| 8 | Filter chips for context, flags, duplicates and device | Done |
| 9 | URL/hash state with browser Back support | Done |
| 10 | Automated Chromium regression smoke test | Done |

## Localization

| Requirement | Verification | Status |
|---|---|---|
| English is the first-load default | `<html lang="en">`, title and dynamic detail copy are English | Done |
| Visible header language switch | `EN / 中文` control has pressed state and keyboard focus styling | Done |
| Chinese can be restored | `#lang=zh` and `localStorage` restore the selected locale | Done |
| Binding descriptions stay language-independent | Descriptions are byte-for-byte identical before and after switching or reloading | Done |
| Dynamic UI and diagnostics are localized | Search, key details, submaps, empty states and all current diagnostic codes switch language | Done |
| Language switch works on mobile | Switch stays inside the viewport without overlapping the source note | Done |

