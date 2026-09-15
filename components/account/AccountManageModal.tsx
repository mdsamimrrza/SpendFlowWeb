"use client";

/**
 * Account add/edit sheet — 1:1 web port of the APK's
 * components/account/AccountManageModal.tsx: centered 460px dialog with the
 * live-tinted header chip, the country dropdown (drives the bank/wallet list
 * AND the account currency), the institution dropdown with Physical Cash and
 * Custom, the amber currency-change warning on edit, account name, the
 * horizontal type pills (each wears its own color when selected), starting
 * balance + last-4 pair, the default-account checkbox card, and the
 * Create/Save button with the inline delete confirmation.
 * Flags render as the self-hosted /flags SVGs (Windows can't show emoji
 * flags); institution 🏦//💵 markers render as Lucide icons per the
 * Lucide-only rule.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  Landmark,
  PiggyBank,
  Smartphone,
  Tag,
  Trash2,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import {
  createBankAccount,
  deleteBankAccount,
  updateBankAccount,
  type BankAccountRow,
} from "@/services/bankAccounts";
import {
  COUNTRIES,
  OTHER_COUNTRY_CODE,
  WIZARD_COUNTRIES,
  countryForCurrency,
  ENABLED_COUNTRY_CODES,
} from "@/constants/countries";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import type { TranslationKey } from "@/constants/i18n/dictionaries";
import { accountGlyph } from "@/components/ui/Glyph";

type AccountType = "bank" | "wallet" | "cash" | "credit_card" | "savings" | "investment" | "other";

/** APK ACCOUNT_TYPES — labels/colors/icons byte-identical. */
const ACCOUNT_TYPES: {
  type: AccountType;
  labelKey: TranslationKey;
  icon: LucideIcon;
  iconName: string;
  defaultColor: string;
}[] = [
  { type: "bank", labelKey: "accTypeBank", icon: Landmark, iconName: "landmark", defaultColor: "#3B82F6" },
  { type: "wallet", labelKey: "accTypeWallet", icon: Smartphone, iconName: "smartphone", defaultColor: "#10B981" },
  { type: "cash", labelKey: "accTypeCash", icon: Banknote, iconName: "banknote", defaultColor: "#F59E0B" },
  { type: "credit_card", labelKey: "accTypeCard", icon: CreditCard, iconName: "credit-card", defaultColor: "#6366F1" },
  { type: "savings", labelKey: "accTypeSavings", icon: PiggyBank, iconName: "piggy-bank", defaultColor: "#EC4899" },
  { type: "investment", labelKey: "accTypeInvestment", icon: TrendingUp, iconName: "trending-up", defaultColor: "#8B5CF6" },
  { type: "other", labelKey: "accTypeOther", icon: Tag, iconName: "tag", defaultColor: "#64748B" },
];

const CASH_PRESET = { name: "Physical Cash", color: "#10B981" };
const ALL_PRESET_NAMES = new Set(
  COUNTRIES.flatMap((c) => [...c.banks.map((b) => b.name), ...c.wallets.map((w) => w.name)]),
);

