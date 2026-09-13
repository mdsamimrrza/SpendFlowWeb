import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://missing-supabase-config.invalid";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "missing-supabase-key";

// Public paths: landing page, auth flow + the static design-preview page (mock data only).
const PUBLIC_PATHS = ["/", "/sign-in", "/onboarding", "/auth/callback", "/preview"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
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

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    response = NextResponse.redirect(url);
  } else if (user && isPublic && path !== "/auth/callback" && path !== "/onboarding" && path !== "/") {
    // Signed-in users skip the marketing landing + auth pages → their statement.
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    response = NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
