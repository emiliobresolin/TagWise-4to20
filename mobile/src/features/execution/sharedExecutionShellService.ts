import type { ActiveUserSession } from '../auth/model';
import { LocalTagContextService } from '../work-packages/localTagContextService';
import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  LocalTagContext,
} from '../work-packages/model';
import { LocalExecutionTemplateRegistry } from './localExecutionTemplateRegistry';
import type {
  SharedExecutionCalculationState,
  SharedExecutionCaptureFieldId,
  SharedExecutionField,
  SharedExecutionShell,
  SharedExecutionCalculationRawInputs,
  StoredExecutionCalculationRecord,
  StoredExecutionProgressRecord,
} from './model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import {
  computeDeterministicCalculation,
  resolveDeterministicCalculationDefinition,
} from './deterministicCalculationEngine';

interface SharedExecutionShellServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  tagContextService: LocalTagContextService;
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

    return buildExecutionShell(snapshot, tag, tagContext, template, progress, storedCalculation);
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
    if (!shell.calculation) {
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
      rawInputs,
      result,
      updatedAt,
    };

    await this.dependencies.userPartitions
      .forUser(session.userId)
      .executionCalculations.saveCalculation(record);

    return {
      ...shell,
      calculation: {
        ...shell.calculation,
        rawInputs,
        result,
        updatedAt,
      },
    };
  }
}

function buildExecutionShell(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
  tagContext: LocalTagContext,
  template: SharedExecutionShell['template'],
  progress: StoredExecutionProgressRecord,
  storedCalculation: StoredExecutionCalculationRecord | null,
): SharedExecutionShell {
  const calculation = buildCalculationState(tag, template, storedCalculation);

  return {
    workPackageId: snapshot.summary.id,
    workPackageTitle: snapshot.summary.title,
    tagId: tag.id,
    tagCode: tag.tagCode,
    template,
    calculation,
    steps: [
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
        ],
      },
      {
        id: 'history',
        title: 'History comparison',
        kind: 'history',
        summary: tagContext.historyPreview.summary,
        detail: `${tagContext.historyPreview.detail} Expected comparison: ${template.historyComparisonExpectation}.`,
        fields: [
          {
            label: 'History state',
            value: toDisplayState(tagContext.historyPreview.state),
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
          availableField('History expectation', template.historyComparisonExpectation),
        ],
      },
      {
        id: 'guidance',
        title: 'Checklist and guidance',
        kind: 'guidance',
        summary: tagContext.referencePointers.detail,
        detail:
          'Checklist and why-it-matters content stays lightweight in the shared shell and will expand in the guidance story.',
        fields: [
          {
            label: 'Reference state',
            value: toDisplayState(tagContext.referencePointers.state),
            state: mapReferenceFieldState(tagContext.referencePointers.state),
          },
          {
            label: 'Guidance pointers',
            value:
              tagContext.referencePointers.guidance.length > 0
                ? tagContext.referencePointers.guidance.join(', ')
                : 'None attached',
            state:
              tagContext.referencePointers.guidance.length > 0
                ? 'available'
                : mapReferenceFieldState(tagContext.referencePointers.state),
          },
          {
            label: 'Procedure pointers',
            value:
              tagContext.referencePointers.templates.length > 0
                ? tagContext.referencePointers.templates.join(', ')
                : 'None attached',
            state:
              tagContext.referencePointers.templates.length > 0
                ? 'available'
                : mapReferenceFieldState(tagContext.referencePointers.state),
          },
        ],
      },
    ],
    progress: normalizeProgress(progress, template.steps.map((step) => step.id)),
  };
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
  );

  return {
    definition,
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
      return 'available';
    case 'missing':
      return 'missing';
    default:
      return 'unavailable';
  }
}

function mapReferenceFieldState(
  state: LocalTagContext['referencePointers']['state'],
): SharedExecutionField['state'] {
  switch (state) {
    case 'available':
      return 'available';
    case 'missing':
      return 'missing';
    default:
      return 'unavailable';
  }
}

function toDisplayState(state: 'available' | 'missing' | 'unavailable'): string {
  switch (state) {
    case 'available':
      return 'Available';
    case 'missing':
      return 'Missing';
    default:
      return 'Unavailable';
  }
}
