---
name: Autocrawl
description: The Dossier Console — operator surface for 24/7 expo/vendor crawler intelligence.
colors:
  warm-ash-cream: "#F4EFE6"
  surface-paper: "#FAF6EE"
  surface-paper-sunk: "#EBE4D7"
  surface-paper-deep: "#E0D7C7"
  deep-field-ink: "#141210"
  ink-soft: "#3A342D"
  ink-mute: "#7A7167"
  editorial-vermilion: "#B5321A"
  gold-leaf: "#9E7C2E"
  deep-teal: "#10302E"
  signal-ok: "#166347"
  signal-warn: "#9E7C2E"
  signal-crit: "#B5321A"
  rule-ink-alpha-12: "#1412101F"
typography:
  display:
    fontFamily: "Hanken Grotesk Variable, Hanken Grotesk, system-ui, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: "1.1"
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Hanken Grotesk Variable, Hanken Grotesk, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.012em"
  title:
    fontFamily: "Hanken Grotesk Variable, Hanken Grotesk, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Hanken Grotesk Variable, Hanken Grotesk, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Hanken Grotesk Variable, Hanken Grotesk, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "0.12em"
  num:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "1.3"
    letterSpacing: "-0.01em"
  num-display:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: "1.1"
    letterSpacing: "-0.025em"
rounded:
  xs: "3px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  px-1: "4px"
  px-2: "8px"
  px-3: "12px"
  px-4: "16px"
  px-5: "20px"
  px-6: "24px"
  px-8: "32px"
components:
  btn-primary:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.editorial-vermilion}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "8px 14px"
  btn-primary-hover:
    backgroundColor: "{colors.editorial-vermilion}"
    textColor: "{colors.warm-ash-cream}"
  btn-ghost:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "8px 14px"
  btn-danger:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.signal-crit}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.surface-paper}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  card-head:
    backgroundColor: "{colors.surface-paper}"
    typography: "{typography.label}"
    padding: "14px 20px"
  input:
    backgroundColor: "{colors.surface-paper-sunk}"
    textColor: "{colors.deep-field-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  pill:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "999px"
    padding: "2px 8px"
  pill-accent:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.editorial-vermilion}"
  ledger-head:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.ink-mute}"
    typography: "{typography.label}"
    padding: "10px 14px"
  ledger-row:
    backgroundColor: "{colors.warm-ash-cream}"
    textColor: "{colors.deep-field-ink}"
    typography: "{typography.body}"
    padding: "10px 14px"
---

# Design System: Autocrawl

## 1. Overview

**Creative North Star: "The Dossier Console"**

Autocrawl is an operator surface that reads like an intelligence dossier and runs like a Linear-tier product tool. Every screen is a page of a long-running brief: tabular numerics on a calm cream ground, label stencils tracked uppercase, vermilion accent appearing where it counts and nowhere else. The operator is in a session of hours, not minutes; the surface must hold density without burning the eyes, must convey provenance without ornament, must keep the tool serving the task.

The system explicitly rejects two adjacent failures. It rejects the bland Notion/Linear-default neutral aesthetic (`#000` on `#fff`, Inter, predictable card grids icon plus heading plus text repeated endlessly). It rejects the operator-cyber HUD aesthetic (cyan neon glow on dark navy, scanline overlays, bracket UI dekoratif, full-saturation status colors). Between those two cliffs, Autocrawl sits on paper editorial ground.

**Key Characteristics:**
- Refined, precise, confident — three words from PRODUCT.md that govern every detail.
- Two themes, one identity: Paper (warm ash cream, editorial vermilion, deep field ink) by default; Ink (warm cream on warm navy with amber) as operator-night variant. Same tokens, swapped values.
- Flat-by-default surfaces; shadow appears only as response to state (hover, focus, elevation).
- Hanken Grotesk for UI and headlines, JetBrains Mono for every number. Two type families, no third.
- 150 to 250 millisecond ease-out transitions for state. No page-load choreography, no decorative pulse.

## 2. Colors

A two-theme palette with one role vocabulary. The frontmatter documents the **Paper** theme (default); the Ink (dark) theme uses the same token names with swapped values, documented at the end of this section.

### Primary

- **Editorial Vermilion** (`#B5321A`, canonical `oklch(50% 0.158 32)`): the one voice. Used for primary action buttons, current selection, run-status indicators (active crawl), and live amber dot on Topbar. Saturated and intentional. Never appears as ambient fill or decorative border. ≤10% of any given screen.

