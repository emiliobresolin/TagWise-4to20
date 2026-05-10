import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { AssignedWorkPackageSnapshot } from './model';
import {
  MANUAL_INSTRUMENT_CONTRACT_VERSION,
  MANUAL_INSTRUMENT_GUIDANCE_ID,
  MANUAL_INSTRUMENT_HISTORY_ID,
  MANUAL_INSTRUMENT_SOURCE_PREFIX,
  MANUAL_INSTRUMENT_TAG_PREFIX,
  MANUAL_INSTRUMENT_TEMPLATE_ID,
  MANUAL_INSTRUMENT_WORK_PACKAGE_PREFIX,
  type ManualInstrumentCreationResult,
  type ManualInstrumentInput,
} from './manualInstrumentModel';

interface ManualInstrumentServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  now?: () => Date;
  idFactory?: () => string;
}

export class ManualInstrumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualInstrumentValidationError';
  }
}

export class ManualInstrumentService {
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly dependencies: ManualInstrumentServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? (() => buildLocalId(this.now));
  }

  async createManualInstrument(
    session: ActiveUserSession,
    input: ManualInstrumentInput,
  ): Promise<ManualInstrumentCreationResult> {
    if (!session) {
      throw new ManualInstrumentValidationError('Entre antes de criar um instrumento manual.');
    }

    const normalized = normalizeManualInstrumentInput(input);
    const localId = this.idFactory();
    const createdAt = this.now().toISOString();
    const workPackageId = `${MANUAL_INSTRUMENT_WORK_PACKAGE_PREFIX}${localId}`;
    const tagId = `${MANUAL_INSTRUMENT_TAG_PREFIX}${localId}`;
    const snapshot = buildManualInstrumentSnapshot({
      createdAt,
      localId,
      normalized,
      session,
      tagId,
      workPackageId,
    });

    await this.dependencies.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(snapshot, createdAt);

    return {
      workPackageId,
      tagId,
      templateId: MANUAL_INSTRUMENT_TEMPLATE_ID,
      snapshot,
    };
  }
}

function normalizeManualInstrumentInput(input: ManualInstrumentInput): Required<ManualInstrumentInput> {
  const description = normalizeText(input.description);
  const area = normalizeText(input.area);
  const instrumentFamily = normalizeText(input.instrumentFamily);
  const reason = normalizeText(input.reason);

  if (!description) {
    throw new ManualInstrumentValidationError('Descricao e obrigatoria para instrumento manual.');
  }

  if (!area) {
    throw new ManualInstrumentValidationError('Area ou localizacao e obrigatoria.');
  }

  if (!instrumentFamily) {
    throw new ManualInstrumentValidationError('Familia do instrumento e obrigatoria.');
  }

  if (!reason) {
    throw new ManualInstrumentValidationError('Motivo do cadastro manual e obrigatorio.');
  }

  return {
    tagCode: normalizeText(input.tagCode),
    description,
    area,
    instrumentFamily,
    instrumentSubtype: normalizeText(input.instrumentSubtype) || 'Cadastro manual',
    measuredVariable: normalizeText(input.measuredVariable) || 'Nao informado',
    signalType: normalizeText(input.signalType) || 'Nao informado',
    rangeMin: normalizeText(input.rangeMin),
    rangeMax: normalizeText(input.rangeMax),
    unit: normalizeText(input.unit),
    tolerance: normalizeText(input.tolerance) || 'Nao informado - cadastro manual',
    reason,
    notes: normalizeText(input.notes),
  };
}

