import type { UserRole } from '../auth/model';
import type { ShellRoute } from '../app-shell/model';

export interface MobileRuntimeErrorEvent {
  id: string;
  severity: string;
  errorName: string;
  message: string;
  stack: string | null;
  capturedAt: string;
  sessionUserId: string | null;
  sessionRole: UserRole | null;
  sessionConnectionMode: 'connected' | 'offline' | null;
  shellRoute: ShellRoute | null;
  devicePlatform: string;
  devicePlatformVersion: string;
  appEnvironment: string;
  apiBaseUrl: string | null;
  contextJson: string;
}

export interface WriteMobileRuntimeErrorInput extends MobileRuntimeErrorEvent {}

export interface MobileErrorCaptureContext {
  session: {
    userId: string;
    role: UserRole;
    connectionMode: 'connected' | 'offline';
  } | null;
  shellRoute: ShellRoute | null;
  apiBaseUrl: string | null;
  context?: Record<string, unknown>;
}

export interface MobileDeviceContext {
  platform: string;
  platformVersion: string;
  appEnvironment: string;
}

export interface MobileDiagnosticsSnapshot {
  capturedErrorCount: number;
  latestErrorId: string | null;
  latestErrorMessage: string | null;
  latestErrorShellRoute: ShellRoute | null;
}
