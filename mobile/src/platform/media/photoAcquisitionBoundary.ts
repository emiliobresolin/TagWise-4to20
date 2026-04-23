export type AcquiredPhotoSource = 'camera' | 'library';

export interface AcquiredPhotoAsset {
  source: AcquiredPhotoSource;
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

export interface PhotoAcquisitionBoundary {
  capturePhoto(): Promise<AcquiredPhotoAsset | null>;
  selectPhoto(): Promise<AcquiredPhotoAsset | null>;
}

interface ExpoImagePickerAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
}

interface ExpoImagePickerResult {
  canceled: boolean;
  assets?: ExpoImagePickerAsset[];
}

interface ExpoImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options: Record<string, unknown>): Promise<ExpoImagePickerResult>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<ExpoImagePickerResult>;
}

export function createPhotoAcquisitionBoundary(
  imagePickerLoader: () => Promise<ExpoImagePickerModule> = loadExpoImagePicker,
): PhotoAcquisitionBoundary {
  return {
    async capturePhoto() {
      const imagePicker = await imagePickerLoader();
      const permission = await imagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera permission is required to capture a field photo on this device.');
      }

      const result = await imagePicker.launchCameraAsync(buildPickerOptions());
      return normalizePickerResult('camera', result);
    },

    async selectPhoto() {
      const imagePicker = await imagePickerLoader();
      const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Media library permission is required to attach a local field photo.');
      }

      const result = await imagePicker.launchImageLibraryAsync(buildPickerOptions());
      return normalizePickerResult('library', result);
    },
  };
}

function buildPickerOptions(): Record<string, unknown> {
  return {
    allowsEditing: false,
    exif: false,
    mediaTypes: ['images'],
    quality: 0.7,
  };
}

function normalizePickerResult(
  source: AcquiredPhotoSource,
  result: ExpoImagePickerResult,
): AcquiredPhotoAsset | null {
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const [asset] = result.assets;
  if (!asset?.uri) {
    return null;
  }

  return {
    source,
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fileSize: asset.fileSize ?? null,
  };
}

async function loadExpoImagePicker(): Promise<ExpoImagePickerModule> {
  return (await import('expo-image-picker')) as unknown as ExpoImagePickerModule;
}
