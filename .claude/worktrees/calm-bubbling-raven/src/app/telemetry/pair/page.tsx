'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

function PairContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const callback = searchParams.get('callback')
  const [status, setStatus] = useState<'idle' | 'confirming' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleConfirm() {
    setStatus('confirming')
    try {
      const res = await fetch('/api/telemetry/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairing_code: code }),
      })

      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error || 'Erro ao conectar')
        setStatus('error')
        return
      }

      const { callback_url } = await res.json()
      setStatus('success')

      // Redirect to sniffer's local callback
      window.location.href = callback_url
    } catch {
      setErrorMsg('Erro de conexao')
      setStatus('error')
    }
  }

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-text-secondary">Codigo de pareamento nao encontrado.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-text-primary mb-4">Conectar Sniffer</h1>
        <p className="text-text-secondary mb-6">
          Confirme o codigo abaixo para conectar seu sniffer ao Instanceiro.
        </p>
        <div className="bg-bg border border-border rounded-md p-4 mb-6">
          <span className="font-mono text-2xl font-bold text-primary tracking-wider">{code}</span>
        </div>

        {status === 'idle' && (
          <button
            onClick={handleConfirm}
            className="w-full bg-primary text-white font-semibold rounded-md py-3 hover:bg-primary-hover transition-colors"
          >
            Confirmar conexao
          </button>
        )}

        {status === 'confirming' && (
          <p className="text-text-secondary">Conectando...</p>
        )}

        {status === 'success' && (
          <p className="text-status-available-text font-semibold">
            Conectado! Voce pode fechar esta janela.
          </p>
        )}

        {status === 'error' && (
          <div>
            <p className="text-status-error-text mb-4">{errorMsg}</p>
            <button
              onClick={() => setStatus('idle')}
              className="text-primary underline text-sm"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PairingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-bg"><p className="text-text-secondary">Carregando...</p></div>}>
      <PairContent />
    </Suspense>
  )
}
