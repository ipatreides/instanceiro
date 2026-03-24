"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const redirect = searchParams.get("redirect");

    if (!code) {
      router.replace("/?error=auth");
      return;
    }

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!error) {
        const target = redirect && redirect.startsWith("/invite/") ? redirect : "/dashboard";
        router.replace(target);
      } else {
        router.replace("/?error=auth");
      }
    });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-secondary text-sm">Autenticando...</p>
    </div>
  );
}

export default function CallbackClientPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-text-secondary text-sm">Autenticando...</p>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
