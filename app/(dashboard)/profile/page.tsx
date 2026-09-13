"use client";

/**
 * Profile & security — identity, avatar, email change (OTP to the CURRENT
 * email), password change, global sign-out, account deletion (OTP-gated edge
 * function). All flows mirror mobile services/auth.ts.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/AuthContext";
import { useLanguage } from "@/store/LanguageContext";
import { useToast } from "@/store/ToastContext";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { changePassword, signOutAllDevices } from "@/services/auth";

const AVATAR_BUCKET = "avatars";
const OTP_COOLDOWN_MS = 60_000;

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
  const lastOtpSent = useRef(0);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStage, setDeleteStage] = useState<"warn" | "otp">("warn");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  useEffect(() => {
    if (profile) setName(profile.display_name ?? "");
  }, [profile]);

  const onUploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Avatar must be ≤ 2 MB", "error");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Use JPG, PNG or WebP", "error");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (upError) throw upError;
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await saveProfile({ avatar_url: data.publicUrl });
      await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
      showToast("Avatar updated", "success");
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
        showToast("Password changed", "success");
      }
    } finally {
      setPwSaving(false);
    }
  };

  /** OTP is sent by the shared edge function to the CURRENT email. */
  const sendOtp = async (purpose: "email_change" | "account_deletion") => {
    if (Date.now() - lastOtpSent.current < OTP_COOLDOWN_MS) {
      showToast("Please wait a minute before requesting another code", "error");
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
      showToast(json.error === "cooldown_active" ? "Cooldown — wait a minute" : "Could not send code", "error");
      return false;
    }
    lastOtpSent.current = Date.now();
    showToast("Code sent to your email", "success");
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
      const { error: upError } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (upError) throw upError;
      await saveProfile({ email: newEmail.trim() });
      setEmailOpen(false);
      setOtp("");
      setOtpStage("send");
      showToast("Email updated", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Invalid code", "error");
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
      if (otpError) throw new Error("Invalid code");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expired");
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error === "otp_verification_required" ? "Code too old — request a new one" : "Deletion failed");
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

  return (
    <main className="mx-auto w-full max-w-[880px]">
      <header className="mb-5">
        <p className="caps !text-primary-strong">Account holder</p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-text">Profile &amp; security</h1>
        <div className="mt-2 h-0.5 w-14 bg-brass" aria-hidden />
      </header>

      {/* Identity */}
      <section className="panel mb-4 flex flex-wrap items-center gap-5 p-5">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative flex h-16 w-16 items-center justify-center overflow-hidden border border-primary bg-primary-light text-xl font-bold text-primary-strong disabled:opacity-50"
          aria-label="Change avatar"
        >
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            initials
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="max-w-xs"
            />
          </div>
          <p className="mt-1 text-xs text-faint">{profile?.email}</p>
        </div>
        <Button variant="secondary" onClick={onSaveName} loading={savingName}>
          Save name
        </Button>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Security actions */}
        <Panel label="Security">
          <div className="p-5">
            <LedgerAction
              label="Password"
              desc="Re-verifies your current password first."
              action={<Button variant="secondary" onClick={() => setPwOpen(true)}>Change</Button>}
            />
            <LedgerAction
              label="Email address"
              desc="A code is sent to your current email to authorize the change."
              action={
                <Button variant="secondary" onClick={() => { setOtpStage("send"); setEmailOpen(true); }}>
                  Change
                </Button>
              }
            />
            <LedgerAction
              label="Sign out everywhere"
              desc="Revokes the session on every device."
              action={
                <Button variant="secondary" onClick={() => setSignOutAllOpen(true)}>
                  Revoke
                </Button>
              }
              last
            />
          </div>
        </Panel>

        {/* Danger zone */}
        <section className="panel border-danger">
          <div className="border-b-2 border-danger px-5 py-2.5">
            <span className="caps !text-danger">Danger zone</span>
          </div>
          <div className="p-5">
            <p className="text-sm text-text-muted">
              Deletes your ledger, uploaded receipts, and account permanently. Requires a code sent
              to your email and a fresh verification — a stolen session alone cannot delete data.
            </p>
            <Button variant="danger" className="mt-4" onClick={() => { setDeleteStage("warn"); setDeleteOpen(true); }}>
              Delete account permanently
            </Button>
          </div>
        </section>
      </div>

      {/* Password modal */}
      <Modal open={pwOpen} title="Change password" onClose={() => setPwOpen(false)} maxWidth="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPw.length < 8) {
              showToast("New password must be at least 8 characters", "error");
              return;
            }
            void onChangePassword();
          }}
          className="space-y-4"
        >
          <Input label="Current password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
          <Input label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          <Button type="submit" loading={pwSaving} className="w-full">
            Change password
          </Button>
        </form>
      </Modal>

      {/* Email change modal */}
      <Modal open={emailOpen} title="Change email" onClose={() => setEmailOpen(false)} maxWidth="max-w-sm">
        <div className="space-y-4">
          {otpStage === "send" ? (
            <>
              <Input label="New email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              <Button onClick={startEmailChange} loading={otpBusy} className="w-full" disabled={!newEmail.includes("@")}>
                Send code to {profile?.email}
              </Button>
            </>
          ) : (
            <>
              <Input label="6-digit code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              <Button onClick={verifyEmailChange} loading={otpBusy} className="w-full" disabled={otp.length < 6}>
                Verify & update email
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* Deletion flow */}
      <ConfirmDialog
        open={deleteOpen && deleteStage === "warn"}
        title="Delete account"
        body="Every entry, upload and setting is permanently destroyed. This cannot be undone."
        confirmLabel="Continue"
        cancelLabel={t("cancel")}
        onConfirm={requestDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <Modal open={deleteOpen && deleteStage === "otp"} title="Confirm deletion" onClose={() => setDeleteOpen(false)} maxWidth="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            A code was sent to <span className="font-bold text-text">{profile?.email}</span>. Enter it to
            trigger the irreversible wipe.
          </p>
          <Input label="6-digit code" inputMode="numeric" maxLength={6} value={deleteOtp} onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, ""))} />
          <Button variant="danger" onClick={confirmDeleteAccount} loading={deleteBusy} className="w-full" disabled={deleteOtp.length < 6}>
            Delete everything
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={signOutAllOpen}
        title="Sign out everywhere"
        body="All sessions on all devices are revoked."
        confirmLabel="Revoke all"
        cancelLabel={t("cancel")}
        onConfirm={onSignOutAll}
        onCancel={() => setSignOutAllOpen(false)}
      />
    </main>
  );
}

function LedgerAction({
  label,
  desc,
  action,
  last = false,
}: {
  label: string;
  desc: string;
  action: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-border/60"}`}>
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-[11px] text-faint">{desc}</p>
      </div>
      {action}
    </div>
  );
}
