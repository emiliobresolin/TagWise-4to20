import type { ActiveUserSession } from '../auth/model';
import { LocalTagContextService } from '../work-packages/localTagContextService';
import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  LocalTagContext,
} from '../work-packages/model';
import { LocalExecutionTemplateRegistry } from './localExecutionTemplateRegistry';
import type {
  SharedExecutionCalculationAcceptance,
  SharedExecutionCalculationResult,
  SharedExecutionCalculationState,
  SharedExecutionChecklistItem,
  SharedExecutionChecklistOutcome,
  SharedExecutionCaptureFieldId,
  SharedExecutionEvidenceState,
  SharedExecutionField,
  SharedExecutionGuidanceState,
  SharedExecutionLinkedGuidanceSnippet,
  SharedExecutionPhotoAttachment,
  SharedExecutionPhotoAttachmentInput,
  SharedExecutionReportChecklistOutcome,
  SharedExecutionReportDraftState,
  SharedExecutionReportEvidenceReference,
  SharedExecutionReportLifecycleState,
  SharedExecutionReportState,
  SharedExecutionRiskInputs,
  SharedExecutionRiskItem,
  SharedExecutionShell,
  SharedExecutionSyncState,
  SharedExecutionStepKind,
  SharedExecutionCalculationRawInputs,
  StoredExecutionCalculationRecord,
  StoredExecutionEvidenceRecord,
  StoredExecutionPhotoAttachmentPayload,
  StoredExecutionProgressRecord,
  StoredExecutionStructuredReadingsEvidence,
} from './model';
import type {
  UserPartitionedLocalStore,
  UserPartitionedLocalStoreFactory,
} from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { LocalWorkStateRepository } from '../../data/local/repositories/localWorkStateRepository';
import type { UserOwnedDraftRecord } from '../../data/local/repositories/userPartitionedLocalTypes';
import {
  computeDeterministicCalculation,
  resolveDeterministicCalculationDefinition,
} from './deterministicCalculationEngine';

const LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE = 'per-tag-report';
const TECHNICIAN_OWNED_DRAFT_REPORT_STATE = 'technician-owned-draft';
const SUBMITTED_PENDING_SYNC_REPORT_STATE = 'submitted-pending-sync';
const LOCAL_ONLY_SYNC_STATE = 'local-only';
const QUEUED_SYNC_STATE = 'queued';
const SUBMIT_REPORT_QUEUE_ITEM_KIND = 'submit-report';
const UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND = 'upload-evidence-binary';
type SharedExecutionEvidenceRequirementKind =
  | 'structured-readings'
  | 'observation-notes'
  | 'photo-evidence';

interface StoredPerTagReportDraftPayload {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  state: SharedExecutionReportState;
  lifecycleState?: SharedExecutionReportLifecycleState;
  syncState?: SharedExecutionSyncState;
  reviewNotes?: string;
  savedAt?: string | null;
  submittedAt?: string | null;
  updatedAt: string;
}

interface SubmitReportQueuePayload {
  queueItemSchemaVersion: '2026-04-v1';
  itemType: typeof SUBMIT_REPORT_QUEUE_ITEM_KIND;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  localObjectReference: {
    businessObjectType: typeof LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE;
    businessObjectId: string;
  };
  objectVersion: string;
  idempotencyKey: string;
  dependencyStatus: 'ready';
  retryCount: number;
  queuedAt: string;
}

interface UploadEvidenceBinaryQueuePayload {
  queueItemSchemaVersion: '2026-04-v1';
  itemType: typeof UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND;
  reportId: string;
  evidenceId: string;
  mediaRelativePath: string;
  mimeType: string | null;
  executionStepId: SharedExecutionStepKind;
  localObjectReference: {
    businessObjectType: typeof LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE;
    businessObjectId: string;
  };
  objectVersion: string;
  idempotencyKey: string;
  dependsOnQueueItemId: string;
  dependencyStatus: 'waiting-on-report-submission';
  retryCount: number;
  queuedAt: string;
}

const STRUCTURED_READINGS_EVIDENCE_LABELS = new Set([
  'readings',
  'as-found readings',
  'as-left readings',
  'loop checkpoints',
  'measured outputs',
  'simulated inputs',
  'reported outputs',
  'calibration checkpoints',
  'range checkpoints',
  'measured current values',
  'validated current points',
  'expected current reference',
  'level checkpoints',
  'output values',
  'expected references',
  'observed outputs',
  'commanded points',
  'observed travel responses',
  'observed feedback responses',
]);

const OBSERVATION_NOTES_EVIDENCE_LABELS = new Set([
  'observations',
  'instrument note',
  'loop condition note',
  'adjustment note',
  'adjustment reference note',
  'reference source note',
  'input source note',
  'configuration note',
  'supply/continuity note',
  'process reference note',
  'conversion basis note',
  'reference setup note',
  'actuator note',
  'positioner note',
]);

const PHOTO_EVIDENCE_LABELS = new Set(['supporting photo']);

interface SharedExecutionShellServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  tagContextService: LocalTagContextService;
  localWorkState?: LocalWorkStateRepository;
  templateRegistry?: LocalExecutionTemplateRegistry;
  now?: () => Date;
}

export class SharedExecutionShellService {
  private readonly now: () => Date;

  private readonly templateRegistry: LocalExecutionTemplateRegistry;

  constructor(private readonly dependencies: SharedExecutionShellServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.templateRegistry = dependencies.templateRegistry ?? new LocalExecutionTemplateRegistry();
  }

  async loadShell(
    session: ActiveUserSession,
    workPackageId: string,
    tagId: string,
    templateId: string,
  ): Promise<SharedExecutionShell | null> {
    const snapshot = await this.dependencies.userPartitions
      .forUser(session.userId)
      .workPackages.getSnapshot(workPackageId);

    if (!snapshot) {
      return null;
    }

    const tag = snapshot.tags.find((item) => item.id === tagId);
    if (!tag) {
      return null;
    }

    const template = this.templateRegistry.resolveTemplate(snapshot, tag, templateId);
    if (!template) {
      return null;
    }

    const tagContext = await this.dependencies.tagContextService.getTagContext(session, workPackageId, tagId);
    if (!tagContext) {
      return null;
    }

    const store = this.dependencies.userPartitions.forUser(session.userId);
    let progress = await store.executionProgress.getProgress(workPackageId, tagId, template.id);
    const storedCalculation = await store.executionCalculations.getCalculation(
      workPackageId,
      tagId,
      template.id,
      template.version,
    );
    const storedEvidence = await store.executionEvidence.listEvidence(
      workPackageId,
      tagId,
      template.id,
      template.version,
    );
    const storedDraft = await store.drafts.getDraft({
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: buildDraftReportId(workPackageId, tagId),
    });
    const storedDraftPayload = parseStoredPerTagReportDraftPayload(storedDraft);
    const storedPhotoAttachments = await buildPhotoAttachments(
      store,
      await store.evidenceMetadata.listEvidenceByBusinessObject({
        businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
        businessObjectId: buildDraftReportId(workPackageId, tagId),
      }),
      workPackageId,
      tagId,
    );

    if (!progress) {
      progress = {
        workPackageId,
        tagId,
        templateId: template.id,
        templateVersion: template.version,
        instrumentFamily: template.instrumentFamily,
        testPattern: template.testPattern,
        currentStepId: template.steps[0]!.id,
        visitedStepIds: [template.steps[0]!.id],
        updatedAt: this.now().toISOString(),
      };

      await store.executionProgress.saveProgress(progress);
    }

    return buildExecutionShell(
      snapshot,
      tag,
      tagContext,
      template,
      progress,
      storedCalculation,
      storedEvidence,
      storedPhotoAttachments,
      storedDraft,
      storedDraftPayload,
      session,
    );
  }

  async selectStep(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
    stepId: string,
  ): Promise<SharedExecutionShell> {
    if (!shell.steps.some((step) => step.id === stepId)) {
      return shell;
    }

    const progress: StoredExecutionProgressRecord = {
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      instrumentFamily: shell.template.instrumentFamily,
      testPattern: shell.template.testPattern,
      currentStepId: stepId,
      visitedStepIds: Array.from(new Set([...shell.progress.visitedStepIds, stepId])),
      updatedAt: this.now().toISOString(),
    };

    await this.dependencies.userPartitions
      .forUser(session.userId)
      .executionProgress.saveProgress(progress);

    return {
      ...shell,
      progress,
    };
  }

  async saveCalculation(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
    rawInputs: SharedExecutionCalculationRawInputs,
  ): Promise<SharedExecutionShell> {
    if (!shell.calculation || isSubmittedReport(shell.report)) {
      return shell;
    }

    const result = computeDeterministicCalculation(shell.calculation.definition, rawInputs);
    const updatedAt = this.now().toISOString();
    const record: StoredExecutionCalculationRecord = {
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      calculationMode: shell.template.calculationMode,
      acceptanceStyle: shell.template.acceptanceStyle,
      executionContext: shell.calculation.definition.executionContext,
      rawInputs,
      result,
      updatedAt,
    };

    await this.dependencies.userPartitions
      .forUser(session.userId)
      .executionCalculations.saveCalculation(record);

    const store = this.dependencies.userPartitions.forUser(session.userId);
    const draftReportId = await ensureDraftReportLink(store, shell, updatedAt);

    await store.executionEvidence.saveEvidence({
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      draftReportId,
      executionStepId: 'calculation',
      structuredReadings: buildStructuredReadingsEvidence(shell, rawInputs, result),
      observationNotes: '',
      checklistOutcomes: [],
      riskJustifications: [],
      createdAt: updatedAt,
      updatedAt,
    });

    const reloadedShell = await this.loadShell(
      session,
      shell.workPackageId,
      shell.tagId,
      shell.template.id,
    );

    return reloadedShell
      ? mergeInSessionEvidenceIntoShell(reloadedShell, shell)
      : shell;
  }

  updateObservationNotes(shell: SharedExecutionShell, observationNotes: string): SharedExecutionShell {
    if (shell.evidence.observationNotes === observationNotes || isSubmittedReport(shell.report)) {
      return shell;
    }

    return applyEvidenceState(shell, {
      ...shell.evidence,
      observationNotes,
    });
  }

