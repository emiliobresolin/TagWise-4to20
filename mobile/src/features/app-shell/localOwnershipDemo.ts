import type { LocalRuntime } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import type { LocalOwnershipProofSnapshot } from './model';

const DEMO_BUSINESS_OBJECT = {
  businessObjectType: 'tag',
  businessObjectId: 'demo-tag-001',
} as const;

const DEMO_FILE_NAME = 'partition-proof.txt';
const DEMO_DRAFT_SUMMARY = 'Owned local draft placeholder';
const DEMO_QUEUE_KIND = 'pending-sync-placeholder';
const DEMO_EVIDENCE_ID = 'partition-proof-evidence';
const DEMO_QUEUE_ITEM_ID = 'partition-proof-queue-item';

export async function loadLocalOwnershipProof(
  runtime: LocalRuntime,
  session: ActiveUserSession,
): Promise<LocalOwnershipProofSnapshot> {
  const store = runtime.repositories.userPartitions.forUser(session.userId);
  const draft = await store.drafts.getDraft(DEMO_BUSINESS_OBJECT);
  const evidence = await store.evidenceMetadata.listEvidenceByBusinessObject(DEMO_BUSINESS_OBJECT);
  const queueItems = await store.queueItems.listQueueItemsByBusinessObject(DEMO_BUSINESS_OBJECT);

  return {
    ownerUserId: session.userId,
    businessObjectType: DEMO_BUSINESS_OBJECT.businessObjectType,
    businessObjectId: DEMO_BUSINESS_OBJECT.businessObjectId,
    draftCount: draft ? 1 : 0,
    evidenceCount: evidence.length,
    queueItemCount: queueItems.length,
    latestMediaRelativePath: evidence[0]?.mediaRelativePath ?? null,
  };
}

export async function writeLocalOwnershipProof(
  runtime: LocalRuntime,
  session: ActiveUserSession,
): Promise<LocalOwnershipProofSnapshot> {
  const store = runtime.repositories.userPartitions.forUser(session.userId);
  const now = new Date().toISOString();

  await store.drafts.saveDraft({
    ...DEMO_BUSINESS_OBJECT,
    summaryText: DEMO_DRAFT_SUMMARY,
    payloadJson: JSON.stringify({
      ownerUserId: session.userId,
      role: session.role,
      updatedAt: now,
    }),
  });

  const sandboxFile = await store.mediaSandbox.writeTextFile({
    ...DEMO_BUSINESS_OBJECT,
    fileName: DEMO_FILE_NAME,
    contents: JSON.stringify(
      {
        ownerUserId: session.userId,
        role: session.role,
        capturedAt: now,
      },
      null,
      2,
    ),
  });

  await store.evidenceMetadata.saveEvidenceMetadata({
    ...DEMO_BUSINESS_OBJECT,
    evidenceId: DEMO_EVIDENCE_ID,
    fileName: sandboxFile.fileName,
    mediaRelativePath: sandboxFile.relativePath,
    mimeType: 'text/plain',
    payloadJson: JSON.stringify({
      ownerUserId: session.userId,
      capturedAt: now,
    }),
  });

  await store.queueItems.enqueue({
    ...DEMO_BUSINESS_OBJECT,
    queueItemId: DEMO_QUEUE_ITEM_ID,
    itemKind: DEMO_QUEUE_KIND,
    payloadJson: JSON.stringify({
      ownerUserId: session.userId,
      queuedAt: now,
    }),
  });

  return loadLocalOwnershipProof(runtime, session);
}
