import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface PasswordHashRecord {
  salt: string;
  hash: string;
}

export function hashPassword(password: string, salt: string = createPasswordSalt()): PasswordHashRecord {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return {
    salt,
    hash,
  };
}

export function verifyPassword(password: string, record: PasswordHashRecord): boolean {
  const expected = Buffer.from(record.hash, 'hex');
  const actual = Buffer.from(scryptSync(password, record.salt, 64));

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function createPasswordSalt(): string {
  return randomBytes(16).toString('hex');
}
