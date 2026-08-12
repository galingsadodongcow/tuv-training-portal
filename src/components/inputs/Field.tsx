'use client'
import { useState, ReactNode } from 'react'

// Inline field validation, generalised from SalesEntry's `tried` gate (#125).
//
// A field's error is shown once the user has either submitted the form once
// (`tried`) OR blurred that field (`touched`) — so nothing shouts while the form
// is first being filled, but a mistake surfaces during entry rather than only
// after a failed submit. Callers compute an errors map from their own state and
// pass it to submit(); the hook flips `tried` and reports whether it is clean.
export function useFormErrors() {
  const [tried, setTried] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const touch = (name: string) => setTouched((t) => (t[name] ? t : { ...t, [name]: true }))
  const shows = (name: string) => tried || !!touched[name]

  // Reveal every error (submit was attempted) and report if the form is clean.
  const submit = (errors: Record<string, string | null | undefined>) => {
    setTried(true)
    return !Object.values(errors).some(Boolean)
  }
  const reset = () => { setTried(false); setTouched({}) }

  // Spread onto an input/select/textarea: wires the blur-to-touch and the
  // invalid styling/aria only once the error is allowed to show.
  const inputProps = (name: string, error?: string | null, extraClass?: string) => {
    const invalid = shows(name) && !!error
    return {
      onBlur: () => touch(name),
      'aria-invalid': invalid || undefined,
      className: [extraClass, invalid ? 'invalid' : ''].filter(Boolean).join(' ') || undefined,
    }
  }

  return { tried, shows, touch, submit, reset, inputProps }
}

// A labelled field wrapper that renders the required marker and the inline error
// (or a hint when there's no error to show). The control itself is the child, so
// this works for inputs, selects, textareas and the Combobox alike.
export function Field({
  label, required, error, show, hint, htmlFor, children,
}: {
  label: ReactNode
  required?: boolean
  error?: string | null
  show?: boolean
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  const visible = !!(show && error)
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>{label}{required && <span className="req-star" aria-hidden="true">*</span>}</span>
      {children}
      {visible && <span className="field-error" role="alert">{error}</span>}
      {!visible && hint && <span className="fill-label">{hint}</span>}
    </label>
  )
}
