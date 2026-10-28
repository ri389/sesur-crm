import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { TotpChallenge } from './api'
import { ApiError as ApiErrorClass, describeServerError } from './api'
import { useAuth } from './auth/useAuth'
import QRCode from 'qrcode'
import sesurLogo from '../../../logo-1.png'
import { PinCodeInput } from './components/PinCodeInput'
import { TotpQrDialog } from './components/TotpQrDialog'

function describeChallengeError(error: unknown): string {
  if (error instanceof ApiErrorClass) {
    if (error.status === 401) return 'Code incorrect ou demande expirée. Vérifiez votre application d’authentification et réessayez.'
    if (error.status === 429) return 'Trop de tentatives. Réessayez dans une minute.'
    if (error.status === 503) return error.message
  }
  return describeServerError(error)
}

export function TotpChallengePage({ challenge }: { challenge: TotpChallenge }) {
  const { verifyTotp, cancelTotp } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const qrTriggerRef = useRef<HTMLButtonElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const enrollment = challenge.step === 'enroll_totp' || challenge.step === 'enroll_whatsapp'
  const whatsapp = challenge.step === 'enroll_whatsapp' || challenge.step === 'verify_whatsapp'
  const totpEnrollment = challenge.step === 'enroll_totp'

  useEffect(() => {
    let cancelled = false
    setQrCode('')
    setQrModalOpen(totpEnrollment && Boolean(challenge.provisioningUri))
    if (totpEnrollment && challenge.provisioningUri) {
      void QRCode.toDataURL(challenge.provisioningUri, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
      }).then((dataUrl) => {
        if (!cancelled) setQrCode(dataUrl)
      }).catch(() => {
        if (!cancelled) setError('Impossible de générer le QR code. Rechargez la page ou contactez votre administrateur.')
      })
    }
    return () => { cancelled = true }
  }, [challenge.provisioningUri, totpEnrollment])

  function closeQrModal() {
    setQrModalOpen(false)
    window.requestAnimationFrame(() => qrTriggerRef.current?.focus())
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await verifyTotp(code)
      window.location.hash = '/'
    } catch (reason) {
      setError(describeChallengeError(reason))
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={(event) => void submit(event)} aria-labelledby="totp-title">
        <div className="login-brand">
          <img className="login-logo" src={sesurLogo} alt="SESUR" />
          <span>SESUR <i>/</i> CRM</span>
        </div>
        <h1 id="totp-title">
          {enrollment
            ? whatsapp ? 'Activer l’authentification WhatsApp' : 'Activer la double authentification'
            : 'Vérification en deux étapes'}
        </h1>
        <p>
          {totpEnrollment
            ? `Configurez Google Authenticator pour ${challenge.email}.`
            : whatsapp
              ? `Saisissez le code envoyé sur WhatsApp${challenge.maskedPhone ? ` (${challenge.maskedPhone})` : ''}.`
              : `Saisissez le code affiché dans Google Authenticator pour ${challenge.email}.`}
        </p>
        {enrollment && challenge.provisioningUri && (
          <div className="totp-qr-prompt">
            <p>Ajoutez votre compte dans Google Authenticator, puis saisissez le code généré.</p>
            <button ref={qrTriggerRef} type="button" className="auth-secondary" onClick={() => setQrModalOpen(true)}>Afficher le QR code</button>
          </div>
        )}
        <label htmlFor="totp-code">{whatsapp ? 'Code reçu sur WhatsApp' : 'Code à 6 chiffres'}</label>
        <PinCodeInput id="totp-code" label={whatsapp ? 'Code reçu sur WhatsApp' : 'Code à 6 chiffres'} value={code} onChange={setCode} disabled={submitting} autoFocus />
        {error && <p role="alert" className="login-error">{error}</p>}
        <button type="submit" disabled={submitting || code.length !== 6} aria-busy={submitting || undefined}>{submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Vérification…' : enrollment ? 'Activer et se connecter' : 'Se connecter'}</button>
        <button type="button" className="auth-secondary" onClick={cancelTotp}>Annuler</button>
      </form>
      {totpEnrollment && challenge.provisioningUri && qrModalOpen && (
        <TotpQrDialog qrCode={qrCode} onClose={closeQrModal} />
      )}
    </main>
  )
}
