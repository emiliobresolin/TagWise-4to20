export type UserRole = 'technician' | 'supervisor' | 'manager';

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

export interface CachedAuthSession {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  lastAuthenticatedAt: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface ActiveUserSession extends CachedAuthSession {
  connectionMode: 'connected' | 'offline';
  reviewActionsAvailable: boolean;
}

export interface SessionRestoreResult {
  state: 'signed_out' | 'signed_in';
  session?: ActiveUserSession;
}

export interface SessionSwitchResult {
  state: 'cleared' | 'blocked';
  message?: string;
}

export function canPerformReviewActions(
  role: UserRole,
  connectionMode: ActiveUserSession['connectionMode'],
): boolean {
  return connectionMode === 'connected' && (role === 'supervisor' || role === 'manager');
}
