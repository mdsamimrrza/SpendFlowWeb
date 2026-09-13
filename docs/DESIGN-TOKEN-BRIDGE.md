# DESIGN-TOKEN-BRIDGE.md — RN theme → Tailwind mapping

Goal: the web app is visually indistinguishable from the mobile app in both themes. Source of
truth: `constants/theme.ts` in the mobile repo (tokens verified in audit, 2026-09-12). **Do not
"improve" the palette.**

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
