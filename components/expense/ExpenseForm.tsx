"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Coins,
  CreditCard,
  ExternalLink,
  LayoutGrid,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Smartphone,
  Tag,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { DateField } from "@/components/ui/CalendarModal";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { accountGlyph, categoryGlyph } from "@/components/ui/Glyph";
import { AmountKeypad } from "./AmountKeypad";
import { CategoryManageModal } from "./CategoryManageModal";
import { AccountManageModal } from "@/components/account/AccountManageModal";
import { RecordPreviewRail, type RailPreview } from "./RecordPreviewRail";
import { useToast } from "@/store/ToastContext";
import { useLanguage } from "@/store/LanguageContext";
import { useAuth } from "@/store/AuthContext";
import { usePrivacy } from "@/store/PrivacyContext";
import { useCategories, useRefreshExpenses } from "@/hooks/useExpenses";
import { useBudget, useRowConverter } from "@/hooks/useRates";
import {
  createExpense,
  getExpense,
  setExpenseReceipt,
  softDeleteExpense,
  updateExpense,
} from "@/services/expenses";
import {
  deleteReceipt,
  resolveReceiptUrl,
  uploadReceipt,
  validateReceiptFile,
} from "@/services/receipts";
import {
  computeAccountBalances,
  listBankAccounts,
  type BankAccountRow,
} from "@/services/bankAccounts";
import { convert, getRate, isPegged } from "@/services/exchange";
import {
  listRecurringRules,
  payPlanFromForm,
  updateRecurringRule,
  type RecurringRuleRow,
} from "@/services/recurring";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import {
  CURRENCIES,
  CURRENCY_DETAILS,
  EXPENSE_QUICK_TAGS,
  INCOME_QUICK_TAGS,
  PAYMENT_METHODS,
  type CurrencyCode,
  type PaymentMethod,
} from "@/constants/app";
import {
  formatMoney,
  getCycleWindow,
  quantizeMoney,
  toISODate,
  todayISO,
} from "@/utils/format";
import { getCachedExpenses, type ExpenseRow } from "@/services/expenses";
import type { Category } from "@/types/database.types";

interface ExpenseFormProps {
  expenseId?: string;
}

type FlowType = "expense" | "income";

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = {
  Cash: Banknote,
  Card: CreditCard,
  UPI: Smartphone,
  Other: Coins,
};

// Quick-add chips (mobile parity: taps increment the entered figure).
const QUICK_AMOUNTS = [100, 500, 1000, 5000];

const KEYPAD_LS_KEY = "sf_expense_keypad";

/** "YYYY-MM-DD" + n days, DST-safe. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/**
 * Transaction entry, spec SF-01: same vertical card stack as the APK form in
 * the same order (§1 type toggle → §8 receipt studio), on a desktop 640px
 * column + sticky 360px record-preview rail below `min-[900px]`. Every emoji
 * the stored data carries is rendered through the Lucide glyph layer.
 */
/**
 * Dynamic circle-row capacity: how many 60px items fit the measured row
 * width, minus one slot reserved for the ▦ All button. Re-measures on
 * resize, so phones get fewer circles and laptops fill the card.
 */