function Flag({ country, size = 15 }: { country: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG
    <img
      src={`/flags/${country.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      width={Math.round((size * 4) / 3)}
      height={size}
      className="inline-block shrink-0 rounded-[2px] object-contain ring-1 ring-border/60"
    />
  );
}

/** APK ui/Select: label + trigger field + centered option sheet. */
function Select({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  options: { key: string; label: string; flag?: string; lead?: ReactNode }[];
  onChange: (key: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) ?? null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-text">
        {icon}
        {label}
      </p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-input px-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.flag ? <Flag country={selected.flag} /> : null}
          {selected?.lead ?? null}
          <span className="truncate text-[13px] font-bold text-text">
            {selected?.label ?? t("accSelectOption")}
          </span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-text-muted" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
            onClick={() => setOpen(false)}
            role="presentation"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="listbox"
              aria-label={label}
              className="sf-pop max-h-[80vh] w-full max-w-[420px] overflow-y-auto rounded-[10px] border border-border bg-surface p-1"
            >
              {options.map((o) => {
                const active = o.key === value;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.key);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 w-full items-center gap-2 px-3 text-left ${
                      active ? "bg-surface-elevated" : ""
                    }`}
                  >
                    {active ? (
                      <Check size={16} className="shrink-0 text-primary" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                    {o.flag ? <Flag country={o.flag} /> : null}
                    {o.lead ?? null}
                    <span className="min-w-0 truncate text-[13px] font-bold text-text">{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AccountManageModal({
  open,
  onClose,
  account,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit when set, create when null (APK `accountToEdit`). */
  account?: BankAccountRow | null;
  onSaved: () => void;
}) {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const supabase = getSupabaseBrowserClient();

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("bank");
  const [initialBalance, setInitialBalance] = useState("0");
  const [last4, setLast4] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [icon, setIcon] = useState("landmark");
  const [isDefault, setIsDefault] = useState(false);
  const [countryCode, setCountryCode] = useState<string>(OTHER_COUNTRY_CODE);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCountry = COUNTRIES.find((c) => c.code === countryCode) ?? null;
  const activeCurrency = (activeCountry?.currency || profile?.preferred_currency || "NPR").toUpperCase();

  useEffect(() => {
    if (!open) return;
    setShowDeleteConfirm(false);
    setError(null);
    if (account) {
      setName(account.name);
      setAccountType(account.account_type as AccountType);
      setInitialBalance(String(account.initial_balance || 0));
      setLast4(account.account_number_last4 || "");
      setColor(account.color || "#3B82F6");
      setIcon(account.icon || "landmark");
      setIsDefault(account.is_default || false);
      setCountryCode(countryForCurrency(account.currency)?.code ?? OTHER_COUNTRY_CODE);
    } else {
      setName("");
      setAccountType("bank");
      setInitialBalance("0");
      setLast4("");
      setColor("#3B82F6");
      setIcon("landmark");
      setIsDefault(false);
      const match = countryForCurrency(profile?.preferred_currency);
      setCountryCode(match && ENABLED_COUNTRY_CODES.includes(match.code) ? match.code : OTHER_COUNTRY_CODE);
    }
  }, [open, account, profile?.preferred_currency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const institutionChoices = useMemo(() => {
    const list: { key: string; label: string; name: string; color: string; type: AccountType; icon: string; lead: ReactNode }[] = [];
    if (activeCountry) {
      activeCountry.banks.forEach((b) =>
        list.push({
          key: `bank:${b.name}`,
          label: b.name,
          name: b.name,
          color: b.color,
          type: "bank",
          icon: "landmark",
          lead: <Landmark size={15} className="shrink-0 text-text-muted" aria-hidden />,
        }),
      );
      activeCountry.wallets.forEach((w) =>
        list.push({
          key: `wallet:${w.name}`,
          label: w.name,
          name: w.name,
          color: w.color,
          type: "wallet",
          icon: "smartphone",
          lead: <Smartphone size={15} className="shrink-0 text-text-muted" aria-hidden />,
        }),
      );
    }
    list.push({
      key: "cash",
      label: CASH_PRESET.name,
      name: CASH_PRESET.name,
      color: CASH_PRESET.color,
      type: "cash",
      icon: "banknote",
      lead: <Banknote size={15} className="shrink-0 text-text-muted" aria-hidden />,
    });
    return list;
  }, [activeCountry]);

  const matchedInstitution = institutionChoices.find((c) => c.name === name.trim());
  const institutionValue = matchedInstitution?.key ?? (name.trim() ? "custom" : "");

  const countryOptions = [
    ...WIZARD_COUNTRIES.map((c) => ({ key: c.code, label: c.name, flag: c.code })),
    {
      key: OTHER_COUNTRY_CODE,
      label: t("account_other_country"),
      lead: <Globe size={15} className="shrink-0 text-text-muted" aria-hidden />,
    },
  ];

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t("accNameRequired"));
      return;
    }
    if (!user) {
      setError(t("error"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const cleaned = initialBalance.replace(/[^0-9.]/g, "");
      const balanceNum = Math.max(0, parseFloat(cleaned) || 0);
      const payload = {
        name: name.trim(),
        accountType,
        currency: activeCurrency,
        country: countryCode === OTHER_COUNTRY_CODE ? null : countryCode,
        initialBalance: balanceNum,
        color,
        icon,
        last4: last4.trim() || null,
        isDefault,
      };
      if (account) await updateBankAccount(supabase, user.id, account.id, payload);
      else await createBankAccount(supabase, user.id, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!account || !user) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBankAccount(supabase, user.id, account.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setDeleting(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const currentTypeConfig = ACCOUNT_TYPES.find((a) => a.type === accountType) || ACCOUNT_TYPES[0];
  const HeaderGlyph = accountGlyph(icon, accountType);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/[0.75] p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={account ? t("accEditAccount") : t("accAddAccount")}
        className="sf-pop flex max-h-[88vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[24px] border border-border bg-surface shadow-[0_10px_18px_rgb(0_0_0/0.28)]"
      >
        {/* Header — chip wears the live account color/icon selection */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-white"
              style={{ backgroundColor: color, boxShadow: `0 2px 4px color-mix(in srgb, ${color} 35%, transparent)` }}
              aria-hidden
            >
              <HeaderGlyph size={20} className="text-white" />
            </span>
            <p className="truncate text-lg font-extrabold text-text">
              {account ? t("accEditAccount") : t("accAddAccount")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-elevated text-text-muted transition active:opacity-70"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto p-5">
          {error && (
            <div className="rounded-xl border border-[var(--sf-acc-del-line2)] bg-[var(--sf-acc-err-bg)] p-3 text-[13px] font-semibold text-danger">
              {error}
            </div>
          )}

          {/* Country — drives the bank/wallet list AND the account currency */}
          <Select
            icon={<Globe size={14} className="text-text-muted" aria-hidden />}
            label={t("account_country")}
            value={countryCode}
            options={countryOptions}
            onChange={(code) => {
              setCountryCode(code);
              if (ALL_PRESET_NAMES.has(name.trim())) setName("");
            }}
          />

          <Select
            icon={<Landmark size={14} className="text-text-muted" aria-hidden />}
            label={t("account_choose_bank")}
            value={institutionValue}
            options={[
              ...institutionChoices,
              { key: "custom", label: t("account_custom") },
            ]}
            onChange={(key) => {
              if (key === "custom") return;
              const choice = institutionChoices.find((c) => c.key === key);
              if (choice) {
                setName(choice.name);
                setAccountType(choice.type);
                setIcon(choice.icon);
                setColor(choice.color);
              }
            }}
          />

          <p className="-mt-2 text-[11px] text-text-muted">
            {t("account_currency_label")}: {activeCurrency}
          </p>

          {account && (account.currency || "").toUpperCase() !== activeCurrency && (
            <div className="space-y-1 rounded-xl border border-[var(--sf-acc-warn-line)] bg-[var(--sf-acc-warn-bg)] p-3">
              <p className="text-[13px] font-extrabold text-[var(--sf-acc-warn-ink)]">
                {t("account_currency_change_title")}
              </p>
              <p className="text-xs leading-[17px] text-text">
                {t("account_currency_change_note")} {(account.currency || "").toUpperCase()} → {activeCurrency}.
              </p>
            </div>
          )}

          {/* Account Name */}
          <label className="block space-y-1.5">
            <span className="text-[13px] font-bold text-text">{t("accNameLabel")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={t("accNamePlaceholder")}
              className="h-12 w-full rounded-[14px] border border-border bg-surface-elevated px-3.5 text-[15px] font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted focus:border-primary"
            />
          </label>

          {/* Account Type pills */}
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-text">{t("accTypeLabel")}</p>
            <div className="scroll-x flex gap-2 overflow-x-auto py-0.5">
              {ACCOUNT_TYPES.map((typeItem) => {
                const selected = accountType === typeItem.type;
                const Icon = typeItem.icon;
                return (
                  <button
                    key={typeItem.type}
                    type="button"
                    onClick={() => {
                      setAccountType(typeItem.type);
                      setIcon(typeItem.iconName);
                      setColor(typeItem.defaultColor);
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 transition active:opacity-85"
                    style={{
                      backgroundColor: selected ? typeItem.defaultColor : "var(--sf-surface-elevated)",
                      borderColor: selected ? typeItem.defaultColor : "var(--sf-border)",
                    }}
                  >
                    <Icon size={15} style={{ color: selected ? "#FFFFFF" : "var(--sf-text)" }} aria-hidden />
                    <span
                      className="text-[13px]"
                      style={{
                        fontWeight: selected ? 800 : 600,
                        color: selected ? "#FFFFFF" : "var(--sf-text)",
                      }}
                    >
                      {t(typeItem.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Starting balance + last 4 */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0 space-y-1.5">
              <span className="block truncate text-[13px] font-bold text-text">
                {t("accStartingBalance").replace("{currency}", activeCurrency)}
              </span>
              <input
                inputMode="decimal"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="h-12 w-full rounded-[14px] border border-border bg-surface-elevated px-3.5 text-[15px] font-bold text-text outline-none placeholder:font-normal placeholder:text-text-muted focus:border-primary"
              />
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className="block truncate text-[13px] font-bold text-text">{t("accLast4Label")}</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                placeholder={t("accLast4Placeholder")}
                className="h-12 w-full rounded-[14px] border border-border bg-surface-elevated px-3.5 text-[15px] font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-muted focus:border-primary"
              />
            </label>
          </div>

          {/* Default account */}
          <button
            type="button"
            onClick={() => setIsDefault(!isDefault)}
            aria-pressed={isDefault}
            className="flex w-full items-center gap-2.5 rounded-[14px] border border-border bg-surface-elevated p-3 text-left transition active:opacity-85"
          >
            <span
              className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-[1.5px] ${
                isDefault ? "border-primary bg-primary" : "border-text-muted bg-transparent"
              }`}
              aria-hidden
            >
              {isDefault && <Check size={14} className="text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-text">{t("accSetDefault")}</span>
              <span className="block text-[11px] text-text-muted">{t("accSetDefaultSub")}</span>
            </span>
          </button>

          {/* Actions */}
          <div className="space-y-2.5 pt-2">
            {showDeleteConfirm ? (
              <div className="space-y-2.5 rounded-2xl border-[1.5px] border-[var(--sf-acc-del-line2)] bg-[var(--sf-acc-del-bg)] p-3.5">
                <p className="flex items-center gap-2 text-sm font-extrabold text-danger">
                  <Trash2 size={18} aria-hidden />
                  {t("accDeleteConfirm").replace("{name}", account?.name ?? "")}
                </p>
                <p className="text-xs leading-[17px] text-text-muted">{t("accDeleteNote")}</p>
                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-elevated py-2.5 text-[13px] font-bold text-text transition active:opacity-85 disabled:opacity-60"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    onClick={() => void handleConfirmDelete()}
                    disabled={deleting}
                    className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger py-2.5 text-[13px] font-extrabold text-white transition active:opacity-85 disabled:opacity-70"
                  >
                    {deleting ? (
                      <span aria-hidden className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Trash2 size={15} aria-hidden />
                    )}
                    {t("accDeleteYes")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || deleting}
                  className="flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[13px] font-bold text-white transition active:opacity-90 disabled:opacity-60"
                >
                  {saving && (
                    <span aria-hidden className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {account
                    ? t("accSaveChanges")
                    : `${t("accCreate")} ${t(currentTypeConfig.labelKey)}`}
                </button>

                {account && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={saving || deleting}
                    className="flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-[var(--sf-acc-del-line)] bg-[var(--sf-acc-del-bg)] py-3 text-[13px] font-extrabold text-danger transition active:opacity-80 disabled:opacity-60"
                  >
                    <Trash2 size={16} aria-hidden />
                    {t("accDeleteThis")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
