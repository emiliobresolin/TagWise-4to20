import type { UserRole } from '../../config/env';

export { type UserRole } from '../../config/env';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthSessionPayload {
  user: AuthenticatedUser;
  tokens: TokenPair;
}

export interface RefreshTokenClaims {
  sub: string;
  role: UserRole;
  typ: 'refresh';
  exp: number;
  ver: number;
}

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  typ: 'access';
  exp: number;
  ver: number;
}

export class AuthenticationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
  }
}
