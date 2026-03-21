"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    <div className="min-h-screen flex items-center justify-center bg-[#0f0a1a] px-4">
      <div className="w-full max-w-md bg-[#1a1230] rounded-2xl p-8 border border-[#3D2A5C]">
        <h1 className="text-2xl font-bold text-white text-center mb-1">
          Esqueceu a senha?
        </h1>
        <p className="text-[#A89BC2] text-center mb-6">
          Digite seu email para receber um link de redefinição
        </p>

        {sent ? (
          <div className="text-center">
            <div className="mb-4 p-3 rounded-lg bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#A89BC2] text-sm">
              Se o email existir, enviamos um link para redefinir sua senha.
            </div>
            <Link
              href="/login"
              className="text-sm text-[#7C3AED] hover:underline font-medium"
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
                  className="block text-sm font-medium text-[#A89BC2] mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#2a1f40] border border-[#3D2A5C] text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] transition"
                  placeholder="seu@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#7C3AED] text-white font-semibold hover:bg-[#6D2FD8] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? "Enviando..." : "Enviar link"}
              </button>
            </form>

            <p className="text-center text-sm text-[#6B5A8A] mt-6">
              <Link
                href="/login"
                className="text-[#7C3AED] hover:underline font-medium"
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
