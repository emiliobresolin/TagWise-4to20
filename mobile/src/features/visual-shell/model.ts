import type {
  LocalAssignedTagEntry,
  LocalTagContext,
  LocalAssignedWorkPackageSummary,
} from '../work-packages/model';
import { isManualInstrumentWorkPackageId } from '../work-packages/manualInstrumentModel';

export type VisualTagCategory = 'pending' | 'recurrent' | 'due' | 'recent';
export type VisualSeverity = 'high' | 'medium' | 'low' | 'ok' | 'due';
export type VisualWorkflowSource = 'seeded-demo' | 'local-authenticated' | 'local-empty';
export type VisualTagSource = 'demo' | 'local';

export interface VisualTagIdentity {
  workPackageId: string;
  tagId: string;
}

export interface VisualTagSummary {
  id: string;
  workPackageId: string;
  tagId: string;
  source: VisualTagSource;
  code: string;
  prefix: string;
  title: string;
  description: string;
  area: string;
  category: VisualTagCategory;
  severity: VisualSeverity;
  badgeLabel: string;
  badgeDetail: string;
  ringColor: string;
}

export interface VisualCalculationModel {
  mode: string;
  expectedValue: number;
  observedValue: number;
  tolerance: number;
  unit: string;
  error: number;
  absoluteError: number;
  status: 'pass' | 'fail';
  statusLabel: string;
}

export interface VisualHistoryPoint {
  label: string;
  value: number;
  statusLabel: string;
}

export interface VisualDiagnosisModel {
  selectedSymptom: string;
  symptoms: string[];
  hypothesis: string;
  nextStep: string;
  why: string;
  checklist: string[];
}

export interface VisualReportModel {
  tagCode: string;
  symptom: string;
  lastValueLabel: string;
  expectedValueLabel: string;
  errorLabel: string;
  diagnosis: string;
  action: string;
  pending: string;
  attachments: string[];
}

export interface VisualWorkflowModel {
  source: VisualWorkflowSource;
  counts: {
    all: number;
    pending: number;
    recurrent: number;
    due: number;
  };
  packageSummary: {
    packageCount: number;
    downloadedCount: number;
  };
  recentTags: VisualTagSummary[];
  pendingTags: VisualTagSummary[];
  recurrentTags: VisualTagSummary[];
  dueTags: VisualTagSummary[];
  selectedTag: VisualTagSummary | null;
  variableRangeLabel: string;
  lastValueLabel: string;
  calculation: VisualCalculationModel;
  history: VisualHistoryPoint[];
  diagnosis: VisualDiagnosisModel;
  report: VisualReportModel;
}

export interface BuildVisualWorkflowInput {
  workPackages?: LocalAssignedWorkPackageSummary[];
  localTags?: LocalAssignedTagEntry[];
  selectedTag?: LocalAssignedTagEntry | null;
  selectedTagContext?: LocalTagContext | null;
  authenticated?: boolean;
  demoEnabled?: boolean;
}

const tagColors = {
  pressure: '#5b9dff',
  temperature: '#42d3c2',
  flow: '#9b63f3',
  level: '#ff3e55',
  due: '#ffd035',
};

const seededTags: VisualTagSummary[] = [
  {
    id: 'pt-204',
    workPackageId: 'demo',
    tagId: 'pt-204',
    source: 'demo',
    code: 'PT-204',
    prefix: 'PT',
    title: 'Pressao',
    description: 'Transmissor de pressao',
    area: 'Vapor - Area 12',
    category: 'pending',
    severity: 'high',
    badgeLabel: 'ALTA',
    badgeDetail: 'Vapor - Area 12',
    ringColor: tagColors.pressure,
  },
  {
    id: 'tt-211',
    workPackageId: 'demo',
    tagId: 'tt-211',
    source: 'demo',
    code: 'TT-211',
    prefix: 'TT',
    title: 'Temperatura',
    description: 'Temperatura entrada reator',
    area: 'Reator R-01',
    category: 'pending',
    severity: 'medium',
    badgeLabel: 'MEDIA',
    badgeDetail: 'Reator R-01',
    ringColor: tagColors.temperature,
  },
  {
    id: 'ft-078',
    workPackageId: 'demo',
    tagId: 'ft-078',
    source: 'demo',
    code: 'FT-078',
    prefix: 'FT',
    title: 'Vazao',
    description: 'Vazao linha produto',
    area: 'Skid P-03',
    category: 'pending',
    severity: 'low',
    badgeLabel: 'BAIXA',
    badgeDetail: 'Skid P-03',
    ringColor: tagColors.flow,
  },
  {
    id: 'lt-090',
    workPackageId: 'demo',
    tagId: 'lt-090',
    source: 'demo',
    code: 'LT-090',
    prefix: 'LT',
    title: 'Nivel',
    description: 'Transmissor de nivel',
    area: 'Torre T-501',
    category: 'recurrent',
    severity: 'high',
    badgeLabel: '3 ocorrencias',
    badgeDetail: 'Torre T-501',
    ringColor: tagColors.level,
  },
  {
    id: 'it-443',
    workPackageId: 'demo',
    tagId: 'it-443',
    source: 'demo',
    code: 'IT-443',
    prefix: 'IT',
    title: 'Valvula',
    description: 'Posicionador de valvula',
    area: 'Linha Gas',
    category: 'due',
    severity: 'due',
    badgeLabel: 'em 8 dias',
    badgeDetail: 'Linha Gas',
    ringColor: tagColors.due,
  },
  {
    id: 'pt-156',
    workPackageId: 'demo',
    tagId: 'pt-156',
    source: 'demo',
    code: 'PT-156',
    prefix: 'PT',
    title: 'Pressao',
    description: 'Pressao diferencial',
    area: 'Filtro F-20',
    category: 'due',
    severity: 'due',
    badgeLabel: 'em 12 dias',
    badgeDetail: 'Filtro F-20',
    ringColor: tagColors.due,
  },
];

