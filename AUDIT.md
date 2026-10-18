# Frontend audit

Baseline: 163 bindings, 14 submaps, 641 DOM nodes.

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
| P2-1 | Search/submap/selected-key state is not stored in URL history | Pending — browser Back cannot restore the prior page state |
| P2-2 | A few empty states interpolate config-derived names through `innerHTML` | Pending — low risk for trusted local configs, but should use `textContent` |
| P2-3 | No automated browser regression tests | Pending — current checks are manual headless-Chromium/CDP runs |

