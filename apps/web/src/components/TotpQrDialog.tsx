import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export function TotpQrDialog({
  qrCode,
  onClose,
}: {
  qrCode: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const closeButton = dialogRef.current?.querySelector<HTMLButtonElement>('.totp-qr-close')
    closeButton?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(
    <div
      className="totp-qr-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
    >
      <section
        ref={dialogRef}
        className="totp-qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="totp-qr-title"
        aria-describedby="totp-qr-description"
      >
        <button className="totp-qr-close" type="button" aria-label="Fermer la fenêtre du QR code" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <span className="totp-qr-kicker">GOOGLE AUTHENTICATOR</span>
        <h2 id="totp-qr-title">Scannez ce QR code</h2>
        <p id="totp-qr-description">Ouvrez Google Authenticator, appuyez sur « + », puis choisissez « Scanner un code QR ».</p>
        <div className="totp-qr-frame">
          {qrCode
            ? <img src={qrCode} alt="QR code de configuration Google Authenticator" />
            : <span role="status">Préparation du QR code…</span>}
        </div>
        <p className="totp-qr-next-step">Vous pourrez ensuite saisir le code à 6 chiffres dans le formulaire.</p>
        <button className="totp-qr-confirm" type="button" onClick={onClose}>J’ai scanné le code</button>
      </section>
    </div>,
    document.body,
  )
}
