"use client";

import { LoginButton } from "@/components/auth/login-button";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0f0a1a] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Entrar</h1>
          <p className="text-[#A89BC2] text-sm">Acesse sua conta no Instanceiro</p>
        </div>

        <div className="flex justify-center">
          <LoginButton />
        </div>

        <a href="/" className="text-sm text-[#A89BC2] hover:text-white transition-colors inline-block">
          ← Voltar
        </a>
      </div>
    </div>
  );
}
