"use client";

/**
 * Profile & security — identity, avatar, email change (OTP to the CURRENT
 * email), password change, global sign-out, account deletion (OTP-gated edge
 * function). All flows mirror mobile services/auth.ts. Register-style UI:
 * square caps action rows (Settings house style), stepped OTP modals with a
 * resend countdown; modals carry their own body padding (Modal is a bare
 * frame, like CategoryManageModal).
 */
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Mail, TriangleAlert, Upload } from "lucide-react";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { Panel } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { changePassword, finalizeRecoveryPassword, isAllowedAvatarUrl, signOutAllDevices } from "@/services/auth";

const AVATAR_BUCKET = "avatars";
const OTP_COOLDOWN_S = 60;

/**
 * Audit P2-3: re-encode through a canvas before upload. This strips EXIF
 * (GPS/device metadata must never reach the PUBLIC avatars bucket), bounds
 * resolution to 512 px (also dodging the 2 MiB cliff), and guarantees the
 * stored bytes match the declared image type.
 */
async function reencodeAvatar(file: File): Promise<{ blob: Blob; ext: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  try {
    const max = 512;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  const toBlob = (mime: string, quality: number) =>
    new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), mime, quality));
  const webp = await toBlob("image/webp", 0.88);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", mime: "image/webp" };
  const jpeg = await toBlob("image/jpeg", 0.9);
  if (!jpeg) throw new Error("Could not process image");
  return { blob: jpeg, ext: "jpg", mime: "image/jpeg" };
}

