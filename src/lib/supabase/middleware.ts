import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do not remove this call
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtectedRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/invite");

  // Unauthenticated user trying to access protected routes → redirect to /
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    if (pathname.startsWith("/invite")) {
      url.pathname = "/";
      url.searchParams.set("redirect", pathname);
    } else {
      url.pathname = "/";
    }
    return NextResponse.redirect(url);
  }

  // Authenticated user
  if (user) {
    // Authenticated user on landing page → redirect to dashboard
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      const redirect = request.nextUrl.searchParams.get("redirect");
      if (redirect && redirect.startsWith("/invite/")) {
        url.pathname = redirect;
        url.searchParams.delete("redirect");
      } else {
        url.pathname = "/dashboard";
      }
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
