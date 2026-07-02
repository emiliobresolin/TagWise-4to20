import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lock the import path to the legacy entry: expo-file-system >= 19 removed
// uploadAsync/FileSystemUploadType from the root module, so the boundary must
// keep importing 'expo-file-system/legacy'. If the import ever regresses to
// the root entry, this mock no longer intercepts the module and the test
// fails to resolve uploadAsync.
const uploadAsync = vi.fn();

vi.mock('expo-file-system/legacy', () => ({
  uploadAsync: (...args: unknown[]) => uploadAsync(...args),
  FileSystemUploadType: {
    BINARY_CONTENT: 0,
    MULTIPART: 1,
  },
}));

import { createEvidenceBinaryUploadBoundary } from './evidenceBinaryUploadBoundary';

describe('createEvidenceBinaryUploadBoundary', () => {
  beforeEach(() => {
    uploadAsync.mockReset();
  });

  it('uploads the binary through the legacy uploadAsync entry with BINARY_CONTENT', async () => {
    uploadAsync.mockResolvedValue({ status: 200 });
    const boundary = createEvidenceBinaryUploadBoundary();

    await boundary.uploadBinary({
      localFileUri: 'file:///data/evidence/photo.jpg',
      uploadUrl: 'https://storage.tagwise.test/upload',
      uploadMethod: 'PUT',
      requiredHeaders: { 'content-type': 'image/jpeg' },
    });

    expect(uploadAsync).toHaveBeenCalledWith(
      'https://storage.tagwise.test/upload',
      'file:///data/evidence/photo.jpg',
      {
        httpMethod: 'PUT',
        headers: { 'content-type': 'image/jpeg' },
        uploadType: 0,
      },
    );
  });

  it('throws when the storage endpoint answers outside the 2xx range', async () => {
    uploadAsync.mockResolvedValue({ status: 403 });
    const boundary = createEvidenceBinaryUploadBoundary();

    await expect(
      boundary.uploadBinary({
        localFileUri: 'file:///data/evidence/photo.jpg',
        uploadUrl: 'https://storage.tagwise.test/upload',
        uploadMethod: 'PUT',
        requiredHeaders: {},
      }),
    ).rejects.toThrow('Evidence binary upload failed with 403.');
  });
});
