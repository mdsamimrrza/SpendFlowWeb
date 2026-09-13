# UI-SPECIFICATION.md — SpendFlow Web

Web mirrors the mobile app screen-for-screen so the two feel like one product. Route names below
map 1:1 to mobile expo-router routes (see `00-EXISTING-APP-AUDIT.md` §2–3 for full mobile behavior).

## 1. Routes / screens

| Web route | Mobile counterpart | Notes |
|---|---|---|
| `/auth` | `(auth)/index` | Sign in / sign up card, forgot-password dialog, Google OAuth. No biometric unlock card, no Apple. |
| `/auth/callback` | (deep link handler) | OAuth PKCE code exchange → redirect to `/`. |
| `/onboarding` | `onboarding` | Single page, pre-login: language pills, 12-country chips (flag + currency code only — full names overflow small cells on mobile; on web they're fine but keep chips), Get Started. |
| `/` (dashboard) | `(tabs)/index` | Greeting bar + theme/language/privacy toggles, BudgetLimitHeroCard, trend chart (1D/7D/4W/6M/1Y), category donut, recent activity. FAB → `/expense/new`. |
| `/history` | `(tabs)/history` | Vault & Flow card, search, timeframe/category/sort dropdowns (popover menus below their icons), date-grouped list with day totals, pagination, export dialog. |
| `/analytics` | `(tabs)/analytics` | Period + section dropdowns, KPI tiles with explainer dialogs, health score, donut with view-flip, budget progress, payment-method bars, habits. |
| `/recurring` | `(tabs)/recurring` | Monthly total hero, rule list, detail dialog, slide-over form with frequency presets, quick-add templates on empty state. |
| `/settings` | `(tabs)/settings` | Profile hero, currency/theme/language/notifications menus, links to accounts/categories/bullion/export/profit-loss, sign-out. |
| `/accounts` | `accounts` | Total liquid balance, quick actions, account list with computed balances, edit dialog, recent transfers. |
| `/transfer` | `transfer` (modal on mobile → dialog/page on web) | From/To pickers, quick-amount chips, live conversion preview, fee/notes, insufficient-balance banner. |
| `/transfer/history` | `transfer-history` | Search + period + sort, list, load-more. |
| `/bullion` | `bullion` | Market switcher (Nepal FENEGOSIDA / India IBJA), 2×2 benchmark grid, SVG chart with hover-scrub (replaces tap-scrub), calculator, buyer guide. |
| `/export` | `export` (modal → dialog) | Period pills, preview, PDF/Excel/CSV (client-side blob downloads), CSV import via file input. |
| `/profile` | `profile` | Avatar upload, inline name editor, email (OTP flow), password, sign-out-all-devices, delete account (shared two-step OTP flow). |
| `/profit-loss` | `profit-loss` (modal → page) | P&L chart with month select, budget editor (budget_currency aware), cycle configurator, month-by-month table. |
| `/categories` | `categories` | Expense/Income switcher, grid, budget bulk editor dialog, category CRUD dialog. |
| `/expense/new`, `/expense/[id]` | `expense/add`, `expense/[id]` | Shared ExpenseForm component: type flip, quick tags, receipt attach (file input; OCR deferred), FX preview, soft delete. |

Modals-on-mobile become **dialogs / drawers** on web (keep them as overlays where mobile uses modals: transfer, export, profit-loss can be full pages on desktop for space).

## 2. Required states per screen

Every screen implements all of:

| State | Requirement |
|---|---|
| **Loading** | Skeleton placeholders matching final layout (mobile uses `Skeleton.tsx` shimmer — port it). Never a blank page; never layout shift when data arrives. |
| **Empty** | Icon + title + message + primary action (mobile `EmptyState`). Recurring has quick-add template chips. Accounts with <2 accounts prompts account creation inline (transfer screen). |
| **Error** | Inline banner within the screen + toast for transient failures; retry action. Auth errors map to Supabase messages, localized. |
| **Success** | Toast (`showToast` port: success/error/info, dismissible) after every mutation. |
| **Disabled** | Submit buttons disabled while in-flight (mobile Button has loading state); privacy mode masks amounts but never disables controls; CSV import disabled >2 MB/1000 rows with explanation. |

## 3. Cross-cutting UI rules (parity contract)

1. **Privacy masking**: global privacy toggle renders `••••••` for all money values; the mask container keeps a **locked width** so adjacent badges (▲ % vs last month) never shift. Persisted in localStorage, same as mobile's AsyncStorage key behavior.
2. **Number/date formatting** follows the selected language locale (`en-US` / `hi-IN` / `ne-NP`) — same as mobile.
3. **Chart colors**: income always green (`theme.colors.income`); expense series theme-conditional (indigo dark / rust light) via a single `expenseColor` variable. Never hardcode one branch.
4. **Amount headers**: large numeric displays get fixed line-height, no font padding quirks, and `adjustsFontSizeToFit`-equivalent (CSS clamp / shrink) so 360 dp-class widths and narrow browser windows never truncate.
5. **Popovers**: History/Analytics filter menus open directly below their trigger icons and dismiss on outside click; list scroll locks while open (`overflow: hidden` on the scroll container).
6. **Destructive actions** always use a confirm dialog (delete expense/account/transfer/category, sign out, delete account).
7. **i18n**: every user-facing string goes through `t()` and is added to **en, hi, and ne in the same change**.
8. **Theme**: every color from the token bridge (DESIGN-TOKEN-BRIDGE.md) — no raw hex in components. Light/dark/system with system listener.

## 4. Responsive rules

- **Desktop (≥ 1024 px)**: dashboard-style layouts — the tab bar becomes a left sidebar; wide screens (History, Analytics, Profit & Loss) get 2-column layouts (filters/list + summary). Keep visual identity, don't invent a new design language.
- **Tablet (768–1023)**: sidebar collapses to icon rail.
- **Mobile / narrow (< 768)**: bottom tab bar (5 tabs, same as mobile), single column — this should look essentially like the mobile app. Compact-height adjustments from mobile (`useWindowDimensions().height < 400` onboarding compaction) translate to short-viewport media queries.
- Analytics KPI grid: 4 → 2 columns < 390 px equivalent (mobile rule), 4 across on desktop.
- Touch targets stay ≥ 40 px even with mouse cursors (parity with mobile's 40×40 icon buttons).
- Dialogs: max-width constraints, `paddingBottom` respecting safe-area equivalent (`env(safe-area-inset-bottom)`) since the web app is also usable on mobile browsers.

## 5. Deliberate web differences (not regressions)

- Hover states on rows/buttons (web affordance) — subtle, doesn't replace press feedback.
- Chart scrubbing via hover + touch (replaces tap-to-scrub).
- Swipe-to-delete replaced by row action buttons/hover reveal.
- Biometric unlock, screenshot blocking, haptics, push notifications: absent (see FEATURE-PARITY).
