import { hashPasswordScrypt } from '../api/_lib/auth.js';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const password = args[0] ?? '';

if (!password) {
  console.error('Penggunaan: npm run hash-password -- "<password-minimal-8-karakter>"');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Error: Password minimal 8 karakter.');
  process.exit(1);
}

const hash = hashPasswordScrypt(password);
console.error('Salin nilai hash berikut ke environment variable ADMIN_PASSWORD_HASH:');
console.log(hash);