export default function ProfilePage() {
  const { user, profile, saveProfile, signOut } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [otpStage, setOtpStage] = useState<"send" | "verify">("send");
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStage, setDeleteStage] = useState<"warn" | "otp">("warn");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  // Audit P2-6: a completed password-reset link lands here via /auth/callback
  // as /profile?recovery=1 — the session is recovery-authenticated, so the
  // user sets the new password directly (no current-password check).
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPw, setRecoveryPw] = useState("");
  const [recoverySaving, setRecoverySaving] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("recovery") === "1") {
      setRecoveryOpen(true);
      window.history.replaceState(null, "", "/profile");
    }
  }, []);
  const onFinishRecovery = async () => {
    setRecoverySaving(true);
    try {
      const { error } = await finalizeRecoveryPassword(supabase, recoveryPw);
      if (error) {
        showToast(error, "error");
      } else {
        setRecoveryOpen(false);
        setRecoveryPw("");
        showToast(t("pwChanged"), "success");
      }
    } finally {
      setRecoverySaving(false);
    }
  };

  // Edge-function cooldown (60 s) is per-user, shared by both OTP flows.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (profile) setName(profile.display_name ?? "");
  }, [profile]);

  const onUploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(t("avatarTooBig"), "error");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast(t("avatarBadType"), "error");
      return;
    }
    setUploading(true);
    try {
      const { blob, ext } = await reencodeAvatar(file);
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
        contentType: blob.type || "image/webp",
        upsert: true,
      });
      if (upError) throw upError;
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await saveProfile({ avatar_url: data.publicUrl });
      await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
      // Audit L2 (avatar half): best-effort remove the replaced object so old
      // public URLs don't linger until account deletion.
      if (profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url)) {
        const marker = "/object/public/avatars/";
        const idx = profile.avatar_url.indexOf(marker);
        if (idx >= 0) {
          const oldPath = decodeURIComponent(profile.avatar_url.slice(idx + marker.length));
          if (oldPath.startsWith(`${user.id}/`)) {
            void supabase.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(() => undefined);
          }
        }
      }
      showToast(t("avatarUpdated"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setUploading(false);
    }
  };

  const onSaveName = async () => {
    setSavingName(true);
    try {
      await saveProfile({ display_name: name.trim() || null });
      await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      showToast(t("saved"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setSavingName(false);
    }
  };

  const onChangePassword = async () => {
    setPwSaving(true);
    try {
      const { error } = await changePassword(supabase, currentPw, newPw);
      if (error) {
        showToast(error, "error");
      } else {
        setPwOpen(false);
        setCurrentPw("");
        setNewPw("");
        showToast(t("pwChanged"), "success");
      }
    } finally {
      setPwSaving(false);
    }
  };

  /** OTP is sent by the shared edge function to the CURRENT email. */
  const sendOtp = async (purpose: "email_change" | "account_deletion") => {
    if (cooldown > 0) {
      showToast(t("otpCooldown"), "error");
      return false;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return false;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-security-otp`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purpose }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) {
      showToast(json.error === "cooldown_active" ? t("otpCooldownShort") : t("otpSendFailed"), "error");
      return false;
    }
    setCooldown(OTP_COOLDOWN_S);
    showToast(t("codeSent"), "success");
    return true;
  };

  const startEmailChange = async () => {
    setOtpBusy(true);
    const ok = await sendOtp("email_change");
    setOtpBusy(false);
    if (ok) setOtpStage("verify");
  };

  const verifyEmailChange = async () => {
    setOtpBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: profile?.email ?? "",
        token: otp.trim(),
        type: "email",
      });
      if (error) throw error;
      const { data: updated, error: upError } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });
      if (upError) throw upError;
      // Audit NV-7: GoTrue may hold the change until the NEW address confirms
      // (two-sided flow — emails/change-email.html). Mirror to the users row
      // ONLY when the server actually applied the address; the pending case
      // keeps the profile on the old (still-authoritative) email, and the
      // next confirmed session resyncs it (ensureProfile).
      const serverEmail = updated.user?.email ?? "";
      const applied = serverEmail.toLowerCase() === newEmail.trim().toLowerCase();
      if (applied) await saveProfile({ email: newEmail.trim() });
      setEmailOpen(false);
      setOtp("");
      setOtpStage("send");
      showToast(applied ? t("emailUpdated") : t("emailChangePending"), applied ? "success" : "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("invalidCode"), "error");
    } finally {
      setOtpBusy(false);
    }
  };

  const requestDelete = async () => {
    setDeleteBusy(true);
    const ok = await sendOtp("account_deletion");
    setDeleteBusy(false);
    if (ok) setDeleteStage("otp");
  };

  const confirmDeleteAccount = async () => {
    setDeleteBusy(true);
    try {
      // OTP verify mints a fresh session whose token opens the deletion gate.
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: profile?.email ?? "",
        token: deleteOtp.trim(),
        type: "email",
      });
      if (otpError) throw new Error(t("invalidCode"));
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error(t("sessionExpired"));
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error === "otp_verification_required" ? t("codeTooOld") : t("deletionFailed"));
      }
      localStorage.clear();
      await signOut();
      router.push("/sign-in");
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("error"), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  const onSignOutAll = async () => {
    setSignOutAllOpen(false);
    await signOutAllDevices(supabase);
    router.push("/sign-in");
    router.refresh();
  };

  const initials = (profile?.display_name ?? profile?.email ?? "?")[0]?.toUpperCase();
  const currentEmail = profile?.email ?? "";

  return (
    <main className="mx-auto w-full max-w-[880px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">{t("profileHolder")}</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">{t("rowProfileSecurity")}</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      {/* ── Identity register ── */}
      <section className="panel mb-4">
        <div className="panel-rule flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <span className="caps">{t("profileHolder")}</span>
          <span className="caps-faint truncate">{currentEmail}</span>
        </div>
        <div className="flex flex-wrap items-end gap-4 p-5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={t("changeAvatar")}
            title={t("changeAvatar")}
            className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-primary bg-primary-light text-xl font-bold text-primary-strong transition-colors hover:border-primary-strong disabled:opacity-50"
          >
            {profile?.avatar_url && isAllowedAvatarUrl(profile.avatar_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <>
                <span className={uploading ? "opacity-30" : ""}>{initials}</span>
                {uploading && <Upload size={18} className="absolute animate-pulse" />}
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadAvatar(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1 basis-52">
            <Input
              label={t("displayName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
          <SquareBtn loading={savingName} onClick={onSaveName} className="shrink-0">
            {t("saveName")}
          </SquareBtn>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Security actions register ── */}
        <Panel label={t("security")} className="self-start">
          <SecurityRow
            Icon={KeyRound}
            label={t("password")}
            desc={t("secPasswordDesc")}
            action={<SquareBtn variant="outline" onClick={() => setPwOpen(true)}>{t("change")}</SquareBtn>}
          />
          <SecurityRow
            Icon={Mail}
            label={t("email")}
            desc={t("secEmailDesc")}
            action={
              <SquareBtn
                variant="outline"
                onClick={() => {
                  setOtpStage("send");
                  setEmailOpen(true);
                }}
              >
                {t("change")}
              </SquareBtn>
            }
          />
          <SecurityRow
            Icon={LogOut}
            label={t("secSignOutAll")}
            desc={t("secSignOutAllDesc")}
            action={<SquareBtn variant="outline" onClick={() => setSignOutAllOpen(true)}>{t("revoke")}</SquareBtn>}
            last
          />
        </Panel>

        {/* ── Danger zone ── */}
        <section className="panel flex flex-col self-start border-danger">
          <div className="border-b-2 border-danger px-4 py-2.5 sm:px-5">
            <span className="caps !text-danger">{t("dangerZone")}</span>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex items-start gap-3.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-danger bg-rust-tint text-danger"
                aria-hidden
              >
                <TriangleAlert size={15} />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-muted">{t("dangerBody")}</p>
            </div>
            <SquareBtn
              variant="danger"
              className="w-full"
              onClick={() => {
                setDeleteStage("warn");
                setDeleteOpen(true);
              }}
            >
              {t("deleteAccountBtn")}
            </SquareBtn>
          </div>
        </section>
      </div>

      {/* ── Password modal ── */}
      <Modal open={pwOpen} title={t("pwTitle")} onClose={() => setPwOpen(false)} maxWidth="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPw.length < 8) {
              showToast(t("pwTooShort"), "error");
              return;
            }
            void onChangePassword();
          }}
          className="space-y-4 px-5 pt-4"
        >
          <p className="stamp">{t("pwHint")}</p>
          <Input
            label={t("currentPassword")}
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label={t("newPassword")}
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            required
          />
          <div className="flex justify-end gap-2 pt-1">
            <SquareBtn type="button" variant="ghost" onClick={() => setPwOpen(false)}>
              {t("cancel")}
            </SquareBtn>
            <SquareBtn type="submit" loading={pwSaving}>
              {t("change")}
            </SquareBtn>
          </div>
        </form>
      </Modal>

      {/* ── Recovery set-new-password modal (reset-link completed) ── */}
      <Modal open={recoveryOpen} title={t("recoveryTitle")} onClose={() => setRecoveryOpen(false)} maxWidth="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onFinishRecovery();
          }}
          className="space-y-4 px-5 pt-4 pb-5"
        >
          <p className="stamp">{t("recoveryHint")}</p>
          <Input
            label={t("newPassword")}
            type="password"
            value={recoveryPw}
            onChange={(e) => setRecoveryPw(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
          <div className="flex justify-end gap-2 pt-1">
            <SquareBtn type="submit" loading={recoverySaving}>
              {t("recoverySet")}
            </SquareBtn>
          </div>
        </form>
      </Modal>

      {/* ── Email change modal — stepped ── */}
      <Modal open={emailOpen} title={t("emailTitle")} onClose={() => setEmailOpen(false)} maxWidth="max-w-sm">
        <div className="space-y-4 px-5 pt-4">
          <StepRail step={otpStage === "send" ? 1 : 2} />
          {otpStage === "send" ? (
            <>
              <Input
                label={t("newEmail")}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="text-xs text-faint">{t("secEmailDesc")}</p>
              <SquareBtn
                className="w-full"
                onClick={startEmailChange}
                loading={otpBusy}
                disabled={!newEmail.includes("@") || cooldown > 0}
              >
                {currentEmail
                  ? `${t("sendCodeTo")} ${currentEmail}${cooldown > 0 ? ` · ${cooldown}s` : ""}`
                  : `${t("sendCodeBtn")}${cooldown > 0 ? ` · ${cooldown}s` : ""}`}
              </SquareBtn>
            </>
          ) : (
            <>
              <p className="stamp">
                {t("deleteOtpLead")} <span className="font-bold text-text">{currentEmail || "—"} ·</span>
              </p>
              <Input
                label={t("enterCode")}
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="numeric text-center text-lg font-bold tracking-[0.45em]"
              />
              <SquareBtn className="w-full" onClick={verifyEmailChange} loading={otpBusy} disabled={otp.length < 6}>
                {t("verifyUpdateEmail")}
              </SquareBtn>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOtpStage("send")}
                  className="text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-text"
                >
                  ← {t("back")}
                </button>
                <button
                  type="button"
                  onClick={startEmailChange}
                  disabled={cooldown > 0}
                  className="text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-primary disabled:opacity-40"
                >
                  {`${t("resendCode")}${cooldown > 0 ? ` · ${cooldown}s` : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Deletion flow ── */}
      <ConfirmDialog
        open={deleteOpen && deleteStage === "warn"}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={t("continueLabel")}
        cancelLabel={t("cancel")}
        onConfirm={requestDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <Modal
        open={deleteOpen && deleteStage === "otp"}
        title={t("confirmDeletion")}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteStage("warn");
        }}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4 px-5 pt-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-danger bg-rust-tint text-danger"
              aria-hidden
            >
              <TriangleAlert size={15} />
            </span>
            <p className="min-w-0 flex-1 pt-1 text-sm text-text-muted">
              {t("deleteOtpLead")} <span className="font-bold text-text">{currentEmail || "—"}</span>.{" "}
              {t("deleteOtpTail")}
            </p>
          </div>
          <Input
            label={t("enterCode")}
            inputMode="numeric"
            maxLength={6}
            value={deleteOtp}
            onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, ""))}
            className="numeric text-center text-lg font-bold tracking-[0.45em]"
          />
          <SquareBtn
            variant="danger"
            className="w-full"
            onClick={confirmDeleteAccount}
            loading={deleteBusy}
            disabled={deleteOtp.length < 6}
          >
            {t("deleteEverything")}
          </SquareBtn>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setDeleteStage("warn")}
              className="text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-text"
            >
              ← {t("back")}
            </button>
            <button
              type="button"
              onClick={requestDelete}
              disabled={cooldown > 0}
              className="text-[11px] font-bold uppercase tracking-wide text-faint transition-colors hover:text-danger disabled:opacity-40"
            >
              {`${t("resendCode")}${cooldown > 0 ? ` · ${cooldown}s` : ""}`}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={signOutAllOpen}
        title={t("secSignOutAll")}
        body={t("signOutAllBody")}
        confirmLabel={t("revokeAll")}
        cancelLabel={t("cancel")}
        onConfirm={onSignOutAll}
        onCancel={() => setSignOutAllOpen(false)}
      />
    </main>
  );
}

