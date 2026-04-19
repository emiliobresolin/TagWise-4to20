"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignedWorkPackageService = void 0;
const seedData_1 = require("./seedData");
class AssignedWorkPackageService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async ensureSeedPackages(technicianUserId) {
        const records = (0, seedData_1.buildSeedAssignedWorkPackages)(technicianUserId);
        for (const record of records) {
            await this.repository.upsertSeedPackage(record);
        }
    }
    async listAssignedPackages(user) {
        return this.repository.listAssignedSummariesForUser(user.id);
    }
    async downloadAssignedPackage(user, workPackageId) {
        return this.repository.getAssignedSnapshotForUser(user.id, workPackageId);
    }
}
exports.AssignedWorkPackageService = AssignedWorkPackageService;
