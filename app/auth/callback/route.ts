import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/utils/supabase/server";

/**
 * OAuth PKCE code exchange (docs/API.md §1). Same-origin only; rejects
 * untrusted `next` paths (open-redirect guard — web counterpart of mobile's
 * deep-link trust gate).
 *
 * Two failure modes are surfaced distinctly on /sign-in:
 *   - `error=oauth_cancelled`: Google redirected back with access_denied (the
 *     user closed/blocked the consent) — the mobile app shows the same
 *     "cancelled" wording.
 *   - `error=oauth`: missing code or failed exchange.
 *
 * Redirect targets are built from the forwarded Host header, not request.url:
 * next dev normalizes the latter to its bind host (localhost), which would
 * bounce a LAN/nip.io session to http://localhost:3000 — unreachable from a
 * phone and a different cookie jar (docs/SUPABASE.md §7).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Signed-in destination defaults to the app, not the marketing page —
  // same as password sign-in (router.push("/overview") on /sign-in).
  const nextParam = searchParams.get("next") ?? "/overview";

  // next dev normalizes request.url to its bind host (localhost), which would
  // bounce LAN/nip.io sessions to http://localhost:3000 — a host a phone can't
  // reach and a cookie jar without the just-exchanged session. The browser's
  // real host (and the PKCE cookies) live in the forwarded Host headers.
  // Audit P3-1: forwarded headers are only trusted in development (LAN/nip.io
  // need them there); in production they are attacker-influenceable if a proxy
  // is misconfigured, so the request's own URL — set by the server on the real
  // deployment host — is authoritative.
  const host =
    process.env.NODE_ENV === "development"
      ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
        request.headers.get("host")
      : null;
  const proto =
    process.env.NODE_ENV === "development"
      ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http"
      : "https";
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (searchParams.get("error") === "access_denied") {
    return NextResponse.redirect(`${origin}/sign-in?error=oauth_cancelled`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=oauth`);
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=oauth`);
  }

  // Password-recovery codes land here too (services/auth.ts redirectTo is kept
  // a bare allowlisted /auth/callback per docs/SUPABASE.md §7 — the flow type
  // rides on GoTrue's own `type=recovery` param, not a nested query).
  if (searchParams.get("type") === "recovery") {
    return NextResponse.redirect(`${origin}/profile?recovery=1`);
  }

  // Google photos live on lh*.googleusercontent.com, which this app can never
  // render (avatar allowlist P3-2 + CSP img-src) and never hotlinks. Mirror
  // the photo into the project's own avatars bucket once, at sign-in, when
  // the user has no avatar yet — the resulting bucket URL passes every gate
  // and lands in users.avatar_url (web) + auth metadata (mobile parity).
  // Strictly best-effort: any failure must not block or slow the redirect.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const googlePhoto = user?.user_metadata?.avatar_url;
    if (
      user &&
      typeof googlePhoto === "string" &&
      /^https:\/\/lh[0-9]\.googleusercontent\.com\/.+/.test(googlePhoto)
    ) {
      const { data: prof } = await supabase
        .from("users")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!prof?.avatar_url) {
        const img = await fetch(googlePhoto);
        const mime = img.headers.get("content-type") ?? "";
        const ext = /png/i.test(mime) ? "png" : /webp/i.test(mime) ? "webp" : /image/i.test(mime) ? "jpg" : null;
        const bytes = img.ok && ext ? await img.arrayBuffer() : null;
        // Bucket limit (docs/SUPABASE.md): avatars ≤ 2 MiB, image MIME only.
        if (bytes && bytes.byteLength > 0 && bytes.byteLength <= 2 * 1024 * 1024) {
          const path = `${user.id}/avatar.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("avatars")
            .upload(path, bytes, {
              contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
              upsert: true,
            });
          if (!upErr) {
            const {
              data: { publicUrl },
            } = supabase.storage.from("avatars").getPublicUrl(path);
            // Row may not exist yet for a first-time OAuth user (ensureProfile
            // creates it client-side) — the metadata write below covers that.
            await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", user.id);
            await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
          }
        }
      }
    }
  } catch {
    // Cosmetic mirror — sign-in succeeds regardless.
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
