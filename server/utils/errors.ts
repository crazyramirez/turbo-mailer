interface SmtpErrorInfo {
  code: string
  message: string
  hint?: string
}

export function userFriendlySmtpError(err: unknown): SmtpErrorInfo {
  const e = err as any
  const msg: string = e?.message ?? String(err)
  const code: string = e?.code ?? ''
  const responseCode: number = e?.responseCode ?? 0

  // Authentication failures
  if (code === 'EAUTH' || responseCode === 535 || msg.includes('535') || msg.toLowerCase().includes('authentication')) {
    return { code: 'EAUTH', message: 'Credenciales SMTP incorrectas.', hint: 'Verifica usuario y contraseña en Ajustes.' }
  }

  // Connection refused / host not reachable
  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
    return { code: 'ECONNREFUSED', message: 'No se puede conectar al servidor SMTP.', hint: 'Verifica el host y puerto en Ajustes.' }
  }

  // DNS resolution failure
  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND')) {
    return { code: 'ENOTFOUND', message: 'Host SMTP no encontrado.', hint: 'Comprueba que el dominio SMTP sea correcto.' }
  }

  // TLS/SSL errors
  if (code === 'ESOCKET' || msg.includes('SSL') || msg.includes('TLS') || msg.includes('certificate')) {
    return { code: 'ESSL', message: 'Error de certificado SSL/TLS.', hint: 'Prueba cambiar el modo seguro (SSL/TLS vs STARTTLS) en Ajustes.' }
  }

  // Connection timeout
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || msg.includes('timeout')) {
    return { code: 'ETIMEDOUT', message: 'Tiempo de conexión agotado.', hint: 'El servidor no responde. Verifica firewall o puerto SMTP.' }
  }

  // Rate limiting / too many connections
  if (responseCode === 421 || responseCode === 450 || msg.includes('too many') || msg.includes('rate limit')) {
    return { code: 'ERATELIMIT', message: 'Demasiadas conexiones o límite de envío alcanzado.', hint: 'Reduce la velocidad de envío en Ajustes.' }
  }

  // Mailbox full / user unknown
  if (responseCode === 550 || responseCode === 551 || responseCode === 552 || responseCode === 553) {
    return { code: 'EREBOUNCE', message: `Dirección rechazada (${responseCode}).`, hint: 'El destinatario no existe o su buzón está lleno.' }
  }

  // SPF/DKIM/DMARC rejection
  if (msg.includes('SPF') || msg.includes('DKIM') || msg.includes('DMARC')) {
    return { code: 'EAUTH_POLICY', message: 'Email rechazado por política SPF/DKIM/DMARC.', hint: 'Configura correctamente los registros DNS o activa DKIM en Ajustes.' }
  }

  // Generic
  return { code: code || 'EUNKNOWN', message: `Error SMTP: ${msg.slice(0, 120)}` }
}