### Secondary

- **Gold Leaf** (`#9E7C2E`, `oklch(54% 0.105 84)`): hot accent and warn signal. Used for hover state of vermilion buttons (one step deeper), warning status pills, and the older-event tail of the activity feed where vermilion would over-shout.

### Tertiary

- **Deep Teal** (`#10302E`, `oklch(28% 0.038 188)`): information and provenance. Used for clickable provenance tags, link underlines, and the small "from cache" badge. Rare; appears only when the data layer wants to disclose origin.

### Neutral

- **Warm Ash Cream** (`#F4EFE6`, `oklch(95% 0.012 80)`): paper background. The page itself. Tinted slightly warm, never pure white.
- **Surface Paper** (`#FAF6EE`, `oklch(97% 0.010 80)`): card surface; one notch lighter than page, to lift the card without shadow.
- **Surface Paper Sunk** (`#EBE4D7`, `oklch(91% 0.018 80)`): input wells, sunken panels, table row hover.
- **Surface Paper Deep** (`#E0D7C7`, `oklch(87% 0.022 80)`): the deepest sunken surface, used sparingly for command palette and modal scrim depth.
- **Deep Field Ink** (`#141210`, `oklch(15% 0.005 60)`): primary text. Deep, not pure black. Carries a microscopic warm tint so it sits naturally on cream.
- **Ink Soft** (`#3A342D`, `oklch(30% 0.013 65)`): secondary text and headlines on cream.
- **Ink Mute** (`#7A7167`, `oklch(54% 0.018 70)`): tertiary text, label captions, axis labels.

### Status (semantic)

- **Signal OK** (`#166347`, `oklch(38% 0.075 160)`): success state, healthy worker, completed run.
- **Signal Warn** (= Gold Leaf): caution, retrying, partial result.
- **Signal Crit** (= Editorial Vermilion): error, blocked, failed run. Same hue as primary because in product register, error is the loudest event the operator can have, and that ranking matches vermilion's role as "the one voice."

### Ink Theme (operator night variant)

The dark theme follows the same token names with these substitutions:
- Backgrounds: `bg` → warm navy `#0A1525` (`oklch(20% 0.027 250)`); surfaces step up through `#131F33`, `#1B2942`, `#23334F`.
- Ink (text): warm cream `#F0E8D5` (`oklch(93% 0.025 88)`), secondary `#AEB6C8`, mute `#7A849C`.
- Accent (vermilion → amber): `#FFB840` (`oklch(82% 0.156 75)`), hot `#FF9230`.
- Cyan tertiary: `#4DD8E6`.
- Status colors brighter to read on dark: OK `#22C55E`, Warn `#F59E0B`, Crit `#F04438`.

### Named Rules

**The One Voice Rule.** The primary accent (vermilion on paper, amber on dark) is used on ≤10% of any given screen. Its rarity is its meaning. Inactive states do not earn the accent.

**The No-Pure-Black Rule.** No `#000` and no `#fff`. Every neutral carries a brand-hue tint. Pure values trigger AI-generic perception and break the editorial character.

**The Status-By-Hue-And-Symbol Rule.** Status is never conveyed by color alone. Every status indicator pairs a color token with an icon or text label. Operator color blindness must not lose the signal.

## 3. Typography

**Display + UI Font:** Hanken Grotesk Variable (with `system-ui, sans-serif` fallback). A humanist neogrotesque with warmth that reads naturally on cream. Carries display, headline, title, body, button, and label. One family, six roles.

**Numeric + Mono Font:** JetBrains Mono Variable (with `ui-monospace, monospace` fallback). Tabular numerics with slashed zero (feature `'zero'`) and stylistic set `'ss19'`. Used for every number that needs to align in a column: KPI tile values, table cells, sparkline axis ticks, run IDs, timestamps.

**Character:** A pairing that says "this was set, not assembled." Hanken's slight warmth grounds the type on cream without feeling decorative; JetBrains' precision keeps the data trustworthy. No serif display, no third family.

### Hierarchy

