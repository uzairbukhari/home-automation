// Usage: npm run hash-password -- "your password"
// Prints the value to store as the DASHBOARD_PASSWORD_HASH secret.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: npm run hash-password -- "a password of at least 12 characters"');
  process.exit(1);
}
const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log(`pbkdf2-sha256$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`);
