import type { AuthenticatedUser } from '../auth/model';
import {
  assertCanReportMobileDiagnostics,
  MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
  MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS,
  MobileDiagnosticsError,
  type MobileRuntimeErrorRecord,
  type MobileRuntimeErrorRequest,
  type MobileRuntimeErrorResponse,
} from './model';
import type { MobileDiagnosticsRepository } from './mobileDiagnosticsRepository';

export class MobileDiagnosticsService {
  constructor(
    private readonly repository: MobileDiagnosticsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reportRuntimeError(
    user: AuthenticatedUser,
    request: MobileRuntimeErrorRequest,
  ): Promise<MobileRuntimeErrorResponse> {
    assertCanReportMobileDiagnostics(user);
    const normalizedRequest = normalizeMobileRuntimeErrorRequest(request);

    const record: MobileRuntimeErrorRecord = {
      ...normalizedRequest,
      contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
      reportingUserId: user.id,
      reportedAt: this.now().toISOString(),
    };
    const persisted = await this.repository.upsertRuntimeError(record);

    return {
      ...persisted,
      contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
    };
  }
}

function normalizeMobileRuntimeErrorRequest(
  request: MobileRuntimeErrorRequest,
): MobileRuntimeErrorRequest {
  if (request.contractVersion !== MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION) {
    throw new MobileDiagnosticsError(
      `Mobile diagnostics contractVersion must be ${MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION}.`,
      400,
    );
  }

  if (request.severity !== 'error') {
    throw new MobileDiagnosticsError('Mobile diagnostics severity must be error.', 400);
  }

  if (
    request.sessionRole !== null &&
    request.sessionRole !== 'technician' &&
    request.sessionRole !== 'supervisor' &&
    request.sessionRole !== 'manager'
  ) {
    throw new MobileDiagnosticsError('Mobile diagnostics sessionRole is unsupported.', 400);
  }

  if (
    request.sessionConnectionMode !== null &&
    request.sessionConnectionMode !== 'connected' &&
    request.sessionConnectionMode !== 'offline'
  ) {
    throw new MobileDiagnosticsError(
      'Mobile diagnostics sessionConnectionMode is unsupported.',
      400,
    );
  }

  if (Number.isNaN(new Date(request.capturedAt).getTime())) {
    throw new MobileDiagnosticsError('Mobile diagnostics capturedAt must be an ISO timestamp.', 400);
  }

  return {
    contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
    id: requiredBoundedString(request.id, 'id', MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.id),
    severity: 'error',
    errorName: requiredBoundedString(
      request.errorName,
      'errorName',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.errorName,
    ),
    message: requiredBoundedString(
      request.message,
      'message',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.message,
    ),
    stack: optionalBoundedString(
      request.stack,
      'stack',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.stack,
    ),
    capturedAt: requiredBoundedString(
      request.capturedAt,
      'capturedAt',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.capturedAt,
    ),
    sessionUserId: optionalBoundedString(
      request.sessionUserId,
      'sessionUserId',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.sessionUserId,
    ),
    sessionRole: request.sessionRole,
    sessionConnectionMode: request.sessionConnectionMode,
    shellRoute: optionalBoundedString(
      request.shellRoute,
      'shellRoute',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.shellRoute,
    ),
    devicePlatform: requiredBoundedString(
      request.devicePlatform,
      'devicePlatform',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.devicePlatform,
    ),
    devicePlatformVersion: requiredBoundedString(
      request.devicePlatformVersion,
      'devicePlatformVersion',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.devicePlatformVersion,
    ),
    appEnvironment: requiredBoundedString(
      request.appEnvironment,
      'appEnvironment',
      MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.appEnvironment,
    ),
    apiBaseUrl: normalizeOptionalUrlOrigin(request.apiBaseUrl),
    contextJson: normalizeContextJson(request.contextJson),
  };
}

function normalizeContextJson(value: string): string {
  if (typeof value !== 'string') {
    throw new MobileDiagnosticsError('Mobile diagnostics contextJson must be a string.', 400);
  }

  assertMaxLength(
    value,
    'contextJson',
    MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.contextJson,
  );

  let parsed: unknown;
  try {
    parsed = value.trim().length > 0 ? JSON.parse(value) : {};
  } catch {
    throw new MobileDiagnosticsError('Mobile diagnostics contextJson must be valid JSON.', 400);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MobileDiagnosticsError(
      'Mobile diagnostics contextJson must be a JSON object.',
      400,
    );
  }

  const normalized = JSON.stringify(redactSensitiveContext(parsed));
  assertMaxLength(
    normalized,
    'contextJson',
    MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.contextJson,
  );
  return normalized;
}

function requiredBoundedString(value: unknown, key: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MobileDiagnosticsError(`Mobile diagnostics requires ${key}.`, 400);
  }

  const normalized = value.trim();
  assertMaxLength(normalized, key, maxLength);
  return normalized;
}

function optionalBoundedString(
  value: unknown,
  key: string,
  maxLength: number,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new MobileDiagnosticsError(`Mobile diagnostics ${key} must be null or string.`, 400);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  assertMaxLength(normalized, key, maxLength);
  return normalized;
}

function normalizeOptionalUrlOrigin(value: unknown): string | null {
  const normalized = optionalBoundedString(
    value,
    'apiBaseUrl',
    MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.apiBaseUrl,
  );
  if (!normalized) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new MobileDiagnosticsError('Mobile diagnostics apiBaseUrl must be a valid URL.', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MobileDiagnosticsError('Mobile diagnostics apiBaseUrl must use http or https.', 400);
  }

  return parsed.origin;
}

function assertMaxLength(value: string, key: string, maxLength: number): void {
  if (Buffer.byteLength(value, 'utf8') > maxLength) {
    throw new MobileDiagnosticsError(
      `Mobile diagnostics ${key} must not exceed ${maxLength} bytes.`,
      400,
    );
  }
}

function redactSensitiveContext(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveContext);
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveContextKey(key) ? '[redacted]' : redactSensitiveContext(entry),
    ]),
  );
}

function isSensitiveContextKey(key: string): boolean {
  return /(authorization|cookie|password|secret|token)/i.test(key);
}
