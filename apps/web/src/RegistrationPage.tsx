import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import QRCode from 'qrcode'
import { ApiError, ApiUnreachableError, createOrResumeRegistrationDraft, describeServerError, registerWithInvitation, saveRegistrationDraft, validateInvitation, type TotpChallenge } from './api'
import { useAuth } from './auth/useAuth'
import sesurLogo from '../../../logo-1.png'
import { PinCodeInput } from './components/PinCodeInput'
import { TotpQrDialog } from './components/TotpQrDialog'

type RegistrationStep = 1 | 2 | 3
type AuthMethod = 'TOTP' | 'WHATSAPP'
const COUNTRY_NAME = new Intl.DisplayNames(['fr'], { type: 'region' })
const PHONE_COUNTRIES = getCountries()
  .map((country) => ({ country, name: COUNTRY_NAME.of(country) ?? country, callingCode: getCountryCallingCode(country) }))
  .sort((left, right) => left.name.localeCompare(right.name, 'fr'))

function registrationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return 'Code incorrect ou demande expirée. Vérifiez le code et réessayez.'
  if (error instanceof ApiError && error.status === 429) return 'Trop de tentatives. Réessayez dans une minute.'
  return error instanceof ApiError ? error.message : describeServerError(error)
}

async function retryTransientRequest<T>(request: () => Promise<T>): Promise<T> {
  const delays = [600, 1_200, 2_400]
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      const transient = error instanceof ApiUnreachableError || (error instanceof ApiError && error.status === 503)
      if (!transient || attempt >= delays.length) throw error
      await new Promise<void>((resolve) => window.setTimeout(resolve, delays[attempt]))
    }
  }
}