  async saveGuidanceEvidence(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<SharedExecutionShell> {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const updatedAt = this.now().toISOString();
    const store = this.dependencies.userPartitions.forUser(session.userId);
    const draftReportId = await ensureDraftReportLink(store, shell, updatedAt);

    await store.executionEvidence.saveEvidence({
      workPackageId: shell.workPackageId,
      tagId: shell.tagId,
      templateId: shell.template.id,
      templateVersion: shell.template.version,
      draftReportId,
      executionStepId: 'guidance',
      structuredReadings: null,
      observationNotes: shell.evidence.observationNotes.trim(),
      checklistOutcomes: shell.guidance.checklistItems.map((item) => ({
        checklistItemId: item.id,
        outcome: item.outcome,
      })),
      riskJustifications: shell.guidance.riskItems
        .filter(
          (item) => item.justificationRequired && item.justificationText.trim().length > 0,
        )
        .map((item) => ({
          riskItemId: item.id,
          reasonType: item.reasonType,
          justificationText: item.justificationText.trim(),
        })),
      createdAt: updatedAt,
      updatedAt,
    });

    const reloadedShell = await this.loadShell(
      session,
      shell.workPackageId,
      shell.tagId,
      shell.template.id,
    );

    return reloadedShell
      ? mergeInSessionReportDraftIntoShell(
          mergeInSessionCalculationIntoShell(reloadedShell, shell),
          shell,
        )
      : shell;
  }

  async attachPhotoEvidence(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
    photo: SharedExecutionPhotoAttachmentInput,
  ): Promise<SharedExecutionShell> {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const updatedAt = this.now().toISOString();
    const store = this.dependencies.userPartitions.forUser(session.userId);
    const draftReportId = await ensureDraftReportLink(store, shell, updatedAt);
    const sandboxFile = await store.mediaSandbox.copyFile({
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: draftReportId,
      fileName: buildPhotoAttachmentFileName(shell, photo, updatedAt),
      sourceUri: photo.uri,
    });

    await store.evidenceMetadata.saveEvidenceMetadata({
      evidenceId: buildPhotoEvidenceId(updatedAt),
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: draftReportId,
      fileName: sandboxFile.fileName,
      mediaRelativePath: sandboxFile.relativePath,
      mimeType: photo.mimeType,
      payloadJson: JSON.stringify({
        kind: 'photo',
        workPackageId: shell.workPackageId,
        tagId: shell.tagId,
        templateId: shell.template.id,
        templateVersion: shell.template.version,
        draftReportId,
        executionStepId: toExecutionStepKind(shell.progress.currentStepId),
        source: photo.source,
        width: photo.width,
        height: photo.height,
        fileSize: photo.fileSize,
      } satisfies StoredExecutionPhotoAttachmentPayload),
    });

    const reloadedShell = await this.loadShell(
      session,
      shell.workPackageId,
      shell.tagId,
      shell.template.id,
    );

    return reloadedShell
      ? mergeInSessionWorkingStateIntoShell(reloadedShell, shell)
      : shell;
  }

  async removePhotoEvidence(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
    evidenceId: string,
  ): Promise<SharedExecutionShell> {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const store = this.dependencies.userPartitions.forUser(session.userId);
    const metadata = await store.evidenceMetadata.getEvidenceById(evidenceId);

    if (
      !metadata ||
      metadata.businessObjectType !== LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE ||
      metadata.businessObjectId !== shell.evidence.draftReportId
    ) {
      return shell;
    }

    await store.mediaSandbox.deleteFile(metadata.mediaRelativePath);
    await store.evidenceMetadata.deleteEvidenceMetadata(evidenceId);

    const reloadedShell = await this.loadShell(
      session,
      shell.workPackageId,
      shell.tagId,
      shell.template.id,
    );

    return reloadedShell
      ? mergeInSessionWorkingStateIntoShell(reloadedShell, shell)
      : shell;
  }

  updateChecklistOutcome(
    shell: SharedExecutionShell,
    checklistItemId: string,
    outcome: SharedExecutionChecklistOutcome,
  ): SharedExecutionShell {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const checklistItems = shell.guidance.checklistItems.map((item) =>
      item.id === checklistItemId ? { ...item, outcome } : item,
    );

    const didChange = checklistItems.some(
      (item, index) => item.outcome !== shell.guidance.checklistItems[index]?.outcome,
    );

    if (!didChange) {
      return shell;
    }

    return applyGuidanceState(shell, {
      ...shell.guidance,
      checklistItems,
    });
  }

  updateRiskJustification(
    shell: SharedExecutionShell,
    riskItemId: string,
    justificationText: string,
  ): SharedExecutionShell {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const riskItems = shell.guidance.riskItems.map((item) =>
      item.id === riskItemId ? { ...item, justificationText } : item,
    );

    const didChange = riskItems.some(
      (item, index) => item.justificationText !== shell.guidance.riskItems[index]?.justificationText,
    );

    if (!didChange) {
      return shell;
    }

    return applyGuidanceState(shell, {
      ...shell.guidance,
      riskItems,
    });
  }

  updateReportReviewNotes(
    shell: SharedExecutionShell,
    reviewNotes: string,
  ): SharedExecutionShell {
    if (shell.report.reviewNotes === reviewNotes || isSubmittedReport(shell.report)) {
      return shell;
    }

    return applyReportDraftState(shell, {
      ...shell.report,
      reviewNotes,
    });
  }

  async saveReportDraft(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<SharedExecutionShell> {
    if (isSubmittedReport(shell.report)) {
      return shell;
    }

    const updatedAt = this.now().toISOString();
    const store = this.dependencies.userPartitions.forUser(session.userId);
    const lifecycleState = resolveDraftReportLifecycleState(shell.guidance.submitReadiness);
    const draftRecord = await saveReportDraftRecord(store, shell, {
      state: TECHNICIAN_OWNED_DRAFT_REPORT_STATE,
      reviewNotes: shell.report.reviewNotes,
      savedAt: updatedAt,
      submittedAt: null,
      syncState: LOCAL_ONLY_SYNC_STATE,
      lifecycleState,
      updatedAt,
    });
    const storedPayload = parseStoredPerTagReportDraftPayload(draftRecord);

    return applyReportDraftState(shell, {
      ...shell.report,
      state: storedPayload?.state ?? TECHNICIAN_OWNED_DRAFT_REPORT_STATE,
      lifecycleState,
      syncState: storedPayload?.syncState ?? LOCAL_ONLY_SYNC_STATE,
      reviewNotes: storedPayload?.reviewNotes ?? shell.report.reviewNotes,
      savedAt: storedPayload?.savedAt ?? updatedAt,
      submittedAt: storedPayload?.submittedAt ?? null,
    });
  }

  async submitReport(
    session: ActiveUserSession,
    shell: SharedExecutionShell,
  ): Promise<SharedExecutionShell> {
    const submitWork = async () => {
      const updatedAt = this.now().toISOString();
      const store = this.dependencies.userPartitions.forUser(session.userId);
      const existingDraft = await store.drafts.getDraft({
        businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
        businessObjectId: shell.report.reportId,
      });
      const existingPayload = parseStoredPerTagReportDraftPayload(existingDraft);
      const alreadySubmitted = existingPayload?.state === SUBMITTED_PENDING_SYNC_REPORT_STATE;

      if (!alreadySubmitted && shell.guidance.submitReadiness === 'blocked') {
        throw new Error(
          'This per-tag report is not ready for local submission yet. Capture the minimum evidence and required justifications first.',
        );
      }

      const reviewNotes = alreadySubmitted
        ? existingPayload?.reviewNotes ?? shell.report.reviewNotes
        : shell.report.reviewNotes;
      const savedAt = alreadySubmitted
        ? existingPayload?.savedAt ?? shell.report.savedAt
        : shell.report.savedAt;
      const submittedAt = alreadySubmitted
        ? existingPayload?.submittedAt ?? updatedAt
        : updatedAt;
      const reportQueueItemId = buildSubmitReportQueueItemId(shell.report.reportId);
      let draftRecord = existingDraft;

      if (!alreadySubmitted || !draftRecord) {
        draftRecord = await persistPerTagReportDraft(store, shell, {
          state: SUBMITTED_PENDING_SYNC_REPORT_STATE,
          reviewNotes,
          savedAt,
          submittedAt,
          syncState: QUEUED_SYNC_STATE,
          lifecycleState: 'Submitted - Pending Sync',
          updatedAt,
        });
      }

      const existingReportQueueItem = await store.queueItems.getQueueItemById(reportQueueItemId);
      if (!existingReportQueueItem) {
        await store.queueItems.enqueue({
          queueItemId: reportQueueItemId,
          businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
          businessObjectId: shell.report.reportId,
          itemKind: SUBMIT_REPORT_QUEUE_ITEM_KIND,
          payloadJson: JSON.stringify(
            buildSubmitReportQueuePayload(
              shell,
              draftRecord?.updatedAt ?? updatedAt,
              updatedAt,
            ),
          ),
        });
      }

      for (const attachment of shell.evidence.photoAttachments) {
        const queueItemId = buildUploadEvidenceBinaryQueueItemId(attachment.evidenceId);
        const existingEvidenceQueueItem = await store.queueItems.getQueueItemById(queueItemId);

        if (existingEvidenceQueueItem) {
          continue;
        }

        await store.queueItems.enqueue({
          queueItemId,
          businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
          businessObjectId: shell.report.reportId,
          itemKind: UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
          payloadJson: JSON.stringify(
            buildUploadEvidenceBinaryQueuePayload(
              shell,
              attachment,
              reportQueueItemId,
              updatedAt,
            ),
          ),
        });
      }

      if (this.dependencies.localWorkState && !existingReportQueueItem) {
        const currentUnsyncedCount = await this.dependencies.localWorkState.getUnsyncedWorkCount();
        await this.dependencies.localWorkState.setUnsyncedWorkCount(currentUnsyncedCount + 1);
      }
    };

    if (this.dependencies.localWorkState) {
      await this.dependencies.localWorkState.runInTransaction(submitWork);
    } else {
      await submitWork();
    }

    const reloadedShell = await this.loadShell(
      session,
      shell.workPackageId,
      shell.tagId,
      shell.template.id,
    );

    return reloadedShell ?? shell;
  }
}

function buildExecutionShell(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
  tagContext: LocalTagContext,
  template: SharedExecutionShell['template'],
  progress: StoredExecutionProgressRecord,
  storedCalculation: StoredExecutionCalculationRecord | null,
  storedEvidence: StoredExecutionEvidenceRecord[],
  storedPhotoAttachments: SharedExecutionPhotoAttachment[],
  storedDraft: UserOwnedDraftRecord | null,
  storedDraftPayload: StoredPerTagReportDraftPayload | null,
  session: ActiveUserSession,
): SharedExecutionShell {
  const riskInputs = buildRiskInputs(tagContext);
  const evidence = buildEvidenceState(
    snapshot.summary.id,
    tag.id,
    storedEvidence,
    storedPhotoAttachments,
    storedDraftPayload?.state,
  );
  const calculation = buildCalculationState(tag, template, storedCalculation);
  const guidance = buildGuidanceState(
    snapshot,
    tag,
    template,
    storedEvidence,
    riskInputs,
    evidence,
  );
  const report = buildReportDraftState({
    snapshot,
    tag,
    tagContext,
    template,
    session,
    calculation,
    guidance,
    evidence,
    storedDraft,
    storedDraftPayload,
  });
  const steps: SharedExecutionShell['steps'] = [
    {
      id: 'context',
      title: 'Context',
      kind: 'context',
      summary: 'Field-critical tag context is loaded locally for this execution.',
      detail: 'Use these local references to confirm what you are about to test before entering values.',
      fields: [
        mapContextField(tagContext.instrumentFamily.label, tagContext.instrumentFamily.value, tagContext.instrumentFamily.state),
        mapContextField(tagContext.measuredVariable.label, tagContext.measuredVariable.value, tagContext.measuredVariable.state),
        mapContextField(tagContext.signalType.label, tagContext.signalType.value, tagContext.signalType.state),
        mapContextField(tagContext.range.label, tagContext.range.value, tagContext.range.state),
        mapContextField(tagContext.tolerance.label, tagContext.tolerance.value, tagContext.tolerance.state),
      ],
    },
    {
      id: 'calculation',
      title: 'Calculation setup',
      kind: 'calculation',
      summary: template.captureSummary,
      detail: `${template.calculationMode} using ${template.acceptanceStyle}.`,
      fields: [
        availableField('Template', template.title),
        availableField('Template version', template.version),
        availableField('Calculation mode', template.calculationMode),
        availableField('Acceptance style', template.acceptanceStyle),
        availableField(
          'Capture fields',
          template.captureFields.map((field) => field.label).join(', '),
        ),
        availableField('Tolerance basis', calculation.definition.toleranceSource),
        availableField(
          'Conversion basis',
          calculation.definition.executionContext.conversionBasisSummary ?? 'Not declared',
        ),
        availableField(
          'Expected range',
          calculation.definition.executionContext.expectedRangeSummary ?? 'Not declared',
        ),
        availableField(
          'Minimum evidence',
          template.minimumSubmissionEvidence.length > 0
            ? template.minimumSubmissionEvidence.join(', ')
            : 'None declared',
        ),
        availableField(
          'Expected evidence',
          template.expectedEvidence.length > 0
            ? template.expectedEvidence.join(', ')
            : 'None declared',
        ),
        availableField('Draft report', evidence.draftReportId),
        {
          label: 'Structured readings saved',
          value: evidence.calculationEvidenceUpdatedAt
            ? new Date(evidence.calculationEvidenceUpdatedAt).toLocaleString()
            : 'Not saved yet',
          state: evidence.calculationEvidenceUpdatedAt ? 'available' : 'missing',
        },
      ],
    },
    {
      id: 'history',
      title: 'History comparison',
      kind: 'history',
      summary: tagContext.historyPreview.summary,
      detail: `${tagContext.historyPreview.detail} Expected comparison: ${template.historyComparisonExpectation}.`,
      fields: buildHistoryFields(tagContext, calculation, template.historyComparisonExpectation),
    },
    {
      id: 'guidance',
      title: 'Checklist and guidance',
      kind: 'guidance',
      summary: buildGuidanceStepSummary(guidance),
      detail: buildGuidanceStepDetail(guidance),
      fields: buildGuidanceFields(guidance, evidence),
    },
    {
      id: 'report',
      title: 'Report draft review',
      kind: 'report',
      summary: buildReportStepSummary(report),
      detail: buildReportStepDetail(report),
      fields: buildReportFields(report),
    },
  ];

  return {
    workPackageId: snapshot.summary.id,
    workPackageTitle: snapshot.summary.title,
    tagId: tag.id,
    tagCode: tag.tagCode,
    template,
    calculation,
    riskInputs,
    guidance,
    evidence,
    report,
    steps,
    progress: normalizeProgress(progress, steps.map((step) => step.id)),
  } satisfies SharedExecutionShell;
}

function buildCalculationState(
  tag: AssignedWorkPackageTagSnapshot,
  template: SharedExecutionShell['template'],
  storedCalculation: StoredExecutionCalculationRecord | null,
): SharedExecutionCalculationState {
  const definition = resolveDeterministicCalculationDefinition(
    tag,
    template.calculationMode,
    template.acceptanceStyle,
    mapTemplateInputLabelOverrides(template.captureFields),
    mapTemplateInputUnitOverrides(template.captureFields),
    template.calculationRangeOverride,
    {
      conversionBasisSummary: template.conversionBasisSummary,
      expectedRangeSummary: template.expectedRangeSummary,
    },
  );
  const executionContext = storedCalculation?.executionContext ?? definition.executionContext;

  return {
    definition: {
      ...definition,
      executionContext,
    },
    rawInputs: storedCalculation?.rawInputs ?? {
      expectedValue: '',
      observedValue: '',
    },
    result: storedCalculation?.result ?? null,
    updatedAt: storedCalculation?.updatedAt ?? null,
  };
}

function mapTemplateInputLabelOverrides(
  captureFields: SharedExecutionShell['template']['captureFields'],
): Partial<Record<SharedExecutionCaptureFieldId, string>> {
  const labels: Partial<Record<SharedExecutionCaptureFieldId, string>> = {};

  for (const field of captureFields) {
    labels[field.id] = field.label;
  }

  return labels;
}

function mapTemplateInputUnitOverrides(
  captureFields: SharedExecutionShell['template']['captureFields'],
): Partial<Record<SharedExecutionCaptureFieldId, string>> {
  const units: Partial<Record<SharedExecutionCaptureFieldId, string>> = {};

  for (const field of captureFields) {
    if (field.unit) {
      units[field.id] = field.unit;
    }
  }

  return units;
}

function normalizeProgress(
  progress: StoredExecutionProgressRecord,
  validStepIds: string[],
): StoredExecutionProgressRecord {
  const currentStepId = validStepIds.includes(progress.currentStepId)
    ? progress.currentStepId
    : validStepIds[0]!;
  const visitedStepIds = Array.from(
    new Set(progress.visitedStepIds.filter((stepId) => validStepIds.includes(stepId)).concat(currentStepId)),
  );

  return {
    ...progress,
    currentStepId,
    visitedStepIds,
  };
}

function buildGuidanceState(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
  template: SharedExecutionShell['template'],
  storedEvidence: StoredExecutionEvidenceRecord[],
  riskInputs: SharedExecutionRiskInputs,
  evidence: SharedExecutionEvidenceState,
): SharedExecutionGuidanceState {
  const savedGuidanceEvidence = storedEvidence.find(
    (item) => item.executionStepId === 'guidance',
  );
  const checklistOutcomeById = new Map(
    (savedGuidanceEvidence?.checklistOutcomes ?? []).map((item) => [
      item.checklistItemId,
      item.outcome,
    ]),
  );
  const riskJustificationById = new Map(
    (savedGuidanceEvidence?.riskJustifications ?? []).map((item) => [
      item.riskItemId,
      item.justificationText,
    ]),
  );

  return deriveGuidanceState(
    {
      checklistItems: template.checklistSteps.map((item) => ({
        ...item,
        outcome: checklistOutcomeById.get(item.id) ?? 'pending',
      })),
      guidedDiagnosisPrompts: template.guidedDiagnosisPrompts,
      linkedGuidance: buildLinkedGuidance(snapshot, tag),
      riskState: 'clear',
      riskHooks: [],
      riskItems: [],
      submitReadiness: 'ready',
      submitBlockingHooks: [],
    },
    {
      template,
      riskInputs,
      evidence,
      riskJustificationById,
    },
  );
}

function buildLinkedGuidance(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): SharedExecutionLinkedGuidanceSnippet[] {
  return snapshot.guidance
    .filter((item) => tag.guidanceReferenceIds.includes(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      whyItMatters: item.whyItMatters,
      sourceReference: item.sourceReference,
    }));
}

function buildRiskInputs(tagContext: LocalTagContext): SharedExecutionRiskInputs {
  return {
    historyState: tagContext.historyPreview.state,
    missingContextFieldLabels: [
      tagContext.area,
      tagContext.parentAssetReference,
      tagContext.instrumentFamily,
      tagContext.instrumentSubtype,
      tagContext.measuredVariable,
      tagContext.signalType,
      tagContext.range,
      tagContext.tolerance,
      tagContext.criticality,
      tagContext.dueIndicator,
    ]
      .filter((field) => field.state === 'missing')
      .map((field) => field.label),
  };
}

function deriveGuidanceState(
  guidance: SharedExecutionGuidanceState,
  context: {
    template: SharedExecutionShell['template'];
    riskInputs: SharedExecutionRiskInputs;
    evidence: SharedExecutionEvidenceState;
    riskJustificationById?: Map<string, string>;
  },
): SharedExecutionGuidanceState {
  const riskJustificationById =
    context.riskJustificationById ??
    new Map(guidance.riskItems.map((item) => [item.id, item.justificationText]));
  const riskItems = buildRiskItems(guidance, context).map((item) => ({
    ...item,
    justificationText: riskJustificationById.get(item.id) ?? item.justificationText,
  }));
  const riskHooks = riskItems.map((item) => formatRiskHook(item));
  const submitBlockingHooks = buildSubmitBlockingHooks(riskItems);

  return {
    ...guidance,
    riskState: riskItems.length > 0 ? 'flagged' : 'clear',
    riskHooks,
    riskItems,
    submitReadiness: submitBlockingHooks.length > 0 ? 'blocked' : 'ready',
    submitBlockingHooks,
  };
}

function buildRiskItems(
  guidance: SharedExecutionGuidanceState,
  context: {
    template: SharedExecutionShell['template'];
    riskInputs: SharedExecutionRiskInputs;
    evidence: SharedExecutionEvidenceState;
  },
): SharedExecutionRiskItem[] {
  const riskItems: SharedExecutionRiskItem[] = [];

  if (context.riskInputs.missingContextFieldLabels.length > 0) {
    riskItems.push({
      id: 'missing-context',
      reasonType: 'missing-context',
      severity: 'warning',
      title: 'Missing context',
      detail: `Missing locally cached context: ${context.riskInputs.missingContextFieldLabels.join(', ')}.`,
      justificationRequired: true,
      justificationPrompt:
        'Explain how you verified the work safely even though some field context was missing.',
      justificationText: '',
    });
  }

  const historyRiskItem = buildHistoryRiskItem(context.riskInputs.historyState);
  if (historyRiskItem) {
    riskItems.push(historyRiskItem);
  }

  for (const item of guidance.checklistItems) {
    const checklistRiskItem = buildChecklistRiskItem(item);
    if (checklistRiskItem) {
      riskItems.push(checklistRiskItem);
    }
  }

  for (const label of resolveMissingEvidenceLabels(
    context.template.expectedEvidence,
    context.evidence,
  )) {
    riskItems.push({
      id: buildEvidenceRiskId('expected-evidence', label),
      reasonType: 'missing-expected-evidence',
      severity: 'warning',
      title: `Expected evidence missing: ${label}`,
      detail:
        'The template marks this evidence as expected for a complete package. Work can continue, but the gap stays visible.',
      justificationRequired: true,
      justificationPrompt:
        'Explain why this expected evidence could not be captured in the field.',
      justificationText: '',
    });
  }

  for (const label of resolveMissingEvidenceLabels(
    context.template.minimumSubmissionEvidence,
    context.evidence,
  )) {
    riskItems.push({
      id: buildEvidenceRiskId('minimum-evidence', label),
      reasonType: 'missing-minimum-evidence',
      severity: 'submit-block',
      title: `Minimum evidence missing: ${label}`,
      detail:
        'This evidence is part of the template minimum and will need to be captured before submission.',
      justificationRequired: false,
      justificationPrompt: null,
      justificationText: '',
    });
  }

  return riskItems;
}

function buildHistoryRiskItem(
  historyState: SharedExecutionRiskInputs['historyState'],
): SharedExecutionRiskItem | null {
  switch (historyState) {
    case 'stale':
      return {
        id: 'history-stale',
        reasonType: 'missing-history',
        severity: 'warning',
        title: 'Cached history is stale',
        detail: 'History is present but flagged as stale, so the comparison may not reflect the latest upstream work.',
        justificationRequired: true,
        justificationPrompt:
          'Explain how you proceeded with a stale history reference in the field.',
        justificationText: '',
      };
    case 'age-unknown':
      return {
        id: 'history-age-unknown',
        reasonType: 'missing-history',
        severity: 'warning',
        title: 'Cached history age is unknown',
        detail: 'History is present, but the package cannot confirm its freshness.',
        justificationRequired: true,
        justificationPrompt:
          'Explain how you handled the age-unknown history reference during execution.',
        justificationText: '',
      };
    case 'missing':
      return {
        id: 'history-missing',
        reasonType: 'missing-history',
        severity: 'warning',
        title: 'History reference is missing',
        detail: 'The cached package points to missing history data for this tag.',
        justificationRequired: true,
        justificationPrompt:
          'Explain how you proceeded without the expected local history reference.',
        justificationText: '',
      };
    case 'unavailable':
      return {
        id: 'history-unavailable',
        reasonType: 'missing-history',
        severity: 'warning',
        title: 'History is unavailable',
        detail: 'This cached package does not include local history for the selected tag.',
        justificationRequired: true,
        justificationPrompt:
          'Explain how you proceeded without local history in the package.',
        justificationText: '',
      };
    default:
      return null;
  }
}

function buildChecklistRiskItem(
  item: SharedExecutionChecklistItem,
): SharedExecutionRiskItem | null {
  if (item.outcome === 'skipped') {
    return {
      id: `checklist:${item.id}`,
      reasonType: 'checklist-skipped',
      severity: 'warning',
      title: `Checklist skipped: ${item.prompt}`,
      detail: `This leaves ${item.helpsRuleOut} unresolved until the technician explains why the step was skipped.`,
      justificationRequired: true,
      justificationPrompt: 'Explain why this checklist step was skipped.',
      justificationText: '',
    };
  }

  if (item.outcome === 'incomplete') {
    return {
      id: `checklist:${item.id}`,
      reasonType: 'checklist-incomplete',
      severity: 'warning',
      title: `Checklist incomplete: ${item.prompt}`,
      detail: `This step still helps rule out ${item.helpsRuleOut}, so the incomplete state must stay visible.`,
      justificationRequired: true,
      justificationPrompt: 'Explain why this checklist step is still incomplete.',
      justificationText: '',
    };
  }

  return null;
}

function resolveMissingEvidenceLabels(
  labels: string[],
  evidence: SharedExecutionEvidenceState,
): string[] {
  return labels.filter((label) => !isEvidenceLabelSatisfied(label, evidence));
}

function isEvidenceLabelSatisfied(
  label: string,
  evidence: SharedExecutionEvidenceState,
): boolean {
  const evidenceKind = resolveEvidenceRequirementKind(label);
  return evidenceKind ? isEvidenceKindSatisfied(evidenceKind, evidence) : false;
}

function resolveEvidenceRequirementKind(
  label: string,
): SharedExecutionEvidenceRequirementKind | null {
  const normalizedLabel = normalizeEvidenceRequirementLabel(label);

  if (STRUCTURED_READINGS_EVIDENCE_LABELS.has(normalizedLabel)) {
    return 'structured-readings';
  }

  if (OBSERVATION_NOTES_EVIDENCE_LABELS.has(normalizedLabel)) {
    return 'observation-notes';
  }

  if (PHOTO_EVIDENCE_LABELS.has(normalizedLabel)) {
    return 'photo-evidence';
  }

  return null;
}

function isEvidenceKindSatisfied(
  evidenceKind: SharedExecutionEvidenceRequirementKind,
  evidence: SharedExecutionEvidenceState,
): boolean {
  switch (evidenceKind) {
    case 'structured-readings':
      return evidence.calculationEvidenceUpdatedAt !== null;
    case 'observation-notes':
      return evidence.observationNotes.trim().length > 0;
    case 'photo-evidence':
      return evidence.photoAttachments.length > 0;
  }
}

function normalizeEvidenceRequirementLabel(label: string): string {
  return label.trim().toLowerCase();
}

function buildEvidenceRiskId(
  prefix: 'expected-evidence' | 'minimum-evidence',
  label: string,
): string {
  return `${prefix}:${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function formatRiskHook(item: SharedExecutionRiskItem): string {
  return `${item.severity === 'submit-block' ? 'Submit-block' : 'Visible risk'}: ${item.title}.`;
}

function buildSubmitBlockingHooks(riskItems: SharedExecutionRiskItem[]): string[] {
  const hooks = riskItems
    .filter((item) => item.severity === 'submit-block')
    .map((item) => `${item.title}.`);

  for (const item of riskItems) {
    if (item.justificationRequired && item.justificationText.trim().length === 0) {
      hooks.push(`Justification required: ${item.title}.`);
    }
  }

  return hooks;
}

function buildReportDraftState(input: {
  snapshot: AssignedWorkPackageSnapshot;
  tag: AssignedWorkPackageTagSnapshot;
  tagContext: LocalTagContext;
  template: SharedExecutionShell['template'];
  session: ActiveUserSession;
  calculation: SharedExecutionCalculationState | null;
  guidance: SharedExecutionGuidanceState;
  evidence: SharedExecutionEvidenceState;
  storedDraft: UserOwnedDraftRecord | null;
  storedDraftPayload: StoredPerTagReportDraftPayload | null;
}): SharedExecutionReportDraftState {
  const storedPayload =
    input.storedDraftPayload ?? parseStoredPerTagReportDraftPayload(input.storedDraft);
  const derivedLifecycleState = resolveDraftReportLifecycleState(input.guidance.submitReadiness);

  return {
    reportId: input.evidence.draftReportId,
    state: storedPayload?.state ?? TECHNICIAN_OWNED_DRAFT_REPORT_STATE,
    lifecycleState: storedPayload?.lifecycleState ?? derivedLifecycleState,
    syncState: storedPayload?.syncState ?? LOCAL_ONLY_SYNC_STATE,
    technicianName: input.session.displayName,
    technicianEmail: input.session.email,
    tagContextSummary: buildReportTagContextSummary(
      input.snapshot.summary.title,
      input.tag,
      input.template.testPattern,
    ),
    executionSummary: buildReportExecutionSummary(input.calculation),
    historySummary: buildReportHistorySummary(input.tagContext),
    draftDiagnosisSummary: buildReportDiagnosisSummary({
      calculation: input.calculation,
      historySummary: buildReportHistorySummary(input.tagContext),
      guidance: input.guidance,
      evidence: input.evidence,
    }),
    checklistOutcomes: buildReportChecklistOutcomes(input.guidance),
    evidenceReferences: buildReportEvidenceReferences(input.template, input.evidence),
    riskFlags: input.guidance.riskItems,
    reviewNotes: storedPayload?.reviewNotes ?? '',
    savedAt: storedPayload?.savedAt ?? null,
    submittedAt: storedPayload?.submittedAt ?? null,
  };
}

function deriveReportDraftState(
  shell: SharedExecutionShell,
  overrides?: Partial<
    Pick<
      SharedExecutionReportDraftState,
      | 'technicianName'
      | 'technicianEmail'
      | 'tagContextSummary'
      | 'reviewNotes'
      | 'savedAt'
      | 'submittedAt'
    >
  >,
): SharedExecutionReportDraftState {
  const historySummary = buildReportHistorySummaryFromShell(shell);
  const lifecycleState = isSubmittedReport(shell.report)
    ? 'Submitted - Pending Sync'
    : resolveDraftReportLifecycleState(shell.guidance.submitReadiness);

  return {
    reportId: shell.evidence.draftReportId,
    state: shell.report.state,
    lifecycleState,
    syncState: shell.report.syncState,
    technicianName: overrides?.technicianName ?? shell.report.technicianName,
    technicianEmail: overrides?.technicianEmail ?? shell.report.technicianEmail,
    tagContextSummary: overrides?.tagContextSummary ?? shell.report.tagContextSummary,
    executionSummary: buildReportExecutionSummary(shell.calculation),
    historySummary,
    draftDiagnosisSummary: buildReportDiagnosisSummary({
      calculation: shell.calculation,
      historySummary,
      guidance: shell.guidance,
      evidence: shell.evidence,
    }),
    checklistOutcomes: buildReportChecklistOutcomes(shell.guidance),
    evidenceReferences: buildReportEvidenceReferences(shell.template, shell.evidence),
    riskFlags: shell.guidance.riskItems,
    reviewNotes: overrides?.reviewNotes ?? shell.report.reviewNotes,
    savedAt: overrides?.savedAt ?? shell.report.savedAt,
    submittedAt: overrides?.submittedAt ?? shell.report.submittedAt,
  };
}

function applyReportDraftState(
  shell: SharedExecutionShell,
  report: SharedExecutionReportDraftState,
): SharedExecutionShell {
  return {
    ...shell,
    evidence: {
      ...shell.evidence,
      draftReportState: report.state,
    },
    report,
    steps: shell.steps.map((step) =>
      step.id === 'report'
        ? {
            ...step,
            summary: buildReportStepSummary(report),
            detail: buildReportStepDetail(report),
            fields: buildReportFields(report),
          }
        : step,
    ),
  };
}

function mergeInSessionReportDraftIntoShell(
  shell: SharedExecutionShell,
  previousShell: SharedExecutionShell,
): SharedExecutionShell {
  const preserveSubmittedLifecycle = isSubmittedReport(previousShell.report);

  return applyReportDraftState(shell, {
    ...shell.report,
    state: previousShell.report.state,
    lifecycleState: preserveSubmittedLifecycle
      ? previousShell.report.lifecycleState
      : shell.report.lifecycleState,
    syncState: preserveSubmittedLifecycle
      ? previousShell.report.syncState
      : shell.report.syncState,
    reviewNotes: previousShell.report.reviewNotes,
    savedAt: previousShell.report.savedAt,
    submittedAt: preserveSubmittedLifecycle
      ? previousShell.report.submittedAt
      : shell.report.submittedAt,
  });
}

function buildReportTagContextSummary(
  workPackageTitle: string,
  tag: AssignedWorkPackageTagSnapshot,
  testPattern: string,
): string {
  return [
    workPackageTitle,
    `${tag.tagCode} ${tag.shortDescription}`.trim(),
    tag.area.trim().length > 0 ? `Area: ${tag.area}` : null,
    `Family: ${tag.instrumentFamily}`,
    `Pattern: ${testPattern}`,
  ]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(' / ');
}

function buildReportExecutionSummary(
  calculation: SharedExecutionCalculationState | null,
): string {
  if (!calculation?.result) {
    return 'Structured readings have not been saved yet for this draft report.';
  }

  const checkpoint = formatCurrentCheckpoint(calculation);
  const signedDeviation = formatCurrentSignedDeviation(calculation);
  const absoluteDeviation = formatCurrentAbsoluteDeviation(calculation);
  const percentOfSpan = formatCurrentPercentOfSpan(calculation);

  return [
    `Current result: ${toDisplayAcceptance(calculation.result.acceptance)}.`,
    checkpoint,
    `Signed deviation: ${signedDeviation}.`,
    `Absolute deviation: ${absoluteDeviation}.`,
    `Percent of span: ${percentOfSpan}.`,
    calculation.result.acceptanceReason,
  ].join(' ');
}

function buildReportHistorySummary(tagContext: LocalTagContext): string {
  return buildHistorySummaryText({
    historyState: tagContext.historyPreview.state,
    currentVsPrior: null,
    priorResult: formatPriorResult(tagContext),
    recurrenceCue: tagContext.historyPreview.recurrenceCue,
    lastObservedAt: tagContext.historyPreview.lastObservedAt,
  });
}

function buildReportHistorySummaryFromShell(shell: SharedExecutionShell): string {
  const historyStep = shell.steps.find((step) => step.id === 'history');
  const currentVsPrior = getStepFieldValue(historyStep, 'Current vs prior');
  const priorResult = getStepFieldValue(historyStep, 'Prior result') ?? 'Not available';
  const recurrenceCue = getStepFieldValue(historyStep, 'Recurrence cue');
  const lastObserved = getStepFieldValue(historyStep, 'Last observed');

  return buildHistorySummaryText({
    historyState: shell.riskInputs.historyState,
    currentVsPrior,
    priorResult,
    recurrenceCue:
      recurrenceCue && recurrenceCue !== 'No recurrence cue attached.'
        ? recurrenceCue
        : null,
    lastObservedAt:
      lastObserved && lastObserved !== 'Missing' && lastObserved !== 'Not included in this package'
        ? lastObserved
        : null,
  });
}

function buildHistorySummaryText(input: {
  historyState: LocalTagContext['historyPreview']['state'];
  currentVsPrior: string | null;
  priorResult: string;
  recurrenceCue: string | null;
  lastObservedAt: string | null;
}): string {
  const segments = [`History state: ${toDisplayState(input.historyState)}.`];

  if (input.currentVsPrior && input.currentVsPrior !== 'Enter current values to compare them with cached history.') {
    segments.push(input.currentVsPrior);
  }

  segments.push(`Prior result: ${input.priorResult}.`);

  if (input.recurrenceCue) {
    segments.push(`Recurrence cue: ${input.recurrenceCue}.`);
  }

  if (input.lastObservedAt) {
    segments.push(`Last observed: ${input.lastObservedAt}.`);
  }

  return segments.join(' ');
}

function buildReportDiagnosisSummary(input: {
  calculation: SharedExecutionCalculationState | null;
  historySummary: string;
  guidance: SharedExecutionGuidanceState;
  evidence: SharedExecutionEvidenceState;
}): string {
  const segments: string[] = [];

  if (!input.calculation?.result) {
    segments.push('Draft diagnosis summary is still incomplete because no deterministic result has been saved yet.');
  } else {
    segments.push(
      `Saved deterministic outcome is ${toDisplayAcceptance(input.calculation.result.acceptance)}.`,
    );
  }

  if (input.guidance.riskItems.length > 0) {
    segments.push(`${input.guidance.riskItems.length} visible risk flag(s) remain on the draft.`);
  } else {
    segments.push('No visible risk flags are currently active.');
  }

  if (input.evidence.observationNotes.trim().length > 0) {
    segments.push('Observation notes were captured locally and will carry into the report draft.');
  }

  if (input.historySummary.length > 0) {
    segments.push(input.historySummary);
  }

  return segments.join(' ');
}

function buildReportChecklistOutcomes(
  guidance: SharedExecutionGuidanceState,
): SharedExecutionReportChecklistOutcome[] {
  return guidance.checklistItems.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    outcome: item.outcome,
    sourceReference: item.sourceReference,
  }));
}

function buildReportEvidenceReferences(
  template: SharedExecutionShell['template'],
  evidence: SharedExecutionEvidenceState,
): SharedExecutionReportEvidenceReference[] {
  return [
    ...template.minimumSubmissionEvidence.map((label) =>
      buildReportEvidenceReference(label, 'minimum', evidence),
    ),
    ...template.expectedEvidence.map((label) =>
      buildReportEvidenceReference(label, 'expected', evidence),
    ),
  ];
}

function buildReportEvidenceReference(
  label: string,
  requirementLevel: SharedExecutionReportEvidenceReference['requirementLevel'],
  evidence: SharedExecutionEvidenceState,
): SharedExecutionReportEvidenceReference {
  const evidenceKind = resolveEvidenceRequirementKind(label);

  if (!evidenceKind) {
    return {
      label,
      requirementLevel,
      evidenceKind: 'unmapped',
      satisfied: false,
      detail: 'No explicit evidence kind mapping is defined for this requirement label yet.',
    };
  }

  return {
    label,
    requirementLevel,
    evidenceKind,
    satisfied: isEvidenceKindSatisfied(evidenceKind, evidence),
    detail: buildEvidenceReferenceDetail(evidenceKind, evidence),
  };
}

function buildEvidenceReferenceDetail(
  evidenceKind: SharedExecutionEvidenceRequirementKind,
  evidence: SharedExecutionEvidenceState,
): string {
  switch (evidenceKind) {
    case 'structured-readings':
      return evidence.calculationEvidenceUpdatedAt
        ? `Structured readings saved ${new Date(evidence.calculationEvidenceUpdatedAt).toLocaleString()}.`
        : 'Structured readings have not been saved yet.';
    case 'observation-notes':
      return evidence.observationNotes.trim().length > 0
        ? 'Observation notes are captured locally.'
        : 'Observation notes have not been captured yet.';
    case 'photo-evidence':
      return evidence.photoAttachments.length > 0
        ? `${evidence.photoAttachments.length} photo attachment(s) are linked locally.`
        : 'No local photo attachment is linked yet.';
  }
}

function buildReportStepSummary(report: SharedExecutionReportDraftState): string {
  if (report.lifecycleState === 'Submitted - Pending Sync') {
    return 'Per-tag report was submitted locally and is queued for sync while the field record stays locked.';
  }

  if (report.lifecycleState === 'Ready to Submit') {
    return 'Per-tag report draft is assembled locally and ready for submission review.';
  }

  return 'Per-tag report draft is assembled locally and still in progress while readiness hooks remain active.';
}

function buildReportStepDetail(report: SharedExecutionReportDraftState): string {
  if (report.lifecycleState === 'Submitted - Pending Sync') {
    return 'This per-tag report has already been queued locally. Submission remains local-only until a later sync story sends it for server validation.';
  }

  return report.savedAt
    ? 'Review the generated draft, add final notes or corrections, and save locally for later completion without retyping the field session.'
    : 'Review the generated draft, add final notes or corrections, and save locally when you want to keep this per-tag report for later completion.';
}

function buildReportFields(
  report: SharedExecutionReportDraftState,
): SharedExecutionField[] {
  const completedChecklistCount = report.checklistOutcomes.filter(
    (item) => item.outcome === 'completed',
  ).length;
  const incompleteChecklistCount = report.checklistOutcomes.filter(
    (item) => item.outcome === 'incomplete',
  ).length;
  const skippedChecklistCount = report.checklistOutcomes.filter(
    (item) => item.outcome === 'skipped',
  ).length;
  const pendingChecklistCount = report.checklistOutcomes.filter(
    (item) => item.outcome === 'pending',
  ).length;
  const minimumEvidence = report.evidenceReferences.filter(
    (item) => item.requirementLevel === 'minimum',
  );
  const expectedEvidence = report.evidenceReferences.filter(
    (item) => item.requirementLevel === 'expected',
  );
  const requiredJustificationCount = report.riskFlags.filter(
    (item) => item.justificationRequired,
  ).length;
  const enteredJustificationCount = report.riskFlags.filter(
    (item) => item.justificationRequired && item.justificationText.trim().length > 0,
  ).length;

  return [
    {
      label: 'Report lifecycle',
      value: report.lifecycleState,
      state: report.lifecycleState === 'In Progress' ? 'missing' : 'available',
    },
    {
      label: 'Sync state',
      value: report.syncState === QUEUED_SYNC_STATE ? 'Queued' : 'Local Only',
      state: report.syncState === QUEUED_SYNC_STATE ? 'missing' : 'available',
    },
    availableField('Draft report', report.reportId),
    availableField('Technician', `${report.technicianName} (${report.technicianEmail})`),
    {
      label: 'Draft review saved',
      value: report.savedAt ? new Date(report.savedAt).toLocaleString() : 'Not saved yet',
      state: report.savedAt ? 'available' : 'missing',
    },
    {
      label: 'Submitted locally',
      value: report.submittedAt ? new Date(report.submittedAt).toLocaleString() : 'Not submitted yet',
      state: report.submittedAt ? 'available' : 'missing',
    },
    availableField('Tag context', report.tagContextSummary),
    {
      label: 'Execution summary',
      value: report.executionSummary,
      state: report.executionSummary.includes('not been saved yet') ? 'missing' : 'available',
    },
    availableField('History summary', report.historySummary),
    {
      label: 'Checklist outcomes',
      value:
        report.checklistOutcomes.length > 0
          ? `Pending ${pendingChecklistCount}; Completed ${completedChecklistCount}; Incomplete ${incompleteChecklistCount}; Skipped ${skippedChecklistCount}`
          : 'None declared',
      state:
        incompleteChecklistCount > 0 ||
        skippedChecklistCount > 0 ||
        pendingChecklistCount > 0
          ? 'missing'
          : 'available',
    },
    {
      label: 'Minimum evidence coverage',
      value:
        minimumEvidence.length > 0
          ? `${minimumEvidence.filter((item) => item.satisfied).length} / ${minimumEvidence.length} satisfied`
          : 'None declared',
      state:
        minimumEvidence.some((item) => !item.satisfied) ? 'missing' : 'available',
    },
    {
      label: 'Expected evidence coverage',
      value:
        expectedEvidence.length > 0
          ? `${expectedEvidence.filter((item) => item.satisfied).length} / ${expectedEvidence.length} satisfied`
          : 'None declared',
      state:
        expectedEvidence.some((item) => !item.satisfied) ? 'missing' : 'available',
    },
    {
      label: 'Risk flags',
      value:
        report.riskFlags.length > 0
          ? `${report.riskFlags.length} visible risk flag(s)`
          : 'No visible risk flags',
      state: report.riskFlags.length > 0 ? 'missing' : 'available',
    },
    {
      label: 'Required justifications',
      value:
        requiredJustificationCount > 0
          ? `${enteredJustificationCount} / ${requiredJustificationCount} entered`
          : 'None required',
      state:
        requiredJustificationCount > enteredJustificationCount ? 'missing' : 'available',
    },
    availableField('Draft diagnosis summary', report.draftDiagnosisSummary),
    {
      label: 'Final notes / corrections',
      value:
        report.reviewNotes.trim().length > 0
          ? report.reviewNotes.trim()
          : 'No final notes or corrections saved yet.',
      state: report.reviewNotes.trim().length > 0 ? 'available' : 'missing',
    },
  ];
}

function resolveDraftReportLifecycleState(
  submitReadiness: SharedExecutionGuidanceState['submitReadiness'],
): SharedExecutionReportLifecycleState {
  return submitReadiness === 'ready' ? 'Ready to Submit' : 'In Progress';
}

function isSubmittedReport(report: Pick<SharedExecutionReportDraftState, 'state'>): boolean {
  return report.state === SUBMITTED_PENDING_SYNC_REPORT_STATE;
}

function getStepFieldValue(
  step: SharedExecutionShell['steps'][number] | undefined,
  label: string,
): string | null {
  return step?.fields.find((field) => field.label === label)?.value ?? null;
}

function applyGuidanceState(
  shell: SharedExecutionShell,
  guidance: SharedExecutionGuidanceState,
): SharedExecutionShell {
  const derivedGuidance = deriveGuidanceState(guidance, {
    template: shell.template,
    riskInputs: shell.riskInputs,
    evidence: shell.evidence,
  });

  const shellWithGuidance = {
    ...shell,
    guidance: derivedGuidance,
    steps: shell.steps.map((step) =>
      step.id === 'guidance'
        ? {
            ...step,
            summary: buildGuidanceStepSummary(derivedGuidance),
            detail: buildGuidanceStepDetail(derivedGuidance),
            fields: buildGuidanceFields(derivedGuidance, shell.evidence),
          }
        : step,
    ),
  };

  return applyReportDraftState(shellWithGuidance, deriveReportDraftState(shellWithGuidance));
}

function mergeGuidanceOutcomesIntoShell(
  shell: SharedExecutionShell,
  previousGuidance: SharedExecutionGuidanceState,
): SharedExecutionShell {
  const checklistItems = shell.guidance.checklistItems.map((item) => {
    const previousItem = previousGuidance.checklistItems.find(
      (candidate) => candidate.id === item.id,
    );

    return previousItem ? { ...item, outcome: previousItem.outcome } : item;
  });
  const riskItems = shell.guidance.riskItems.map((item) => {
    const previousItem = previousGuidance.riskItems.find(
      (candidate) => candidate.id === item.id,
    );

    return previousItem
      ? { ...item, justificationText: previousItem.justificationText }
      : item;
  });

  return applyGuidanceState(shell, {
    ...shell.guidance,
    checklistItems,
    riskItems,
  });
}

function mergeInSessionEvidenceIntoShell(
  shell: SharedExecutionShell,
  previousShell: SharedExecutionShell,
): SharedExecutionShell {
  return mergeInSessionReportDraftIntoShell(
    applyEvidenceState(
    mergeGuidanceOutcomesIntoShell(shell, previousShell.guidance),
    {
      ...shell.evidence,
      observationNotes: previousShell.evidence.observationNotes,
    },
    ),
    previousShell,
  );
}

function mergeInSessionWorkingStateIntoShell(
  shell: SharedExecutionShell,
  previousShell: SharedExecutionShell,
): SharedExecutionShell {
  return mergeInSessionReportDraftIntoShell(
    mergeInSessionCalculationIntoShell(
      mergeInSessionEvidenceIntoShell(shell, previousShell),
      previousShell,
    ),
    previousShell,
  );
}

function mergeInSessionCalculationIntoShell(
  shell: SharedExecutionShell,
  previousShell: SharedExecutionShell,
): SharedExecutionShell {
  if (!shell.calculation || !previousShell.calculation) {
    return shell;
  }

  return {
    ...shell,
    calculation: previousShell.calculation,
  };
}

function buildGuidanceStepSummary(guidance: SharedExecutionGuidanceState): string {
  if (guidance.submitReadiness === 'blocked') {
    return 'Visible risk is flagged locally. Missing minimum evidence or required justification would block submission later.';
  }

  if (guidance.riskState === 'flagged') {
    return 'Visible risk is flagged locally. Capture justification where needed, but keep moving in the field.';
  }

  if (
    guidance.checklistItems.length > 0 ||
    guidance.guidedDiagnosisPrompts.length > 0 ||
    guidance.linkedGuidance.length > 0
  ) {
    return 'Lightweight checklist and diagnosis guidance is available locally for this execution.';
  }

  return 'No checklist or diagnosis guidance is attached to this template.';
}

function buildGuidanceStepDetail(guidance: SharedExecutionGuidanceState): string {
  if (guidance.submitReadiness === 'blocked') {
    return 'The shell stays non-blocking, but the current draft still has submit-blocking hooks that should be resolved before review.';
  }

  if (guidance.riskState === 'flagged') {
    return 'The shell remains non-blocking, and visible risks stay explicit so the technician can justify messy field conditions without abandoning the draft.';
  }

  return 'Guidance stays lightweight in the shared shell: what to do, why it matters, what it helps rule out, and the cached source reference.';
}

function buildGuidanceFields(
  guidance: SharedExecutionGuidanceState,
  evidence: SharedExecutionEvidenceState,
): SharedExecutionField[] {
  const completedCount = guidance.checklistItems.filter(
    (item) => item.outcome === 'completed',
  ).length;
  const incompleteCount = guidance.checklistItems.filter(
    (item) => item.outcome === 'incomplete',
  ).length;
  const skippedCount = guidance.checklistItems.filter(
    (item) => item.outcome === 'skipped',
  ).length;
  const pendingCount = guidance.checklistItems.filter(
    (item) => item.outcome === 'pending',
  ).length;
  const latestPhotoAttachment = evidence.photoAttachments.at(-1);

  return [
    availableField('Draft report', evidence.draftReportId),
    {
      label: 'Guidance evidence saved',
      value: evidence.guidanceEvidenceUpdatedAt
        ? new Date(evidence.guidanceEvidenceUpdatedAt).toLocaleString()
        : 'Not saved yet',
      state: evidence.guidanceEvidenceUpdatedAt ? 'available' : 'missing',
    },
    {
      label: 'Observation notes',
      value: evidence.observationNotes.trim().length > 0
        ? evidence.observationNotes.trim()
        : 'No local observation notes saved yet.',
      state: evidence.observationNotes.trim().length > 0 ? 'available' : 'missing',
    },
    {
      label: 'Photo attachments',
      value:
        evidence.photoAttachments.length > 0
          ? `${evidence.photoAttachments.length} photo attachment(s) linked to the draft report`
          : 'No local draft-report photos attached yet.',
      state: evidence.photoAttachments.length > 0 ? 'available' : 'missing',
    },
    {
      label: 'Latest photo saved',
      value: latestPhotoAttachment
        ? new Date(latestPhotoAttachment.updatedAt).toLocaleString()
        : 'Not saved yet',
      state: latestPhotoAttachment ? 'available' : 'missing',
    },
    availableField(
      'Checklist status',
      guidance.checklistItems.length > 0
        ? `Pending ${pendingCount}; Completed ${completedCount}; Incomplete ${incompleteCount}; Skipped ${skippedCount}`
        : 'None declared',
    ),
    availableField(
      'Guided diagnosis prompts',
      guidance.guidedDiagnosisPrompts.length > 0
        ? `${guidance.guidedDiagnosisPrompts.length} prompt(s) available`
        : 'None declared',
    ),
    availableField(
      'Linked guidance',
      guidance.linkedGuidance.length > 0
        ? guidance.linkedGuidance.map((item) => item.title).join(', ')
        : 'None attached',
    ),
    {
      label: 'Guidance risk state',
      value: guidance.riskState === 'flagged' ? 'Flagged' : 'Clear',
      state: guidance.riskState === 'flagged' ? 'missing' : 'available',
    },
    {
      label: 'Risk hooks',
      value:
        guidance.riskHooks.length > 0
          ? guidance.riskHooks.join(' ')
          : 'No visible risk is currently flagged.',
      state: guidance.riskHooks.length > 0 ? 'missing' : 'available',
    },
    {
      label: 'Submit readiness',
      value: guidance.submitReadiness === 'blocked' ? 'Blocked by rule hooks' : 'Ready',
      state: guidance.submitReadiness === 'blocked' ? 'missing' : 'available',
    },
    {
      label: 'Submit blocking hooks',
      value:
        guidance.submitBlockingHooks.length > 0
          ? guidance.submitBlockingHooks.join(' ')
          : 'No submit-blocking hooks are active.',
      state: guidance.submitBlockingHooks.length > 0 ? 'missing' : 'available',
    },
    {
      label: 'Required justifications',
      value:
        guidance.riskItems.filter((item) => item.justificationRequired).length > 0
          ? `${guidance.riskItems.filter((item) => item.justificationRequired).length} required / ${
              guidance.riskItems.filter((item) => item.justificationRequired && item.justificationText.trim().length > 0).length
            } entered`
          : 'None required',
      state:
        guidance.riskItems.some(
          (item) =>
            item.justificationRequired && item.justificationText.trim().length === 0,
        )
          ? 'missing'
          : 'available',
    },
  ];
}

function buildEvidenceState(
  workPackageId: string,
  tagId: string,
  storedEvidence: StoredExecutionEvidenceRecord[],
  storedPhotoAttachments: SharedExecutionPhotoAttachment[],
  reportState: SharedExecutionReportState | undefined,
): SharedExecutionEvidenceState {
  const calculationEvidence = storedEvidence.find(
    (item) => item.executionStepId === 'calculation',
  );
  const guidanceEvidence = storedEvidence.find(
    (item) => item.executionStepId === 'guidance',
  );
  const latestPhotoAttachment = storedPhotoAttachments.at(-1);

  return {
    draftReportId:
      guidanceEvidence?.draftReportId ??
      calculationEvidence?.draftReportId ??
      buildDraftReportId(workPackageId, tagId),
    draftReportState: reportState ?? TECHNICIAN_OWNED_DRAFT_REPORT_STATE,
    observationNotes: guidanceEvidence?.observationNotes ?? '',
    calculationEvidenceUpdatedAt: calculationEvidence?.updatedAt ?? null,
    guidanceEvidenceUpdatedAt: guidanceEvidence?.updatedAt ?? null,
    photoAttachments: storedPhotoAttachments,
    photoEvidenceUpdatedAt: latestPhotoAttachment?.updatedAt ?? null,
  };
}

function applyEvidenceState(
  shell: SharedExecutionShell,
  evidence: SharedExecutionEvidenceState,
): SharedExecutionShell {
  const guidance = deriveGuidanceState(shell.guidance, {
    template: shell.template,
    riskInputs: shell.riskInputs,
    evidence,
  });

  const shellWithEvidence = {
    ...shell,
    evidence,
    guidance,
    steps: shell.steps.map((step) =>
      step.id === 'guidance'
        ? {
            ...step,
            summary: buildGuidanceStepSummary(guidance),
            detail: buildGuidanceStepDetail(guidance),
            fields: buildGuidanceFields(guidance, evidence),
          }
        : step,
    ),
  };

  return applyReportDraftState(shellWithEvidence, deriveReportDraftState(shellWithEvidence));
}

function mapContextField(
  label: string,
  value: string,
  state: 'available' | 'missing',
): SharedExecutionField {
  return {
    label,
    value,
    state,
  };
}

function availableField(label: string, value: string): SharedExecutionField {
  return {
    label,
    value,
    state: 'available',
  };
}

function mapHistoryFieldState(
  state: LocalTagContext['historyPreview']['state'],
): SharedExecutionField['state'] {
  switch (state) {
    case 'available':
    case 'stale':
    case 'age-unknown':
      return 'available';
    case 'missing':
      return 'missing';
    default:
      return 'unavailable';
  }
}

function toDisplayState(
  state: 'available' | 'stale' | 'age-unknown' | 'missing' | 'unavailable',
): string {
  switch (state) {
    case 'available':
      return 'Available';
    case 'stale':
      return 'Stale';
    case 'age-unknown':
      return 'Age unknown';
    case 'missing':
      return 'Missing';
    default:
      return 'Unavailable';
  }
}

function buildHistoryFields(
  tagContext: LocalTagContext,
  calculation: SharedExecutionCalculationState | null,
  historyExpectation: string,
): SharedExecutionField[] {
  return [
    {
      label: 'History state',
      value: toDisplayState(tagContext.historyPreview.state),
      state: mapHistoryFieldState(tagContext.historyPreview.state),
    },
    {
      label: 'Current result',
      value: formatCurrentHistoryResult(calculation),
      state: calculation?.result ? 'available' : 'unavailable',
    },
    {
      label: 'Current checkpoint',
      value: formatCurrentCheckpoint(calculation),
      state: calculation?.result ? 'available' : 'unavailable',
    },
    {
      label: 'Current signed deviation',
      value: formatCurrentSignedDeviation(calculation),
      state: calculation?.result ? 'available' : 'unavailable',
    },
    {
      label: 'Current absolute deviation',
      value: formatCurrentAbsoluteDeviation(calculation),
      state: calculation?.result ? 'available' : 'unavailable',
    },
    {
      label: 'Current percent of span',
      value: formatCurrentPercentOfSpan(calculation),
      state: calculation?.result ? 'available' : 'unavailable',
    },
    {
      label: 'Current vs prior',
      value: buildCurrentVsPriorSummary(calculation, tagContext),
      state: mapCurrentVsPriorState(calculation, tagContext),
    },
    {
      label: 'Prior result',
      value: formatPriorResult(tagContext),
      state: mapHistoryFieldState(tagContext.historyPreview.state),
    },
    {
      label: 'Recurrence cue',
      value: tagContext.historyPreview.recurrenceCue ?? 'No recurrence cue attached.',
      state: mapHistoryFieldState(tagContext.historyPreview.state),
    },
    {
      label: 'Last observed',
      value: tagContext.historyPreview.lastObservedAt
        ? new Date(tagContext.historyPreview.lastObservedAt).toLocaleString()
        : tagContext.historyPreview.state === 'unavailable'
          ? 'Not included in this package'
          : 'Missing',
      state: mapHistoryFieldState(tagContext.historyPreview.state),
    },
    availableField('History expectation', historyExpectation),
  ];
}

function formatCurrentHistoryResult(calculation: SharedExecutionCalculationState | null): string {
  if (!calculation?.result) {
    return 'Not entered yet';
  }

  return `${toDisplayAcceptance(calculation.result.acceptance)} (${calculation.result.acceptanceReason})`;
}

function formatCurrentCheckpoint(calculation: SharedExecutionCalculationState | null): string {
  if (!calculation?.result) {
    return 'Not entered yet';
  }

  return `${calculation.definition.expectedLabel}: ${calculation.rawInputs.expectedValue}; ${calculation.definition.observedLabel}: ${calculation.rawInputs.observedValue}`;
}

function formatCurrentSignedDeviation(calculation: SharedExecutionCalculationState | null): string {
  if (!calculation?.result) {
    return 'Not entered yet';
  }

  return formatDeviation(calculation.result.signedDeviation, calculation.definition.unit);
}

function formatCurrentAbsoluteDeviation(
  calculation: SharedExecutionCalculationState | null,
): string {
  if (!calculation?.result) {
    return 'Not entered yet';
  }

  return formatDeviation(calculation.result.absoluteDeviation, calculation.definition.unit);
}

function formatCurrentPercentOfSpan(calculation: SharedExecutionCalculationState | null): string {
  if (!calculation?.result) {
    return 'Not entered yet';
  }

  return calculation.result.percentOfSpan !== null
    ? `${formatNumber(calculation.result.percentOfSpan)}%`
    : 'Not available';
}

function buildCurrentVsPriorSummary(
  calculation: SharedExecutionCalculationState | null,
  tagContext: LocalTagContext,
): string {
  if (!calculation?.result) {
    return 'Enter current values to compare them with cached history.';
  }

  if (tagContext.historyPreview.state === 'unavailable') {
    return 'Current result saved. No cached history was included with this tag.';
  }

  if (tagContext.historyPreview.state === 'missing') {
    return 'Current result saved. The cached history pointer is missing from this package.';
  }

  if (!tagContext.historyPreview.lastResult) {
    return 'Current result saved. Prior result label is not available in the cached history.';
  }

  return `${toDisplayAcceptance(calculation.result.acceptance)} now versus ${tagContext.historyPreview.lastResult} previously.`;
}

function mapCurrentVsPriorState(
  calculation: SharedExecutionCalculationState | null,
  tagContext: LocalTagContext,
): SharedExecutionField['state'] {
  if (!calculation?.result) {
    return 'unavailable';
  }

  return mapHistoryFieldState(tagContext.historyPreview.state);
}

function formatPriorResult(tagContext: LocalTagContext): string {
  switch (tagContext.historyPreview.state) {
    case 'available':
    case 'stale':
    case 'age-unknown':
      return tagContext.historyPreview.lastResult ?? 'Prior result label missing.';
    case 'missing':
      return 'History summary pointer missing.';
    default:
      return 'Not included in this package';
  }
}

function buildStructuredReadingsEvidence(
  shell: SharedExecutionShell,
  rawInputs: SharedExecutionCalculationRawInputs,
  result: SharedExecutionCalculationResult,
): StoredExecutionStructuredReadingsEvidence {
  return {
    expectedLabel: shell.calculation!.definition.expectedLabel,
    observedLabel: shell.calculation!.definition.observedLabel,
    expectedValue: rawInputs.expectedValue,
    observedValue: rawInputs.observedValue,
    unit: shell.calculation!.definition.unit,
    signedDeviation: result.signedDeviation,
    absoluteDeviation: result.absoluteDeviation,
    percentOfSpan: result.percentOfSpan,
    acceptance: result.acceptance,
    acceptanceReason: result.acceptanceReason,
  };
}

async function buildPhotoAttachments(
  store: UserPartitionedLocalStore,
  storedMetadata: Awaited<ReturnType<UserPartitionedLocalStore['evidenceMetadata']['listEvidenceByBusinessObject']>>,
  workPackageId: string,
  tagId: string,
): Promise<SharedExecutionPhotoAttachment[]> {
  const attachments = await Promise.all(
    storedMetadata.map(async (record) => {
      const payload = parsePhotoAttachmentPayload(record.payloadJson);
      if (
        !payload ||
        payload.kind !== 'photo' ||
        payload.workPackageId !== workPackageId ||
        payload.tagId !== tagId
      ) {
        return null;
      }

      return {
        evidenceId: record.evidenceId,
        executionStepId: payload.executionStepId,
        fileName: record.fileName,
        mimeType: record.mimeType,
        previewUri: await store.mediaSandbox.resolveFileUri(record.mediaRelativePath),
        mediaRelativePath: record.mediaRelativePath,
        source: payload.source,
        width: payload.width,
        height: payload.height,
        fileSize: payload.fileSize,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      } satisfies SharedExecutionPhotoAttachment;
    }),
  );

  return attachments
    .filter((item): item is SharedExecutionPhotoAttachment => item !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function parsePhotoAttachmentPayload(
  payloadJson: string,
): StoredExecutionPhotoAttachmentPayload | null {
  try {
    const parsed = JSON.parse(payloadJson) as Partial<StoredExecutionPhotoAttachmentPayload>;
    if (
      parsed.kind !== 'photo' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      typeof parsed.draftReportId !== 'string' ||
      !isExecutionStepKind(parsed.executionStepId) ||
      (parsed.source !== 'camera' && parsed.source !== 'library')
    ) {
      return null;
    }

    return {
      kind: 'photo',
      workPackageId: parsed.workPackageId,
      tagId: parsed.tagId,
      templateId: parsed.templateId,
      templateVersion: parsed.templateVersion,
      draftReportId: parsed.draftReportId,
      executionStepId: parsed.executionStepId,
      source: parsed.source,
      width: typeof parsed.width === 'number' ? parsed.width : null,
      height: typeof parsed.height === 'number' ? parsed.height : null,
      fileSize: typeof parsed.fileSize === 'number' ? parsed.fileSize : null,
    };
  } catch {
    return null;
  }
}

async function ensureDraftReportLink(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
  updatedAt: string,
): Promise<string> {
  const draft = await persistPerTagReportDraft(store, shell, {
    state: shell.report.state,
    reviewNotes: shell.report.reviewNotes,
    savedAt: shell.report.savedAt,
    submittedAt: shell.report.submittedAt,
    syncState: shell.report.syncState,
    lifecycleState: isSubmittedReport(shell.report)
      ? 'Submitted - Pending Sync'
      : resolveDraftReportLifecycleState(shell.guidance.submitReadiness),
    updatedAt,
  });

  return draft.businessObjectId;
}

async function saveReportDraftRecord(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
  input: {
    state: SharedExecutionReportState;
    reviewNotes: string;
    savedAt: string | null;
    submittedAt: string | null;
    syncState: SharedExecutionSyncState;
    lifecycleState: SharedExecutionReportLifecycleState;
    updatedAt: string;
  },
): Promise<UserOwnedDraftRecord> {
  return persistPerTagReportDraft(store, shell, input);
}

async function persistPerTagReportDraft(
  store: UserPartitionedLocalStore,
  shell: SharedExecutionShell,
  input: {
    state: SharedExecutionReportState;
    reviewNotes: string;
    savedAt: string | null;
    submittedAt: string | null;
    syncState: SharedExecutionSyncState;
    lifecycleState: SharedExecutionReportLifecycleState;
    updatedAt: string;
  },
): Promise<UserOwnedDraftRecord> {
  const draftReportId = buildDraftReportId(shell.workPackageId, shell.tagId);
  const existingDraft = await store.drafts.getDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: draftReportId,
  });
  const existingPayload = parseStoredPerTagReportDraftPayload(existingDraft);
  const reviewNotes = input.reviewNotes;
  const savedAt = input.savedAt ?? existingPayload?.savedAt ?? null;
  const submittedAt =
    input.state === SUBMITTED_PENDING_SYNC_REPORT_STATE
      ? input.submittedAt ?? existingPayload?.submittedAt ?? null
      : null;
  const payload = buildStoredPerTagReportDraftPayload(shell, {
    state: input.state,
    reviewNotes,
    savedAt,
    submittedAt,
    syncState: input.syncState,
    lifecycleState: input.lifecycleState,
    updatedAt: input.updatedAt,
  });

  return store.drafts.saveDraft({
    businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
    businessObjectId: draftReportId,
    summaryText: buildDraftSummaryText(shell, input.lifecycleState),
    payloadJson: JSON.stringify(payload),
  });
}

function parseStoredPerTagReportDraftPayload(
  draft: UserOwnedDraftRecord | null,
): StoredPerTagReportDraftPayload | null {
  if (!draft) {
    return null;
  }

  try {
    const parsed = JSON.parse(draft.payloadJson) as Partial<StoredPerTagReportDraftPayload>;
    if (
      typeof parsed.reportId !== 'string' ||
      typeof parsed.workPackageId !== 'string' ||
      typeof parsed.tagId !== 'string' ||
      typeof parsed.templateId !== 'string' ||
      typeof parsed.templateVersion !== 'string' ||
      (parsed.state !== TECHNICIAN_OWNED_DRAFT_REPORT_STATE &&
        parsed.state !== SUBMITTED_PENDING_SYNC_REPORT_STATE) ||
      typeof parsed.updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      reportId: parsed.reportId,
      workPackageId: parsed.workPackageId,
      tagId: parsed.tagId,
      templateId: parsed.templateId,
      templateVersion: parsed.templateVersion,
      state: parsed.state,
      lifecycleState:
        parsed.lifecycleState === 'Ready to Submit' ||
        parsed.lifecycleState === 'In Progress' ||
        parsed.lifecycleState === 'Submitted - Pending Sync'
          ? parsed.lifecycleState
          : undefined,
      syncState:
        parsed.syncState === QUEUED_SYNC_STATE || parsed.syncState === LOCAL_ONLY_SYNC_STATE
          ? parsed.syncState
          : undefined,
      reviewNotes: typeof parsed.reviewNotes === 'string' ? parsed.reviewNotes : undefined,
      savedAt:
        typeof parsed.savedAt === 'string' || parsed.savedAt === null
          ? parsed.savedAt
          : undefined,
      submittedAt:
        typeof parsed.submittedAt === 'string' || parsed.submittedAt === null
          ? parsed.submittedAt
          : undefined,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function buildStoredPerTagReportDraftPayload(
  shell: SharedExecutionShell,
  input: {
    state: SharedExecutionReportState;
    reviewNotes: string;
    savedAt: string | null;
    submittedAt: string | null;
    syncState: SharedExecutionSyncState;
    lifecycleState: SharedExecutionReportLifecycleState;
    updatedAt: string;
  },
): StoredPerTagReportDraftPayload {
  return {
    reportId: buildDraftReportId(shell.workPackageId, shell.tagId),
    workPackageId: shell.workPackageId,
    tagId: shell.tagId,
    templateId: shell.template.id,
    templateVersion: shell.template.version,
    state: input.state,
    lifecycleState: input.lifecycleState,
    syncState: input.syncState,
    reviewNotes: input.reviewNotes,
    savedAt: input.savedAt,
    submittedAt: input.submittedAt,
    updatedAt: input.updatedAt,
  };
}

function buildDraftSummaryText(
  shell: SharedExecutionShell,
  lifecycleState: SharedExecutionReportLifecycleState,
): string {
  return `${lifecycleState} report for ${shell.tagCode}`;
}

function buildDraftReportId(workPackageId: string, tagId: string): string {
  return `tag-report:${workPackageId}:${tagId}`;
}

function buildSubmitReportQueueItemId(reportId: string): string {
  return `${SUBMIT_REPORT_QUEUE_ITEM_KIND}:${reportId}`;
}

function buildUploadEvidenceBinaryQueueItemId(evidenceId: string): string {
  return `${UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND}:${evidenceId}`;
}

function buildSubmitReportQueuePayload(
  shell: SharedExecutionShell,
  objectVersion: string,
  queuedAt: string,
): SubmitReportQueuePayload {
  return {
    queueItemSchemaVersion: '2026-04-v1',
    itemType: SUBMIT_REPORT_QUEUE_ITEM_KIND,
    reportId: shell.report.reportId,
    workPackageId: shell.workPackageId,
    tagId: shell.tagId,
    templateId: shell.template.id,
    templateVersion: shell.template.version,
    localObjectReference: {
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
    },
    objectVersion,
    idempotencyKey: `${SUBMIT_REPORT_QUEUE_ITEM_KIND}:${shell.report.reportId}:${objectVersion}`,
    dependencyStatus: 'ready',
    retryCount: 0,
    queuedAt,
  };
}

function buildUploadEvidenceBinaryQueuePayload(
  shell: SharedExecutionShell,
  attachment: SharedExecutionPhotoAttachment,
  dependsOnQueueItemId: string,
  queuedAt: string,
): UploadEvidenceBinaryQueuePayload {
  return {
    queueItemSchemaVersion: '2026-04-v1',
    itemType: UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND,
    reportId: shell.report.reportId,
    evidenceId: attachment.evidenceId,
    mediaRelativePath: attachment.mediaRelativePath,
    mimeType: attachment.mimeType,
    executionStepId: attachment.executionStepId,
    localObjectReference: {
      businessObjectType: LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE,
      businessObjectId: shell.report.reportId,
    },
    objectVersion: attachment.updatedAt,
    idempotencyKey: `${UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND}:${attachment.evidenceId}:${attachment.updatedAt}`,
    dependsOnQueueItemId,
    dependencyStatus: 'waiting-on-report-submission',
    retryCount: 0,
    queuedAt,
  };
}

function buildPhotoAttachmentFileName(
  shell: SharedExecutionShell,
  photo: SharedExecutionPhotoAttachmentInput,
  timestamp: string,
): string {
  const extension = resolvePhotoFileExtension(photo);
  return [
    shell.tagCode,
    shell.progress.currentStepId,
    compactTimestamp(timestamp),
    Math.random().toString(36).slice(2, 8),
  ].join('-') + extension;
}

function buildPhotoEvidenceId(timestamp: string): string {
  return `photo:${compactTimestamp(timestamp)}:${Math.random().toString(36).slice(2, 8)}`;
}

function resolvePhotoFileExtension(photo: SharedExecutionPhotoAttachmentInput): string {
  const source = photo.fileName ?? photo.uri;
  const explicitExtensionMatch = source.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (explicitExtensionMatch) {
    return `.${explicitExtensionMatch[1]!.toLowerCase()}`;
  }

  switch (photo.mimeType) {
    case 'image/png':
      return '.png';
    case 'image/heic':
      return '.heic';
    case 'image/webp':
      return '.webp';
    default:
      return '.jpg';
  }
}

function compactTimestamp(timestamp: string): string {
  return timestamp.replace(/[^0-9]/g, '').slice(0, 14);
}

function toExecutionStepKind(stepId: string): SharedExecutionStepKind {
  return isExecutionStepKind(stepId) ? stepId : 'guidance';
}

function isExecutionStepKind(value: unknown): value is SharedExecutionStepKind {
  return (
    value === 'context' ||
    value === 'calculation' ||
    value === 'history' ||
    value === 'guidance' ||
    value === 'report'
  );
}

function toDisplayAcceptance(
  acceptance: SharedExecutionCalculationAcceptance,
): string {
  switch (acceptance) {
    case 'pass':
      return 'Pass';
    case 'fail':
      return 'Fail';
    default:
      return 'Unavailable';
  }
}

function formatDeviation(value: number, unit: string | null): string {
  const formatted = formatNumber(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
