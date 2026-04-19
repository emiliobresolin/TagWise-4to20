import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AuthConfig } from '../../config/env';
import {
  AuthenticationError,
  type AccessTokenClaims,
  type AuthenticatedUser,
  type RefreshTokenClaims,
  type TokenPair,
} from './model';

type TokenClaims = AccessTokenClaims | RefreshTokenClaims;

interface TokenHeader {
  alg: 'HS256';
  typ: 'JWT';
}

export function issueTokenPair(
  user: AuthenticatedUser,
  sessionVersion: number,
  config: AuthConfig,
  now: Date = new Date(),
): TokenPair {
  const issuedAtSeconds = toEpochSeconds(now);
  const accessExp = issuedAtSeconds + config.accessTokenTtlSeconds;
  const refreshExp = issuedAtSeconds + config.refreshTokenTtlSeconds;

  const accessToken = signToken(
    {
      sub: user.id,
      role: user.role,
      typ: 'access',
      exp: accessExp,
      ver: sessionVersion,
    },
    config.tokenSecret,
  );
  const refreshToken = signToken(
    {
      sub: user.id,
      role: user.role,
      typ: 'refresh',
      exp: refreshExp,
      ver: sessionVersion,
    },
    config.tokenSecret,
  );

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(refreshExp * 1000).toISOString(),
  };
}

export function verifyRefreshToken(
  token: string,
  config: AuthConfig,
  now: Date = new Date(),
): RefreshTokenClaims {
  const claims = verifyToken(token, config.tokenSecret);

  if (claims.typ !== 'refresh') {
    throw new AuthenticationError('Invalid refresh token type.');
  }

  if (claims.exp <= toEpochSeconds(now)) {
    throw new AuthenticationError('Refresh token expired.');
  }

  return claims;
}

function signToken(claims: TokenClaims, secret: string): string {
  const header: TokenHeader = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = encodeSegment(header);
  const encodedPayload = encodeSegment(claims);
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token: string, secret: string): TokenClaims {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new AuthenticationError('Malformed token.');
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = Buffer.from(encodedSignature, 'base64url');

  if (expectedSignature.length !== actualSignature.length) {
    throw new AuthenticationError('Invalid token signature.');
  }

  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    throw new AuthenticationError('Invalid token signature.');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as TokenClaims;
  return payload;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url');
}

function toEpochSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}