function useFitCount() {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const gap = 10;
      const item = 60;
      const inner = el.clientWidth - 8; // px-1 padding
      setCount(Math.max(1, Math.floor((inner + gap) / (item + gap)) - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, count };
}

export function ExpenseForm({ expenseId }: ExpenseFormProps) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { mask } = usePrivacy();
  const supabase = getSupabaseBrowserClient();
  const refreshExpenses = useRefreshExpenses();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const displayCurrency = profile?.preferred_currency ?? "NPR";
  const budget = useBudget();

  const { categories, reload: reloadCategories } = useCategories(userId);
  const [existing, setExisting] = useState<ExpenseRow | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(!!expenseId);

  const [flowType, setFlowType] = useState<FlowType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(
    (profile?.preferred_currency as CurrencyCode) ?? "NPR",
  );
  const currencyManuallySelected = useRef(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  // ── PAY FROM PLAN (mobile §6): plans are managed ONLY on the Recurring
  //    tab; the form's recurring surface is exactly one thing — paying a
  //    plan's open installment with what's in the form. Saving books the
  //    rule's slot AND re-anchors the chain from this payment date. ──
  const [plans, setPlans] = useState<RecurringRuleRow[]>([]);
  const [payPlan, setPayPlan] = useState<RecurringRuleRow | null>(null);
  const [planRowOpen, setPlanRowOpen] = useState(false);
  const [snapshotDate, setSnapshotDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Rule-linked rows get the three-way delete (mobile requestDelete):
  // this payment only / cancel plan too / cancel.
  const [confirmPlanDelete, setConfirmPlanDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Time widget (APK §5): 12-hour boxes + AM/PM, stored as "HH:MM" (24h).
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");
  const [timeSet, setTimeSet] = useState(false);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  // Pickers / popovers.
  const [catOpen, setCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  // In-form category editor (APK CategoryManageModal parity).
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catToEdit, setCatToEdit] = useState<Category | null>(null);
  const [accOpen, setAccOpen] = useState(false);
  // In-form account editor (APK "Manage Account" pill).
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [accToEdit, setAccToEdit] = useState<BankAccountRow | null>(null);
  const [accountsReload, setAccountsReload] = useState(0);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!!expenseId);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  // Rail breakpoint + the mobile save-review sheet (see onSubmit).
  const [isDesktop, setIsDesktop] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [insufficient, setInsufficient] = useState<{
    accountName: string;
    required: number;
    available: number;
    shortfall: number;
    currency: string;
  } | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const categoryCardRef = useRef<HTMLDivElement>(null);
  const accountCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // ── Accounts with live balances (APK §3.5) ──
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listBankAccounts(supabase, userId)
      .then(async (rows) => {
        if (cancelled) return;
        setAccounts(rows);
        try {
          const live = await computeAccountBalances(supabase, userId, rows);
          if (!cancelled) setBalances(live);
        } catch {
          if (!cancelled) setBalances(new Map());
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, supabase, existing?.updated_at, accountsReload]);

  // ── Active plans for the pay-from-plan row (add mode only — mobile §6). ──
  useEffect(() => {
    if (expenseId || !userId) {
      setPlans([]);
      return;
    }
    let cancelled = false;
    void listRecurringRules(supabase, userId)
      .then((rs) => {
        if (!cancelled) setPlans(rs.filter((r) => r.is_active));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [expenseId, userId, supabase]);

  /** Selecting a plan fills the whole form; re-tapping the pick unbooks it. */
  const handleSelectPlan = (rule: RecurringRuleRow) => {
    if (payPlan?.id === rule.id) {
      setPayPlan(null);
      return;
    }
    setPlanRowOpen(false);
    setPayPlan(rule);
    setAmount(String(rule.amount));
    setCurrency((rule.currency || displayCurrency) as CurrencyCode);
    currencyManuallySelected.current = true;
    if (rule.category_id) setCategoryId(rule.category_id);
    if (rule.description?.trim()) setDescription(rule.description.trim());
    setPaymentMethod(rule.payment_method);
    setDate(todayISO());
    amountRef.current?.focus();
  };

  /** Slot state chip on a plan tile: Overdue Nd / Due today / next due X. */
  const planSlotChip = (rule: RecurringRuleRow): { label: string; tone: "danger" | "primary" | "muted" } => {
    const due = rule.next_due_date;
    const dayShort = (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
    const today = todayISO();
    if (due < today) {
      const late = Math.max(
        0,
        Math.round(
          (new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000,
        ),
      );
      return { label: `${t("recurring_overdue")} ${late}d`, tone: "danger" };
    }
    if (due === today) return { label: t("recurring_due_today"), tone: "primary" };
    return { label: `${t("recurring_next_due_short")} ${dayShort(due)}`, tone: "muted" };
  };

  // Default account (mobile parity): is_default, else first. New entry only.
  useEffect(() => {
    if (expenseId || bankAccountId || accounts.length === 0) return;
    const def = accounts.find((a) => a.is_default) ?? accounts[0];
    if (def) setBankAccountId(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, expenseId]);

  // Default currency follows the profile until the user picks manually.
  useEffect(() => {
    if (profile?.preferred_currency && !currencyManuallySelected.current && !expenseId) {
      setCurrency(profile.preferred_currency as CurrencyCode);
    }
  }, [profile?.preferred_currency, expenseId]);

  useEffect(() => {
    setHasCamera(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    );
    try {
      setKeypadOpen(localStorage.getItem(KEYPAD_LS_KEY) === "1");
    } catch {
      /* private mode: default off */
    }
  }, []);

  const toggleKeypad = () => {
    setKeypadOpen((k) => {
      const next = !k;
      try {
        localStorage.setItem(KEYPAD_LS_KEY, next ? "1" : "0");
      } catch {
        /* best effort */
      }
      return next;
    });
  };

  // ── Load the row in edit mode (APK §1) ──
  useEffect(() => {
    if (!expenseId || !userId) return;
    void getExpense(supabase, userId, expenseId).then((row) => {
      if (row) {
        setExisting(row);
        setFlowType(row.type);
        setAmount(String(row.amount));
        setCurrency(row.currency as CurrencyCode);
        setCategoryId(row.category_id);
        setDescription(row.description ?? "");
        setDate(row.date);
        setPaymentMethod(row.payment_method);
        setBankAccountId(row.bank_account_id ?? "");
        setNotes(row.notes ?? "");
        if (row.time) {
          const [h, m] = row.time.split(":");
          const hn = Number(h);
          setAmpm(hn >= 12 ? "PM" : "AM");
          setHour(String(hn % 12 === 0 ? 12 : hn % 12));
          setMinute(m);
          setTimeSet(true);
        }
        setExistingPath(row.receipt_image_url ?? null);
        if (row.receipt_image_url) {
          void resolveReceiptUrl(supabase, userId, row.receipt_image_url).then(setExistingUrl);
        }
      }
      setLoadingExisting(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, userId, supabase]);

  const timeString = useMemo(() => {
    if (!timeSet || hour === "" || minute === "") return null;
    const h = Number(hour) % 12;
    const h24 = ampm === "PM" ? h + 12 : h;
    return `${String(h24).padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }, [timeSet, hour, minute, ampm]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === flowType),
    [categories, flowType],
  );

  // ── APK circle-row ordering ──
  const catFit = useFitCount();
  const accFit = useFitCount();
  // Category usage from the read-cache (mobile derives the same from the
  // cached expenses page): count desc, last-used date desc.
  const categoryUsage = useMemo(() => {
    const by = new Map<string, { count: number; last: string }>();
    if (!userId) return by;
    for (const e of getCachedExpenses(userId)) {
      if (e.deleted_at) continue;
      const cur = by.get(e.category_id);
      if (cur) {
        cur.count += 1;
        if (e.date > cur.last) cur.last = e.date;
      } else by.set(e.category_id, { count: 1, last: e.date });
    }
    return by;
  }, [userId]);

  // Circle row = current pick first (always visible + ringed), then the
  // most-used categories; the rendered slice is dynamic — as many as fit
  // the card width (see useFitCount) with one slot reserved for ▦ All.
  const categoryRow = useMemo(() => {
    const selected = categories.find((c) => c.id === categoryId) ?? null;
    const seen = new Set<string>();
    const list: Category[] = [];
    if (selected && selected.type === flowType) {
      list.push(selected);
      seen.add(selected.id);
    }
    const top = [...categoryUsage.entries()]
      .map(([id, v]) => ({ c: visibleCategories.find((x) => x.id === id), last: v.last, count: v.count }))
      .filter((x) => !!x.c)
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
      .slice(0, 5);
    for (const u of top) {
      if (u.c && !seen.has(u.c.id)) {
        list.push(u.c);
        seen.add(u.c.id);
      }
    }
    // Fill the rest of the row with the remaining categories in list order
    // so wide screens show more picks before ▦ All.
    for (const c of visibleCategories) {
      if (!seen.has(c.id)) {
        list.push(c);
        seen.add(c.id);
      }
    }
    return list;
  }, [categories, categoryId, flowType, categoryUsage, visibleCategories]);

  // Account circle row = current pick first, then the richest accounts
  // (live balance desc); rendered slice is dynamic via useFitCount.
  const accountRow = useMemo(() => {
    const selected = accounts.find((a) => a.id === bankAccountId) ?? null;
    const seen = new Set<string>();
    const list: BankAccountRow[] = [];
    if (selected) {
      list.push(selected);
      seen.add(selected.id);
    }
    for (const a of [...accounts].sort(
      (x, y) => (balances.get(y.id) ?? 0) - (balances.get(x.id) ?? 0),
    )) {
      if (!seen.has(a.id)) {
        list.push(a);
        seen.add(a.id);
      }
    }
    return list;
  }, [accounts, bankAccountId, balances]);

  // Default category: first of the matching type (mobile parity, new entry).
  useEffect(() => {
    if (expenseId || categoryId || visibleCategories.length === 0) return;
    setCategoryId(visibleCategories[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCategories, expenseId]);

  const switchType = (next: FlowType) => {
    setFlowType(next);
    const current = categories.find((c) => c.id === categoryId);
    if (!current || current.type !== next) {
      const firstOfNext = categories.find((c) => c.type === next);
      setCategoryId(firstOfNext?.id ?? "");
    }
  };

  // Desktop shortcuts: Ctrl/Cmd+E / +I flip the type, Ctrl+Enter submits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      if (!typing && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        switchType("expense");
      } else if (!typing && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        switchType("income");
      } else if (e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, categories]);

  // Close popovers on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-popover-host]")) {
        setCatOpen(false);
        setAccOpen(false);
        setCurrencyOpen(false);
        setRateOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── §2 Live FX detail row: USD/unit of the entry currency at the
  //    effective snapshot date (override or transaction date) + the display
  //    currency's own rate. Recomputed on every keystroke/currency/date change.
  const effectiveSnapshot = snapshotDate || date;
  // USD entries have no rate to lock — a snapshot date picked under another
  // currency must never survive a switch to USD.
  useEffect(() => {
    if (currency === "USD") setSnapshotDate("");
  }, [currency]);
  const [usdPerUnit, setUsdPerUnit] = useState<number | null>(null);
  const [displayUsdPerUnit, setDisplayUsdPerUnit] = useState<number | null>(null);
  const [fxPending, setFxPending] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFxPending(true);
    void Promise.all([
      getRate(supabase, currency, effectiveSnapshot),
      getRate(supabase, displayCurrency),
    ])
      .then(([from, to]) => {
        if (cancelled) return;
        setUsdPerUnit(from);
        setDisplayUsdPerUnit(to);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFxPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency, effectiveSnapshot, displayCurrency, userId, supabase]);

  const rateToDisplay =
    usdPerUnit != null && displayUsdPerUnit != null && displayUsdPerUnit > 0
      ? usdPerUnit / displayUsdPerUnit
      : null;

  // ── Rate history for the §2 popover mini chart (best effort). ──
  const [rateHistory, setRateHistory] = useState<{ date: string; rate: number }[]>([]);
  useEffect(() => {
    if (!rateOpen) return;
    let cancelled = false;
    const qccy = currency === "NPR" ? "INR" : currency;
    if (isPegged(currency) && currency !== "NPR") {
      setRateHistory([]);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase
          .from("exchange_rates")
          .select("date, rate_to_usd")
          .eq("currency", qccy)
          .lte("date", todayISO())
          .order("date", { ascending: false })
          .limit(7);
        if (cancelled) return;
        const rows = (data ?? []) as { date: string; rate_to_usd: string | number }[];
        rows.reverse();
        setRateHistory(
          rows.map((r) => ({
            date: r.date,
            rate: Number(r.rate_to_usd) / (currency === "NPR" ? 1.6 : 1),
          })),
        );
      } catch {
        /* no history — popover shows the fallback note */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rateOpen, currency, supabase]);

  // ── Budget impact (rail): spend booked in the current cycle, display ccy. ──
  const cycleWindow = useMemo(
    () =>
      getCycleWindow(
        new Date(),
        profile?.cycle_start_day ?? 1,
        profile?.cycle_end_day ?? null,
      ),
    [profile?.cycle_start_day, profile?.cycle_end_day],
  );
  const [cycleRows, setCycleRows] = useState<
    { id: string; amount: number; currency: string; date: string; exchange_rate_to_usd: number | null }[]
  >([]);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from("expenses")
          .select("id, amount, currency, date, exchange_rate_to_usd")
          .eq("user_id", userId)
          .eq("type", "expense")
          .is("deleted_at", null)
          .gte("date", toISODate(cycleWindow.start))
          .lte("date", toISODate(cycleWindow.end));
        if (!cancelled) setCycleRows((data ?? []) as typeof cycleRows);
      } catch {
        /* impact line just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase, cycleWindow]);
  const rowConverter = useRowConverter(displayCurrency, cycleRows);
  const cycleSpent = useMemo(
    () =>
      cycleRows
        .filter((r) => r.id !== existing?.id)
        .reduce((sum, r) => sum + rowConverter.convert(r), 0),
    [cycleRows, rowConverter, existing?.id],
  );

  // ── §8 Receipt state: new file (deferred until save) or stored path. ──
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingPath, setExistingPath] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);

  const onPickFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      const invalid = validateReceiptFile(f);
      if (invalid) {
        showToast(invalid, "error");
        return;
      }
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(f);
      });
      setReceiptFile(f);
      setRemoveExisting(false);
    },
    [showToast],
  );

  // Paste-to-attach (web addition to the APK's Snap/Pick pair).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      const image = files.find((f) => f.type.startsWith("image/"));
      if (image) onPickFile(image);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPickFile]);

  const clearReceipt = () => {
    if (receiptFile) {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setReceiptFile(null);
    } else if (existingPath) {
      setRemoveExisting(true);
    }
  };

  const showNewReceipt = receiptFile != null;
  const showExistingReceipt = !showNewReceipt && !!existingPath && !removeExisting;

  const numericAmount = Number(amount) || 0;
  const selectedAccount = accounts.find((a) => a.id === bankAccountId) ?? null;

  // ── Balance-after-save preview + pre-emptive warning (rail impact line). ──
  const [afterSaveBalance, setAfterSaveBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!selectedAccount || !(numericAmount > 0)) {
      setAfterSaveBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Mobile guard parity: convert at the historical date rate (no row
        // snapshot forced), in the account's own currency.
        let next = balances.get(selectedAccount.id) ?? 0;
        if (existing && existing.bank_account_id === selectedAccount.id) {
          next += await convert(
            supabase,
            Number(existing.amount),
            existing.currency,
            selectedAccount.currency,
            existing.date,
          );
        }
        const entry = await convert(supabase, numericAmount, currency, selectedAccount.currency, date);
        if (!cancelled) setAfterSaveBalance(flowType === "income" ? next + entry : next - entry);
      } catch {
        if (!cancelled) setAfterSaveBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAccount, numericAmount, flowType, currency, date, balances, existing, usdPerUnit, supabase]);

  // ── Validation (zod-schema parity with the mobile form) ──
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1_000_000_000_000) {
      next.amount = t("amountRequired");
    }
    if (!categoryId) next.category = t("categoryRequired");
    const maxISO = addDaysISO(todayISO(), 1);
    if (date < "2000-01-01" || date > maxISO) next.date = t("dateRangeError");
    return next;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.amount) amountRef.current?.focus();
      else if (next.category)
        categoryCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (next.date) dateCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!userId) return;
    // Below the rail breakpoint there is no live preview on the page, so
    // Save first pops the record preview as a review sheet: Done commits,
    // Back returns to the form. Desktop (rail always visible) saves direct.
    if (!isDesktop) {
      setReviewOpen(true);
      return;
    }
    await performSave();
  };

  const performSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // Insufficient-balance guard (APK submit parity): expense + linked
      // account only; compared in the ACCOUNT's currency at historical rates;
      // income always adds money and skips the guard.
      if (flowType === "expense" && selectedAccount && balances.has(selectedAccount.id)) {
        const required = await convert(supabase, numericAmount, currency, selectedAccount.currency, date);
        let available = balances.get(selectedAccount.id) ?? 0;
        if (existing && existing.bank_account_id === selectedAccount.id && existing.type === "expense") {
          available += await convert(
            supabase,
            Number(existing.amount),
            existing.currency,
            selectedAccount.currency,
            existing.date,
          );
        }
        if (required > available + 1e-9) {
          setReviewOpen(false);
          setInsufficient({
            accountName: selectedAccount.name,
            required,
            available,
            shortfall: required - available,
            currency: selectedAccount.currency,
          });
          setSaving(false);
          return;
        }
      }

      const payload = {
        categoryId,
        amount: numericAmount,
        currency,
        type: flowType,
        description: description.trim() || null,
        date,
        time: timeString,
        paymentMethod,
        notes: notes.trim() || null,
        bankAccountId: bankAccountId || null,
        snapshotDate: snapshotDate && snapshotDate !== date ? snapshotDate : null,
      };
      // ── Pay-from-plan path (mobile §6): book the rule's open slot with the
      //    FORM's values (a corrected price wins and self-updates the rule),
      //    then the chain re-anchors from THIS payment date. The row is
      //    written inside the service, so the generic save and the deferred
      //    receipt are skipped — the receipt is uploaded FIRST and rides in
      //    with the installment.
      if (payPlan) {
        let planReceiptUrl: string | null = null;
        if (receiptFile) {
          planReceiptUrl = await uploadReceipt(supabase, userId, receiptFile).catch(() => null);
        }
        const paid = await payPlanFromForm(supabase, userId, payPlan.id, {
          amount: numericAmount,
          category_id: categoryId,
          currency,
          description: description.trim() || null,
          notes: notes.trim() || null,
          date,
          time: timeString || null,
          payment_method: paymentMethod,
          bank_account_id: bankAccountId || null,
          receipt_image_url: planReceiptUrl,
        });
        refreshExpenses();
        showToast(
          `${t("recurring_marked_paid")} · ${t("recurring_next_due_short")} ` +
            new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
              new Date(`${paid.nextDue}T00:00:00`),
            ) +
            (paid.lateDays > 0 ? ` · ${t("recurring_late_days")} ${paid.lateDays}d` : ""),
          "success",
        );
        router.push("/overview");
        router.refresh();
        return;
      }

      let rowId: string;
      if (existing) {
        const updated = await updateExpense(supabase, userId, existing.id, payload);
        rowId = updated.id;
      } else {
        const created = await createExpense(supabase, { userId, ...payload });
        rowId = created.id;
      }

      // Deferred receipt upload (mobile parity): the row exists first, the
      // object follows; a failed upload never loses the entry.
      if (receiptFile) {
        try {
          const path = await uploadReceipt(supabase, userId, receiptFile);
          await setExpenseReceipt(supabase, userId, rowId, path);
          if (existingPath) await deleteReceipt(supabase, userId, existingPath);
        } catch (err) {
          showToast(
            err instanceof Error ? `${err.message} — ${t("entrySaved")}` : "Receipt upload failed",
            "error",
          );
        }
      } else if (removeExisting && existingPath) {
        try {
          await setExpenseReceipt(supabase, userId, rowId, null);
          await deleteReceipt(supabase, userId, existingPath);
        } catch {
          // path stays; RLS-scoped, harmless
        }
      }

      refreshExpenses();
      showToast(t("saved"), "success");
      router.push("/overview");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    } finally {
      setSaving(false);
    }
  };

  // Rule-linked rows get the three-way delete (mobile requestDelete):
  // *payment_only* deletes just this installment; *plan_too* also pauses the
  // plan (future slots stop). Plain rows delete immediately after confirm.
  const onDelete = async (mode: "plain" | "payment_only" | "plan_too" = "plain") => {
    if (!existing || !userId) return;
    setConfirmDelete(false);
    setConfirmPlanDelete(false);
    try {
      await softDeleteExpense(supabase, userId, existing.id);
      if (mode === "plan_too" && existing.recurring_rule_id && userId) {
        await updateRecurringRule(supabase, existing.recurring_rule_id, { isActive: false }, userId);
      }
      refreshExpenses();
      showToast(t("bin_moved_toast"), "success");
      router.push("/overview");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("error"), "error");
    }
  };

  // ── Dirty tracking for the Cancel confirm: baseline is captured once,
  //    after the edit row has hydrated (immediately for a new entry). ──
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (loadingExisting) return;
    const id = window.setTimeout(() => {
      setBaseline(
        JSON.stringify({
          flowType,
          amount,
          currency,
          categoryId,
          description,
          date,
          timeString,
          paymentMethod,
          bankAccountId,
          notes,
          planPicking: payPlan?.id ?? null,
          snapshotDate,
          hasNewReceipt: receiptFile != null,
          removeExisting,
        }),
      );
    }, 0);
    return () => window.clearTimeout(id);
    // Re-capture after async auto-defaults land (first category, default
    // account, profile currency, seeded time) so a fresh form never reads dirty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingExisting, existing, visibleCategories.length, accounts.length, timeSet]);
  const dirty =
    baseline != null &&
    JSON.stringify({
      flowType,
      amount,
      currency,
      categoryId,
      description,
      date,
      timeString,
      paymentMethod,
      bankAccountId,
      notes,
      planPicking: payPlan?.id ?? null,
      snapshotDate,
      hasNewReceipt: receiptFile != null,
      removeExisting,
    }) !== baseline;

  // ── Time input handlers (APK §5 24h auto-convert) ──
  const handleHourInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) {
      setHour("");
      return;
    }
    let n = Number(digits);
    if (digits.length === 1 && n === 0) n = 1;
    if (n >= 13 && n <= 23) {
      setHour(String(n - 12));
      setAmpm("PM");
      setTimeSet(true);
      minuteRef.current?.focus();
      minuteRef.current?.select();
      return;
    }
    if (n === 24) {
      setHour("12");
      setAmpm("AM");
      setTimeSet(true);
      minuteRef.current?.focus();
      return;
    }
    if (n > 12) n = Number(digits[0]);
    setHour(String(n));
    setTimeSet(true);
    if (digits.length === 2 || n > 1) {
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };
  const handleMinuteInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) {
      setMinute("");
      return;
    }
    setMinute(String(Math.min(Number(digits), 59)));
    setTimeSet(true);
  };
  const setNow = () => {
    const now = new Date();
    const h24 = now.getHours();
    setAmpm(h24 >= 12 ? "PM" : "AM");
    setHour(String(h24 % 12 === 0 ? 12 : h24 % 12));
    setMinute(String(now.getMinutes()).padStart(2, "0"));
    setTimeSet(true);
  };
  // Seed "now" on a fresh entry, like the APK's currentFormattedTime().
  const seededTime = useRef(false);
  useEffect(() => {
    if (expenseId || seededTime.current) return;
    seededTime.current = true;
    setNow();
  }, [expenseId]);

  if (loadingExisting) {
    return <p className="text-sm text-text-muted">{t("loading")}</p>;
  }

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const accentBorder = flowType === "income" ? "border-income" : "border-danger";
  const accentText = flowType === "income" ? "text-income" : "text-danger";
  const quickTags = flowType === "income" ? INCOME_QUICK_TAGS : EXPENSE_QUICK_TAGS;
  const entryMoney = numericAmount > 0 ? formatMoney(numericAmount, currency, locale) : null;
  const signedMoney = entryMoney ? `${flowType === "income" ? "+ " : "- "}${mask(entryMoney)}` : null;
  const errorList = Object.values(errors);

  // FX detail line — the record's snapshot row, live (spec §2).
  const fxLine =
    usdPerUnit != null
      ? `1 ${currency} = ${usdPerUnit.toFixed(6)} USD` +
        (currency !== "USD" && numericAmount > 0
          ? ` · ${t("baseApprox")} ${mask(formatMoney(numericAmount * usdPerUnit, "USD", locale))}`
          : "") +
        ` · ${t("snapshot")} ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(`${effectiveSnapshot}T00:00:00`),
        )}${effectiveSnapshot === todayISO() ? ` · ${t("today").toLowerCase()}` : ""}` +
        ` · ${t("basis")} USD`
      : null;

  // Budget add-line: the new entry converted into display currency, if in cycle.
  const entryInCycle =
    date >= toISODate(cycleWindow.start) && date <= toISODate(cycleWindow.end);
  const entryDisplay =
    rateToDisplay != null && numericAmount > 0
      ? quantizeMoney(numericAmount * rateToDisplay, displayCurrency)
      : null;

  const railPreview: RailPreview = {
    flowType,
    category: {
      name: selectedCategory?.name ?? null,
      icon: selectedCategory ? categoryGlyph(selectedCategory.icon) : null,
      color: selectedCategory?.color ?? null,
    },
    signedAmount: signedMoney,
    fx:
      currency === displayCurrency || currency === "USD"
        ? null
        : { text: fxLine ?? "", pending: fxPending || !fxLine },
    account: selectedAccount
      ? {
          name: selectedAccount.name,
          type: selectedAccount.account_type,
          icon: accountGlyph(selectedAccount.icon, selectedAccount.account_type),
        }
      : null,
    paymentMethod,
    recurrence:
      existing?.recurring_rule_id
        ? t("generatedByRule")
        : payPlan
          ? `${t("expense_pay_from_plan")} · ${t("recurring_slot_due")} ${payPlan.next_due_date}`
          : t("oneOffEntry"),
    description: description.trim(),
    dateLabel:
      new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
        new Date(`${date}T00:00:00`),
      ) +
      (timeString
        ? ` · ${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
            new Date(`${date}T${timeString}`),
          )}`
        : ""),
    notes: mask(notes.trim()),
    hasReceipt: showNewReceipt || showExistingReceipt,
    budget:
      budget != null && budget > 0
        ? {
            spent: mask(formatMoney(cycleSpent, displayCurrency, locale)),
            added:
              flowType === "expense" && entryInCycle && entryDisplay != null && entryDisplay > 0
                ? mask(formatMoney(entryDisplay, displayCurrency, locale))
                : null,
            limit: mask(formatMoney(budget, displayCurrency, locale)),
            pct: Math.round(((cycleSpent + (entryInCycle && flowType === "expense" ? entryDisplay ?? 0 : 0)) / budget) * 100),
            remaining: mask(
              formatMoney(
                budget - (cycleSpent + (entryInCycle && flowType === "expense" ? entryDisplay ?? 0 : 0)),
                displayCurrency,
                locale,
              ),
            ),
          }
        : null,
    afterSave:
      selectedAccount && afterSaveBalance != null
        ? {
            label: `${selectedAccount.name} · ${t("afterSave")}`,
            value: mask(formatMoney(afterSaveBalance, selectedAccount.currency, locale)),
            negative: afterSaveBalance < 0,
            icon: accountGlyph(selectedAccount.icon, selectedAccount.account_type),
          }
        : null,
    meta: {
      ref: existing ? existing.id.slice(0, 8).toUpperCase() : null,
      recorded: existing
        ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(existing.created_at),
          )
        : null,
      edited:
        existing && existing.updated_at !== existing.created_at
          ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
              new Date(existing.updated_at),
            )
          : null,
    },
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="pb-28">
      {/* ══ Header bar (app pattern: round close + kicker/title, type-aware) ══ */}
      <header className="mb-5 flex items-start gap-3">
        <Link
          href="/overview"
          aria-label={t("cancel")}
          className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-muted transition hover:border-text-muted hover:text-text active:opacity-70"
        >
          <X size={16} />
        </Link>
        <div>
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-text-muted">
            {t("transactionEntry")}
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-text">
            {existing
              ? t(flowType === "income" ? "editIncome" : "editExpense")
              : t(flowType === "income" ? "addIncome" : "addExpense")}
          </h1>
          {existing && (
            <p className="stamp mt-1">
              {t("recordRef")} {existing.id.slice(0, 8).toUpperCase()} · {t("recorded")}{" "}
              <span className="numeric">
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(existing.created_at),
                )}
              </span>
            </p>
          )}
        </div>
      </header>

      <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:gap-5">
        {/* ══════════ Form column ══════════ */}
        {/* min-w-0: without it the single-column grid track inflates to the
            widest un-shrinkable child (quick-tag strip ≈570px intrinsic min),
            pushing the whole page into horizontal scroll on phones. */}
        <div className="order-2 min-w-0 space-y-4 min-[900px]:order-1">
          {/* ══ 1+2. Type toggle + hero amount & currency — one card ══ */}
          <section className={`panel border-2 ${accentBorder}`}>
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-1 border border-border bg-surface p-1">
                {(["expense", "income"] as FlowType[]).map((type) => {
                  const active = flowType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => switchType(type)}
                      aria-pressed={active}
                      className={`flex h-9 items-center justify-center text-[11px] font-bold uppercase tracking-[0.06em] transition active:scale-[0.99] ${
                        active
                          ? type === "income"
                            ? "bg-income text-white"
                            : "bg-danger text-white"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {t(type)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="caps pt-1">
                  {t(flowType === "income" ? "enterIncomeAmount" : "enterExpenseAmount")}
                </p>
                <div className="relative" data-popover-host>
                  <button
                    type="button"
                    onClick={() => setCurrencyOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={currencyOpen}
                    className="flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface-elevated px-3 text-xs font-extrabold text-text transition hover:border-primary"
                  >
                    {CURRENCY_DETAILS[currency].symbol} {currency}
                    <ChevronDown size={12} />
                  </button>
                  {currencyOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 top-9 z-30 max-h-[300px] w-56 overflow-auto border border-border bg-surface-elevated shadow-lg"
                    >
                      {CURRENCIES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="option"
                          aria-selected={currency === c}
                          onClick={() => {
                            setCurrency(c);
                            currencyManuallySelected.current = true;
                            setCurrencyOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface ${
                            currency === c ? "bg-primary/10 font-bold text-primary" : "text-text"
                          }`}
                        >
                          <span>
                            <span className="font-bold">{c}</span>{" "}
                            <span className="text-text-muted">{CURRENCY_DETAILS[c].label}</span>
                          </span>
                          <span className="font-bold">{CURRENCY_DETAILS[c].symbol}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-1 flex items-baseline justify-center gap-1">
                <span className={`text-2xl font-extrabold ${accentText}`} aria-hidden>
                  {CURRENCY_DETAILS[currency].symbol}
                </span>
                <input
                  ref={amountRef}
                  id="expense-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus={!expenseId}
                  placeholder="0"
                  aria-label={t("amount")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  className={`figures w-full max-w-[240px] border-b-2 bg-transparent pb-1 text-center text-[38px] font-bold leading-none text-text placeholder:text-faint/50 focus:outline-none ${
                    errors.amount ? "border-danger" : "border-transparent focus:border-primary"
                  }`}
                />
                {amount !== "" && (
                  <button
                    type="button"
                    onClick={() => setAmount("")}
                    aria-label={t("clear")}
                    className="p-1 text-faint transition-colors hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {errors.amount && <p className="mt-2 text-center text-xs font-bold text-danger">{errors.amount}</p>}

              {/* Quick increments + keypad toggle */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() =>
                      setAmount((a) => String(Math.round(((Number(a) || 0) + q) * 100) / 100))
                    }
                    className="h-8 border border-border bg-surface px-2.5 text-xs font-bold text-text-muted transition hover:border-primary hover:text-primary active:scale-[0.97]"
                  >
                    +{formatMoney(q, currency, locale)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={toggleKeypad}
                  aria-pressed={keypadOpen}
                  aria-label={t("keypad")}
                  className={`flex h-8 w-8 items-center justify-center border transition active:scale-[0.97] ${
                    keypadOpen
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-text-muted hover:text-text"
                  }`}
                >
                  <Calculator size={14} />
                </button>
              </div>
              {keypadOpen && <AmountKeypad amount={amount} onChange={setAmount} />}
            </div>
          </section>

          {/* ══ 2.5 PAY FROM PLAN (mobile §6): a quiet dashed pill under the
              amount hero, add-mode expenses only. Selecting a plan auto-fills
              amount / category / currency / description / channel and sets the
              date to today; saving books the plan's open slot with the FORM's
              values and re-anchors the chain from this payment date. ══ */}
          {!expenseId && flowType === "expense" && plans.length > 0 && (
            <section className={`panel ${payPlan ? "border-2 border-primary/50" : "border-2 border-dashed"}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <button
                  type="button"
                  onClick={() => setPlanRowOpen((o) => !o)}
                  aria-expanded={planRowOpen}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors ${
                    payPlan ? "text-primary" : "text-text-muted hover:text-text"
                  }`}
                >
                  <Repeat size={13} className="shrink-0" />
                  <span className="truncate">
                    {payPlan
                      ? `${payPlan.description?.trim() || payPlan.categories?.name || t("recurring")} · ${t("recurring_slot_due")} ${payPlan.next_due_date}`
                      : `${t("expense_pay_from_plan")} (${plans.length})`}
                  </span>
                  <ChevronDown size={13} className={`shrink-0 transition-transform ${planRowOpen ? "rotate-180" : ""}`} />
                </button>
                {payPlan && (
                  <button
                    type="button"
                    onClick={() => setPayPlan(null)}
                    className="inline-flex shrink-0 items-center gap-1 border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-text-muted transition-colors hover:border-danger/50 hover:text-danger"
                  >
                    <X size={10} /> {t("expense_plan_change")}
                  </button>
                )}
              </div>
              {planRowOpen && (
                <div className="border-t border-border/60 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap gap-1.5">
                    {[...(payPlan ? [payPlan] : []), ...plans.filter((r) => r.id !== payPlan?.id)]
                      .slice(0, 6)
                      .map((rule) => {
                        const sel = payPlan?.id === rule.id;
                        const chip = planSlotChip(rule);
                        return (
                          <button
                            key={rule.id}
                            type="button"
                            onClick={() => handleSelectPlan(rule)}
                            className={`flex items-center gap-2 border px-2.5 py-1.5 text-xs transition ${
                              sel
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-text-muted hover:border-primary hover:text-text"
                            }`}
                          >
                            <span aria-hidden>{rule.categories?.icon || "🔁"}</span>
                            <span className="max-w-[140px] truncate font-bold">
                              {rule.description?.trim() || rule.categories?.name || t("recurring")}
                            </span>
                            <span className="numeric">{formatMoney(Number(rule.amount), rule.currency, locale)}</span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wide ${
                                chip.tone === "danger" ? "text-danger" : chip.tone === "primary" ? "text-primary" : "text-faint"
                              }`}
                            >
                              {chip.label}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                  <p className="stamp mt-2">
                    {payPlan ? t("expense_plan_autofill_note") : t("expense_plan_fills_hint")}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ══ 3. CATEGORY — APK circle-row card (icon circles + ▦ All) ═ */}
          <div ref={categoryCardRef}>
            <section className="panel">
              <div className="space-y-2 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-text">
                    <Tag size={16} className="shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {t(flowType === "income" ? "incomeCategory" : "expenseCategory")}
                    </span>
                  </p>
                  {selectedCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setCatToEdit(selectedCategory);
                        setCatModalOpen(true);
                      }}
                      className="flex shrink-0 items-center gap-[5px] rounded-full border border-border bg-surface-elevated px-2 py-[3px] text-[11px] font-bold text-primary transition hover:border-primary"
                    >
                      {(() => {
                        const G = categoryGlyph(selectedCategory.icon);
                        return <G size={13} className="text-primary" aria-hidden />;
                      })()}
                      {t("editCategory")}
                      <Pencil size={11} aria-hidden />
                    </button>
                  )}
                </div>

                <div className="relative" data-popover-host>
                <div ref={catFit.ref} className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {categoryRow.slice(0, catFit.count).map((c) => {
                    const G = categoryGlyph(c.icon);
                    const active = categoryId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(c.id);
                          setCatOpen(false);
                        }}
                        aria-pressed={active}
                        className="flex w-[60px] shrink-0 flex-col items-center gap-[5px]"
                      >
                        <span
                          className={`grid h-[46px] w-[46px] place-items-center rounded-full border bg-surface-elevated transition ${
                            active
                              ? "border-2 border-primary bg-primary/10"
                              : "border-border"
                          }`}
                        >
                          <G size={20} className={active ? "text-primary" : "text-text"} aria-hidden />
                        </span>
                        <span
                          className={`w-[60px] truncate text-center text-[10.5px] leading-4 ${
                            active
                              ? "font-extrabold text-primary"
                              : "font-semibold text-text-muted"
                          }`}
                        >
                          {c.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setCatOpen((o) => !o);
                      setCatSearch("");
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={catOpen}
                    className="flex w-[60px] shrink-0 flex-col items-center gap-[5px]"
                  >
                    <span
                      className={`grid h-[46px] w-[46px] place-items-center rounded-full border-[1.6px] border-dashed transition ${
                        catOpen
                          ? "border-primary bg-primary/[0.06] text-primary"
                          : "border-text-muted text-text-muted"
                      }`}
                    >
                      <LayoutGrid size={18} aria-hidden />
                    </span>
                    <span
                      className={`w-[60px] text-center text-[10.5px] font-extrabold leading-4 ${
                        catOpen ? "text-primary" : "text-text-muted"
                      }`}
                    >
                      {t("expense_all")}
                    </span>
                  </button>
                </div>

                {catOpen && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 border border-border bg-surface-elevated shadow-lg">
                    {visibleCategories.length > 10 && (
                      <div className="border-b border-border p-2">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                          <input
                            autoFocus
                            type="search"
                            value={catSearch}
                            onChange={(e) => setCatSearch(e.target.value)}
                            placeholder={t("searchCategories")}
                            className="h-9 w-full border border-border bg-input pl-8 pr-2 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    )}
                    <ul className="max-h-[300px] overflow-auto py-1" role="listbox">
                      {visibleCategories
                        .filter((c) => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()))
                        .map((c) => {
                          const G = categoryGlyph(c.icon);
                          const active = categoryId === c.id;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setCategoryId(c.id);
                                  setCatOpen(false);
                                }}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface ${
                                  active ? "bg-primary/10 font-bold text-text" : "text-text"
                                }`}
                              >
                                <G size={16} style={{ color: c.color }} />
                                {c.name}
                                {active && <Check size={14} className="ml-auto text-primary" />}
                              </button>
                            </li>
                          );
                        })}
                      {visibleCategories.filter((c) =>
                        c.name.toLowerCase().includes(catSearch.trim().toLowerCase()),
                      ).length === 0 && (
                        <li className="px-3 py-3 text-center text-xs italic text-faint">
                          {t("noCategories")}
                        </li>
                      )}
                    </ul>
                    <div className="flex gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCatToEdit(null);
                          setCatModalOpen(true);
                          setCatOpen(false);
                        }}
                        className="flex flex-1 items-center justify-center gap-1.5 border border-dashed border-border py-2 text-xs font-bold text-text-muted transition hover:border-primary hover:text-primary"
                      >
                        <Plus size={13} /> {t("addNewCategory")}
                      </button>
                      {/* APK "Edit Category" pill — opens the same modal on the
                          current pick (create mode when nothing is selected). */}
                      <button
                        type="button"
                        onClick={() => {
                          setCatToEdit(selectedCategory ?? null);
                          setCatModalOpen(true);
                          setCatOpen(false);
                        }}
                        className="flex items-center justify-center gap-1.5 border border-border bg-surface-elevated px-3 py-2 text-xs font-bold text-primary transition hover:border-primary"
                      >
                        <Pencil size={11} /> {t(selectedCategory ? "catModalEdit" : "catModalNew")}
                      </button>
                    </div>
                  </div>
                )}
                {errors.category && (
                  <p className="mt-2 text-xs font-bold text-danger">{errors.category}</p>
                )}
                </div>
              </div>
            </section>
          </div>

          {/* ══ 4. BANK ACCOUNT / WALLET — APK circle-row card ══ */}
          <div ref={accountCardRef}>
            <section className="panel">
              <div className="space-y-2 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-text">
                    <Wallet size={16} className="shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{t("bankAccountWallet")}</span>
                  </p>
                  {selectedAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccToEdit(selectedAccount);
                        setAccModalOpen(true);
                      }}
                      className="flex shrink-0 items-center gap-[5px] rounded-full border border-border bg-surface-elevated px-2 py-[3px] text-[11px] font-bold text-primary transition hover:border-primary"
                    >
                      {(() => {
                        const G = accountGlyph(selectedAccount.icon, selectedAccount.account_type);
                        return <G size={13} className="text-primary" aria-hidden />;
                      })()}
                      {t("manageAccount")}
                      <Pencil size={11} aria-hidden />
                    </button>
                  )}
                </div>

                <div className="relative" data-popover-host>
                <div ref={accFit.ref} className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {accountRow.slice(0, accFit.count).map((a) => {
                    const G = accountGlyph(a.icon, a.account_type);
                    const active = bankAccountId === a.id;
                    const accent = a.color || "var(--sf-primary)";
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setBankAccountId(a.id);
                          setAccOpen(false);
                        }}
                        aria-pressed={active}
                        className="flex w-[60px] shrink-0 flex-col items-center gap-[5px]"
                      >
                        <span
                          className={`grid h-[46px] w-[46px] place-items-center rounded-full border bg-surface-elevated transition ${
                            active ? "border-2" : "border-border"
                          }`}
                          style={
                            active
                              ? {
                                  borderColor: accent,
                                  backgroundColor: a.color
                                    ? `${a.color}18`
                                    : "color-mix(in srgb, var(--sf-primary) 10%, transparent)",
                                }
                              : undefined
                          }
                        >
                          <G
                            size={20}
                            className={active ? undefined : "text-text"}
                            style={active ? { color: accent } : undefined}
                            aria-hidden
                          />
                        </span>
                        <span
                          className={`w-[60px] truncate text-center text-[10.5px] leading-4 ${
                            active ? "font-extrabold" : "font-semibold text-text-muted"
                          }`}
                          style={active ? { color: accent } : undefined}
                        >
                          {a.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAccOpen((o) => !o)}
                    aria-haspopup="listbox"
                    aria-expanded={accOpen}
                    className="flex w-[60px] shrink-0 flex-col items-center gap-[5px]"
                  >
                    <span
                      className={`grid h-[46px] w-[46px] place-items-center rounded-full border-[1.6px] border-dashed transition ${
                        accOpen
                          ? "border-primary bg-primary/[0.06] text-primary"
                          : "border-text-muted text-text-muted"
                      }`}
                    >
                      <LayoutGrid size={18} aria-hidden />
                    </span>
                    <span
                      className={`w-[60px] text-center text-[10.5px] font-extrabold leading-4 ${
                        accOpen ? "text-primary" : "text-text-muted"
                      }`}
                    >
                      {t("expense_all")}
                    </span>
                  </button>
                </div>

                {accOpen && (
                  <div className="absolute inset-x-0 top-full z-30 mt-1 border border-border bg-surface-elevated shadow-lg">
                    <ul className="max-h-[300px] overflow-auto py-1" role="listbox">
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={!bankAccountId}
                          onClick={() => {
                            setBankAccountId("");
                            setAccOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm italic transition hover:bg-surface ${
                            !bankAccountId ? "bg-primary/10 font-bold" : "text-text-muted"
                          }`}
                        >
                          {t("notTracked")}
                        </button>
                      </li>
                      {[...accounts]
                        .sort((a, b) => (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0))
                        .map((a) => {
                          const G = accountGlyph(a.icon, a.account_type);
                          const active = bankAccountId === a.id;
                          const live = balances.get(a.id);
                          return (
                            <li key={a.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setBankAccountId(a.id);
                                  setAccOpen(false);
                                }}
                                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface ${
                                  active ? "bg-primary/10" : ""
                                }`}
                              >
                                <G size={16} style={{ color: a.color }} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold text-text">{a.name}</span>
                                  <span className="block text-[10px] text-faint">
                                    {t("live")}{" "}
                                    {live != null ? (
                                      <span className={live < 0 ? "font-bold text-danger" : "font-bold text-income"}>
                                        {mask(formatMoney(live, a.currency, locale))}
                                      </span>
                                    ) : (
                                      "…"
                                    )}
                                    {" · "}
                                    {a.account_type}
                                  </span>
                                </span>
                                {active && <Check size={14} className="shrink-0 text-primary" />}
                              </button>
                            </li>
                          );
                        })}
                    </ul>
                    <Link
                      href="/accounts"
                      className="m-2 flex items-center justify-center gap-1.5 border border-dashed border-border py-2 text-xs font-bold text-text-muted transition hover:border-primary hover:text-primary"
                    >
                      <Plus size={13} /> {t("addNewAccount")}
                    </Link>
                  </div>
                )}
                </div>
              </div>
            </section>
          </div>

          {/* ══ 5+6. Date & time + payment channel — one card ══ */}
          <div ref={dateCardRef}>
            <section className="panel">
              <div className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                <div className="min-w-[150px] flex-1">
                  <DateField
                    label={t("date")}
                    required
                    value={date}
                    min="2000-01-01"
                    max={addDaysISO(todayISO(), 1)}
                    error={errors.date ?? null}
                    onChange={setDate}
                  />
                </div>
                <div className="min-w-[160px] flex-1">
                  <p className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                      <Clock size={10} className="mr-1 inline" aria-hidden />
                      {t("time")}
                    </span>
                    <button
                      type="button"
                      onClick={setNow}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-text-muted transition hover:text-primary sm:hidden"
                    >
                      <RotateCcw size={11} /> {t("now")}
                    </button>
                  </p>
                  <div className="flex h-11 w-full items-center gap-1.5 border border-border bg-surface-elevated px-2">
                    <input
                      ref={hourRef}
                      aria-label={t("hour")}
                      inputMode="numeric"
                      value={hour === "" ? "" : hour.padStart(2, "0")}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => handleHourInput(e.target.value)}
                      placeholder="--"
                      className="figures h-9 min-w-0 flex-1 border-b border-transparent bg-transparent text-center text-lg font-bold text-text placeholder:text-faint/40 focus:border-primary focus:outline-none"
                    />
                    <span className="text-lg font-bold text-faint" aria-hidden>:</span>
                    <input
                      ref={minuteRef}
                      aria-label={t("minute")}
                      inputMode="numeric"
                      value={minute === "" ? "" : minute.padStart(2, "0")}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => handleMinuteInput(e.target.value)}
                      onKeyDown={(e) => {
                        // APK parity: backspace on an empty minute returns to
                        // the hour box and reselects it.
                        if (e.key === "Backspace" && minute === "") {
                          e.preventDefault();
                          hourRef.current?.focus();
                          hourRef.current?.select();
                        }
                      }}
                      placeholder="--"
                      className="figures h-9 min-w-0 flex-1 border-b border-transparent bg-transparent text-center text-lg font-bold text-text placeholder:text-faint/40 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAmpm((a) => (a === "AM" ? "PM" : "AM"));
                        setTimeSet(true);
                      }}
                      className="h-9 w-11 border border-border text-xs font-extrabold transition hover:border-primary sm:w-14"
                      style={{ color: ampm === "AM" ? "var(--sf-primary)" : "var(--sf-income)" }}
                    >
                      {ampm}
                    </button>
                  </div>
                </div>
                  <button
                    type="button"
                    onClick={setNow}
                    className="hidden h-11 shrink-0 items-center gap-1.5 border border-border bg-surface px-3 text-xs font-bold uppercase tracking-wide text-text-muted transition hover:border-primary hover:text-primary sm:flex"
                  >
                    <RotateCcw size={12} /> {t("now")}
                  </button>
                </div>

                {/* Payment channel (expense only — hidden for income, APK §6) */}
                {flowType === "expense" && (
                  <div>
                    <p className="caps-faint mb-1.5 text-[10px]">{t("paymentChannel")}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_METHODS.map((m) => {
                        const Icon = METHOD_ICONS[m];
                        const active = paymentMethod === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            aria-pressed={active}
                            className={`relative flex h-11 flex-col items-center justify-center gap-0.5 border-2 text-[10px] font-bold uppercase tracking-[0.04em] transition active:scale-[0.97] sm:h-12 ${
                              active
                                ? "border-primary bg-primary/10 text-text"
                                : "border-border bg-surface-elevated text-text-muted hover:border-text-muted"
                            }`}
                          >
                            <Icon size={15} className={active ? "text-primary" : ""} />
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ══ 7. Description + quick tags + notes ══ */}
          <section className="panel">
            <div className="p-3 sm:p-4">
              <Input
                label={t("description")}
                type="text"
                maxLength={200}
                placeholder={
                  flowType === "income"
                    ? t("descPlaceholderIncome")
                    : t("descPlaceholderExpense")
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div
                className="scroll-x mt-2.5 flex gap-1.5 overflow-x-auto pb-1"
                role="group"
                aria-label={t("quickTags")}
              >
                {quickTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setDescription(tag)}
                    className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition active:scale-[0.97] ${
                      description === tag
                        ? "border-brass bg-brass-tint text-text"
                        : "border-border text-text-muted hover:text-text"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {/* Notes live here — never behind an accordion on a phone. */}
              <div className="mt-3">
                <label htmlFor="expense-notes" className="mb-1 block text-[13px] font-bold text-text-muted">
                  {t("notes")}
                </label>
                <textarea
                  id="expense-notes"
                  maxLength={2000}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t("notesOptional")}
                />
              </div>
            </div>
          </section>

          {/* ══ 7. Details (web-only collapsible: recurrence · notes · snapshot) ══ */}
          <section className="panel">
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
              className="panel-rule flex w-full items-center justify-between px-4 py-2.5 sm:px-5"
            >
              <span className="caps">{t("details")}</span>
              {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {detailsOpen && (
              <div className="space-y-4 p-4 sm:p-5">
                {/* Plans are managed ONLY on the Recurring tab (mobile §3);
                    an installment row just carries the link badge. */}
                {existing?.recurring_rule_id && (
                  <div>
                    <Link
                      href="/recurring"
                      className="stamp inline-flex items-center gap-1 font-bold text-primary hover:underline"
                    >
                      <Repeat size={11} /> {t("recurring_part_of_plan")} · {t("recurring_manage_plan")} →
                    </Link>
                  </div>
                )}
                <div>
                  {/* Rate + snapshot lock — moved out of the hero card (APK parity:
                      no FX line while typing); the record row still previews in the rail.
                      USD is the base currency — there is no rate to inspect or lock,
                      so the whole block stays hidden for USD entries. */}
                  {currency !== "USD" && (
                    <>
                  <button
                    type="button"
                    onClick={() => setRateOpen((o) => !o)}
                    aria-expanded={rateOpen}
                    className="mb-2 inline-flex items-center gap-1.5 border border-border bg-surface-elevated px-2.5 py-1.5 text-[11px] font-bold text-text-muted transition hover:border-primary hover:text-primary"
                  >
                    {fxPending
                      ? t("fxPending")
                      : usdPerUnit != null
                        ? `1 ${currency} = ${usdPerUnit.toFixed(6)} USD`
                        : t("fxUnavailable")}
                    <ChevronDown size={11} className={rateOpen ? "rotate-180" : ""} />
                  </button>
                  {rateOpen && (
                    <div className="mb-3 border border-border bg-surface-elevated p-3">
                      <p className="caps-faint mb-1.5 text-[10px]">
                        {t("rateHistory")} · {currency}
                        /USD
                      </p>
                      {isPegged(currency) && currency !== "NPR" ? (
                        <p className="stamp py-3">{t("peggedRate")}</p>
                      ) : rateHistory.length < 2 ? (
                        <p className="stamp py-3">{t("noRateHistory")}</p>
                      ) : (
                        <RateSparkline points={rateHistory} />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <DateField
                        label={t("snapshotDate")}
                        value={effectiveSnapshot}
                        min="2000-01-01"
                        max={todayISO()}
                        onChange={(v) => setSnapshotDate(v)}
                      />
                    </div>
                    {snapshotDate && (
                      <button
                        type="button"
                        onClick={() => setSnapshotDate("")}
                        className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-primary hover:underline"
                      >
                        {t("followDate")}
                      </button>
                    )}
                  </div>
                  <p className="stamp mt-1.5">{t("snapshotHelp")}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ══ 8. Receipt attach (expense only — APK §7) — one compact strip ══ */}
          {flowType === "expense" && (
            <section className="panel">
              <div className="p-3 sm:p-4">
                <input
                  ref={cameraInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                <input
                  ref={galleryInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />

                {showNewReceipt || showExistingReceipt ? (
                  <div className="flex items-center gap-3">
                    {showNewReceipt || existingUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={showNewReceipt ? previewUrl ?? "" : existingUrl ?? ""}
                        alt={t("receiptPreview")}
                        onClick={() => setViewerOpen(true)}
                        className="h-14 w-14 shrink-0 cursor-zoom-in border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-border text-[9px] font-bold uppercase text-faint">
                        {t("loading")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="caps-faint text-[10px]">{t("receiptStudio")}</p>
                      <p className="stamp truncate">
                        {showNewReceipt ? t("uploadsOnSave") : t("storedOnFile")}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 border border-income px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-income">
                      <BadgeCheck size={11} /> {t("attached")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewerOpen(true)}
                      aria-label={t("fullScreen")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center border border-border text-text-muted transition hover:border-primary hover:text-primary"
                    >
                      <ExternalLink size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={clearReceipt}
                      aria-label={t("removeReceipt")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center border border-danger/40 text-danger transition hover:bg-rust-tint"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex gap-2"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      onPickFile(
                        Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")),
                      );
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => galleryInput.current?.click()}
                      className={`flex h-12 min-w-0 flex-1 items-center gap-2 border-2 border-dashed px-3 text-xs font-bold uppercase tracking-[0.04em] transition active:scale-[0.99] ${
                        dragActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-text-muted hover:border-text-muted"
                      }`}
                    >
                      <Paperclip size={15} className="shrink-0" />
                      <span className="truncate">{t("dropReceipt")}</span>
                      <span className="ml-auto hidden shrink-0 text-[10px] font-semibold normal-case tracking-normal text-faint sm:block">
                        {t("orPaste")} · {t("receiptLimits")}
                      </span>
                    </button>
                    {hasCamera && (
                      <button
                        type="button"
                        onClick={() => cameraInput.current?.click()}
                        aria-label={t("snapCamera")}
                        className="flex h-12 w-12 shrink-0 items-center justify-center border border-border text-text-muted transition hover:border-primary hover:text-primary active:scale-[0.97]"
                      >
                        <Camera size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Inline error banner (web addition over the single APK banner) */}
          {errorList.length > 0 && (
            <div className="flex items-center gap-2 border border-danger bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger">
              <AlertCircle size={15} className="shrink-0" />
              {errorList[0]}
            </div>
          )}
        </div>

        {/* ══════════ Sticky record-preview rail — ≥900px only; below that the
             same preview appears on Save as a full review sheet ══════════ */}
        <aside className="hidden min-[900px]:order-2 min-[900px]:block">
          <div className="min-[900px]:sticky min-[900px]:top-6">
            {/* Full record sheet on the rail: header, detail rows, impact
                lines and ref stamp — the complete 1:1 record, same as the
                mobile Save review sheet. */}
            <RecordPreviewRail preview={railPreview} variant="full" />
          </div>
        </aside>
      </div>

      {/* ══ Sticky save bar (APK parity + Cancel/Ctrl+Enter) ══ */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-tab/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -8px 24px rgb(0 0 0 / 0.12)" }}
      >
        <div className="mx-auto flex max-w-[1080px] items-center gap-2 px-4 py-3 sm:gap-3">
          {existing && (
            <button
              type="button"
              onClick={() => {
                if (existing.recurring_rule_id) setConfirmPlanDelete(true);
                else setConfirmDelete(true);
              }}
              aria-label={t("deleteExpense")}
              className="flex h-12 w-12 shrink-0 items-center justify-center border border-danger/40 text-danger transition active:scale-[0.97] hover:bg-rust-tint"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (dirty) setConfirmCancel(true);
              else router.push("/overview");
            }}
            className="h-12 border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted hover:text-text"
          >
            {t("cancel")}
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="caps-faint text-[9px]">{t("total")}</p>
            <p className={`figures truncate text-lg font-bold leading-tight ${accentText}`}>
              {signedMoney ?? t("placeholderAmount")}
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className={`h-12 min-w-[170px] shrink-0 border px-5 text-sm font-bold uppercase tracking-[0.06em] text-white transition active:scale-[0.98] disabled:opacity-50 ${
              flowType === "income"
                ? "border-income bg-income hover:opacity-90"
                : "border-primary bg-primary hover:opacity-90"
            }`}
          >
            {saving
              ? t("updating")
              : existing
                ? t(flowType === "income" ? "updateIncome" : "updateExpense")
                : t(flowType === "income" ? "saveIncome" : "saveExpense")}
          </button>
        </div>
      </div>

      {/* ══ Insufficient-balance dialog (APK bottom sheet → web dialog) ══ */}
      <Modal open={!!insufficient} title={t("insufficientTitle")} onClose={() => setInsufficient(null)}>
        {insufficient && (
          <div>
            <p className="mb-4 text-sm text-text-muted">
              <span className="font-bold text-text">{insufficient.accountName}</span> ·{" "}
              {t("insufficientBody")}
            </p>
            <div className="space-y-2 border border-border bg-surface-elevated p-4 text-sm">
              <p className="flex justify-between">
                <span className="text-text-muted">{t("youAreSpending")}</span>
                <span className="numeric font-bold text-danger">
                  {mask(formatMoney(insufficient.required, insufficient.currency, locale))}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-text-muted">{t("availableBalance")}</span>
                <span className="numeric font-bold text-text">
                  {mask(formatMoney(insufficient.available, insufficient.currency, locale))}
                </span>
              </p>
              <p className="flex justify-between border-t border-border pt-2">
                <span className="text-text-muted">{t("shortBy")}</span>
                <span className="numeric font-bold text-danger">
                  {mask(formatMoney(insufficient.shortfall, insufficient.currency, locale))}
                </span>
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInsufficient(null)}
                className="h-9 border border-border px-4 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted"
              >
                {t("cancel")}
              </button>
              <Button
                type="button"
                onClick={() => {
                  setInsufficient(null);
                  accountCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setAccOpen(true);
                }}
              >
                {t("switchAccount")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Full-screen receipt viewer (APK ImageViewerModal) */}
      <Modal open={viewerOpen} title={t("receipt")} onClose={() => setViewerOpen(false)} maxWidth="max-w-2xl">
        <img
          src={showNewReceipt ? previewUrl ?? "" : existingUrl ?? ""}
          alt={t("receiptPreview")}
          className="max-h-[70vh] w-full border border-border object-contain"
        />
      </Modal>

      {/* ══ Mobile save-review sheet: the record preview with Back / Done ══ */}
      {reviewOpen && !isDesktop && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label={t("reviewBeforeSave")}
          onClick={() => setReviewOpen(false)}
        >
          <div
            className="panel max-h-[92vh] w-full overflow-auto rounded-b-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 py-2.5 backdrop-blur">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="flex h-10 items-center gap-1 border border-border px-3 text-xs font-bold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-text-muted hover:text-text"
              >
                <ChevronLeft size={14} /> {t("back")}
              </button>
              <span className="caps-faint">{t("reviewBeforeSave")}</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setReviewOpen(false);
                  void performSave();
                }}
                className={`flex h-10 min-w-[96px] items-center justify-center px-4 text-xs font-bold uppercase tracking-[0.08em] text-white transition disabled:opacity-50 ${
                  flowType === "income" ? "bg-income hover:opacity-90" : "bg-primary hover:opacity-90"
                }`}
              >
                {saving ? t("updating") : t("done")}
              </button>
            </div>
            <div className="p-3">
              <RecordPreviewRail preview={railPreview} />
            </div>
          </div>
        </div>
      )}

      {/* ══ In-form category editor (APK CategoryManageModal) ══ */}
      <CategoryManageModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        category={catToEdit}
        defaultType={flowType}
        userId={userId}
        onSaved={(cat) => {
          // APK parity: reload the list and select the created/updated pick.
          void reloadCategories().then(() => {
            if (cat) setCategoryId(cat.id);
          });
        }}
      />

      {/* ══ In-form account editor (APK "Manage Account" pill) ══ */}
      <AccountManageModal
        open={accModalOpen}
        onClose={() => setAccModalOpen(false)}
        account={accToEdit}
        onSaved={() => {
          setAccModalOpen(false);
          setAccountsReload((n) => n + 1);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteConfirmTitle")}
        body={t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onConfirm={() => void onDelete("plain")}
        onCancel={() => setConfirmDelete(false)}
      />
      {/* Rule-linked rows: three-way delete (mobile requestDelete parity). */}
      <Modal
        open={confirmPlanDelete}
        title={t("recurring_delete_title")}
        onClose={() => setConfirmPlanDelete(false)}
        maxWidth="max-w-md"
      >
        <div className="px-4 pt-4 pb-2 sm:px-5">
          <p className="text-sm text-text-muted">{t("recurring_delete_plan_question")}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setConfirmPlanDelete(false)} className="w-full sm:w-auto">
              {t("cancel")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onDelete("payment_only")} className="w-full sm:w-auto">
              {t("recurring_delete_payment_only")}
            </Button>
            <Button type="button" variant="danger" onClick={() => void onDelete("plan_too")} className="w-full sm:w-auto">
              {t("recurring_delete_plan_too")}
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmCancel}
        title={t("discardTitle")}
        body={t("discardBody")}
        confirmLabel={t("discard")}
        cancelLabel={t("keepEditing")}
        destructive
        onConfirm={() => {
          setConfirmCancel(false);
          router.push("/overview");
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </form>
  );
}

/** 7-day rate sparkline — plain SVG, theme tokens only (spec §2 popover). */
function RateSparkline({ points }: { points: { date: string; rate: number }[] }) {
  const w = 288;
  const h = 72;
  const min = Math.min(...points.map((p) => p.rate));
  const max = Math.max(...points.map((p) => p.rate));
  const span = max - min || 1;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - 8 - ((p.rate - min) / span) * (h - 16),
  ]);
  const path = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = points[points.length - 1].rate >= points[0].rate;
  return (
    <div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="7-day rate history">
        <path d={path} fill="none" stroke="var(--sf-primary)" strokeWidth={2} />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2} fill="var(--sf-primary)" />
        ))}
      </svg>
      <p className="stamp mt-1 flex justify-between">
        <span className="numeric">{min.toFixed(6)}</span>
        <span className={`inline-flex items-center gap-0.5 ${up ? "text-income" : "text-danger"}`}>
          {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {(((points[points.length - 1].rate - points[0].rate) / points[0].rate) * 100).toFixed(2)}%
        </span>
        <span className="numeric">{max.toFixed(6)}</span>
      </p>
    </div>
  );
}
