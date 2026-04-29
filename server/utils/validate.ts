const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{1,63}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null
  const s = String(value).trim()
  return s.length === 0 ? null : s.slice(0, max)
}

export function sanitizeContactFields(raw: Record<string, any>) {
  return {
    email: truncate(raw.email, 254)?.toLowerCase() ?? '',
    name: truncate(raw.name, 255),
    company: truncate(raw.company, 255),
    agency: truncate(raw.agency, 255),
    role: truncate(raw.role, 255),
    phone: truncate(raw.phone, 50),
    linkedin: truncate(raw.linkedin, 500),
    url: truncate(raw.url, 500),
    youtube: truncate(raw.youtube, 500),
    instagram: truncate(raw.instagram, 500),
  }
}
