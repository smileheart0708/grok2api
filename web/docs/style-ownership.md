# Frontend Style Ownership

## 1) Tailwind Runtime Entry

- `src/styles/index.css`
- Responsibilities:
  - Tailwind v4 entry (`@import 'tailwindcss'`)
  - theme token bridge (`@theme inline`)
  - dark variant bridge for `data-theme` (`@custom-variant dark ...`)
  - legacy script source scan (`@source '../public/legacy/scripts/*.js'`)

## 2) Global Shared Styles

- `src/styles/common.css`
- Responsibilities:
  - app-level layout shells (nav, modal, footer, shared stat card)
  - shared confirmation dialog and toolbar separator styles
  - global form primitives kept for cross-page reuse (`.geist-input`, etc.)

## 3) UI Component-owned Styles

- `src/components/ui/*`
- Responsibilities:
  - `ui-button.vue` / `ui-icon-button.vue`: variant + size + tone class mapping in component
  - `ui-checkbox.vue`: reusable checkbox primitive
  - `ui-data-table.vue`: table visual baseline (th/td/hover/selected) for all admin tables

## 4) Page-specific Styles

- `src/styles/pages/*.css`
- Responsibilities:
  - only page-unique visuals and legacy DOM hook classes
  - no repeated table/checkbox/button base styles
  - no utility-mirror stylesheet patterns

## 5) Guardrail

- Do not add any new hand-written utility mirror file (for example `legacy-utilities.css` pattern).
- If a style is reused:
  - first choice: Tailwind utility in template
  - second choice: a dedicated UI component abstraction
  - last choice: shared rule in `common.css`
