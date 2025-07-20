import { randomBytes } from 'crypto';

export function generateSecretId(): string {
  // Generate a 12-character alphanumeric secret ID
  return randomBytes(6).toString('hex').toUpperCase();
}

export function generateUniqueSecretId(length: number = 16): string {
  // Generate a unique secret ID with configurable length
  const timestamp = Date.now().toString(36);
  const random = randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .toUpperCase();
  return `${timestamp}${random}`.slice(0, length);
}
