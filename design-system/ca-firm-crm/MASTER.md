# CA Firm CRM design system

Working tool for CA firm partners and staff. Calm, dense, numbers first. Tokens live in `client/src/styles.css` (`:root`, dark under `prefers-color-scheme: dark`).

Dials: variance 5, motion 3, density 7.

## Colour
| Role | Light | Dark |
|---|---|---|
| Background | `#F3F5F4` | `#0E1412` |
| Surface (cards) | `#FFFFFF` | `#151D1A` |
| Ink / secondary / muted | `#131A17` / `#47524D` / `#66716C` | `#E4EBE7` / `#AEB9B3` / `#8C9892` |
| Accent (one only: buttons, links, active nav) | `#0071A0` | `#6CB6E0` |
| Status: danger / warn / ok | `#B42318` / `#8A5A00` / `#17703F` | `#F2857A` / `#E3B160` / `#6CCB93` |
| Chart series 1 / 2 (validated with the dataviz checker) | `#0071A0` / `#B26B12` | `#3A93C4` / `#C47F35` |

Status colours mean state (late, due soon, paid). Never use them for decoration or chart series.

## Type
- Geist for all UI text. Sentence case everywhere, no all-caps labels.
- Geist Mono for identifiers (PAN, GSTIN, invoice numbers) and the due chip.
- Money and counts use tabular figures (`.num`).

## Shape
Radius 12 (cards), 8 (controls), 4 (badges, chips). Borders over shadows; shadow only on floating layers (popover, modal, toast).

## Signature element
The due chip (`<Due days={n} />`): mono countdown "6d left", "today", "5d late" with a left tick. Every date-sensitive row carries one: deadlines, filings, invoices, tasks. Under 7 days = danger, up to 30 = warn.

## Rules
- Icons: Phosphor only (`@phosphor-icons/react`), regular weight, fill for the active nav item. No emoji in UI.
- Summary numbers sit in one "ledger" card split into cells, not separate coloured cards.
- Every table sits in `.table-wrap` (scrolls sideways on phones).
- Below 860px the sidebar becomes a drawer behind the menu button.
- Hinglish copy is the product voice; keep it.
