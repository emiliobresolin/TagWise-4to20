export interface EvidenceBinaryUploadBoundary {
  uploadBinary(input: {
    localFileUri: string;
    uploadUrl: string;
    uploadMethod: 'PUT';
    requiredHeaders: Record<string, string>;
  }): Promise<void>;
}

export function createEvidenceBinaryUploadBoundary(
  fetchImplementation: typeof fetch = fetch,
): EvidenceBinaryUploadBoundary {
  return {
    async uploadBinary(input) {
      const localResponse = await fetchImplementation(input.localFileUri);
      if (!localResponse.ok) {
        throw new Error('Unable to read the local evidence binary for upload.');
      }

      const body = await localResponse.blob();
      const uploadResponse = await fetchImplementation(input.uploadUrl, {
        method: input.uploadMethod,
        headers: input.requiredHeaders,
        body,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Evidence binary upload failed with ${uploadResponse.status}.`);
      }
    },
  };
}
