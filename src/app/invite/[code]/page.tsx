"use client";

import { useParams, useRouter } from "next/navigation";
import { useFriendInvite } from "@/hooks/use-friend-invite";
import { Avatar } from "@/components/ui/avatar";
import { FullPageSpinner } from "@/components/ui/spinner";
import { LoginButton } from "@/components/auth/login-button";
import { Logo } from "@/components/ui/logo";

function DashboardLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/dashboard")}
      className="px-6 py-2.5 text-sm font-semibold text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
    >
      Ir para o dashboard
    </button>
  );
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { status, creator, acceptInvite, accepting } = useFriendInvite(code);

  if (status === "loading") {
    return <FullPageSpinner label="Carregando convite..." />;
  }

  const handleAccept = async () => {
    const result = await acceptInvite();
    if (result === "accepted") {
      router.push("/dashboard");
    }
  };

  const creatorName = creator?.display_name ?? creator?.username;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-8">
      <div className="max-w-[420px] w-full text-center">
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] px-10 py-12 space-y-6">

          {/* Unauthenticated — welcome card with branding */}
          {status === "unauthenticated" && creator && (
            <>
              <div className="flex justify-center">
                <Logo size="sm" />
              </div>

              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creatorName} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">{creatorName}</h1>
                <p className="text-sm text-text-secondary mt-1">te convidou para acompanhar instâncias juntos</p>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">
                Instanceiro ajuda você a gerenciar cooldowns e agendar instâncias de Ragnarok Online com seus amigos.
              </p>

              <div className="pt-1">
                <LoginButton redirect={`/invite/${code}`} />
              </div>

              <p className="text-[11px] text-text-secondary">
                Ao entrar, você aceita o convite e se torna amigo de <strong className="text-text-primary">{creatorName}</strong>.
              </p>
            </>
          )}

          {/* Valid — show creator + accept button */}
          {status === "valid" && creator && (
            <>
              <div className="flex justify-center">
                <Logo size="sm" />
              </div>

              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creatorName} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">{creatorName}</h1>
                <p className="text-sm text-text-secondary mt-1">te convidou para o Instanceiro</p>
              </div>

              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full px-6 py-3 text-sm font-semibold text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                {accepting ? "Aceitando..." : "Aceitar convite"}
              </button>
            </>
          )}

          {/* Already friends */}
          {status === "already_friends" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creatorName} size="lg" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                Você já é amigo de {creatorName}
              </h1>
              <DashboardLink />
            </>
          )}

          {/* Self invite */}
          {status === "self_invite" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Este é seu próprio convite</h1>
              <p className="text-sm text-text-secondary">Compartilhe o link com seus amigos.</p>
              <DashboardLink />
            </>
          )}

          {/* Used */}
          {status === "used" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite já utilizado</h1>
              <p className="text-sm text-text-secondary">Este convite já foi aceito por outro usuário.</p>
              <DashboardLink />
            </>
          )}

          {/* Invalid */}
          {status === "invalid" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite inválido</h1>
              <p className="text-sm text-text-secondary">Este link de convite não existe.</p>
              <DashboardLink />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