/* ── Register row: glyph chip, label + detail line, square caps action ── */
function SecurityRow({
  Icon,
  label,
  desc,
  action,
  last = false,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  desc: string;
  action: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3.5 px-5 py-4 ${last ? "" : "border-b border-border/60"}`}>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary bg-primary-light text-primary-strong"
        aria-hidden
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-faint">{desc}</p>
      </div>
      {action}
    </div>
  );
}

/** Square caps button — the ledger action language of this register. */
function SquareBtn({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger" | "ghost";
  loading?: boolean;
}) {
  const VARIANTS = {
    primary: "border border-primary bg-primary text-white hover:bg-primary-strong",
    outline: "border border-border bg-input text-primary hover:border-primary hover:bg-primary-light",
    danger: "border-2 border-danger bg-danger text-white hover:opacity-90",
    ghost: "border border-border text-text-muted hover:border-text-muted hover:text-text",
  } as const;
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 px-4 text-xs font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {loading && (
        <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/** Two-segment OTP step indicator. */
function StepRail({ step }: { step: 1 | 2 }) {
  const { t } = useLanguage();
  const seg = "caps flex-1 border px-2 py-1.5 text-center transition-colors";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`${seg} ${step === 1 ? "border-primary bg-primary-light text-primary-strong" : "border-border text-faint"}`}>
        1 · {t("stepAuthorize")}
      </span>
      <span className={`${seg} ${step === 2 ? "border-primary bg-primary-light text-primary-strong" : "border-border text-faint"}`}>
        2 · {t("stepConfirm")}
      </span>
    </div>
  );
}
