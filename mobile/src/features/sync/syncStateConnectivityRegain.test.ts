import { describe, expect, it, vi } from 'vitest';

import type { ActiveUserSession } from '../auth/model';
import { detectConnectivityRegain } from './syncConnectivityRegain';

const offlineSession: ActiveUserSession = {
  userId: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
  lastAuthenticatedAt: '2026-04-24T10:00:00.000Z',
  accessTokenExpiresAt: '2026-04-24T11:00:00.000Z',
  refreshTokenExpiresAt: '2026-04-25T11:00:00.000Z',
  connectionMode: 'offline',
  reviewActionsAvailable: false,
};

const connectedSession: ActiveUserSession = {
  ...offlineSession,
  connectionMode: 'connected',
};

describe('detectConnectivityRegain', () => {
  it('does not restore or retry without an active session', async () => {
    const restoreSession = vi.fn();
    const retryEligibleReports = vi.fn();

    const result = await detectConnectivityRegain({
      currentSession: null,
      restoreSession,
      retryEligibleReports,
    });

    expect(result).toMatchObject({
      state: 'no-session',
      session: null,
      retrySummary: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
    });
    expect(restoreSession).not.toHaveBeenCalled();
    expect(retryEligibleReports).not.toHaveBeenCalled();
  });

  it('triggers retry exactly when an offline session restores as connected', async () => {
    const retryEligibleReports = vi.fn(async () => ({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    }));

    const result = await detectConnectivityRegain({
      currentSession: offlineSession,
      restoreSession: vi.fn(async () => ({
        state: 'signed_in' as const,
        session: connectedSession,
      })),
      retryEligibleReports,
    });

    expect(result).toMatchObject({
      state: 'reconnected',
      session: connectedSession,
      retrySummary: {
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
    });
    expect(retryEligibleReports).toHaveBeenCalledOnce();
    expect(retryEligibleReports).toHaveBeenCalledWith(connectedSession);
  });

  it('does not retry repeatedly while already connected', async () => {
    const restoreSession = vi.fn();
    const retryEligibleReports = vi.fn();

    const result = await detectConnectivityRegain({
      currentSession: connectedSession,
      restoreSession,
      retryEligibleReports,
    });

    expect(result).toMatchObject({
      state: 'already-connected',
      retrySummary: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
    });
    expect(restoreSession).not.toHaveBeenCalled();
    expect(retryEligibleReports).not.toHaveBeenCalled();
  });

  it('does not retry while restore still yields an offline session', async () => {
    const retryEligibleReports = vi.fn();

    const result = await detectConnectivityRegain({
      currentSession: offlineSession,
      restoreSession: vi.fn(async () => ({
        state: 'signed_in' as const,
        session: offlineSession,
      })),
      retryEligibleReports,
    });

    expect(result).toMatchObject({
      state: 'still-offline',
      session: offlineSession,
      retrySummary: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
    });
    expect(retryEligibleReports).not.toHaveBeenCalled();
  });

  it('does not retry when restore signs the user out', async () => {
    const retryEligibleReports = vi.fn();

    const result = await detectConnectivityRegain({
      currentSession: offlineSession,
      restoreSession: vi.fn(async () => ({
        state: 'signed_out' as const,
      })),
      retryEligibleReports,
    });

    expect(result).toMatchObject({
      state: 'signed-out',
      session: offlineSession,
      retrySummary: {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
    });
    expect(retryEligibleReports).not.toHaveBeenCalled();
  });
});
