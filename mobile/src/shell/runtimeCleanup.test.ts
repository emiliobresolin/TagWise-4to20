import { describe, expect, it, vi } from 'vitest';

import { closeRuntimeIfInactive } from './runtimeCleanup';

describe('closeRuntimeIfInactive', () => {
  it('closes the database handle when bootstrap resolves after unmount', async () => {
    const closeAsync = vi.fn().mockResolvedValue(undefined);

    const wasClosed = await closeRuntimeIfInactive(
      {
        database: {
          closeAsync,
        },
      },
      false,
    );

    expect(wasClosed).toBe(true);
    expect(closeAsync).toHaveBeenCalledTimes(1);
  });

  it('leaves the database open while the component is still active', async () => {
    const closeAsync = vi.fn().mockResolvedValue(undefined);

    const wasClosed = await closeRuntimeIfInactive(
      {
        database: {
          closeAsync,
        },
      },
      true,
    );

    expect(wasClosed).toBe(false);
    expect(closeAsync).not.toHaveBeenCalled();
  });
});
