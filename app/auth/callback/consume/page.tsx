"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/utils/supabase/browser";
import { useLanguage } from "@/store/LanguageContext";

/**
 * Consumes password-recovery links on the web.
 *
 * GoTrue's emailed recovery link lands here with the session tokens in the
 * URL FRAGMENT (#access_token=...&refresh_token=...&type=recovery, implicit
 * flow — the mail comes from the send-password-reset broker's /recover call,
 * not a PKCE client, so there is no ?code= for the server route to exchange).
 * Fragments never reach the server, so ../route.ts rewrites codeless requests
 * to THIS page and the tokens can only be read by client JS.
 *
 * setSession() promotes the one-time recovery tokens to a full cookie session
 * (browser client = cookie storage, so the middleware/server see it too), and
 * /profile?recovery=1 then raises the set-new-password form — the same
 * destination mobile's deep-link flow lands on. Non-recovery fragments (a
 * stray implicit link) go to /overview; anything malformed to /sign-in.
 */
export default function AuthCallbackConsumePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [status, setStatus] = useState(t("recoveryTitle"));
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type");

    if (hash.get("error") || !accessToken || !refreshToken) {
      router.replace("/sign-in?error=oauth");
      return;
    }

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        router.replace("/sign-in?error=oauth");
        return;
      }
      // Strip the tokens from the address bar before navigating on.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(type === "recovery" ? "/profile?recovery=1" : "/overview");
    })();
  }, [router, t]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-faint">{status}</p>
    </main>
  );
}
