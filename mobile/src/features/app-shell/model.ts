export type ShellRoute = 'foundation' | 'storage' | 'packages' | 'review';

export const DEFAULT_SHELL_ROUTE: ShellRoute = 'foundation';
export const SHELL_ROUTE_PREFERENCE_KEY = 'shell.route';

export interface BootstrapDemoRecord {
  id: string;
  title: string;
  subtitle: string;
  launchCount: number;
  manualWriteCount: number;
  lastOpenedAt: string;
  updatedAt: string;
}

export interface DatabaseMigrationSummary {
  appliedMigrationIds: string[];
  currentSchemaVersion: number;
}

export interface AppBootstrapSnapshot {
  shellRoute: ShellRoute;
  demoRecord: BootstrapDemoRecord;
  migrationSummary: DatabaseMigrationSummary;
  databaseName: string;
}

export interface LocalOwnershipProofSnapshot {
  ownerUserId: string;
  businessObjectType: string;
  businessObjectId: string;
  draftCount: number;
  evidenceCount: number;
  queueItemCount: number;
  latestMediaRelativePath: string | null;
}

export interface MobileDiagnosticsSnapshot {
  capturedErrorCount: number;
  latestErrorId: string | null;
  latestErrorMessage: string | null;
  latestErrorShellRoute: ShellRoute | null;
}
