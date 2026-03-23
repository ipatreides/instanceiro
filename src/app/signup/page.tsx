"use client";

import { createClient } from "@/lib/supabase/client";
import { useUsernameCheck, isValidUsername } from "@/hooks/use-username-check";
import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const usernameStatus = useUsernameCheck(username);

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  }

  const validate = () => {
    const newErrors: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!username) {
      newErrors.username = "Username é obrigatório";
    } else if (!isValidUsername(username)) {
      newErrors.username = username.length < 3 ? "Mínimo 3 caracteres" : "Apenas letras minúsculas e números";
    } else if (usernameStatus === "taken") {
      newErrors.username = "Já em uso";
    } else if (usernameStatus !== "available") {
      newErrors.username = "Aguarde a verificação do username";
    }

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
        // Store username for after email confirmation + login
        localStorage.setItem("pending_username", username);
        setSuccess(true);
      }
    } catch {
      setErrorMessage("Erro inesperado. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    // Save username to localStorage so dashboard can apply it after OAuth callback
    if (username && isValidUsername(username) && usernameStatus === "available") {
      localStorage.setItem("pending_username", username);
    }
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const canSubmit = usernameStatus === "available";

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
            {/* Username field */}
            <div>
              <label htmlFor="username" className="block text-[#A89BC2] text-sm font-medium mb-1">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-sm font-medium">@</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  maxLength={20}
                  placeholder="username"
                  className="w-full bg-[#2a1f40] border border-[#3D2A5C] text-white placeholder-[#6B5A8A] rounded-lg pl-8 pr-10 py-2.5 focus:border-[#7C3AED] focus:outline-none transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                  {usernameStatus === "checking" && (
                    <span className="text-[#A89BC2] animate-pulse">...</span>
                  )}
                  {usernameStatus === "available" && (
                    <span className="text-green-400">✓</span>
                  )}
                  {usernameStatus === "taken" && (
                    <span className="text-red-400">✗</span>
                  )}
                  {usernameStatus === "invalid" && username.length > 0 && (
                    <span className="text-red-400">✗</span>
                  )}
                </span>
              </div>
              <div className="h-5">
                {usernameStatus === "taken" && (
                  <p className="mt-1 text-red-400 text-xs">Já em uso</p>
                )}
                {usernameStatus === "invalid" && username.length > 0 && (
                  <p className="mt-1 text-red-400 text-xs">
                    {username.length < 3
                      ? "Mínimo 3 caracteres"
                      : "Apenas letras minúsculas e números"}
                  </p>
                )}
                {usernameStatus === "available" && (
                  <p className="mt-1 text-green-400 text-xs">Disponível!</p>
                )}
              </div>
              {errors.username && usernameStatus === "idle" && (
                <p className="mt-1 text-red-400 text-sm">{errors.username}</p>
              )}
            </div>

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
              disabled={submitting || !canSubmit}
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
