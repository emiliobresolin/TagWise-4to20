import type { ActiveUserSession, SessionRestoreResult } from '../auth/model';
import type { SyncRetrySummary } from './syncStateService';

export type ConnectivityRegainResult =
  | {
      state: 'no-session' | 'already-connected' | 'still-offline' | 'signed-out';
      session: ActiveUserSession | null;
      retrySummary: SyncRetrySummary;
    }
  | {
      state: 'reconnected';
      session: ActiveUserSession;
      retrySummary: SyncRetrySummary;
    };

interface ConnectivityRegainInput {
  currentSession: ActiveUserSession | null;
  restoreSession: () => Promise<SessionRestoreResult>;
  retryEligibleReports: (session: ActiveUserSession) => Promise<SyncRetrySummary>;
}

const EMPTY_RETRY_SUMMARY: SyncRetrySummary = {
  attempted: 0,
  succeeded: 0,
  failed: 0,
};

export async function detectConnectivityRegain(
  input: ConnectivityRegainInput,
): Promise<ConnectivityRegainResult> {
  if (!input.currentSession) {
    return {
      state: 'no-session',
      session: null,
      retrySummary: EMPTY_RETRY_SUMMARY,
    };
  }

  if (input.currentSession.connectionMode === 'connected') {
    return {
      state: 'already-connected',
      session: input.currentSession,
      retrySummary: EMPTY_RETRY_SUMMARY,
    };
  }

  const restoredSession = await input.restoreSession();
  if (restoredSession.state !== 'signed_in' || !restoredSession.session) {
    return {
      state: 'signed-out',
      session: input.currentSession,
      retrySummary: EMPTY_RETRY_SUMMARY,
    };
  }

  if (restoredSession.session.connectionMode !== 'connected') {
    return {
      state: 'still-offline',
      session: restoredSession.session,
      retrySummary: EMPTY_RETRY_SUMMARY,
    };
  }

  return {
    state: 'reconnected',
    session: restoredSession.session,
    retrySummary: await input.retryEligibleReports(restoredSession.session),
  };
}