- **Display** (700, 38px, line-height 1.1, tracking -0.02em): page hero numbers, mode banner. Rare.
- **Headline** (600, 24px, line-height 1.2, tracking -0.012em): page H1 (Atlas, Vendor, Labs).
- **Title** (600, 17px, line-height 1.3, tracking -0.005em): card titles, modal titles, section dividers.
- **Body** (400, 15px, line-height 1.5, tracking -0.005em): paragraph text, descriptions, table cell prose. Cap line length at 65–75ch for prose; data tables may run denser (120ch+).
- **Label** (600, 10.5px, line-height 1.2, tracking 0.12em, uppercase): KPI labels, section headers, button text, status pill text, table column heads. The "stencil" that gives Autocrawl its operator-editorial tone.
- **Num** (500, tabular, 15px default): every number in a table or list.
- **Num Display** (500, tabular, 30px, tracking -0.025em): KPI tile values, donut center totals, the headline number on a card. Always JetBrains Mono.

### Named Rules

**The Two-Family Rule.** Hanken for UI, JetBrains for numerics. No third font, ever. Display-serif pairings, script accents, condensed display faces — all rejected. The pairing IS the brand.

**The Tabular Numerics Rule.** Every number consumed by the eye-as-data (table cell, KPI value, axis tick, timestamp) uses JetBrains Mono with `font-variant-numeric: tabular-nums` and feature settings `'tnum', 'zero', 'ss19'`. Mixing proportional digits in a column is forbidden.

**The Label-Stencil Rule.** Section headers, column heads, button text, status pills, KPI labels: all use the Label style (10.5px, 600 weight, 0.12em tracking, uppercase). This is the operator-editorial voice. Sentence-case body labels exist in form inputs only.

## 4. Elevation

Flat by default. Surfaces sit on their canvas without shadow at rest. Shadow appears only as a response to state.

### Shadow Vocabulary

- **shadow-card** (`box-shadow: 0 1px 0 rgb(20 18 16 / 0.04), 0 4px 12px rgb(20 18 16 / 0.06)` on paper; deeper on Ink): the resting shadow of a card. So subtle it reads as a 1-pixel separation from page, not a lift.
- **shadow-card-hover** (`0 1px 0 rgb(20 18 16 / 0.06), 0 8px 20px rgb(20 18 16 / 0.10)` on paper): the response. Card lifts on hover; this is how cards announce they are interactive.
- **shadow-amber** (`0 0 0 1px rgb(181 50 26 / 0.25)`): the affirmation ring. Used for `card-glow` state (a card on a run-active row), and the `focus-visible` ring on buttons and inputs (with cyan in dark mode for hue contrast against amber).

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as responses to state: hover, focus, run-active, elevation (modal). A card that ships with a resting shadow is over-decorated.

**The No-Glass Rule.** `backdrop-filter: blur(...)` as decoration is forbidden. It is permitted only when there is a genuine reason to obscure overlapping content (the live VNC viewer modal, the command palette over a busy dashboard). Outside of those, it is the AI-slop tell.

## 5. Components

### Buttons

- **Shape:** sharp-edged rectangles, gently rounded corners (3px / `rounded-xs`). Not pill, not square.
- **Primary (`btn` + `btn-amber`):** transparent background, 1px vermilion border, vermilion label text (10.5px label style). On hover, fills vermilion with cream label. On `focus-visible`, adds a 2px cyan outer ring (amber on paper might over-shout). 8px vertical, 14px horizontal padding.
- **Ghost (`btn-ghost`):** transparent border, ink-soft label. Hover: cream-sunk surface fill. Used in tertiary actions.
- **Danger (`btn-danger`):** vermilion border, vermilion label. On hover, fills vermilion. Same hue as primary because Crit status shares the One Voice color; danger affordance is reinforced via icon and copy.
- **Split (`split-btn`):** a single bordered control with two targets — primary action on the left, dropdown chevron on the right, divided by a hairline. Used for the run-trigger compound on Topbar.

### Chips / Pills

- **Style:** 999px radius (true pill), 1px border, transparent fill. Label style typography. Compact (2px vertical, 8px horizontal padding).
- **Variants:** `pill` default (ink-mute label, ink-alpha-12 border); `pill-amber` (vermilion border + label); `pill-ok`, `pill-warn`, `pill-crit` for status.

### Cards

- **Corner Style:** 8px radius.
- **Background:** Surface Paper on cream page; one notch lighter than canvas to lift without shadow.
- **Shadow Strategy:** flat at rest; `shadow-card-hover` on hover; `shadow-amber` for `card-glow` (run-active card).
- **Border:** 1px rule-ink at 6% alpha (4% in Ink theme). The hairline that separates card from page on cream where the shadow alone is too quiet.
- **Internal Padding:** 16px vertical, 20px horizontal. `card-head` adds a hairline-bottom rule at 6% alpha; `card-body` is the content well.

