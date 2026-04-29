// Improved Regex for professional validation
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  const cleanEmail = email.trim()
  if (cleanEmail.length > 254) return false
  return EMAIL_RE.test(cleanEmail)
}

export function truncate(value: any, max: number): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
  return s.length === 0 ? null : s.slice(0, max)
}

export function sanitizeContactFields(raw: Record<string, any>) {
  const email = (String(raw.email || '').trim().replace(/[\s"']/g, '')).toLowerCase() // Remove quotes and spaces from email
  
  return {
    email: email.slice(0, 254),
    name: truncate(raw.name, 255),
    company: truncate(raw.company, 255),
    role: truncate(raw.role, 255),
    phone: truncate(raw.phone, 50),
    linkedin: truncate(raw.linkedin, 500),
    url: truncate(raw.url, 500),
    youtube: truncate(raw.youtube, 500),
    instagram: truncate(raw.instagram, 500),
  }
}
