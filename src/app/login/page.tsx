"use client";

import { LoginButton } from "@/components/auth/login-button";
import { Logo } from "@/components/ui/logo";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div>
          <Logo size="md" />
          <h1 className="text-3xl font-bold text-text-primary mb-2">Entrar</h1>
          <p className="text-text-secondary text-sm">Acesse sua conta no Instanceiro</p>
        </div>

        <div className="flex justify-center">
          <LoginButton />
        </div>

        <a href="/" className="text-sm text-text-secondary hover:text-text-primary transition-colors inline-block">
          ← Voltar
        </a>
      </div>
    </div>
  );
}
