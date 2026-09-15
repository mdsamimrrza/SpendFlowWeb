"use client";

/* ── CalendarModal — 1:1 port of the mobile ui/CalendarModal.tsx, shared by
   every date input in the web app (the native browser date pickers are gone).
   Bottom sheet (rounded-t-24, 88vh max, slide-up), Calendar-icon header +
   round X, From/To banner (single mode: a centered selected-date banner),
   horizontal quick presets Today · Yesterday · Last 7 Days · This Month ·
   Last Month (range mode only), month navigator whose tappable
   "September 2026 ▾" pill opens the year-list (2000→now+1, auto-scrolled) +
   month-grid JUMP picker, Sunday-first day grid with adjacent-month days
   dimmed, teal in-range fill, 1.5px primary today ring, Reset / Apply Range
   footer (hidden in single mode — tapping a date applies and closes, exactly
   like the app).
   Manual typing (user request, 2026-09-15 — beyond the mobile app): the
   banner From/To cells AND the DateField/RangeField triggers are dd/mm/yyyy
   digit-masked inputs — slashes auto-insert, only digits are accepted, and a
   date commits live the moment it is complete and valid (grid jumps to it).
   Impossible dates (31/04, month 13, year outside 2000→next year) show an
   inline "Invalid date" error and never corrupt the calendar. ── */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLanguage } from "@/store/LanguageContext";
import { toISODate } from "@/utils/format";

/* The app renders these calendar labels in English in every language —
   mirrored exactly (ui/CalendarModal.tsx WEEKDAYS / MONTH_NAMES / YEARS). */
const CAL_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CAL_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAL_CURRENT_YEAR = new Date().getFullYear();
const CAL_YEARS = Array.from({ length: CAL_CURRENT_YEAR - 2000 + 2 }, (_, i) => 2000 + i);

export interface CalendarRange {
  from: string | null;
  to: string | null;
}

/* ── manual date entry ──
   Typeable fields use a digits-only dd/mm/yyyy mask: slashes are inserted
   automatically, anything non-numeric is dropped, and a full date is only
   committed once it parses to a real calendar day inside the picker's year
   range (2000 → next year). Incomplete text stays neutral; impossible text
   shows an inline error and never touches the grid. */

