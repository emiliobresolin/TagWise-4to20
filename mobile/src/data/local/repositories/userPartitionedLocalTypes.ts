export interface LocalBusinessObjectIdentity {
  businessObjectType: string;
  businessObjectId: string;
}

export interface UserOwnedDraftRecord extends LocalBusinessObjectIdentity {
  ownerUserId: string;
  summaryText: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOwnedEvidenceMetadataRecord extends LocalBusinessObjectIdentity {
  ownerUserId: string;
  evidenceId: string;
  fileName: string;
  mediaRelativePath: string;
  mimeType: string | null;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOwnedQueueItemRecord extends LocalBusinessObjectIdentity {
  ownerUserId: string;
  queueItemId: string;
  itemKind: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}
