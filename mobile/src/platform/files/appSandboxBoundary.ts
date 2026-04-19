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
}

export interface UserOwnedTextFileWriteRequest {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  fileName: string;
  contents: string;
}

export interface AppSandboxBoundary {
  ensureUserOwnedMediaDirectory(
    request: Omit<UserOwnedTextFileWriteRequest, 'fileName' | 'contents'>,
  ): Promise<UserOwnedMediaDirectory>;
  writeUserOwnedTextFile(request: UserOwnedTextFileWriteRequest): Promise<UserOwnedSandboxFile>;
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
}

export interface UserOwnedMediaSandbox {
  readonly ownerUserId: string;
  ensureDirectory(request: {
    businessObjectType: string;
    businessObjectId: string;
  }): Promise<UserOwnedMediaDirectory>;
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
