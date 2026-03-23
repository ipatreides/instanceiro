"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Logo } from "@/components/ui/logo";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setCanReset(true);
          setChecking(false);
        }
      }
    );

    // Timeout fallback — if no PASSWORD_RECOVERY event after 3s, show error
    const timer = setTimeout(() => setChecking(false), 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md bg-surface rounded-2xl p-8 border border-border text-center">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-text-secondary text-sm">
            Senha redefinida com sucesso!
          </div>
          <Link
            href="/login"
            className="text-sm text-primary hover:underline font-medium"
          >
            Ir para login
          </Link>
        </div>
      </div>
    );
  }

  if (checking) {
    return <FullPageSpinner label="Verificando link..." />;
  }

  if (!canReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="w-full max-w-md bg-surface rounded-2xl p-8 border border-border text-center">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm">
            Link inválido ou expirado. Solicite um novo.
          </div>
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline font-medium"
          >
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl p-8 border border-border">
        <div className="flex justify-center mb-4">
          <Logo size="lg" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary text-center mb-1">
          Nova Senha
        </h1>
        <p className="text-text-secondary text-center mb-6">
          Digite sua nova senha
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Nova senha
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-text-secondary mb-1"
            >
              Confirmar senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-surface border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-primary text-text-primary font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Salvando..." : "Redefinir Senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
