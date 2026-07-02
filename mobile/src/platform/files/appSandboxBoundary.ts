export const appSandboxDirectories = {
  mediaRoot: 'evidence',
  userPartitions: 'users',
} as const;

export interface UserOwnedMediaDirectory {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  relativePath: string;
  uri: string;
}

export interface UserOwnedSandboxFile {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  fileName: string;
  relativePath: string;
  uri: string;
  // Byte size of the stored copy, probed after the write. Populated by the
  // media copy path so callers can backfill picker metadata (some pickers
  // omit fileSize); null when the platform probe cannot resolve a size.
  sizeBytes?: number | null;
}

export interface UserOwnedTextFileWriteRequest {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  fileName: string;
  contents: string;
}

export interface UserOwnedBinaryFileCopyRequest {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  fileName: string;
  sourceUri: string;
}

export interface AppSandboxBoundary {
  ensureUserOwnedMediaDirectory(
    request: Omit<UserOwnedTextFileWriteRequest, 'fileName' | 'contents'>,
  ): Promise<UserOwnedMediaDirectory>;
  writeUserOwnedTextFile(request: UserOwnedTextFileWriteRequest): Promise<UserOwnedSandboxFile>;
  copyUserOwnedMediaFile(request: UserOwnedBinaryFileCopyRequest): Promise<UserOwnedSandboxFile>;
  deleteUserOwnedMediaFile(relativePath: string): Promise<void>;
  resolveUserOwnedMediaFileUri(relativePath: string): Promise<string>;
}

interface ExpoFileSystemModule {
  documentDirectory: string | null;
  makeDirectoryAsync(
    uri: string,
    options?: {
      intermediates?: boolean;
    },
  ): Promise<void>;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
}

export interface UserOwnedMediaSandbox {
  readonly ownerUserId: string;
  ensureDirectory(request: {
    businessObjectType: string;
    businessObjectId: string;
  }): Promise<UserOwnedMediaDirectory>;
  copyFile(
    request: Omit<UserOwnedBinaryFileCopyRequest, 'ownerUserId'>,
  ): Promise<UserOwnedSandboxFile>;
  deleteFile(relativePath: string): Promise<void>;
  resolveFileUri(relativePath: string): Promise<string>;
  writeTextFile(
    request: Omit<UserOwnedTextFileWriteRequest, 'ownerUserId'>,
  ): Promise<UserOwnedSandboxFile>;
}

export function createAppSandboxBoundary(
  fileSystemLoader: () => Promise<ExpoFileSystemModule> = loadExpoFileSystem,
): AppSandboxBoundary {
  return {
    async ensureUserOwnedMediaDirectory(request) {
      const fileSystem = await fileSystemLoader();
      const documentDirectory = requireDocumentDirectory(fileSystem.documentDirectory);
      const relativePath = buildUserOwnedMediaRelativeDirectory(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
      );
      const uri = joinUriSegments(documentDirectory, relativePath);

      await fileSystem.makeDirectoryAsync(uri, { intermediates: true });

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        relativePath,
        uri,
      };
    },

    async writeUserOwnedTextFile(request) {
      const fileSystem = await fileSystemLoader();
      const documentDirectory = requireDocumentDirectory(fileSystem.documentDirectory);
      const directory = await this.ensureUserOwnedMediaDirectory(request);
      const relativePath = buildUserOwnedMediaRelativePath(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
        request.fileName,
      );
      const uri = joinUriSegments(documentDirectory, relativePath);

      await fileSystem.writeAsStringAsync(uri, request.contents);

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        fileName: sanitizeSandboxSegment(request.fileName),
        relativePath,
        uri,
      };
    },

    async copyUserOwnedMediaFile(request) {
      const fileSystem = await fileSystemLoader();
      const documentDirectory = requireDocumentDirectory(fileSystem.documentDirectory);
      const directory = await this.ensureUserOwnedMediaDirectory(request);
      const sanitizedFileName = sanitizeSandboxSegment(request.fileName);
      const relativePath = buildUserOwnedMediaRelativePath(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
        sanitizedFileName,
      );
      const uri = joinUriSegments(documentDirectory, relativePath);

      await fileSystem.copyAsync({
        from: request.sourceUri,
        to: uri,
      });

      // Probe the stored copy's real byte size so callers can backfill
      // metadata the picker omitted. A probe failure must never fail the
      // copy itself; sizeBytes stays null in that case.
      let sizeBytes: number | null = null;
      try {
        const info = await fileSystem.getInfoAsync(uri);
        sizeBytes = info.exists && typeof info.size === 'number' ? info.size : null;
      } catch {
        sizeBytes = null;
      }

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        fileName: sanitizedFileName,
        relativePath,
        uri,
        sizeBytes,
      };
    },

    async deleteUserOwnedMediaFile(relativePath) {
      const fileSystem = await fileSystemLoader();
      const documentDirectory = requireDocumentDirectory(fileSystem.documentDirectory);
      const uri = joinUriSegments(documentDirectory, relativePath);

      await fileSystem.deleteAsync(uri, { idempotent: true });
    },

    async resolveUserOwnedMediaFileUri(relativePath) {
      const fileSystem = await fileSystemLoader();
      const documentDirectory = requireDocumentDirectory(fileSystem.documentDirectory);
      return joinUriSegments(documentDirectory, relativePath);
    },
  };
}

export function createUserOwnedMediaSandbox(
  boundary: AppSandboxBoundary,
  ownerUserId: string,
): UserOwnedMediaSandbox {
  return {
    ownerUserId,
    ensureDirectory(request) {
      return boundary.ensureUserOwnedMediaDirectory({
        ownerUserId,
        ...request,
      });
    },
    copyFile(request) {
      return boundary.copyUserOwnedMediaFile({
        ownerUserId,
        ...request,
      });
    },
    deleteFile(relativePath) {
      return boundary.deleteUserOwnedMediaFile(relativePath);
    },
    resolveFileUri(relativePath) {
      return boundary.resolveUserOwnedMediaFileUri(relativePath);
    },
    writeTextFile(request) {
      return boundary.writeUserOwnedTextFile({
        ownerUserId,
        ...request,
      });
    },
  };
}

export function buildUserOwnedMediaRelativeDirectory(
  ownerUserId: string,
  businessObjectType: string,
  businessObjectId: string,
): string {
  return joinRelativeSegments(
    appSandboxDirectories.mediaRoot,
    appSandboxDirectories.userPartitions,
    sanitizeSandboxSegment(ownerUserId),
    sanitizeSandboxSegment(businessObjectType),
    sanitizeSandboxSegment(businessObjectId),
  );
}

export function buildUserOwnedMediaRelativePath(
  ownerUserId: string,
  businessObjectType: string,
  businessObjectId: string,
  fileName: string,
): string {
  return joinRelativeSegments(
    buildUserOwnedMediaRelativeDirectory(ownerUserId, businessObjectType, businessObjectId),
    sanitizeSandboxSegment(fileName),
  );
}

export function sanitizeSandboxSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function joinRelativeSegments(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
}

function joinUriSegments(baseUri: string, relativePath: string): string {
  return `${baseUri.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

function requireDocumentDirectory(value: string | null): string {
  if (!value) {
    throw new Error('App sandbox document directory is unavailable.');
  }

  return value;
}

async function loadExpoFileSystem(): Promise<ExpoFileSystemModule> {
  return import('expo-file-system/legacy');
}