const defaultDemoTag = seededTags.find((tag) => tag.code === 'PT-204') ?? null;

export function calculateVisualError(input: {
  expectedValue: number;
  observedValue: number;
  tolerance: number;
  unit: string;
}): VisualCalculationModel {
  const error = roundToTwoDecimals(input.observedValue - input.expectedValue);
  const absoluteError = Math.abs(error);
  const status = absoluteError <= input.tolerance ? 'pass' : 'fail';

  return {
    mode: 'Erro absoluto',
    expectedValue: input.expectedValue,
    observedValue: input.observedValue,
    tolerance: input.tolerance,
    unit: input.unit,
    error,
    absoluteError,
    status,
    statusLabel: status === 'pass' ? 'OK' : 'FALHA',
  };
}

export function buildTechnicianVisualWorkflow(
  input: BuildVisualWorkflowInput = {},
): VisualWorkflowModel {
  const localTags = input.localTags?.map(mapLocalTagToVisualTag) ?? [];
  const authenticated = input.authenticated ?? false;
  const demoEnabled = input.demoEnabled ?? isVisualDemoShellEnabled();
  const catalogTags = authenticated || !demoEnabled ? localTags : mergeVisualTags(localTags, seededTags);
  const pendingTags = catalogTags.filter((tag) => tag.category === 'pending');
  const recurrentTags = catalogTags.filter((tag) => tag.category === 'recurrent');
  const dueTags = catalogTags.filter((tag) => tag.category === 'due');
  const selectedTag = authenticated
    ? input.selectedTag
      ? mapLocalTagToVisualTag(input.selectedTag)
      : null
    : demoEnabled
      ? defaultDemoTag
      : null;
  // Story 8.8 D-07: only build the demo calculation/history/report literals
  // when the signed-out demo shell is rendering. Authenticated paths consume
  // service-backed projections (`serviceCalculation`, `serviceHistory`,
  // `serviceReport`) and never look at these fields; constructing them
  // unconditionally created a future-bug risk that an authenticated screen
  // would accidentally pick up the seeded numbers.
  const isDemoShell = !authenticated && demoEnabled;
  const calculation = isDemoShell
    ? calculateVisualError({
        expectedValue: 8,
        observedValue: 9.45,
        tolerance: 0.5,
        unit: 'bar',
      })
    : calculateVisualError({
        expectedValue: 0,
        observedValue: 0,
        tolerance: 0,
        unit: '',
      });
  const workPackages = input.workPackages ?? [];

  return {
    source: authenticated
      ? catalogTags.length > 0
        ? 'local-authenticated'
        : 'local-empty'
      : demoEnabled
        ? 'seeded-demo'
        : 'local-empty',
    counts: {
      all: authenticated || !demoEnabled ? catalogTags.length : Math.max(32, catalogTags.length),
      pending: authenticated || !demoEnabled ? pendingTags.length : Math.max(12, pendingTags.length),
      recurrent: authenticated || !demoEnabled ? recurrentTags.length : Math.max(4, recurrentTags.length),
      due: authenticated || !demoEnabled ? dueTags.length : Math.max(9, dueTags.length),
    },
    packageSummary: {
      packageCount: workPackages.length,
      downloadedCount: workPackages.filter((workPackage) => workPackage.hasSnapshot).length,
    },
    recentTags: [
      ...(selectedTag ? [selectedTag] : []),
      ...catalogTags.filter((tag) => tag.id !== selectedTag?.id).slice(0, 3),
    ].slice(0, 4),
    pendingTags,
    recurrentTags,
    dueTags,
    selectedTag,
    variableRangeLabel:
      input.selectedTagContext?.range.value ??
      (authenticated ? 'Contexto local indisponivel' : '2,0 a 8,0 bar'),
    lastValueLabel:
      input.selectedTagContext?.historyPreview.lastResult ??
      (authenticated ? 'Historico local indisponivel' : '9,45 bar'),
    calculation,
    history: isDemoShell
      ? [
          { label: '8 dias atras', value: 0.75, statusLabel: 'REINCIDENTE' },
          { label: '3 dias atras', value: 1.1, statusLabel: 'REINCIDENTE' },
          { label: 'Hoje', value: 1.45, statusLabel: 'FALHA' },
        ]
      : [],
    diagnosis: isDemoShell
      ? {
          selectedSymptom: 'Sem Resposta',
          symptoms: ['Sem Resposta', 'Intermitente', 'Leitura Instavel', 'Desvio Recorrente'],
          hypothesis: 'Alimentacao eletrica ou loop de corrente interrompido',
          nextStep: 'Verifique alimentacao (24 V) e continuidade do loop',
          why:
            'Problema na alimentacao ou loop interrompido pode interromper a comunicacao com o transmissor e simular falha eletrica.',
          checklist: [
            'Verificar se alimentacao 24 VDC esta presente',
            'Checar continuidade do loop de corrente 4-20 mA',
            'Conferir polaridade da alimentacao',
          ],
        }
      : {
          selectedSymptom: '',
          symptoms: [],
          hypothesis: '',
          nextStep: '',
          why: '',
          checklist: [],
        },
    report: isDemoShell
      ? {
          tagCode: selectedTag?.code ?? 'Sem tag selecionada',
          symptom: 'Sem Resposta',
          lastValueLabel: '9,45 bar',
          expectedValueLabel: '8,00 bar',
          errorLabel: '+ 1,45 bar',
          diagnosis: 'Alimentacao eletrica ou loop interrompido',
          action: 'Verificacao da alimentacao (24 V) e continuidade do loop',
          pending: 'Nenhuma',
          attachments: ['foto-transmissor', 'foto-multimetro', 'foto-loop'],
        }
      : {
          tagCode: selectedTag?.code ?? 'Sem tag selecionada',
          symptom: '',
          lastValueLabel: '',
          expectedValueLabel: '',
          errorLabel: '',
          diagnosis: '',
          action: '',
          pending: '',
          attachments: [],
        },
  };
}

