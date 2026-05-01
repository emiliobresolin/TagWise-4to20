import type { AuthenticatedUser, UserRole } from '../auth/model';

export const MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION = '2026-04-v1' as const;

export const MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS = {
  requestBodyBytes: 24 * 1024,
  id: 128,
  errorName: 128,
  message: 1024,
  stack: 8192,
  capturedAt: 64,
  sessionUserId: 128,
  shellRoute: 64,
  devicePlatform: 32,
  devicePlatformVersion: 64,
  appEnvironment: 32,
  apiBaseUrl: 512,
  contextJson: 4096,
} as const;

export interface MobileRuntimeErrorRequest {
  contractVersion: typeof MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION;
  id: string;
  severity: 'error';
  errorName: string;
  message: string;
  stack: string | null;
  capturedAt: string;
  sessionUserId: string | null;
  sessionRole: UserRole | null;
  sessionConnectionMode: 'connected' | 'offline' | null;
  shellRoute: string | null;
  devicePlatform: string;
  devicePlatformVersion: string;
  appEnvironment: string;
  apiBaseUrl: string | null;
  contextJson: string;
}

export interface MobileRuntimeErrorRecord extends MobileRuntimeErrorRequest {
  reportingUserId: string;
  reportedAt: string;
}

export interface MobileRuntimeErrorResponse extends MobileRuntimeErrorRecord {
  contractVersion: typeof MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION;
}

export class MobileDiagnosticsError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MobileDiagnosticsError';
    this.statusCode = statusCode;
  }
}

export function assertCanReportMobileDiagnostics(user: AuthenticatedUser): void {
  if (
    user.role !== 'technician' &&
    user.role !== 'supervisor' &&
    user.role !== 'manager'
  ) {
    throw new MobileDiagnosticsError('Authenticated session is required for mobile diagnostics.', 403);
  }
}
