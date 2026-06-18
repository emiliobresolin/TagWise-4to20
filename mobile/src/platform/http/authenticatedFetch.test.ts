import { describe, it, expect, vi } from 'vitest';
import { createAuthenticatedFetch } from './authenticatedFetch';

describe('createAuthenticatedFetch', () => {
  it('attaches the access token from secure storage to requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const mockStorage = {
      getItem: vi.fn().mockResolvedValue('valid-access-token'),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const mockRefresh = vi.fn();
    const mockInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      authApiClient: { login: vi.fn(), refresh: mockRefresh },
      secureStorage: mockStorage,
      onSessionInvalidated: mockInvalidated,
    });

    // Replace global fetch for this test
    const originalFetch = global.fetch;
    global.fetch = mockFetch;
    try {
      await authedFetch('https://api.example.com/data');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      );
      const calledHeaders = mockFetch.mock.calls[0][1].headers as Headers;
      expect(calledHeaders.get('authorization')).toBe('Bearer valid-access-token');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('retries with a refreshed token on 401 and succeeds', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(new Response('{}', { status: 401 }));
      return Promise.resolve(new Response('{"data":true}', { status: 200 }));
    });

    const mockStorage = {
      getItem: vi.fn().mockResolvedValue('expired-token'),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const mockRefresh = vi.fn().mockResolvedValue({
      tokens: { accessToken: 'new-token', refreshToken: 'new-refresh' },
    });
    const mockInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      authApiClient: { login: vi.fn(), refresh: mockRefresh },
      secureStorage: mockStorage,
      onSessionInvalidated: mockInvalidated,
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch;
    try {
      const result = await authedFetch('https://api.example.com/data');
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockInvalidated).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('calls onSessionInvalidated when refresh token is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const mockStorage = {
      getItem: vi.fn().mockImplementation((key: string) => {
        if (key === 'tagwise_access_token') return Promise.resolve('expired-token');
        return Promise.resolve(null); // no refresh token
      }),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const mockInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      authApiClient: { login: vi.fn(), refresh: vi.fn() },
      secureStorage: mockStorage,
      onSessionInvalidated: mockInvalidated,
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch;
    try {
      await authedFetch('https://api.example.com/data');
      expect(mockInvalidated).toHaveBeenCalledOnce();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
