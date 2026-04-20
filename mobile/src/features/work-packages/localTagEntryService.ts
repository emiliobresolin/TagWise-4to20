import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type {
  AssignedWorkPackageSnapshot,
  LocalAssignedTagEntry,
} from './model';

interface LocalTagEntryServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
}

export class LocalTagEntryService {
  constructor(private readonly dependencies: LocalTagEntryServiceDependencies) {}

  async listPackageTags(
    session: ActiveUserSession,
    workPackageId: string,
  ): Promise<LocalAssignedTagEntry[]> {
    const snapshot = await this.dependencies.userPartitions
      .forUser(session.userId)
      .workPackages.getSnapshot(workPackageId);

    return snapshot ? mapSnapshotTags(snapshot) : [];
  }

  async searchPackageTags(
    session: ActiveUserSession,
    workPackageId: string,
    query: string,
  ): Promise<LocalAssignedTagEntry[]> {
    const tags = await this.listPackageTags(session, workPackageId);
    const normalizedQuery = normalizeQuery(query);

    if (!normalizedQuery) {
      return tags;
    }

    return tags.filter((tag) =>
      normalizeQuery(tag.tagCode).includes(normalizedQuery) ||
      normalizeQuery(tag.shortDescription).includes(normalizedQuery),
    );
  }

  async selectPackageTag(
    session: ActiveUserSession,
    workPackageId: string,
    tagId: string,
  ): Promise<LocalAssignedTagEntry | null> {
    const tags = await this.listPackageTags(session, workPackageId);
    return tags.find((tag) => tag.tagId === tagId) ?? null;
  }
}

function mapSnapshotTags(snapshot: AssignedWorkPackageSnapshot): LocalAssignedTagEntry[] {
  return snapshot.tags.map((tag) => ({
    workPackageId: snapshot.summary.id,
    workPackageTitle: snapshot.summary.title,
    tagId: tag.id,
    tagCode: tag.tagCode,
    shortDescription: tag.shortDescription,
    area: tag.area,
    instrumentFamily: tag.instrumentFamily,
    instrumentSubtype: tag.instrumentSubtype,
    parentAssetReference: tag.parentAssetReference,
  }));
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}
