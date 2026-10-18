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
| P1-1 | Keyboard needs horizontal scrolling at 1366px and below | Pending |
| P1-2 | Large submap collections still consume first-screen space | Pending |
| P1-3 | `aria-live` wraps the entire detail panel | Pending |
| P1-4 | Search lacks standard combobox/listbox semantics | Partially done — results are a keyboard-navigable listbox; combobox relationship/expanded state remain |

