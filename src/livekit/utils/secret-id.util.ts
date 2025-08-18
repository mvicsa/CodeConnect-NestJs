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

export function generatePublicId(): string {
  // Generate a shorter, more user-friendly public ID for public rooms
  const timestamp = Date.now().toString(36);
  const random = randomBytes(3).toString('hex').toUpperCase();
  return `${timestamp}${random}`.slice(0, 8);
}

export function generateUniquePublicId(length: number = 8): string {
  // Generate a unique public ID with configurable length
  const timestamp = Date.now().toString(36);
  const random = randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .toUpperCase();
  return `${timestamp}${random}`.slice(0, length);
}
