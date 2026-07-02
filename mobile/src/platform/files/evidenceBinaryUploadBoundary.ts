// expo-file-system >= 19 removed uploadAsync/FileSystemUploadType from the
// root entry (root uploadAsync throws at runtime and FileSystemUploadType is
// undefined). The legacy subpath keeps the identical API surface, matching
// how appSandboxBoundary.ts already loads the filesystem module.
import * as FileSystem from 'expo-file-system/legacy';

export interface EvidenceBinaryUploadBoundary {
  uploadBinary(input: {
    localFileUri: string;
    uploadUrl: string;
    uploadMethod: 'PUT';
    requiredHeaders: Record<string, string>;
  }): Promise<void>;
}

export function createEvidenceBinaryUploadBoundary(): EvidenceBinaryUploadBoundary {
  return {
    async uploadBinary(input) {
      const uploadResult = await FileSystem.uploadAsync(input.uploadUrl, input.localFileUri, {
        httpMethod: input.uploadMethod,
        headers: input.requiredHeaders,
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Evidence binary upload failed with ${uploadResult.status}.`);
      }
    },
  };
}
