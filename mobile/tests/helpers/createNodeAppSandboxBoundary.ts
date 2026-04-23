import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  buildUserOwnedMediaRelativeDirectory,
  buildUserOwnedMediaRelativePath,
  type AppSandboxBoundary,
} from '../../src/platform/files/appSandboxBoundary';

export function createNodeAppSandboxBoundary(rootDirectory: string): AppSandboxBoundary {
  return {
    async ensureUserOwnedMediaDirectory(request) {
      const relativePath = buildUserOwnedMediaRelativeDirectory(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
      );
      const uri = join(rootDirectory, ...relativePath.split('/'));

      await mkdir(uri, { recursive: true });

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        relativePath,
        uri,
      };
    },

    async writeUserOwnedTextFile(request) {
      const directory = await this.ensureUserOwnedMediaDirectory(request);
      const relativePath = buildUserOwnedMediaRelativePath(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
        request.fileName,
      );
      const uri = join(rootDirectory, ...relativePath.split('/'));

      await writeFile(uri, request.contents, 'utf-8');

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        fileName: request.fileName,
        relativePath,
        uri,
      };
    },

    async copyUserOwnedMediaFile(request) {
      const directory = await this.ensureUserOwnedMediaDirectory(request);
      const relativePath = buildUserOwnedMediaRelativePath(
        request.ownerUserId,
        request.businessObjectType,
        request.businessObjectId,
        request.fileName,
      );
      const uri = join(rootDirectory, ...relativePath.split('/'));

      await copyFile(request.sourceUri, uri);

      return {
        ownerUserId: request.ownerUserId,
        businessObjectType: request.businessObjectType,
        businessObjectId: request.businessObjectId,
        fileName: request.fileName,
        relativePath,
        uri,
      };
    },

    async deleteUserOwnedMediaFile(relativePath) {
      const uri = join(rootDirectory, ...relativePath.split('/'));
      await rm(uri, { force: true });
    },

    async resolveUserOwnedMediaFileUri(relativePath) {
      return join(rootDirectory, ...relativePath.split('/'));
    },
  };
}
