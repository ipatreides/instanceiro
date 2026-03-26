"use client";

import { useParams, useRouter } from "next/navigation";
import { useFriendInvite } from "@/hooks/use-friend-invite";
import { Avatar } from "@/components/ui/avatar";
import { FullPageSpinner } from "@/components/ui/spinner";
import { LoginButton } from "@/components/auth/login-button";

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

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-8 space-y-5">
          {/* Unauthenticated — show creator + login buttons */}
          {status === "unauthenticated" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {creator.display_name ?? creator.username}
                </h1>
                <p className="text-sm text-text-secondary mt-1">te convidou para o Instanceiro</p>
              </div>
              <div className="pt-2">
                <LoginButton redirect={`/invite/${code}`} />
              </div>
            </>
          )}

          {/* Valid — show creator + accept button */}
          {status === "valid" && creator && (
            <>
              <div className="flex justify-center">
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {creator.display_name ?? creator.username}
                </h1>
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
                <Avatar src={creator.avatar_url} name={creator.display_name ?? creator.username} size="lg" />
              </div>
              <h1 className="text-xl font-bold text-text-primary">
                Você já é amigo de {creator.display_name ?? creator.username}
              </h1>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Self invite */}
          {status === "self_invite" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Este é seu próprio convite</h1>
              <p className="text-sm text-text-secondary">Compartilhe o link com seus amigos.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Used */}
          {status === "used" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite já utilizado</h1>
              <p className="text-sm text-text-secondary">Este convite já foi aceito por outro usuário.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}

          {/* Invalid */}
          {status === "invalid" && (
            <>
              <h1 className="text-xl font-bold text-text-primary">Convite inválido</h1>
              <p className="text-sm text-text-secondary">Este link de convite não existe.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-6 py-2 text-sm text-text-primary bg-primary rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors cursor-pointer"
              >
                Ir para o dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