export function isVisualDemoShellEnabled(
  value: string | undefined = process.env.EXPO_PUBLIC_TAGWISE_ENABLE_DEMO_SHELL,
): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function mapLocalTagToVisualTag(tag: LocalAssignedTagEntry): VisualTagSummary {
  const prefix = tag.tagCode.split('-')[0] ?? tag.tagCode.slice(0, 2);
  const category: VisualTagCategory = 'pending';
  const isManual = isManualInstrumentWorkPackageId(tag.workPackageId);

  return {
    id: tag.tagId,
    workPackageId: tag.workPackageId,
    tagId: tag.tagId,
    source: 'local',
    code: tag.tagCode,
    prefix,
    title: isManual ? 'Manual intake' : tag.instrumentFamily,
    description: tag.shortDescription,
    area: tag.area,
    category,
    severity: isManual ? 'due' : category === 'pending' ? 'medium' : 'ok',
    badgeLabel: isManual ? 'MANUAL' : category === 'pending' ? 'MEDIA' : 'OK',
    badgeDetail: isManual ? 'Pending reconciliation' : tag.area,
    ringColor: resolveRingColor(prefix),
  };
}

function mergeVisualTags(primary: VisualTagSummary[], fallback: VisualTagSummary[]) {
  const seen = new Set<string>();
  const result: VisualTagSummary[] = [];

  for (const tag of [...primary, ...fallback]) {
    if (seen.has(tag.code)) {
      continue;
    }
    seen.add(tag.code);
    result.push(tag);
  }

  return result;
}

function resolveRingColor(prefix: string) {
  switch (prefix) {
    case 'TT':
      return tagColors.temperature;
    case 'FT':
      return tagColors.flow;
    case 'LT':
      return tagColors.level;
    case 'IT':
      return tagColors.due;
    default:
      return tagColors.pressure;
  }
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}