function buildManualInstrumentSnapshot(input: {
  createdAt: string;
  localId: string;
  normalized: Required<ManualInstrumentInput>;
  session: ActiveUserSession;
  tagId: string;
  workPackageId: string;
}): AssignedWorkPackageSnapshot {
  const range = parseManualRange(input.normalized);
  const tagCode = input.normalized.tagCode || `MANUAL-${input.localId.toUpperCase()}`;
  const notesSuffix = input.normalized.notes ? ` Observacoes: ${input.normalized.notes}` : '';

  return {
    contractVersion: MANUAL_INSTRUMENT_CONTRACT_VERSION,
    generatedAt: input.createdAt,
    summary: {
      id: input.workPackageId,
      sourceReference: `${MANUAL_INSTRUMENT_SOURCE_PREFIX}${input.localId}`,
      title: 'Cadastro manual de instrumento',
      assignedTeam: 'Cadastro manual em campo',
      priority: 'routine',
      status: 'in_progress',
      packageVersion: 1,
      snapshotContractVersion: MANUAL_INSTRUMENT_CONTRACT_VERSION,
      tagCount: 1,
      dueWindow: { startsAt: null, endsAt: null },
      updatedAt: input.createdAt,
    },
    tags: [
      {
        id: input.tagId,
        tagCode,
        shortDescription: `${input.normalized.description} (manual/local, pendente de reconciliacao)`,
        area: input.normalized.area,
        parentAssetReference: 'Cadastro manual local - pendente de reconciliacao',
        instrumentFamily: input.normalized.instrumentFamily,
        instrumentSubtype: input.normalized.instrumentSubtype,
        measuredVariable: input.normalized.measuredVariable,
        signalType: input.normalized.signalType,
        range,
        tolerance: input.normalized.tolerance,
        criticality: 'medium',
        templateIds: [MANUAL_INSTRUMENT_TEMPLATE_ID],
        guidanceReferenceIds: [MANUAL_INSTRUMENT_GUIDANCE_ID],
        historySummaryId: MANUAL_INSTRUMENT_HISTORY_ID,
      },
    ],
    templates: [
      {
        id: MANUAL_INSTRUMENT_TEMPLATE_ID,
        instrumentFamily: input.normalized.instrumentFamily,
        testPattern: 'cadastro manual em campo',
        title: 'Relatorio de instrumento manual',
        calculationMode: 'valor esperado versus medido manual',
        acceptanceStyle: 'desvio visivel, tolerancia se conhecida',
        captureSummary:
          'Registre valores esperados e medidos quando conhecidos. Dados ausentes ficam explicitos e nao bloqueiam.',
        captureFields: [
          {
            id: 'expectedValue',
            label: 'Valor esperado se conhecido',
            inputKind: 'numeric',
            unit: range.unit || undefined,
          },
          {
            id: 'observedValue',
            label: 'Valor medido',
            inputKind: 'numeric',
            unit: range.unit || undefined,
          },
        ],
        calculationRangeOverride: range.unit ? range : undefined,
        conversionBasisSummary: 'Cadastro manual nao tem base oficial de conversao ate reconciliacao.',
        expectedRangeSummary: range.unit
          ? `${range.min} to ${range.max} ${range.unit}`
          : 'Faixa nao informada neste cadastro manual.',
        checklistPrompts: [
          'Confirmar que o instrumento nao esta no pacote baixado.',
          'Registrar placa, localizacao ou contexto do processo em notas/fotos.',
          'Informar o motivo do cadastro manual para reconciliacao futura.',
        ],
        checklistSteps: [
          {
            id: 'manual-confirm-not-in-package',
            prompt: 'Instrumento nao encontrado no pacote atribuido/baixado.',
            whyItMatters: 'Evita tratar um cadastro ad-hoc como ativo oficial da empresa.',
            helpsRuleOut: 'Tag oficial duplicada ou pacote desatualizado.',
            sourceReference: 'LOCAL-MANUAL-INTAKE',
          },
          {
            id: 'manual-capture-context',
            prompt: 'Local, descricao e motivo foram registrados para reconciliacao.',
            whyItMatters: 'Da contexto suficiente para reconciliar depois.',
            helpsRuleOut: 'Relatorios manuais sem rastreabilidade.',
            sourceReference: 'LOCAL-MANUAL-INTAKE',
          },
        ],
        guidedDiagnosisPrompts: [
          {
            id: 'manual-diagnosis-boundary',
            prompt: 'Instrumento manual nao tem base oficial; use a orientacao apenas como apoio ao cadastro.',
            whyItMatters: 'Evita inventar verdade corporativa antes da reconciliacao.',
            helpsRuleOut: 'Orientacao deterministica falsa sem metadados oficiais.',
            sourceReference: 'LOCAL-MANUAL-INTAKE',
          },
        ],
        minimumSubmissionEvidence: ['observacoes'],
        expectedEvidence: ['foto de apoio', 'motivo do cadastro manual'],
        historyComparisonExpectation:
          'Nao ha historico oficial ate este instrumento manual ser reconciliado.',
      },
    ],
    guidance: [
      {
        id: MANUAL_INSTRUMENT_GUIDANCE_ID,
        title: 'Limite do cadastro manual',
        version: MANUAL_INSTRUMENT_CONTRACT_VERSION,
        summary:
          'Este instrumento foi criado localmente por um tecnico e segue pendente de reconciliacao.',
        whyItMatters:
          'Relatorios podem ser rascunhados offline sem fingir que o ativo existe no SAP/Maximo/TOTVS.',
        sourceReference: `Motivo: ${input.normalized.reason}.${notesSuffix}`,
      },
    ],
    historySummaries: [
      {
        id: MANUAL_INSTRUMENT_HISTORY_ID,
        tagId: input.tagId,
        lastObservedAt: input.createdAt,
        summaryText: 'Nao ha historico oficial para este instrumento manual.',
        lastResult: 'Pendente de reconciliacao',
        trendHint: 'Cadastro manual/ad-hoc. Reconciliar antes de tratar como historico corporativo.',
      },
    ],
  };
}

function parseManualRange(input: Required<ManualInstrumentInput>) {
  const hasDeclaredRange = input.rangeMin && input.rangeMax && input.unit;
  const min = hasDeclaredRange ? Number(input.rangeMin) : Number.NaN;
  const max = hasDeclaredRange ? Number(input.rangeMax) : Number.NaN;

  if (!Number.isNaN(min) && !Number.isNaN(max)) {
    return { min, max, unit: input.unit };
  }

  return { min: 0, max: 0, unit: '' };
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? '';
}

function buildLocalId(now: () => Date): string {
  const timestamp = now().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${entropy}`;
}
