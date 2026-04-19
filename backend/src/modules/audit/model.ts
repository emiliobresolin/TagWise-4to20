import type { UserRole } from '../../config/env';

export interface AuditEventRecord {
  id: string;
  actorId: string;
  actorRole: UserRole;
  actionType: string;
  targetObjectType: string;
  targetObjectId: string;
  occurredAt: string;
  correlationId: string;
  priorState: string | null;
  nextState: string | null;
  comment: string | null;
  metadataJson: string;
}

export interface WriteAuditEventInput {
  actorId: string;
  actorRole: UserRole;
  actionType: string;
  targetObjectType: string;
  targetObjectId: string;
  correlationId: string;
  priorState?: string | null;
  nextState?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown>;
}
