"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const newErrors: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      newErrors.email = "Email é obrigatório";
    } else if (!emailRegex.test(email)) {
      newErrors.email = "Email inválido";
    }

    if (!password) {
      newErrors.password = "Senha é obrigatória";
    } else if (password.length < 6) {
      newErrors.password = "Senha deve ter no mínimo 6 caracteres";
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Confirmação de senha é obrigatória";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "As senhas não coincidem";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!validate()) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setErrorMessage("Erro inesperado. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#1a1230] rounded-xl p-8 border border-[#3D2A5C] text-center">
          <div className="text-[#D4A843] text-4xl mb-4">✉️</div>
          <h2 className="text-white text-xl font-semibold mb-3">Verifique seu email</h2>
          <p className="text-[#A89BC2]">
            Verifique seu email para confirmar a conta. Enviamos um link de confirmação para{" "}
            <span className="text-white font-medium">{email}</span>.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-[#7C3AED] hover:text-[#9F67FF] transition-colors"
          >
            Voltar para login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-white text-3xl font-bold">Criar Conta</h1>
          <p className="text-[#A89BC2] mt-2">Crie sua conta no Instanceiro</p>
        </div>

        <div className="bg-[#1a1230] rounded-xl p-8 border border-[#3D2A5C]">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/50 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[#A89BC2] text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-[#2a1f40] border border-[#3D2A5C] text-white placeholder-[#6B5A8A] rounded-lg px-4 py-2.5 focus:border-[#7C3AED] focus:outline-none transition-colors"
              />
              {errors.email && (
                <p className="mt-1 text-red-400 text-sm">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-[#A89BC2] text-sm font-medium mb-1">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#2a1f40] border border-[#3D2A5C] text-white placeholder-[#6B5A8A] rounded-lg px-4 py-2.5 focus:border-[#7C3AED] focus:outline-none transition-colors"
              />
              {errors.password && (
                <p className="mt-1 text-red-400 text-sm">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-[#A89BC2] text-sm font-medium mb-1">
                Confirmar Senha
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                className="w-full bg-[#2a1f40] border border-[#3D2A5C] text-white placeholder-[#6B5A8A] rounded-lg px-4 py-2.5 focus:border-[#7C3AED] focus:outline-none transition-colors"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-red-400 text-sm">{errors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? "Criando..." : "Criar Conta"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-[#3D2A5C]" />
            <span className="text-[#6B5A8A] text-sm">ou</span>
            <div className="flex-1 h-px bg-[#3D2A5C]" />
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-[#2a1f40] hover:bg-[#3D2A5C] border border-[#3D2A5C] text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
          >
            Entrar com Google
          </button>

          <p className="mt-6 text-center text-[#A89BC2] text-sm">
            Já tem conta?{" "}
            <Link href="/login" className="text-[#7C3AED] hover:text-[#9F67FF] transition-colors">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
