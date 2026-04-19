import type { AuthenticatedUser } from '../auth/model';
import { buildSeedAssignedWorkPackages } from './seedData';
import type { AssignedWorkPackageSnapshot, AssignedWorkPackageSummary } from './model';
import { AssignedWorkPackageRepository } from './assignedWorkPackageRepository';

export class AssignedWorkPackageService {
  constructor(private readonly repository: AssignedWorkPackageRepository) {}

  async ensureSeedPackages(technicianUserId: string): Promise<void> {
    const records = buildSeedAssignedWorkPackages(technicianUserId);

    for (const record of records) {
      await this.repository.upsertSeedPackage(record);
    }
  }

  async listAssignedPackages(user: AuthenticatedUser): Promise<AssignedWorkPackageSummary[]> {
    return this.repository.listAssignedSummariesForUser(user.id);
  }

  async downloadAssignedPackage(
    user: AuthenticatedUser,
    workPackageId: string,
  ): Promise<AssignedWorkPackageSnapshot | null> {
    return this.repository.getAssignedSnapshotForUser(user.id, workPackageId);
  }
}