### Inputs

- **Style:** 6px radius, Surface Paper Sunk background, 1px rule border at 6%. Sunken not raised; the input is a well, not a button.
- **Focus:** vermilion border at 60% alpha plus a 2px vermilion outer glow at 18% alpha. Reads as "this field is alive without shouting."
- **Disabled:** opacity 0.4, cursor not-allowed.

### Navigation

- **Sidebar:** icon-only collapsed rail (66px wide). Icons in ink-soft; vermilion left border (1px, not stripe) plus tinted icon on active route. Tooltip labels with live badge counts on hover.
- **Topbar:** 64px tall, mission-control density. Hex monogram (AC logo) anchored left; omnisearch in the center; live worker meter, clock, mode trigger, theme toggle anchored right.

### Ledger Table

- **Style:** zero-border table; column heads use Label style, row separators are 6%-alpha hairlines, row hover fills Surface Paper Sunk.
- **Cells:** body type for prose, num type for numerics. Every numeric column is right-aligned and tabular.
- **No zebra striping.** Hover fills the active row; the table is a printed page, not a spreadsheet.

### Modals

- **Use sparingly.** Default to inline progressive disclosure (a row expands, a panel slides in, a drawer opens). Modals exist only for: destructive confirmation (ConfirmCountdownModal), full-screen composition (VendorEmailDraftModal), and live media (VNC viewer).
- **Style:** flat dialog body on Surface Paper, 12px radius, 1px rule-strong border (12% alpha). Backdrop is a neutral scrim at 40% black-with-tint, not a colored gradient, not a blur.

### Live Status Dot

- 6px circle, currentColor fill. Variants: `dot-amber` (run active), `dot-ok` (worker healthy), `dot-warn`, `dot-crit`, `dot-mute`. Optional `dot-glow` adds `0 0 4px, 0 0 12px currentColor`, used only for active-run indicators where the live state is the message.

## 6. Do's and Don'ts

### Do:
- **Do** keep the primary accent (vermilion / amber) under 10% of any given screen.
- **Do** tint every neutral toward the brand hue. Warm Ash Cream is `oklch(95% 0.012 80)` not `#fff`. Deep Field Ink is `oklch(15% 0.005 60)` not `#000`.
- **Do** use Hanken Grotesk for UI and JetBrains Mono for numerics. Two families, no third.
- **Do** use the Label stencil (10.5px, 600, 0.12em tracking, uppercase) for section headers, column heads, button text, status pills.
- **Do** keep cards flat at rest; lift on hover via `shadow-card-hover`.
- **Do** pair every status color with an icon or text label so color-blind operators do not lose the signal.
- **Do** respect `prefers-reduced-motion`: disable `pulse-amber`, `blink`, `ticker-scroll`, and any non-essential animation.

### Don't:
- **Don't** use side-stripe borders. `border-left` or `border-right` greater than 1 pixel as a colored accent on cards, list items, callouts, or alerts is forbidden. Use full 1px border, background tint, or leading icon.
- **Don't** use gradient text via `background-clip: text`. Single solid color, weight or size for emphasis.
- **Don't** use `backdrop-filter: blur(...)` as decoration. Permitted only when actually obscuring overlapping content.
- **Don't** ship the hero-metric template (big number, small label, supporting stats, gradient accent). The KPI tile is paper, not SaaS landing.
- **Don't** build identical card grids (same-sized icon plus heading plus text, repeated endlessly). Vary card density, mix card with ledger row.
- **Don't** default to modal as first thought. Try inline disclosure, drawer, or progressive panel first.
- **Don't** use `#000` or `#fff`. Every neutral tints toward the brand hue.
- **Don't** use Roboto, Inter, or any third font. Hanken plus JetBrains Mono is the brand.
- **Don't** use Material Design patterns (FAB, ripple, shadow elevation 5). Autocrawl is paper editorial, not Android default.
- **Don't** use SaaS purple-to-pink gradients, glow text, or glassmorphic card stacks. The AI-slop tell.
- **Don't** use HUD cyberpunk neon glow, scanline overlays, or bracket UI decoration. Legacy aesthetic to be removed.
- **Don't** use em-dash or en-dash or semicolon in user-facing copy and ops reports.
