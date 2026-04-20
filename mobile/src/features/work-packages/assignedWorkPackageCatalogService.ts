import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { AssignedWorkPackageApiClient } from './workPackageApiClient';
import type {
  AssignedWorkPackageSnapshot,
  LocalAssignedWorkPackageSummary,
} from './model';

interface AssignedWorkPackageCatalogServiceDependencies {
  apiClient: AssignedWorkPackageApiClient;
  userPartitions: UserPartitionedLocalStoreFactory;
  now?: () => Date;
}

export class AssignedWorkPackageCatalogService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: AssignedWorkPackageCatalogServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async loadLocalCatalog(session: ActiveUserSession): Promise<LocalAssignedWorkPackageSummary[]> {
    return this.dependencies.userPartitions.forUser(session.userId).workPackages.listSummaries();
  }

  async refreshConnectedCatalog(
    session: ActiveUserSession,
  ): Promise<LocalAssignedWorkPackageSummary[]> {
    assertConnectedSession(session);
    const remoteSummaries = await this.dependencies.apiClient.listAssignedPackages();
    const workPackages = this.dependencies.userPartitions.forUser(session.userId).workPackages;
    await workPackages.replaceCatalog(remoteSummaries);
    return workPackages.listSummaries();
  }

  async downloadAssignedPackage(
    session: ActiveUserSession,
    workPackageId: string,
  ): Promise<{
    snapshot: AssignedWorkPackageSnapshot;
    summaries: LocalAssignedWorkPackageSummary[];
  }> {
    assertConnectedSession(session);
    const workPackages = this.dependencies.userPartitions.forUser(session.userId).workPackages;
    const snapshot = await this.dependencies.apiClient.downloadAssignedPackage(workPackageId);
    await workPackages.saveDownloadedSnapshot(snapshot, this.now().toISOString());

    return {
      snapshot,
      summaries: await workPackages.listSummaries(),
    };
  }
}

function assertConnectedSession(session: ActiveUserSession) {
  if (session.connectionMode !== 'connected') {
    throw new Error('Reconnect before refreshing or downloading assigned work packages.');
  }
}
