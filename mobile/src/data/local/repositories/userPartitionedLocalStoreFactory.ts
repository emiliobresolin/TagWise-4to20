import type { AppSandboxBoundary, UserOwnedMediaSandbox } from '../../../platform/files/appSandboxBoundary';
import { createUserOwnedMediaSandbox } from '../../../platform/files/appSandboxBoundary';
import type { LocalDatabase } from '../sqlite/types';
import { AssignedWorkPackageRepository } from './assignedWorkPackageRepository';
import { UserPartitionedDraftRepository } from './userPartitionedDraftRepository';
import { UserPartitionedEvidenceMetadataRepository } from './userPartitionedEvidenceMetadataRepository';
import { UserPartitionedExecutionProgressRepository } from './userPartitionedExecutionProgressRepository';
import { UserPartitionedQueueItemRepository } from './userPartitionedQueueItemRepository';

export interface UserPartitionedLocalStore {
  ownerUserId: string;
  workPackages: AssignedWorkPackageRepository;
  executionProgress: UserPartitionedExecutionProgressRepository;
  drafts: UserPartitionedDraftRepository;
  evidenceMetadata: UserPartitionedEvidenceMetadataRepository;
  queueItems: UserPartitionedQueueItemRepository;
  mediaSandbox: UserOwnedMediaSandbox;
}

export class UserPartitionedLocalStoreFactory {
  constructor(
    private readonly database: LocalDatabase,
    private readonly sandboxBoundary: AppSandboxBoundary,
  ) {}

  forUser(ownerUserId: string): UserPartitionedLocalStore {
    return {
      ownerUserId,
      workPackages: new AssignedWorkPackageRepository(this.database, ownerUserId),
      executionProgress: new UserPartitionedExecutionProgressRepository(this.database, ownerUserId),
      drafts: new UserPartitionedDraftRepository(this.database, ownerUserId),
      evidenceMetadata: new UserPartitionedEvidenceMetadataRepository(this.database, ownerUserId),
      queueItems: new UserPartitionedQueueItemRepository(this.database, ownerUserId),
      mediaSandbox: createUserOwnedMediaSandbox(this.sandboxBoundary, ownerUserId),
    };
  }
}
