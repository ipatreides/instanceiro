import { LoginButton } from "@/components/auth/login-button";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-4xl font-bold text-white">
          RO Instance Tracker
        </h1>
        <p className="text-gray-400 text-lg">
          Acompanhe suas instâncias de Ragnarok Online.
          Gerencie cooldowns, histórico e progresso de todos os seus personagens em um só lugar.
        </p>
        <LoginButton />
      </div>
    </main>
  );
}