function maskDateDigits(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Evaluate masked text: { iso } when complete + valid + within bounds,
 *  { error } when complete but impossible, {} while still incomplete. */
function evalMasked(v: string, min?: string, max?: string): { iso?: string; error?: boolean } {
  const digits = v.replace(/\D/g, "");
  if (digits.length < 8) return {};
  const d = +digits.slice(0, 2);
  const mo = +digits.slice(2, 4);
  const y = +digits.slice(4, 8);
  if (y < 2000 || y > CAL_CURRENT_YEAR + 1) return { error: true };
  if (mo < 1 || mo > 12) return { error: true };
  const dt = new Date(y, mo - 1, d);
  // Round-trip rejects impossible days (31/04, 30/02, non-leap 29/02…).
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { error: true };
  const iso = toISODate(dt);
  if (min && iso < min) return { error: true };
  if (max && iso > max) return { error: true };
  return { iso };
}

/** YYYY-MM-DD → "29/01/2026" (the typed display form). */
function toDMY(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function CalendarModal({
  open,
  onClose,
  mode = "range",
  initial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** 'single' — picks one date (hides the From/To banner and presets).
   *  'range'  — default, full range-picker behaviour (mobile parity). */
  mode?: "single" | "range";
  initial?: { from?: string; to?: string };
  onApply: (range: CalendarRange) => void;
}) {
  const { t, locale } = useLanguage();
  const isSingle = mode === "single";

  // 'calendar' — day grid | 'monthYear' — month+year jump picker (mobile parity)
  const [view, setView] = useState<"calendar" | "monthYear">("calendar");
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Year being browsed inside the jump picker (independent of the calendar).
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const yearScrollRef = useRef<HTMLDivElement>(null);
  // Typed text in the banner cells (null = show the committed date).
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [toDraft, setToDraft] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFrom(initial?.from || "");
      setTo(initial?.to || "");
      const base = initial?.from ? new Date(`${initial.from}T00:00:00`) : new Date();
      setAnchor({ y: base.getFullYear(), m: base.getMonth() });
      setPickerYear(base.getFullYear());
      setView("calendar");
      setFromDraft(null);
      setToDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Scroll the year list to the selected year each time the picker opens
  // (mobile: each year row is 44px tall; position it near the top).
  useEffect(() => {
    if (open && view === "monthYear" && yearScrollRef.current) {
      const idx = CAL_YEARS.indexOf(pickerYear);
      if (idx >= 0) yearScrollRef.current.scrollTop = Math.max(0, idx * 44 - 44);
    }
  }, [open, view, pickerYear]);

  if (!open || typeof document === "undefined") return null;

  const first = new Date(anchor.y, anchor.m, 1);
  const startPad = first.getDay(); // Sunday-first grid (mobile WEEKDAYS Su–Sa)
  const daysInMonth = new Date(anchor.y, anchor.m + 1, 0).getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(anchor.y, anchor.m, 1 - startPad + i);
    return { iso: toISODate(d), inMonth: d.getMonth() === anchor.m };
  });
  const monthLabel = first.toLocaleDateString(locale, { month: "long", year: "numeric" });

  const isEdge = (iso: string) => (!!from && iso === from) || (!!to && iso === to);
  const isInRange = (iso: string) => !!from && !!to && iso > from && iso < to;
  const todayIso = toISODate(new Date());

  const jumpTo = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    // Guard the anchor: a NaN year/month would poison the navigator pill.
    if (!isNaN(d.getTime())) setAnchor({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Apply a committed (already-valid) banner date: set the side, keep the
  // range coherent, and move the grid to it.
  const applyBanner = (which: "from" | "to", iso: string) => {
    if (which === "from") {
      setFrom(iso);
      if (!to || to < iso) setTo("");
    } else if (!from || iso >= from) {
      setTo(iso);
    } else {
      setTo(from);
      setFrom(iso);
    }
    jumpTo(iso);
  };

  // Mobile handleDatePress: single mode applies immediately; range mode —
  // first tap starts, second tap ends (a day before the start restarts the
  // selection; the same day closes a one-day range).
  const pickDay = (iso: string) => {
    if (isSingle) {
      onApply({ from: iso, to: iso });
      onClose();
      return;
    }
    if (!from || (from && to)) {
      setFrom(iso);
      setTo("");
    } else if (iso < from) {
      setFrom(iso);
      setTo("");
    } else {
      setTo(iso);
    }
  };

  const shiftMonth = (d: number) =>
    setAnchor((a) => {
      const next = new Date(a.y, a.m + d, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });

  // Mobile handleQuickPreset — sets a full day range and keeps the calendar
  // on the current month (last-month preset stays on this month, like the app).
  const quick = (kind: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth") => {
    const now = new Date();
    const endOfMonthOf = (d: Date) => toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    if (kind === "today") {
      setFrom(toISODate(now));
      setTo(toISODate(now));
    } else if (kind === "yesterday") {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      setFrom(toISODate(y));
      setTo(toISODate(y));
    } else if (kind === "last7") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      setFrom(toISODate(s));
      setTo(toISODate(now));
    } else if (kind === "thisMonth") {
      setFrom(toISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(endOfMonthOf(now));
    } else {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setFrom(toISODate(prev));
      setTo(endOfMonthOf(prev));
    }
  };

  const presetItems: [kind: "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth", label: string][] = [
    ["today", t("anCalToday")],
    ["yesterday", t("anCalYesterday")],
    ["last7", t("anCalLast7")],
    ["thisMonth", t("anCalThisMonthT")],
    ["lastMonth", t("anCalLastMonthT")],
  ];

  // Masked banner cell: digits only, auto-slashes, live commit the moment the
  // date is complete + valid; impossible dates show an error and never apply.
  const bannerInput = (
    which: "from" | "to",
    committed: string,
    draft: string | null,
    setDraft: (v: string | null) => void,
  ) => {
    const shown = draft ?? (committed ? toDMY(committed) : "");
    const err = draft !== null && !!evalMasked(draft).error;
    return (
      <input
        type="text"
        inputMode="numeric"
        aria-label={which === "from" ? t("anCalFrom") : t("anCalTo")}
        aria-invalid={err || undefined}
        placeholder="dd/mm/yyyy"
        value={shown}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const masked = maskDateDigits(e.target.value);
          const st = evalMasked(masked);
          if (st.iso) {
            setDraft(null);
            applyBanner(which, st.iso);
          } else {
            setDraft(masked);
          }
        }}
        onBlur={() => setDraft(null)}
        className={`numeric w-full min-w-0 bg-transparent text-[13px] font-bold placeholder:font-normal placeholder:text-text-muted focus:outline-none ${
          err ? "text-danger" : "text-text"
        }`}
      />
    );
  };
  const bannerError =
    (!!fromDraft && !!evalMasked(fromDraft).error) || (!!toDraft && !!evalMasked(toDraft).error);

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/50" onClick={onClose} role="presentation">
      <div
        className="sf-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] w-full max-w-[440px] flex-col rounded-t-3xl border border-border bg-surface px-[18px] pb-9 pt-4"
        style={{ paddingBottom: "max(36px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isSingle ? t("anCalSelectDate") : t("anCalSelectRange")}
      >
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
          {/* ── Header ─ */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Calendar size={20} className="shrink-0 text-primary" aria-hidden />
              <span className="truncate text-lg font-extrabold text-text">
                {isSingle ? t("anCalSelectDate") : t("anCalSelectRange")}
              </span>
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated active:scale-95"
            >
              <X size={18} className="text-text" aria-hidden />
            </button>
          </div>

          {/* ── From / To banner — masked typeable cells (dd/mm/yyyy) ── */}
          {isSingle ? (
            <div className="rounded-xl border border-border bg-surface-elevated p-2.5">
              {bannerInput("from", from, fromDraft, setFromDraft)}
            </div>
          ) : (
            <div className="flex items-center rounded-xl border border-border bg-surface-elevated p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-text-muted">{t("anCalFrom")}</span>
                {bannerInput("from", from, fromDraft, setFromDraft)}
              </span>
              <span className="mx-3 h-6 w-px shrink-0 bg-border" aria-hidden />
              <span className="min-w-0 flex-1 pl-2.5">
                <span className="block text-[11px] text-text-muted">{t("anCalTo")}</span>
                {bannerInput("to", to || from, toDraft, setToDraft)}
              </span>
            </div>
          )}
          {bannerError && (
            <p className="-mt-2 text-[11px] font-bold text-danger">{t("anCalInvalidDate")}</p>
          )}

          {/* ── Quick presets (range mode only) ── */}
          {!isSingle && (
            <div className="scroll-x flex gap-1.5 overflow-x-auto py-0.5">
              {presetItems.map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => quick(kind)}
                  className="min-h-[32px] shrink-0 rounded-[14px] border border-border px-3 py-[7px] text-xs font-bold text-text transition active:scale-[0.97]"
                  style={{ backgroundColor: "var(--sf-track)" }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── Month navigator / picker header ── */}
          {view === "calendar" ? (
            <div className="flex items-center justify-between py-0.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={t("anPrevMonth")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated active:scale-95"
              >
                <ChevronLeft size={18} className="text-text" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerYear(anchor.y);
                  setView("monthYear");
                }}
                className="flex items-center gap-1 rounded-xl border border-border bg-surface-elevated px-3 py-1.5 transition active:scale-[0.98]"
              >
                <span className="text-[15px] font-extrabold text-primary">{monthLabel}</span>
                <ChevronDown size={13} className="text-primary" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={t("anNextMonth")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated active:scale-95"
              >
                <ChevronRight size={18} className="text-text" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between py-0.5">
              <button
                type="button"
                onClick={() => setView("calendar")}
                aria-label={t("anCalBack")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated active:scale-95"
              >
                <ChevronLeft size={18} className="text-text" aria-hidden />
              </button>
              <span className="text-[15px] font-extrabold text-text">{t("anCalPickMonthYear")}</span>
              <span className="w-8 shrink-0" aria-hidden />
            </div>
          )}

          {/* ── Month + year jump picker (year list · month grid) ── */}
          {view === "monthYear" && (
            <div className="flex h-[220px] overflow-hidden rounded-[14px] border border-border">
              <div ref={yearScrollRef} className="w-[76px] shrink-0 overflow-y-auto border-r border-border">
                {CAL_YEARS.map((yr) => {
                  const selected = yr === pickerYear;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setPickerYear(yr)}
                      className="flex h-11 w-full items-center justify-center text-sm transition active:scale-[0.98]"
                      style={{
                        backgroundColor: selected ? "var(--sf-jump-tint)" : "transparent",
                        color: selected ? "var(--sf-primary)" : "var(--sf-text)",
                        fontWeight: selected ? 800 : 500,
                      }}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-1 flex-wrap content-start gap-1.5 p-1.5">
                {CAL_MONTH_NAMES.map((name, idx) => {
                  const viewing = idx === anchor.m && pickerYear === anchor.y;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setAnchor({ y: pickerYear, m: idx });
                        setView("calendar");
                      }}
                      className="h-[42px] w-[30%] rounded-[10px] border text-[13px] transition active:scale-[0.97]"
                      style={{
                        backgroundColor: viewing ? "var(--sf-primary)" : "var(--sf-cell-idle)",
                        borderColor: viewing ? "var(--sf-primary)" : "var(--sf-border)",
                        color: viewing ? "#FFFFFF" : "var(--sf-text)",
                        fontWeight: viewing ? 800 : 600,
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Day grid (calendar view) ── */}
          {view === "calendar" && (
            <>
              <div className="flex py-0.5">
                {CAL_WEEKDAYS.map((wd) => (
                  <span key={wd} className="flex-1 text-center text-[11px] font-bold text-text-muted">
                    {wd}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap">
                {cells.map(({ iso, inMonth }) => {
                  const edge = isEdge(iso);
                  const inRange = !isSingle && isInRange(iso);
                  const isToday = iso === todayIso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => pickDay(iso)}
                      className="relative flex aspect-square w-[14.2857%] items-center justify-center text-[13px] transition active:scale-90"
                      style={{
                        backgroundColor: edge ? "var(--sf-primary)" : inRange ? "var(--sf-range-tint)" : "transparent",
                        borderRadius: edge ? 9999 : inRange ? 8 : 0,
                        color: edge ? "#FFFFFF" : inRange ? "var(--sf-primary)" : inMonth ? "var(--sf-text)" : "var(--sf-text-muted)",
                        fontWeight: edge || isToday ? 800 : 500,
                      }}
                    >
                      {Number(iso.slice(8, 10))}
                      {isToday && !edge && (
                        <span
                          className="pointer-events-none absolute inset-[3px] rounded-full border-[1.5px] border-primary"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Footer (range mode only; mobile hides it in single mode) ─ */}
        {!isSingle && view === "calendar" && (
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
                setFromDraft(null);
                setToDraft(null);
              }}
              className="min-h-[44px] flex-1 rounded-xl border border-border bg-surface-elevated text-sm font-bold text-text transition active:scale-[0.98]"
            >
              {t("anCalReset")}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply({ from: from || null, to: (to || from) || null });
                onClose();
              }}
              className="min-h-[44px] flex-[2] rounded-xl bg-primary text-sm font-extrabold text-white transition active:scale-[0.98]"
            >
              {t("anCalApplyRange")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function clampISO(v: string, min?: string, max?: string): string {
  if (min && v < min) return min;
  if (max && v > max) return max;
  return v;
}

/* ── DateField — a single-date input the user can TYPE (digits-only
   dd/mm/yyyy mask, live-validated) or pick via the calendar button. Same
   visual language as ui/Input: caps label, hairline box. Owns its
   CalendarModal (single mode); min/max reject out-of-range dates. ── */
export function DateField({
  label,
  value,
  onChange,
  required,
  error,
  disabled,
  min,
  max,
  className = "",
  boxClassName = "",
}: {
  label?: string;
  value: string; // YYYY-MM-DD or ""
  onChange: (iso: string) => void;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  boxClassName?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (value ? toDMY(value) : "");
  const typedError = draft !== null && !!evalMasked(draft, min, max).error;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <span className="caps mb-1.5 block">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
      )}
      <div
        className={`flex h-10 w-full items-stretch border bg-input text-sm transition focus-within:border-primary ${
          typedError || error ? "border-danger" : "border-border"
        } ${boxClassName}`}
      >
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder="dd/mm/yyyy"
          aria-invalid={typedError || undefined}
          value={shown}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const masked = maskDateDigits(e.target.value);
            const st = evalMasked(masked, min, max);
            if (st.iso) {
              setDraft(null);
              onChange(st.iso);
            } else {
              setDraft(masked);
            }
          }}
          onBlur={() => setDraft(null)}
          aria-label={label ?? t("anCalSelectDate")}
          className={`numeric min-w-0 flex-1 bg-transparent px-3 placeholder:font-normal placeholder:text-faint focus:outline-none disabled:opacity-50 ${
            typedError ? "text-danger" : "text-text"
          }`}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          aria-label={t("anCalSelectDate")}
          className="flex w-10 shrink-0 items-center justify-center border-l border-border text-text-muted transition hover:text-text active:scale-95 disabled:opacity-50"
        >
          <Calendar size={14} aria-hidden />
        </button>
      </div>
      {typedError ? (
        <p className="mt-1 text-xs font-bold text-danger">{t("anCalInvalidDate")}</p>
      ) : (
        error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>
      )}
      <CalendarModal
        open={open}
        onClose={() => setOpen(false)}
        mode="single"
        initial={{ from: value || undefined }}
        onApply={({ from }) => {
          if (from) onChange(clampISO(from, min, max));
        }}
      />
    </div>
  );
}

/* ── RangeField — a From→To pill that opens the shared range CalendarModal
   (whose banner cells are typeable). min/max clamp the applied range. ── */
export function RangeField({
  from,
  to,
  onChange,
  min,
  max,
  className = "",
  boxClassName = "",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  min?: string;
  max?: string;
  className?: string;
  boxClassName?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("anCalSelectRange")}
        className={`flex min-h-[36px] w-full items-center gap-2 border border-border bg-input px-3 text-xs text-text transition hover:border-text-muted focus:border-primary focus:outline-none ${boxClassName}`}
      >
        <Calendar size={13} className="shrink-0 text-text-muted" aria-hidden />
        <span className="numeric min-w-0 truncate">
          {from ? toDMY(from) : t("anCalFrom")}
          <span className="mx-1.5 text-faint">→</span>
          {to ? toDMY(to) : t("anCalTo")}
        </span>
      </button>
      <CalendarModal
        open={open}
        onClose={() => setOpen(false)}
        mode="range"
        initial={{ from: from || undefined, to: to || undefined }}
        onApply={(r) => {
          const f = r.from ? clampISO(r.from, min, max) : "";
          const tt = r.to ? clampISO(r.to, min, max) : "";
          onChange(f, tt);
        }}
      />
    </div>
  );
}
