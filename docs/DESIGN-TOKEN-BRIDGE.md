# DESIGN-TOKEN-BRIDGE.md — RN theme → Tailwind mapping

Goal: the web app is visually indistinguishable from the mobile app in both themes. Source of
truth: `constants/theme.ts` in the mobile repo (tokens verified in audit, 2026-09-12). **Do not
"improve" the palette.**

> Status (2026-09-15): the web's "Neo" divergence has been reversed by user decision —
> `app/globals.css` now mirrors this document token-for-token (plus fixed `--sf-hue-*` /
> `--sf-tint-*` / `--sf-tile-*` / `--sf-track*` / `--sf-bar-*` / `--sf-set-*` tokens for the mobile
> components' theme-invariant accent hues and component-level tints). See the Theme divergence note in
> `FEATURE-PARITY.md`.

> **SUPERSEDED for the web (2026-10-10): "Engraved Banknote" redesign (user-directed, recorded in
> `FEATURE-PARITY.md`).** The WEB only now runs the note-language palette below; the mobile repo
> keeps the parchment/teal table in §2 unchanged. The token NAMES and Tailwind classes are identical
> — only the values swapped, so every component keeps consuming semantic tokens (`bg-background`,
> `text-text`, `border-border`, never raw hex). Same rule as before: do not "improve" the palette
> without a user decision.

## 0. Web banknote palette (2026-10-10)

| Token (useTheme key) | Web Light — "Note paper" | Web Dark — "Night vault" |
|---|---|---|
| primary | `#17402F` (engraved green ink) | `#D4B36A` (gold foil) |
| primaryStrong | `#0E2B1F` | `#E8CB8B` |
| primaryLight | `#DDE7DB` | `rgb(212 179 106 / 0.16)` |
| accent | `#8C6D1F` (foil brass) | `#B08D3E` |
| success / income | `#1F6F4A` / `#1F6F4A` | `#3FBF8A` / `#3FBF8A` |
| warning | `#8C6D1F` | `#D4B36A` |
| danger / rust | `#9C3B2E` (oxblood stamp) | `#E06A55` |
| info | `#2A5E74` | `#5BA8C9` |
| background | `#F2EFE2` (note paper) | `#0A100C` (vault black) |
| surface | `#FAF8EE` | `#101A14` |
| surfaceElevated | `#EBE7D6` | `#16241C` |
| text | `#1C231F` | `#EDEBDF` |
| textMuted | `#55604F` | `#9BA894` |
| faint | `#8A9284` | `#6B7866` |
| border | `#D8D2BC` | `#24352B` |
| input / tab | `#FAF8EE` | `#101A14` |
| accentBg | `#DDE7DB` | `rgb(212 179 106 / 0.16)` |
| brass / brassTint | `#8C6D1F` / `#EFE4C3` | `#D4B36A` / `rgb(212 179 106 / 0.15)` |
| rust / rustTint | `#9C3B2E` / `#F2DED6` | `#E06A55` / `rgb(224 106 85 / 0.15)` |

Typography: Fraunces (variable, `next/font`) is the display face — headlines and hero money
figures; system sans stays for body/UI. The fixed `--sf-hue-*` / tint tokens keep their values
(they are theme-invariant data-visualization hues on mobile too).


## 1. Strategy

- Tailwind **CSS variables** in `globals.css` under `:root` (light values) and `.dark` (dark values).
- Tailwind config maps semantic token names to `var(--...)` — components use `bg-background`,
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
- `primaryLight` / `accentBg` dark values are **alpha rgba** — store as `rgb(129 140 248 / 0.18)` in CSS vars.
- **Chart rule** (from AGENTS.md of mobile): income series = `income` token always; expense series = `primary` in dark, `danger` in light, via a single `expenseColor` variable in the chart component.

## 3. Spacing (RN numbers → Tailwind scale)

RN spacing: xs 4, sm 8, md 16, lg 24, xl 32, 2xl 40, 3xl 48, 4xl 56, 5xl 64.
Tailwind's default 4 px scale covers all of these (`p-1, p-2, p-4, p-6, p-8, p-10, p-12, p-14, p-16`).
**Rule: reference the semantic name in code comments only if needed — use the Tailwind class whose
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
| Haptics | None — ensure the visual feedback (scale/flash) is present where mobile relies on haptics |

## 7. Glassmorphism

Mobile uses translucent elevated surfaces on data-dense cards. Web equivalent:
`backdrop-blur` + `bg-surface-elevated/80`-style translucency over the parchment/slate
backgrounds — verify contrast in both themes before shipping.
