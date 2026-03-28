import { Logo } from "@/components/ui/logo";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="text-center py-8 px-4">
      <div className="flex justify-center mb-3">
        <Logo size="lg" />
      </div>
      <p className="text-text-secondary text-lg max-w-md mx-auto leading-relaxed mb-6">
        Rastreie instâncias e MVPs do Ragnarok Online — grátis, sem conta
      </p>
      <div className="flex items-center justify-center gap-3">
        <a
          href="#tracker"
          className="bg-primary text-white font-semibold px-5 py-2 rounded-md hover:bg-primary-hover transition-colors"
        >
          Começar ↓
        </a>
        <Link
          href="/login"
          className="text-text-secondary hover:text-text-primary font-medium px-5 py-2 transition-colors"
        >
          Entrar
        </Link>
      </div>
    </section>
  );
}
