type PinCodeInputProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}

export function PinCodeInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
}: PinCodeInputProps) {
  return (
    <div className="pin-code-field">
      <input
        id={id}
        className="pin-code-native"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        aria-label={label}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value.replace(/\D/gu, '').slice(0, 6))}
      />
      <span className="pin-code-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className={`pin-code-slot${value[index] ? ' is-filled' : index === Math.min(value.length, 5) ? ' is-next' : ''}`}>
            {value[index] ?? ''}
          </span>
        ))}
      </span>
    </div>
  )
}
