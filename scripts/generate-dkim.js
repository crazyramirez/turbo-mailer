import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Uso: node scripts/generate-dkim.js tudominio.com [selector]
const domain = process.argv[2] || 'tudominio.com';
const selector = process.argv[3] || 'default';

console.log(`\n🚀 Generando llaves DKIM (RSA 2048) para: ${domain} (selector: ${selector})...\n`);

try {
  // Generar el par de llaves usando el módulo nativo 'crypto'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const formattedPublicKey = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');

  console.log('\n' + '='.repeat(60));
  console.log('1. COPIA ESTO EN TU ARCHIVO .env');
  console.log('='.repeat(60));
  console.log(`DKIM_DOMAIN=${domain}`);
  console.log(`DKIM_SELECTOR=${selector}`);
  
  // Formateamos la llave privada para .env (sustituyendo saltos de línea por \n)
  const envPrivateKey = privateKey.trim().replace(/\r?\n/g, '\\n');
  console.log(`DKIM_PRIVATE_KEY="${envPrivateKey}"`);

  console.log('\n' + '='.repeat(60));
  console.log('2. CONFIGURACIÓN DNS (Registro TXT)');
  console.log('='.repeat(60));
  console.log(`Nombre/Host: ${selector}._domainkey`);
  console.log(`Valor: v=DKIM1; k=rsa; p=${formattedPublicKey}`);
  console.log('='.repeat(60));

  console.log('\n✅ Proceso completado exitosamente.');
  console.log('⚠️  ¡No compartas tu DKIM_PRIVATE_KEY con nadie!');

} catch (error) {
  console.error('\n❌ Error generando las llaves:');
  console.error(error.message);
}
