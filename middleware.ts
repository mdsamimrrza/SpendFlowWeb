import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

// `||` not `??`: present-but-blank env must fail closed, not build "" clients.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://missing-supabase-config.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-supabase-key";

// Public paths: landing page, auth flow + the static design-preview pages
// (mock data only). "/preview" also covers every "/preview/<screen>" route.
const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up", "/forgot-password", "/onboarding", "/auth/callback", "/preview"];

// Route prefixes that actually exist under (dashboard)/ + expense/[id].
// Unknown paths (typos, stale links, probes) must NOT bounce anonymous users
// to /sign-in — they fall through so Next renders the custom 404 page.
const APP_PATHS = ["/overview", "/history", "/accounts", "/categories", "/transfer", "/recurring", "/profit-loss", "/analytics", "/bullion", "/export", "/settings", "/profile", "/bin", "/expense"];

export async function middleware(request: NextRequest) {
  // NV-9 + rotation-drop fix (prior audit): collect cookie writes instead of
  // attaching them to a response object the redirect branches later replace —
  // the final response (redirect or passthrough) gets the rotated tokens.
  const cookieWrites: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookieWrites.push(...cookiesToSet);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    PUBLIC_PATHS.some((p) => p !== "/" && (path === p || path.startsWith(`${p}/`)));
  const isAppPath = APP_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  let response: NextResponse;
  if (!isPublic && !isAppPath) {
    // No such route at any auth state → let Next's not-found handle it (404).
    response = NextResponse.next({ request });
  } else if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    response = NextResponse.redirect(url);
  } else if (user && isPublic && path !== "/auth/callback" && path !== "/onboarding" && path !== "/") {
    // Signed-in users skip the marketing landing + auth pages → their statement.
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request });
  }

  cookieWrites.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