export function RegistrationPage({ token, challenge }: { token?: string; challenge?: TotpChallenge }) {
  const { startTotpEnrollment, verifyTotp, cancelTotp } = useAuth()
  const [step, setStep] = useState<RegistrationStep>(1)
  const [draftToken, setDraftToken] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [email, setEmail] = useState('')
  const [roleName, setRoleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [authMethod, setAuthMethod] = useState<AuthMethod>('TOTP')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('BJ')
  const [code, setCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const qrTriggerRef = useRef<HTMLButtonElement>(null)
  const [loading, setLoading] = useState(true)
  const [invitationReady, setInvitationReady] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [serverUnavailable, setServerUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!token) {
      setInvitationReady(false)
      setServerUnavailable(false)
      setError('Le lien d’invitation est incomplet. Demandez une nouvelle invitation à votre administrateur.')
      setLoading(false)
      return
    }
    const invitationToken = token
    setLoading(true)
    setInvitationReady(false)
    setServerUnavailable(false)
    setError('')
    async function openInvitation() {
      try {
        const invitation = await retryTransientRequest(() => validateInvitation(invitationToken))
        const draft = await retryTransientRequest(() =>
          createOrResumeRegistrationDraft(invitationToken, sessionStorage.getItem('sesur-registration-draft') ?? undefined),
        )
        if (cancelled) return
        setEmail(invitation.email)
        setRoleName(invitation.roleName)
        setDraftToken(draft.draftToken)
        sessionStorage.setItem('sesur-registration-draft', draft.draftToken)
        setFirstName(draft.firstName)
        setLastName(draft.lastName)
        setPasswordSaved(draft.passwordSaved)
        if (draft.authMethod) setAuthMethod(draft.authMethod)
        const savedPhone = draft.whatsappPhone ? parsePhoneNumberFromString(draft.whatsappPhone) : undefined
        if (savedPhone) {
          setPhoneCountry(savedPhone.country ?? 'BJ')
          setWhatsappPhone(savedPhone.nationalNumber)
        }
        if (draft.completedStep > 0) setStep(Math.min(draft.completedStep + (draft.completedStep < 3 ? 1 : 0), 3) as RegistrationStep)
        setInvitationReady(true)
        setError('')
      } catch (reason: unknown) {
        if (cancelled) return
        setServerUnavailable(reason instanceof ApiUnreachableError || (reason instanceof ApiError && reason.status === 503))
        setError(reason instanceof ApiError ? reason.message : describeServerError(reason))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void openInvitation()
    return () => { cancelled = true }
  }, [token, retryCount])

  useEffect(() => {
    let cancelled = false
    setQrCode('')
    setQrModalOpen(challenge?.step === 'enroll_totp' && Boolean(challenge.provisioningUri))
    if (challenge?.provisioningUri) {
      void QRCode.toDataURL(challenge.provisioningUri, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
        .then((dataUrl) => { if (!cancelled) setQrCode(dataUrl) })
        .catch(() => { if (!cancelled) setError('Impossible de générer le QR code. Rechargez la page ou contactez votre administrateur.') })
    }
    return () => { cancelled = true }
  }, [challenge?.provisioningUri, challenge?.step])

  const passwordRules = [
    { label: 'Au moins 8 caractères', valid: password.length >= 8 },
    { label: 'Au moins un chiffre', valid: /\d/u.test(password) },
    { label: 'Au moins une lettre majuscule', valid: /\p{Lu}/u.test(password) },
    { label: 'Au moins un caractère spécial', valid: /[^\p{L}\p{N}]/u.test(password) },
    { label: 'Différent de votre adresse e-mail', valid: password.length > 0 && password.trim().toLowerCase() !== email.trim().toLowerCase() },
  ]
  const passwordValid = passwordRules.every((rule) => rule.valid) && password.length <= 128
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const parsedPhone = whatsappPhone.trim()
    ? parsePhoneNumberFromString(whatsappPhone, phoneCountry)
    : undefined
  const phoneValid = Boolean(parsedPhone?.isValid())

  function updateWhatsappNumber(value: string) {
    const internationalValue = value.trim().replace(/^00/u, '+')
    if (internationalValue.startsWith('+')) {
      const internationalPhone = parsePhoneNumberFromString(internationalValue)
      if (internationalPhone?.isValid()) {
        if (internationalPhone.country) setPhoneCountry(internationalPhone.country)
        setWhatsappPhone(internationalPhone.nationalNumber)
        return
      }
    }
    setWhatsappPhone(value.replace(/[^\d\s().-]/gu, ''))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    if (challenge) {
      try {
        await verifyTotp(code)
        sessionStorage.removeItem('sesur-registration-draft')
        window.location.hash = '/'
      } catch (reason) {
        setError(registrationError(reason))
        setCode('')
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (step === 1) {
      if (!draftToken || !lastName.trim() || !firstName.trim()) {
        setSubmitting(false)
        return
      }
      try {
        await saveRegistrationDraft({ draftToken, step: 'identity', firstName: firstName.trim(), lastName: lastName.trim() })
        setStep(2)
      } catch (reason) {
        setError(registrationError(reason))
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (step === 2) {
      if (passwordSaved && !password) {
        setStep(3)
        setSubmitting(false)
        return
      }
      if (!draftToken || !passwordValid || !passwordsMatch) {
        setSubmitting(false)
        return
      }
      try {
        await saveRegistrationDraft({ draftToken, step: 'password', password, confirmPassword })
        setPasswordSaved(true)
        setPassword('')
        setConfirmPassword('')
        setStep(3)
      } catch (reason) {
        setError(registrationError(reason))
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (!token || !draftToken) {
      setSubmitting(false)
      return
    }

    try {
      await saveRegistrationDraft({
        draftToken,
        step: 'security',
        authMethod,
        ...(authMethod === 'WHATSAPP' && parsedPhone ? { whatsappPhone: parsedPhone.number } : {}),
      })
      const nextChallenge = await registerWithInvitation({ token, draftToken })
      sessionStorage.removeItem('sesur-registration-draft')
      startTotpEnrollment(nextChallenge)
    } catch (reason) {
      setError(registrationError(reason))
    } finally {
      setSubmitting(false)
    }
  }

  function exitEnrollment() {
    cancelTotp()
    sessionStorage.removeItem('sesur-registration-draft')
    window.location.hash = '/'
  }

  function closeQrModal() {
    setQrModalOpen(false)
    window.requestAnimationFrame(() => qrTriggerRef.current?.focus())
  }

  return (
    <main className="login registration-shell">
      <form className="login-card registration-card" onSubmit={(event) => void submit(event)} aria-labelledby="register-title">
        <div className="login-brand">
          <img className="login-logo" src={sesurLogo} alt="SESUR" />
          <span>SESUR <i>/</i> CRM</span>
        </div>
        <div className="registration-heading">
          <span className="registration-kicker">{challenge ? 'ACTIVATION DU COMPTE' : 'VOTRE ESPACE SESUR'}</span>
          <h1 id="register-title">{challenge ? challenge.step === 'enroll_whatsapp' ? 'Vérifier votre numéro' : 'Activer la double authentification' : 'Créer votre compte'}</h1>
          <p className="registration-intro">{challenge ? challenge.step === 'enroll_totp' ? 'Scannez le QR code dans la fenêtre qui s’affiche, puis saisissez le code généré.' : challenge.step === 'enroll_whatsapp' ? `Saisissez le code envoyé sur WhatsApp${challenge.maskedPhone ? ` (${challenge.maskedPhone})` : ''}.` : 'Saisissez le code de votre application d’authentification.' : loading ? 'Vérification de votre invitation…' : 'Configurez votre accès sécurisé en quelques étapes.'}</p>
        </div>

        {!loading && invitationReady && (
          <>
            <div className="invitation-email">
              <span>Adresse e-mail de l’invitation</span>
              <strong>{email}</strong>
              {roleName && <small>Profil attribué · {roleName}</small>}
            </div>
            {!challenge && <p role="status" className="registration-save-note">Vos étapes terminées sont conservées jusqu’à l’expiration de l’invitation.</p>}

            {challenge ? (
              <section className="registration-challenge" aria-labelledby="challenge-step-title">
                <h2 className="registration-stage-title" id="challenge-step-title">{challenge.step === 'enroll_totp' ? 'Configurer Google Authenticator' : challenge.step === 'enroll_whatsapp' ? 'Confirmer le numéro WhatsApp' : 'Saisir le code de vérification'}</h2>
                {challenge.step === 'enroll_totp' && challenge.provisioningUri && (
                  <div className="registration-qr-prompt">
                    <p>Utilisez Google Authenticator pour ajouter votre compte, puis saisissez le code généré.</p>
                    <button ref={qrTriggerRef} type="button" className="auth-secondary registration-qr-button" onClick={() => setQrModalOpen(true)}>Afficher le QR code</button>
                  </div>
                )}
                <label htmlFor="registration-code">{challenge.step === 'enroll_whatsapp' || challenge.step === 'verify_whatsapp' ? 'Code reçu sur WhatsApp' : 'Code à 6 chiffres'}</label>
                <PinCodeInput id="registration-code" label="Code de vérification à 6 chiffres" value={code} onChange={setCode} disabled={submitting} autoFocus />
                <div className="registration-actions registration-challenge-actions">
                  <button type="button" className="auth-secondary" onClick={exitEnrollment}>Annuler</button>
                  <button type="submit" disabled={submitting || code.length !== 6} aria-busy={submitting || undefined}>{submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Vérification…' : 'Activer et continuer'}</button>
                </div>
              </section>
            ) : (
              <>
            <ol className="registration-steps" aria-label="Étapes de création du compte">
              {(['Identité', 'Mot de passe', 'Authentification'] as const).map((label, index) => {
                const stepNumber = (index + 1) as RegistrationStep
                return (
                  <li key={label} className={step === stepNumber ? 'is-current' : step > stepNumber ? 'is-complete' : ''} aria-current={step === stepNumber ? 'step' : undefined}>
                    <span className="registration-step-number">{step > stepNumber ? '✓' : stepNumber}</span>
                    <span>{label}</span>
                  </li>
                )
              })}
            </ol>

            {step === 1 && (
              <section aria-labelledby="identity-step-title">
                <h2 className="registration-stage-title" id="identity-step-title">Votre identité</h2>
                <label htmlFor="register-last-name">Nom</label>
                <input id="register-last-name" autoComplete="family-name" maxLength={100} required value={lastName} onChange={(event) => setLastName(event.target.value)} autoFocus disabled={submitting} />
                <label htmlFor="register-first-name">Prénom</label>
                <input id="register-first-name" autoComplete="given-name" maxLength={100} required value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={submitting} />
                <button type="submit" disabled={submitting || !lastName.trim() || !firstName.trim()} aria-busy={submitting || undefined}>{submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Enregistrement…' : 'Continuer'}</button>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="password-step-title">
                <h2 className="registration-stage-title" id="password-step-title">Définissez votre mot de passe</h2>
                {passwordSaved ? (
                  <p role="status" className="registration-password-saved"><span aria-hidden="true">✓</span> Votre mot de passe est conservé de manière sécurisée.</p>
                ) : (
                  <>
                    <label htmlFor="register-password">Mot de passe</label>
                    <div className="password-field">
                      <input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} autoFocus disabled={submitting} />
                      <PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} field="le mot de passe" />
                    </div>
                    <ul className="password-rules" aria-label="Critères du mot de passe" aria-live="polite">
                      {passwordRules.map((rule) => <PasswordRule key={rule.label} label={rule.label} valid={rule.valid} touched={password.length > 0} />)}
                      {password.length > 128 && <PasswordRule label="128 caractères maximum" valid={false} touched />}
                    </ul>
                    <label htmlFor="register-confirm-password">Confirmer le mot de passe</label>
                    <div className="password-field">
                      <input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={submitting} />
                      <PasswordVisibilityButton visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} field="le mot de passe de confirmation" />
                    </div>
                    {confirmPassword.length > 0 && (
                      <ul className="password-rules" aria-label="Vérification du mot de passe de confirmation" aria-live="polite">
                        <PasswordRule
                          label={passwordsMatch ? 'Les deux mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
                          valid={passwordsMatch}
                          touched
                        />
                      </ul>
                    )}
                  </>
                )}
                <div className="registration-actions">
                  <button type="button" className="auth-secondary" onClick={() => setStep(1)} disabled={submitting}>Retour</button>
                  <button type="submit" disabled={submitting || (!passwordSaved && (!passwordValid || !passwordsMatch))} aria-busy={submitting || undefined}>{submitting && <span className="button-spinner" aria-hidden="true" />} {submitting ? 'Enregistrement…' : passwordSaved ? 'Continuer' : 'Confirmer le mot de passe'}</button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="mfa-step-title">
                <h2 className="registration-stage-title" id="mfa-step-title">Choisissez votre méthode de vérification</h2>
                <fieldset className="mfa-options">
                  <legend className="sr-only">Méthode d’authentification à deux facteurs</legend>
                  <label className={authMethod === 'TOTP' ? 'mfa-option is-selected' : 'mfa-option'}>
                    <input type="radio" name="authMethod" value="TOTP" checked={authMethod === 'TOTP'} onChange={() => setAuthMethod('TOTP')} />
                    <span className="mfa-option-copy"><strong>Google Authenticator</strong><small>Scannez un QR code et saisissez le code de l’application.</small></span>
                  </label>
                  <label className={authMethod === 'WHATSAPP' ? 'mfa-option is-selected' : 'mfa-option'}>
                    <input type="radio" name="authMethod" value="WHATSAPP" checked={authMethod === 'WHATSAPP'} onChange={() => setAuthMethod('WHATSAPP')} />
                    <span className="mfa-option-copy"><strong>WhatsApp</strong><small>Recevez un code à usage unique sur votre numéro WhatsApp.</small></span>
                  </label>
                </fieldset>
                {authMethod === 'WHATSAPP' && (
                  <>
                    <label htmlFor="register-whatsapp">Numéro WhatsApp</label>
                    <div className="phone-number-row">
                      <select className="select-control" aria-label="Pays et indicatif" value={phoneCountry} onChange={(event) => setPhoneCountry(event.target.value as CountryCode)} disabled={submitting}>
                        {PHONE_COUNTRIES.map(({ country, name, callingCode }) => <option key={country} value={country}>{name} (+{callingCode})</option>)}
                      </select>
                      <input id="register-whatsapp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Numéro" maxLength={24} value={whatsappPhone} onChange={(event) => updateWhatsappNumber(event.target.value)} aria-describedby="whatsapp-help" aria-invalid={whatsappPhone.length > 0 && !phoneValid} autoFocus disabled={submitting} />
                    </div>
                    <p className={`auth-note phone-validation${whatsappPhone.length > 0 ? phoneValid ? ' is-valid' : ' is-invalid' : ''}`} id="whatsapp-help">{whatsappPhone.length === 0 ? `Saisissez le numéro national. L’indicatif +${getCountryCallingCode(phoneCountry)} sera ajouté automatiquement.` : phoneValid ? `Numéro valide · ${parsedPhone?.number}` : 'Numéro incomplet ou invalide pour le pays sélectionné.'}</p>
                  </>
                )}
                <div className="registration-actions">
                  <button type="button" className="auth-secondary" onClick={() => setStep(2)} disabled={submitting}>Retour</button>
                  <button type="submit" disabled={submitting || (authMethod === 'WHATSAPP' && !phoneValid)} aria-busy={submitting || undefined}>
                    {submitting && <span className="button-spinner" aria-hidden="true" />}{submitting ? 'Création…' : 'Créer mon compte'}
                  </button>
                </div>
              </section>
            )}
              </>
            )}
          </>
        )}
        {error && <p role="alert" className="login-error">{error}</p>}
        {!loading && error && !invitationReady && (
          <div className="registration-error-actions">
            {serverUnavailable
              ? <button type="button" className="auth-secondary" onClick={() => setRetryCount((count) => count + 1)}>Réessayer</button>
              : <p>Si ce lien est expiré ou invalide, demandez une nouvelle invitation à votre administrateur.</p>}
          </div>
        )}
      </form>
      {challenge?.step === 'enroll_totp' && challenge.provisioningUri && qrModalOpen && (
        <TotpQrDialog qrCode={qrCode} onClose={closeQrModal} />
      )}
    </main>
  )
}

function PasswordRule({ label, valid, touched }: { label: string; valid: boolean; touched: boolean }) {
  return (
    <li className={valid ? 'is-valid' : touched ? 'is-invalid' : ''}>
      <span className="password-rule-icon" aria-hidden="true">{valid ? '✓' : touched ? '×' : '○'}</span>
      <span>{label}</span>
    </li>
  )
}

function PasswordVisibilityButton({
  visible,
  onToggle,
  field,
}: {
  visible: boolean
  onToggle: () => void
  field: string
}) {
  return (
    <button
      type="button"
      className="password-visibility"
      aria-label={visible ? 'Masquer ' + field : 'Afficher ' + field}
      aria-pressed={visible}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2.5 12s3.4-7 9.5-7 9.5 7 9.5 7-3.4 7-9.5 7-9.5-7-9.5-7Z" />
        <circle cx="12" cy="12" r="3" />
        {!visible && <path d="m4 4 16 16" />}
      </svg>
    </button>
  )
}

