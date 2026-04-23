import { describe, expect, it, vi } from 'vitest';

import { createPhotoAcquisitionBoundary } from './photoAcquisitionBoundary';

describe('createPhotoAcquisitionBoundary', () => {
  it('captures a photo with bounded image-only options', async () => {
    const requestCameraPermissionsAsync = vi.fn().mockResolvedValue({ granted: true });
    const launchCameraAsync = vi.fn().mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/captured-photo.jpg',
          fileName: 'captured-photo.jpg',
          mimeType: 'image/jpeg',
          width: 1024,
          height: 768,
          fileSize: 2048,
        },
      ],
    });

    const acquisition = createPhotoAcquisitionBoundary(async () => ({
      requestCameraPermissionsAsync,
      requestMediaLibraryPermissionsAsync: vi.fn(),
      launchCameraAsync,
      launchImageLibraryAsync: vi.fn(),
    }));

    await expect(acquisition.capturePhoto()).resolves.toEqual({
      source: 'camera',
      uri: 'file:///cache/captured-photo.jpg',
      fileName: 'captured-photo.jpg',
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
      fileSize: 2048,
    });
    expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(launchCameraAsync).toHaveBeenCalledWith({
      allowsEditing: false,
      exif: false,
      mediaTypes: ['images'],
      quality: 0.7,
    });
  });

  it('selects a photo from the media library with the same bounded options', async () => {
    const requestMediaLibraryPermissionsAsync = vi.fn().mockResolvedValue({ granted: true });
    const launchImageLibraryAsync = vi.fn().mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/selected-photo.jpg',
          fileName: 'selected-photo.jpg',
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          fileSize: 1024,
        },
      ],
    });

    const acquisition = createPhotoAcquisitionBoundary(async () => ({
      requestCameraPermissionsAsync: vi.fn(),
      requestMediaLibraryPermissionsAsync,
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync,
    }));

    await expect(acquisition.selectPhoto()).resolves.toEqual({
      source: 'library',
      uri: 'file:///cache/selected-photo.jpg',
      fileName: 'selected-photo.jpg',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      fileSize: 1024,
    });
    expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      allowsEditing: false,
      exif: false,
      mediaTypes: ['images'],
      quality: 0.7,
    });
  });

  it('returns null when the picker is cancelled', async () => {
    const acquisition = createPhotoAcquisitionBoundary(async () => ({
      requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
      requestMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
      launchCameraAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
      launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
    }));

    await expect(acquisition.capturePhoto()).resolves.toBeNull();
    await expect(acquisition.selectPhoto()).resolves.toBeNull();
  });

  it('throws a clear error when photo permissions are denied', async () => {
    const acquisition = createPhotoAcquisitionBoundary(async () => ({
      requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: false }),
      requestMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: false }),
      launchCameraAsync: vi.fn(),
      launchImageLibraryAsync: vi.fn(),
    }));

    await expect(acquisition.capturePhoto()).rejects.toThrow(
      'Camera permission is required to capture a field photo on this device.',
    );
    await expect(acquisition.selectPhoto()).rejects.toThrow(
      'Media library permission is required to attach a local field photo.',
    );
  });
});
