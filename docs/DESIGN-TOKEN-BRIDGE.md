# DESIGN-TOKEN-BRIDGE.md – RN theme → Tailwind mapping

Goal: the web app is visually indistinguishable from the mobile app in both themes. Source of
truth: `constants/theme.ts` in the mobile repo (tokens verified in audit, 2026-09-12). **Do not
"improve" the palette.**

> Status (2026-09-15): the web's "Neo" divergence has been reversed by user decision –
> `app/globals.css` now mirrors this document token-for-token (plus fixed `--sf-hue-*` /
> `--sf-tint-*` / `--sf-tile-*` / `--sf-track*` / `--sf-bar-*` / `--sf-set-*` tokens for the mobile
> components' theme-invariant accent hues and component-level tints). See the Theme divergence note in
> `FEATURE-PARITY.md`.

> **SUPERSEDED for the web (2026-10-13): "SpendFlow V5 Sage Ledger" redesign
> (user-directed: reference image of a cream/sage pastel dashboard – "same
> exact design, restructure redesign complete exact").** Warm pastel
> identity: light = cream `#F1EEE5` + sage `#5E7E5B` + white-warm cards
> `#FDFCF9` with soft diffuse shadows; dark = moss-black `#161A12` + lifted
> olive `#1F251A` + pale sage `#A9C2A0`. Pastel accent quartet for chips and
> charts: sage / warm beige `#D9BC8C` / dusty blue `#92A9BD` / rosewood
> `#C4785A`. Charts: income = sage green, expense series = rosewood
> (`--sf-expense-series`, clay `#DC9178` in dark). Type: DM Sans for the UI
> (`--font-sans`) + Geist Mono for every money figure (`--font-money`,
> applied by the `.numeric` utility - 2026-10-15 user direction, matching
> the Master Admin project; mono digits keep masked • swaps width-stable). Cards: 20px radius, hairline warm border +
> soft shadow (`.panel`); navigation rides a floating sage rail
> (`--sf-rail*`). The V4 Meridian palette is superseded – values only;
> token names are unchanged (see `FEATURE-PARITY.md`).

> **SUPERSEDED for the web (2026-10-13): "SpendFlow V4 Meridian" rebuild
> (user-directed: "forget what I have in frontend… complete new design").**
> Cool instrument-grade identity: light = mist `#F2F4F7` + ink-navy `#0C1626` +
> cobalt `#2145C4`; dark = blue-black `#0B1017` + slate `#111826` + periwinkle
> `#8BA4F5`. Fonts: IBM Plex Sans (`--font-plex`) + IBM Plex Mono
> (`--font-plex-mono`) for money figures. The V3 Tihar palette AND its
> `--sf-plate*` hero set are gone – values only; token names are unchanged
> (see `FEATURE-PARITY.md`).
>
> **SUPERSEDED for the web (2026-10-13): "SpendFlow V3 Tihar" redesign
> (user-directed: "completely redesign dashboard, complete new, don't care what I have").**
> The V2 neutral zinc/emerald system below is replaced by an indigo-night + marigold
> festival identity (see `FEATURE-PARITY.md`). Token NAMES and Tailwind classes are again
> identical – only values swapped – plus two additions: `--sf-primary-ink` (the dark ink
> that pairs with marigold fills; `bg-primary` + `text-primary-ink` everywhere) and the
> fixed hero-plate set `--sf-plate` / `--sf-plate-ink` / `--sf-plate-gold` /
> `--sf-plate-pos` / `--sf-plate-neg` / `--sf-plate-line` (night panel, same in both
> themes). Fonts: Anek Latin via `next/font` as `--font-anek` (UI + display figures).
> The `.plate` class additionally re-scopes the standard `--sf-*` tokens to the night
> palette for its descendants, so any token-consuming component (charts, chips,
> skeletons) renders correctly on the plate without dark-mode variants.

## 0. Web palettes (historical record – V3 "Tihar" shown; live values in app/globals.css V5 "Sage Ledger")

Indigo night + marigold. Light is stone-warm with indigo ink and deep marigold; dark is
the Tihar night itself – lamplight text, lit marigold. Income green / coral expense keep
the chart series rule. The dashboard hero plate is always night (`--sf-plate*`).

| Token (useTheme key) | Web Light | Web Dark |
|---|---|---|
| primary | `#B4720A` (deep marigold) | `#F0A81C` (lit marigold) |
| primaryStrong | `#96600A` | `#FFC24F` |
| primaryLight | `#F6E7C6` | `rgb(240 168 28 / 0.15)` |
| primaryInk | `#241505` | `#241505` |
| accent | `#B4720A` | `#FFC24F` |
| success / income | `#1E7A4E` | `#62C888` |
| warning | `#C2447E` | `#E77BA9` |
| danger / rust | `#C2402F` | `#F07A62` |
| info | `#3B5BDB` | `#7FA5F0` |
| background | `#EFEDE6` | `#0F1120` |
| surface | `#FBFAF5` | `#171A31` |
| surfaceElevated | `#E7E4D8` | `#20243F` |
| text | `#1D1C2B` | `#F2EFE4` |
| textMuted | `#565569` | `#AEADC6` |
| faint | `#8F8EA1` | `#757491` |
| border | `#DBD7C8` | `#2C3053` |
| input / tab | `#FBFAF5` | `#171A31` |
| accentBg | `#F6E7C6` | `rgb(240 168 28 / 0.15)` |
| brass / brassTint | `#96660D` / `#F3E6BE` | `#E5B84B` / `rgb(229 184 75 / 0.16)` |
| plate / plateInk | `#181B35` / `#F2EFE4` | same |
| plateGold / platePos / plateNeg / plateLine | `#F0A81C` / `#6FCF97` / `#F08A72` / `rgb(242 239 228 / 0.14)` | same |

## 0.1 Web V2 palette (2026-10-10, superseded)

Neutral zinc surfaces, emerald brand, Inter everywhere. No ornaments, no glass, no
uppercase-tracked labels (`.caps` renders sentence-case now), hairline 12px cards.

| Token (useTheme key) | Web Light | Web Dark |
|---|---|---|
| primary | `#059669` (emerald) | `#059669` |
| primaryStrong | `#047857` | `#34D399` |
| primaryLight | `#ECFDF5` | `rgb(16 185 129 / 0.14)` |
| accent | `#059669` | `#34D399` |
| success / income | `#059669` | `#34D399` |
| warning | `#D97706` | `#FBBF24` |
| danger / rust | `#DC2626` | `#F87171` |
| info | `#2563EB` | `#60A5FA` |
| background | `#F7F7F8` | `#09090B` |
| surface | `#FFFFFF` | `#111113` |
| surfaceElevated | `#F4F4F5` | `#1B1B1F` |
| text | `#18181B` | `#FAFAFA` |
| textMuted | `#52525B` | `#A1A1AA` |
| faint | `#A1A1AA` | `#71717A` |
| border | `#E4E4E7` | `#26262B` |
| input / tab | `#FFFFFF` / `#FFFFFF` | `#111113` / `#111113` |
| accentBg | `#ECFDF5` | `rgb(16 185 129 / 0.14)` |
| brass / brassTint | `#B45309` / `#FEF3C7` | `#FBBF24` / `rgb(251 191 36 / 0.14)` |
| rust / rustTint | `#DC2626` / `#FEE2E2` | `#F87171` / `rgb(248 113 113 / 0.14)` |

Typography: Inter (`next/font`, variable `--font-inter`) for EVERYTHING – body, UI, headlines
and money figures (`.figures-display` is Inter 650 tabular). Chart expense series is red in
both themes (`--sf-expense-series` = danger). Shell: fixed sidebar nav (lg+) with the full
destination list, sticky topbar for actions, flat bottom tab bar on phones
(`components/layout/DashboardShell.tsx`). The fixed `--sf-hue-*` / tint tokens keep their
values (theme-invariant data-visualization hues).

## 1. Strategy

- Tailwind **CSS variables** in `globals.css` under `:root` (light values) and `.dark` (dark values).
- Tailwind config maps semantic token names to `var(--...)` – components use `bg-background`,
  `text-text`, `border-border`, etc., never raw hex.
- Dark mode via **class strategy** (`darkMode: 'class'`), toggled by the ThemeContext port
  (`light | dark | system`, persisted, `prefers-color-scheme` listener for system).

## 2. Color tokens

| Token (useTheme key) | Light | Dark | Tailwind class |
|---|---|---|---|
| primary | `#0F5C4D` (teal) | `#818CF8` (indigo) | `bg-primary`, `text-primary` |
| primaryStrong | `#0A453A` | `#A5B4FC` | `primary-strong` |
| primaryLight | `#DCE9E3` | `rgba(129,140,248,0.18)` | `primary-light` |
| accent | `#A8791F` (brass) | `#8B5CF6` | `accent` |
| success / income | `#0F5C4D` / `#047857` | `#10B981` / `#10B981` | `success`, `income` |
| warning | `#A8791F` | `#F59E0B` | `warning` |
| danger / rust | `#A5442B` | `#EF4444` | `danger`, `rust` |
| info | `#2A6F86` | `#0EA5E9` | `info` |
| background | `#EDEAE0` (warm parchment) | `#0B0F19` (deep slate) | `bg-background` |
| surface | `#F7F5EC` | `#151D2A` | `bg-surface` |
| surfaceElevated | `#E5E2D6` | `#1E293B` | `bg-surface-elevated` |
| text | `#17241F` | `#F8FAFC` | `text-text` |
| textMuted | `#4B5C55` | `#94A3B8` | `text-text-muted` |
| faint | `#8B978F` | `#64748B` | `text-faint` |
| border | `#CFCABA` | `#273549` | `border-border` |
| input | `#F7F5EC` | `#151D2A` | `bg-input` |
| tab | `#F7F5EC` | `#151D2A` | tab bar bg |
| accentBg | `#DCE9E3` | `rgba(129,140,248,0.18)` | `accent-bg` |
| brass / brassTint | `#A8791F` / `#F0E3C8` | `#F59E0B` / `rgba(245,158,11,0.15)` | `brass`, `brass-tint` |
| rust / rustTint | `#A5442B` / `#F1DCD3` | `#EF4444` / `rgba(239,68,68,0.15)` | `rust`, `rust-tint` |

Special-cases:
- `primaryLight` / `accentBg` dark values are **alpha rgba** – store as `rgb(129 140 248 / 0.18)` in CSS vars.
- **Chart rule** (from AGENTS.md of mobile): income series = `income` token always; expense series = `primary` in dark, `danger` in light, via a single `expenseColor` variable in the chart component.

## 3. Spacing (RN numbers → Tailwind scale)

RN spacing: xs 4, sm 8, md 16, lg 24, xl 32, 2xl 40, 3xl 48, 4xl 56, 5xl 64.
Tailwind's default 4 px scale covers all of these (`p-1, p-2, p-4, p-6, p-8, p-10, p-12, p-14, p-16`).
**Rule: reference the semantic name in code comments only if needed – use the Tailwind class whose
value equals the RN token.** No custom spacing scale required.

## 4. Radius

sm 6 (`rounded-md`), md 10 (custom `rounded-[10px]` or override `rounded-lg`), lg 16 (`rounded-2xl`),
full 9999 (`rounded-full`). Recommend overriding Tailwind's radius scale to match exactly:
`sm: 6px, md: 10px, lg: 16px`.

## 5. Typography

Mobile `Text.tsx` variants → web classes (Georgia serif for the wordmark only, system sans elsewhere):

| Variant | RN | Tailwind |
|---|---|---|
| display | 34 / 800 | `text-[34px] font-extrabold` |
| h1 / h2 / h3 | per theme.ts | map to `text-3xl / 2xl / xl` with matching weights |
| body | 16 / 400 | `text-base` |
| small | 14 | `text-sm` |
| caption | 12 / 500 | `text-xs font-medium` |
| label | 13 / 700 | `text-[13px] font-bold` |

Large numeric headers (amounts): fixed `line-height`, `font-variant-numeric: tabular-nums`,
and CSS `clamp()` font sizing (web equivalent of `adjustsFontSizeToFit` + `minimumFontScale`).
**Disable** any default font synthesis that shifts baselines; keep container widths locked when
privacy masking swaps in `••••••` (same width as masked digits) so badges don't jump.

## 6. Motion bridge (mobile animation → web)

| Mobile | Web |
|---|---|
| PressableScale (activeScale ~0.97) | `active:scale-[0.97] transition-transform` |
| FAB micro-float loop | CSS keyframes translateY ±3 px |
| Card flip (expense type / donut flip / login mode flip) | CSS 3D `rotateY` transition (preserve-3d) |
| Slide-up bottom sheets | Drawer/dialog with translate-y transition |
| Toast slide-in-from-top | Same via transition classes |
| Skeleton shimmer | Same linear-gradient animation as `components/ui/Skeleton.tsx` |
| Haptics | None – ensure the visual feedback (scale/flash) is present where mobile relies on haptics |

## 7. Glassmorphism

Mobile uses translucent elevated surfaces on data-dense cards. Web equivalent:
`backdrop-blur` + `bg-surface-elevated/80`-style translucency over the parchment/slate
backgrounds – verify contrast in both themes before shipping.
