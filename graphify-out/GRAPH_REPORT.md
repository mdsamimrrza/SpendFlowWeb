# Graph Report - spendflowweb  (2026-09-16)

## Corpus Check
- Large corpus: 408 files · ~746,304 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1003 nodes · 2821 edges · 64 communities (56 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.85)
- Token cost: 2,021,904 input · 0 output

## Community Hubs (Navigation)
- Core Dashboard Screens
- Accounts & Transfer Screens
- Auth Screens
- Recurring & Bills Module
- Analytics Module
- Bullion Module
- Profile & Security
- Bin Module
- Agent Rules Documentation
- Category Budget Studio
- History Register Screens
- Transfer History
- TypeScript Config
- Routing & Middleware
- Root Layout & Providers
- Budget Progress Widgets
- Expense Hooks & Sync
- Settings Screen
- Database Schema Docs
- API Surface Docs
- Generated Supabase Types
- Phone Showcase Preview
- Email Template Config Script
- Expense Form
- Package Manifest
- Error & Status Pages
- Global Error & i18n Dicts
- Flow & Stock Charts
- Excel Export Smoke Test
- Dashboard Shell & Layout
- Currency Sync Verification
- Glyph & Icon Mapping
- Landing Page
- Theme & Palette Docs
- SMTP Config Script
- Ops & Schema Drift Docs
- Playwright Overflow Checks
- Icon Generation Script
- Expense Detail & New Pages
- Alerts & Skeletons
- Theme Context & Favicon
- Runtime Dependencies
- Dev Dependencies
- Preview Screenshot Scripts
- Category Breakdown Charts
- Donut & Sparkline Charts
- i18n Tooling Script
- Recent Feed & Expense Rows
- Daily Heat Chart
- Detail Sheet & SlideOver
- OAuth Redirect Verification
- Amount Keypad
- Next Config Security Headers
- NPM Scripts
- Export File Verification
- Daily Bars Chart
- Donut Chart
- Heat Calendar
- Definition of Done Rules
- PostCSS Config
- Mobile-First Design Rules
- Nepal Gold Rate Functions
- Monorepo Decision Docs
- Bullion History Edge Function

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 89 edges
2. `react` - 66 edges
3. `getSupabaseBrowserClient()` - 60 edges
4. `lucide-react` - 46 edges
5. `useAuth()` - 45 edges
6. `formatMoney()` - 45 edges
7. `ExpenseForm()` - 39 edges
8. `useToast()` - 35 edges
9. `usePrivacy()` - 33 edges
10. `RecurringRegister()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `FEATURE-PARITY.md — Mobile vs Web` --references--> `ensureProfile()`  [EXTRACTED]
  docs/FEATURE-PARITY.md → services/auth.ts
- `StepRail()` --calls--> `useLanguage()`  [EXTRACTED]
  app/(dashboard)/profile/page.tsx → store/LanguageContext.tsx
- `SheetModal()` --calls--> `useLanguage()`  [EXTRACTED]
  app/(dashboard)/settings/page.tsx → store/LanguageContext.tsx
- `ErrorPage()` --calls--> `useLanguage()`  [EXTRACTED]
  app/error.tsx → store/LanguageContext.tsx
- `NotFound()` --calls--> `useLanguage()`  [EXTRACTED]
  app/not-found.tsx → store/LanguageContext.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **OTP-Gated Sensitive Flows (Email Change / Account Deletion)** — docs_api_send_security_otp, docs_api_delete_account, docs_schema_security_otp_sends, emails_security_code, docs_00_existing_app_audit_auth_flow [EXTRACTED 1.00]
- **Mobile/Web One-Product Parity Contract** — docs_supabase_shared_backend, docs_sync_strategy_byte_compat_rules, docs_testing_logic_parity, docs_00_existing_app_audit, docs_feature_parity, docs_architecture_client_direct [INFERRED 0.95]
- **Auth Email → /auth/callback Redirect Path** — app_auth_callback_route, docs_supabase_oauth_redirect_allowlist, docs_security_password_reset, emails_confirm_signup, emails_readme_reset_password_template, docs_security_audit_p2_6_email_redirects [EXTRACTED 1.00]

## Communities (64 total, 8 thin omitted)

### Community 0 - "Core Dashboard Screens"
Cohesion: 0.05
Nodes (96): CategoriesPage(), formatShort(), HomePage(), ChartMode, MonthRow, parseISO(), ProfitLossPage(), safeMonthDate() (+88 more)

### Community 1 - "Accounts & Transfer Screens"
Cohesion: 0.06
Nodes (60): ACCOUNT_TYPES, AccountManageModal(), AccountType, ALL_PRESET_NAMES, CASH_PRESET, Select(), ACCOUNT_TYPE_LABELS, AccountsInject (+52 more)

### Community 2 - "Auth Screens"
Cohesion: 0.08
Nodes (40): ForgotPasswordPage(), AuthLayout(), CHIP_TONES, NOTE: The localhost→127.0.0.1 redirect was removed. It split the browser, SignInPage(), SignUpPage(), AuthBanner(), AuthCard() (+32 more)

### Community 3 - "Recurring & Bills Module"
Cohesion: 0.10
Nodes (33): BillFormSheet(), daysBetween(), DetailSheet(), INTERVAL_PRESETS, PRESETS, Input, InputProps, Select (+25 more)

### Community 4 - "Analytics Module"
Cohesion: 0.08
Nodes (23): AnalyticsInject, BreakdownView, BurnPacingCard(), CAL_CURRENT_YEAR, CAL_MONTH_NAMES, CAL_WEEKDAYS, CAL_YEARS, CapsMatrixCard() (+15 more)

### Community 5 - "Bullion Module"
Cohesion: 0.12
Nodes (26): BullionInject, BullionPageProps, BullionSeriesPoint, BullionStatement(), EMPTY_SERIES, Market, TrendPeriod, countryForCurrency() (+18 more)

### Community 6 - "Profile & Security"
Cohesion: 0.13
Nodes (25): ProfilePage(), reencodeAvatar(), StepRail(), DashboardShell(), DEFAULT_CATEGORIES, DefaultCategory, FALLBACK_EXPENSE_CATEGORY, Mobile Auth & Session Flow (End to End) (+17 more)

### Community 7 - "Bin Module"
Cohesion: 0.14
Nodes (24): BinInject, BinStatement(), BinStatementProps, daysToneVar(), itemTitle(), BIN_RETENTION_DAYS, binDaysLeft(), BinItem (+16 more)

### Community 8 - "Agent Rules Documentation"
Cohesion: 0.19
Nodes (21): AGENTS.md — SpendFlow Web Agent Rules, Graphify Codebase Intelligence Skill, Priority of Information Order, constants/theme.ts (Mobile Repo), 00 — Existing App Audit (SpendFlow Mobile), Mobile-Only Behaviors to Adapt or Skip on Web, ARCHITECTURE.md — SpendFlow Web, DESIGN-TOKEN-BRIDGE.md — RN Theme to Tailwind (+13 more)

### Community 9 - "Category Budget Studio"
Cohesion: 0.23
Nodes (14): CategoryBudgetStudio(), handleClearSingle(), handleSave(), writeBudget(), CategoryManageModal(), CategoryManageModalProps, categoryColorForIcon(), seedDefaultCategories() (+6 more)

### Community 10 - "History Register Screens"
Cohesion: 0.12
Nodes (13): BreakdownFlipCard(), DayDetailModal(), DatePreset, DayCard(), filterRowsLocally(), FlowFilter, groupDate(), HistoryHero() (+5 more)

### Community 11 - "Transfer History"
Cohesion: 0.12
Nodes (13): Preset, PRESETS, SortKey, SORTS, TransferDetailSheet(), TransferHistoryInject, TransferHistoryPageProps, EmptyState() (+5 more)

### Community 12 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 13 - "Routing & Middleware"
Cohesion: 0.14
Nodes (12): GET(), APP_PATHS, config, PUBLIC_PATHS, @supabase/ssr, @supabase/supabase-js, BudgetAlertInput, CategoryAlertInput (+4 more)

### Community 14 - "Root Layout & Providers"
Cohesion: 0.13
Nodes (13): metadata, viewport, LanguageProvider(), PrivacyContext, PrivacyContextValue, PrivacyProvider(), Providers(), KIND_STYLES (+5 more)

### Community 15 - "Budget Progress Widgets"
Cohesion: 0.15
Nodes (11): ProgressRing(), ProgressRingProps, BudgetPanelProps, MoneyPulseHero(), MoneyPulseHeroProps, PaceInfo, QuickStat, QuickStatTiles() (+3 more)

### Community 16 - "Expense Hooks & Sync"
Cohesion: 0.17
Nodes (16): PaymentMethod, Listener, listeners, refetchThrottles, useExpenses(), cacheExpenses(), cacheKey(), CreateExpenseInput (+8 more)

### Community 17 - "Settings Screen"
Cohesion: 0.15
Nodes (9): COUNTRY_BY_CURRENCY, LANGUAGE_FLAG, SheetModal(), OnboardingPage(), CountryData, InstitutionPreset, ONBOARDING_COMPLETE_KEY, ONBOARDING_CURRENCY_KEY (+1 more)

### Community 18 - "Database Schema Docs"
Cohesion: 0.18
Nodes (17): Recurring Payment Plan Model (Mobile), SCHEMA.md — SpendFlow Database Schema, public.bank_accounts Table, public.bin_receipt_orphans Table, public.categories Table, public.category_budget_history Table (Append-only), public.expenses Table, Per-Row FX Snapshot Columns (+9 more)

### Community 19 - "API Surface Docs"
Cohesion: 0.16
Nodes (17): API.md — Web-facing API Surface, External Public HTTP APIs (FX, Gold, Push), Client-Direct Supabase (No BFF), @supabase/ssr Cookie Session Handling, public.exchange_rates Table, Known Live Migration Drift, SECURITY.md — SpendFlow Web, Full Security Audit 2026-09-14 (v2 Consolidated) (+9 more)

### Community 20 - "Generated Supabase Types"
Cohesion: 0.12
Nodes (16): BankAccountRelationships, BankAccountsInsert, CategoryRelationships, ExpenseInsert, ExpenseRelationships, ExpenseUpdate, Json, RecurringRule (+8 more)

### Community 21 - "Phone Showcase Preview"
Cohesion: 0.13
Nodes (3): ShowcaseProps, CurrencyCode, CountryInfo

### Community 22 - "Email Template Config Script"
Cohesion: 0.18
Nodes (12): args, brief(), buildPayload(), env, getToken(), HTML, KEYS, main() (+4 more)

### Community 23 - "Expense Form"
Cohesion: 0.19
Nodes (11): ExpenseFormProps, FlowType, METHOD_ICONS, QUICK_AMOUNTS, useFitCount(), ANDROID_DOWNLOAD_URL, CURRENCY_DETAILS, CurrencyDetail (+3 more)

### Community 24 - "Package Manifest"
Cohesion: 0.14
Nodes (12): name, private, version, autoprefixer, postcss, tailwindcss, @types/node, @types/react (+4 more)

### Community 25 - "Error & Status Pages"
Cohesion: 0.26
Nodes (8): ErrorPage(), NotFound(), StatusPage(), StatusPageProps, Button(), ButtonProps, SpendFlowSeal(), react

### Community 26 - "Global Error & i18n Dicts"
Cohesion: 0.28
Nodes (9): en, hi, ne, TranslationKey, DICTIONARIES, LanguageContext, LanguageContextValue, LANGUAGE_LOCALES (+1 more)

### Community 27 - "Flow & Stock Charts"
Cohesion: 0.27
Nodes (10): MonthBars(), MonthBarsProps, StockFlowChart(), StockFlowChartProps, TrendChart(), TrendChartProps, TrendPoint, formatDate() (+2 more)

### Community 28 - "Excel Export Smoke Test"
Cohesion: 0.17
Nodes (8): cat(), csv, html, [ledger, summary], row(), rows, xbytes, ../.smoke/export-bundle.mjs

### Community 29 - "Dashboard Shell & Layout"
Cohesion: 0.23
Nodes (5): BudgetHeroCardProps, NAV, PrivacyEyeButton(), ThemeToggle(), lucide-react

### Community 30 - "Currency Sync Verification"
Cohesion: 0.17
Nodes (8): { CURRENCIES }, { formatMoney, quantizeMoney, currencyDecimals }, require, root, srcApp, srcFormat, tmp, tsc

### Community 31 - "Glyph & Icon Mapping"
Cohesion: 0.22
Nodes (9): Lucide-Only Icon Rule, ACCOUNT_NAME_TO_LUCIDE, EMOJI_TO_LUCIDE, CATEGORY_ICONS, DEFAULT_CATEGORY_COLOR, EMOJI_TO_ICON_NAME, ICON_COLORS, INCOME_ICON_NAMES (+1 more)

### Community 32 - "Landing Page"
Cohesion: 0.18
Nodes (7): DEMO_ROWS, DEMO_USD_PER_UNIT, FEATURES, LandingPage(), PhoneScreen, PhoneShowcase(), CURRENCIES

### Community 33 - "Theme & Palette Docs"
Cohesion: 0.24
Nodes (11): send-security-otp Edge Function, Chart Series Color Rule, Mobile Canonical Palette (Parchment/Teal, Slate/Indigo), Theme Token Bridge (CSS Vars), Neo Palette Divergence (Reversed 2026-09-15), public.security_otp_sends Table, change-email.html Template, confirm-signup.html Template (+3 more)

### Community 34 - "SMTP Config Script"
Cohesion: 0.24
Nodes (9): args, env, getToken(), m, main(), mgmt(), ROOT, smtpConfig (+1 more)

### Community 35 - "Ops & Schema Drift Docs"
Cohesion: 0.20
Nodes (10): Trilingual i18n Coverage Rule, Bullion Market Calibrations (FENEGOSIDA / IBJA), public.market_gold_rates Table, public.user_settings_history Table (Append-only), public.users Table, P2-2: Live Bucket Limits Unverified, Avatar EXIF/GPS Canvas Re-encode, avatars Storage Bucket (public) (+2 more)

### Community 36 - "Playwright Overflow Checks"
Cohesion: 0.20
Nodes (4): playwright-core, WIDTHS, SECTIONS, ROWS

### Community 37 - "Icon Generation Script"
Cohesion: 0.31
Nodes (9): emblem(), fs, NAVY, path, png(), ROOT, roundedEmblem(), sharp (+1 more)

### Community 38 - "Expense Detail & New Pages"
Cohesion: 0.22
Nodes (3): metadata, metadata, next

### Community 39 - "Alerts & Skeletons"
Cohesion: 0.39
Nodes (6): AlertBell(), Skeleton(), SkeletonCard(), listNotifications(), markAllNotificationsRead(), NotificationRow

### Community 40 - "Theme Context & Favicon"
Cohesion: 0.33
Nodes (7): ThemeFavicon(), applyTheme(), ThemeContext, ThemeContextValue, ThemeProvider(), useTheme(), ThemePreference

### Community 41 - "Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, lucide-react, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, write-excel-file (+1 more)

### Community 42 - "Dev Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, autoprefixer, playwright-core, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+1 more)

### Community 43 - "Preview Screenshot Scripts"
Cohesion: 0.22
Nodes (4): pageErrors, ROUTES, STRESS, WIDTHS

### Community 44 - "Category Breakdown Charts"
Cohesion: 0.32
Nodes (5): CategoryBarsProps, CategorySlice, MixSlice, SpendingMix(), SpendingMixProps

### Community 45 - "Donut & Sparkline Charts"
Cohesion: 0.21
Nodes (3): CategoryDonutProps, DonutDatum, SparklineProps

### Community 46 - "i18n Tooling Script"
Cohesion: 0.25
Nodes (5): en, fs, hi, ne, src

### Community 47 - "Recent Feed & Expense Rows"
Cohesion: 0.38
Nodes (6): RecentFeed(), RecentFeedProps, toISO(), ExpenseDetailSheetProps, ExpenseRow, StatementPdfOptions

### Community 48 - "Daily Heat Chart"
Cohesion: 0.40
Nodes (5): alpha(), DailyHeat(), DailyHeatProps, DayDatum, INTENSITY_STOPS

### Community 49 - "Detail Sheet & SlideOver"
Cohesion: 0.40
Nodes (3): SlideOver(), SlideOverProps, react-dom

### Community 50 - "OAuth Redirect Verification"
Cohesion: 0.33
Nodes (4): allowed, locLower, root, url

### Community 51 - "Amount Keypad"
Cohesion: 0.50
Nodes (3): AmountKeypad(), apply(), Op

### Community 52 - "Next Config Security Headers"
Cohesion: 0.40
Nodes (4): csp, nextConfig, securityHeaders, supabaseHost

### Community 53 - "NPM Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, start, typecheck

### Community 57 - "Heat Calendar"
Cohesion: 0.67
Nodes (3): HeatCalendar(), HeatCalendarProps, isoOf()

### Community 58 - "Definition of Done Rules"
Cohesion: 0.67
Nodes (3): Completion Bar (Definition of Done), Ponytail Simplicity Discipline, supabase/tests/rls_regression.sql (49 pgTAP Assertions)

## Ambiguous Edges - Review These
- `send-password-reset Flow (2026-09-15)` → `P3-9: Enumeration-Safe Auth Messaging`  [AMBIGUOUS]
  docs/SECURITY.md · relation: conceptually_related_to
- `Mobile Canonical Palette (Parchment/Teal, Slate/Indigo)` → `confirm-signup.html Template`  [AMBIGUOUS]
  emails/README.md · relation: conceptually_related_to

## Knowledge Gaps
- **285 isolated node(s):** `fs`, `src`, `en`, `hi`, `ne` (+280 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 399 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `send-password-reset Flow (2026-09-15)` and `P3-9: Enumeration-Safe Auth Messaging`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Mobile Canonical Palette (Parchment/Teal, Slate/Indigo)` and `confirm-signup.html Template`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Error & Status Pages` to `Core Dashboard Screens`, `Accounts & Transfer Screens`, `Auth Screens`, `Recurring & Bills Module`, `Analytics Module`, `Bullion Module`, `Profile & Security`, `Bin Module`, `Category Budget Studio`, `History Register Screens`, `Transfer History`, `Root Layout & Providers`, `Budget Progress Widgets`, `Expense Hooks & Sync`, `Settings Screen`, `Expense Form`, `Package Manifest`, `Global Error & i18n Dicts`, `Flow & Stock Charts`, `Dashboard Shell & Layout`, `Landing Page`, `Alerts & Skeletons`, `Theme Context & Favicon`, `Donut & Sparkline Charts`, `Recent Feed & Expense Rows`, `Detail Sheet & SlideOver`, `Amount Keypad`, `Daily Bars Chart`, `Heat Calendar`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `lucide-react` connect `Dashboard Shell & Layout` to `Core Dashboard Screens`, `Accounts & Transfer Screens`, `Auth Screens`, `Recurring & Bills Module`, `Analytics Module`, `Bullion Module`, `Profile & Security`, `Bin Module`, `Category Budget Studio`, `History Register Screens`, `Transfer History`, `Budget Progress Widgets`, `Settings Screen`, `Phone Showcase Preview`, `Expense Form`, `Package Manifest`, `Error & Status Pages`, `Global Error & i18n Dicts`, `Glyph & Icon Mapping`, `Landing Page`, `Alerts & Skeletons`, `Recent Feed & Expense Rows`, `Detail Sheet & SlideOver`, `Amount Keypad`, `Heat Calendar`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `Auth Screens` to `Core Dashboard Screens`, `Accounts & Transfer Screens`, `Recurring & Bills Module`, `Analytics Module`, `Bullion Module`, `Profile & Security`, `Bin Module`, `Category Budget Studio`, `History Register Screens`, `Transfer History`, `Budget Progress Widgets`, `Settings Screen`, `Expense Form`, `Error & Status Pages`, `Global Error & i18n Dicts`, `Dashboard Shell & Layout`, `Landing Page`, `Alerts & Skeletons`, `Detail Sheet & SlideOver`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `fs`, `src`, `en` to the rest of the system?**
  _285 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Dashboard Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.054324206866579745 - nodes in this community are weakly interconnected._