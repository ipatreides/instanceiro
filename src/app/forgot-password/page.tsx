"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/ui/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });

    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl p-8 border border-border">
        <div className="flex justify-center mb-4">
          <Logo size="lg" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary text-center mb-1">
          Esqueceu a senha?
        </h1>
        <p className="text-text-secondary text-center mb-6">
          Digite seu email para receber um link de redefinição
        </p>

        {sent ? (
          <div className="text-center">
            <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-text-secondary text-sm">
              Se o email existir, enviamos um link para redefinir sua senha.
            </div>
            <Link
              href="/login"
              className="text-sm text-primary hover:underline font-medium"
            >
              Voltar para login
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-secondary mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition"
                  placeholder="seu@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-primary text-text-primary font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "Enviando..." : "Enviar link"}
              </button>
            </form>

            <p className="text-center text-sm text-text-secondary mt-6">
              <Link
                href="/login"
                className="text-primary hover:underline font-medium"
              >
                Voltar para login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
