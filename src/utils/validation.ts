/** Digits only, max 10 for phone entry. */
export function sanitizePhoneInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

/** Exactly 10 digits. */
export function isValidPhone(value: string) {
  return /^\d{10}$/.test(sanitizePhoneInput(value))
}

/**
 * Person / brand display names: letters, spaces, and common name punctuation only.
 * Digits and other symbols are rejected.
 */
export function sanitizeNameInput(value: string) {
  return value.replace(/[^A-Za-z\s'.-]/g, '').slice(0, 80)
}

export function isValidName(value: string, { min = 1, max = 80 } = {}) {
  const v = value.trim()
  if (v.length < min || v.length > max) return false
  return /^[A-Za-z]+(?:[A-Za-z\s'.-]*[A-Za-z])?$/.test(v) || /^[A-Za-z]$/.test(v)
}

export function sanitizeOtpInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function isValidOtp(value: string) {
  return /^\d{6}$/.test(sanitizeOtpInput(value))
}
