import type { MobileRuntimeErrorRepository } from '../../data/local/repositories/mobileRuntimeErrorRepository';
import type {
  MobileDeviceContext,
  MobileDiagnosticsSnapshot,
  MobileErrorCaptureContext,
  MobileRuntimeErrorEvent,
} from './model';

export class MobileErrorCaptureService {
  constructor(
    private readonly repository: MobileRuntimeErrorRepository,
    private readonly getDeviceContext: () => MobileDeviceContext = getDefaultMobileDeviceContext,
  ) {}

  async captureError(
    error: unknown,
    context: MobileErrorCaptureContext,
  ): Promise<MobileRuntimeErrorEvent> {
    const deviceContext = this.getDeviceContext();
    const normalized = normalizeError(error);

    return this.repository.saveError({
      id: createLocalErrorId(),
      severity: 'error',
      errorName: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
      capturedAt: new Date().toISOString(),
      reportedAt: null,
      sessionUserId: context.session?.userId ?? null,
      sessionRole: context.session?.role ?? null,
      sessionConnectionMode: context.session?.connectionMode ?? null,
      shellRoute: context.shellRoute,
      devicePlatform: deviceContext.platform,
      devicePlatformVersion: deviceContext.platformVersion,
      appEnvironment: deviceContext.appEnvironment,
      apiBaseUrl: context.apiBaseUrl,
      contextJson: JSON.stringify(context.context ?? {}),
    });
  }

  async getSnapshot(): Promise<MobileDiagnosticsSnapshot> {
    const latestError = await this.repository.getLatestError();

    return {
      capturedErrorCount: await this.repository.countErrors(),
      latestErrorId: latestError?.id ?? null,
      latestErrorMessage: latestError?.message ?? null,
      latestErrorShellRoute: latestError?.shellRoute ?? null,
    };
  }
}

function getDefaultMobileDeviceContext(): MobileDeviceContext {
  const platform = getReactNativePlatform();

  return {
    platform: platform?.OS ?? 'unknown',
    platformVersion: String(platform?.Version ?? 'unknown'),
    appEnvironment: process.env.NODE_ENV ?? 'development',
  };
}

function getReactNativePlatform(): { OS: string; Version: string | number } | null {
  try {
    const reactNative = require('react-native') as {
      Platform?: { OS: string; Version: string | number };
    };
    return reactNative.Platform ?? null;
  } catch {
    return null;
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: 'Error',
    message: String(error),
    stack: null,
  };
}

function createLocalErrorId(): string {
  return `mobile-error-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
