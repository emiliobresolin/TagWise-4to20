import type {
  SharedExecutionCalculationAcceptance,
  SharedExecutionCalculationDefinition,
  SharedExecutionCalculationRange,
  SharedExecutionCalculationState,
  SharedExecutionChecklistItem,
  SharedExecutionField,
  SharedExecutionGuidanceItem,
  SharedExecutionLinkedGuidanceSnippet,
  SharedExecutionRiskItem,
  SharedExecutionShell,
} from '../execution/model';

export type VisualExecutionSeverity = 'high' | 'medium' | 'low' | 'ok' | 'due';

export interface VisualExecutionCalculationViewModel {
  state: 'available' | 'unavailable';
  tagCode: string;
  templateTitle: string;
  modeLabel: string;
  acceptanceLabel: string;
  expectedLabel: string;
  observedLabel: string;
  expectedValue: string;
  observedValue: string;
  unitLabel: string;
  rangeLabel: string;
  toleranceLabel: string;
  conversionBasisLabel: string;
  expectedRangeLabel: string;
  result: {
    signedDeviationLabel: string;
    absoluteDeviationLabel: string;
    percentOfSpanLabel: string;
    acceptanceLabel: string;
    acceptanceSeverity: VisualExecutionSeverity;
    acceptanceReason: string;
  } | null;
  updatedAtLabel: string;
  editable: boolean;
  conversion: VisualLoopConversionMetadata;
  unavailableReason: string | null;
}

export interface VisualLoopConversionMetadata {
  state: 'available' | 'unavailable';
  reason: string;
  basisLabel: string;
  processRange: SharedExecutionCalculationRange | null;
  loopRange: SharedExecutionCalculationRange | null;
}

export type VisualLoopConversionMode =
  | 'process-to-milliamp'
  | 'milliamp-to-process'
  | 'process-to-percent'
  | 'milliamp-to-percent'
  | 'percent-to-milliamp';

export interface VisualLoopConversionResult {
  state: 'available' | 'unavailable';
  label: string;
  detail: string;
  value: number | null;
}

export interface VisualExecutionHistoryRow {
  label: string;
  value: string;
  stateLabel: string;
  severity: VisualExecutionSeverity;
}

export interface VisualExecutionHistoryViewModel {
  state: 'available' | 'missing' | 'unavailable';
  tagCode: string;
  title: string;
  summary: string;
  detail: string;
  currentResultLabel: string;
  currentResultSeverity: VisualExecutionSeverity;
  historyStateLabel: string;
  rows: VisualExecutionHistoryRow[];
  unavailableReason: string | null;
}

export interface VisualHistoryPointOption {
  id: string;
  label: string;
  pointPercent: number | null;
  rows: VisualExecutionHistoryRow[];
  emptyLabel: string;
}

export interface VisualExecutionGuidanceViewModel {
  state: 'available' | 'missing' | 'unavailable';
  tagCode: string;
  title: string;
  summary: string;
  detail: string;
  checklistItems: SharedExecutionChecklistItem[];
  guidedDiagnosisPrompts: SharedExecutionGuidanceItem[];
  linkedGuidance: SharedExecutionLinkedGuidanceSnippet[];
  riskItems: SharedExecutionRiskItem[];
  observationNotes: string;
  guidanceEvidenceSavedAtLabel: string;
  riskStateLabel: string;
  riskSeverity: VisualExecutionSeverity;
  submitReadinessLabel: string;
  submitReadinessSeverity: VisualExecutionSeverity;
  editable: boolean;
  unavailableReason: string | null;
}

const unavailableConversion: VisualLoopConversionMetadata = {
  state: 'unavailable',
  reason: 'Metadados de conversao 4-20 mA indisponiveis para este teste.',
  basisLabel: 'Indisponivel',
  processRange: null,
  loopRange: null,
};

export function buildVisualExecutionCalculation(
  shell: SharedExecutionShell | null,
): VisualExecutionCalculationViewModel {
  if (!shell?.calculation) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'Nenhuma tag selecionada',
      templateTitle: shell?.template.title ?? 'Nenhum teste carregado',
      modeLabel: 'Indisponivel',
      acceptanceLabel: 'Indisponivel',
      expectedLabel: 'Valor esperado',
      observedLabel: 'Valor medido',
      expectedValue: '',
      observedValue: '',
      unitLabel: 'Indisponivel',
      rangeLabel: 'Indisponivel',
      toleranceLabel: 'Indisponivel',
      conversionBasisLabel: 'Indisponivel',
      expectedRangeLabel: 'Indisponivel',
      result: null,
      updatedAtLabel: 'Ainda nao salvo',
      editable: false,
      conversion: unavailableConversion,
      unavailableReason:
        'Carregue um teste local da tag antes de inserir medicoes.',
    };
  }

  const calculation = shell.calculation;
  const definition = calculation.definition;

  return {
    state: 'available',
    tagCode: shell.tagCode,
    templateTitle: shell.template.title,
    modeLabel: translateVisibleText(definition.modeLabel) ?? definition.modeLabel,
    acceptanceLabel: translateVisibleText(definition.acceptanceLabel) ?? definition.acceptanceLabel,
    expectedLabel: translateVisibleText(definition.expectedLabel) ?? definition.expectedLabel,
    observedLabel: translateVisibleText(definition.observedLabel) ?? definition.observedLabel,
    expectedValue: calculation.rawInputs.expectedValue,
    observedValue: calculation.rawInputs.observedValue,
    unitLabel: definition.unit ?? 'Unidade local indisponivel',
    rangeLabel: formatRange(definition.calculationRange),
    toleranceLabel: formatTolerance(definition),
    conversionBasisLabel:
      translateVisibleText(definition.executionContext.conversionBasisSummary) ??
      'Base de conversao nao declarada',
    expectedRangeLabel:
      translateVisibleText(definition.executionContext.expectedRangeSummary) ??
      'Faixa esperada nao declarada',
    result: buildCalculationResult(calculation),
    updatedAtLabel: calculation.updatedAt ? formatTimestamp(calculation.updatedAt) : 'Ainda nao salvo',
    editable: isTechnicianEditableReport(shell.report),
    conversion: resolveLoopConversionMetadata(definition),
    unavailableReason: null,
  };
}

export function buildVisualExecutionHistory(
  shell: SharedExecutionShell | null,
): VisualExecutionHistoryViewModel {
  const historyStep = shell?.steps.find((step) => step.kind === 'history') ?? null;

  if (!shell || !historyStep) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'Nenhuma tag selecionada',
      title: 'Comparacao historica indisponivel',
      summary: 'Nenhuma etapa local de historico foi carregada.',
      detail: 'O tecnico pode continuar, mas nao ha comparacao historica local aqui.',
      currentResultLabel: 'Ainda nao informado',
      currentResultSeverity: 'medium',
      historyStateLabel: 'Indisponivel',
      rows: [],
      unavailableReason:
        'Carregue um teste local da tag antes de comparar o historico.',
    };
  }

  const historyStateField = historyStep.fields.find((field) => field.label === 'History state');
  const currentResultField = historyStep.fields.find((field) => field.label === 'Current result');
  const currentAcceptance = shell.calculation?.result?.acceptance ?? 'unavailable';

  return {
    state: mapHistoryState(shell.riskInputs.historyState),
    tagCode: shell.tagCode,
    title: translateVisibleText(historyStep.title) ?? historyStep.title,
    summary: translateVisibleText(historyStep.summary) ?? historyStep.summary,
    detail: translateVisibleText(historyStep.detail) ?? historyStep.detail,
    currentResultLabel: translateCommonValue(currentResultField?.value) ?? currentResultField?.value ?? 'Ainda nao informado',
    currentResultSeverity: acceptanceSeverity(currentAcceptance),
    historyStateLabel:
      translateCommonValue(historyStateField?.value) ?? toHistoryStateLabel(shell.riskInputs.historyState),
    rows: historyStep.fields.map(mapHistoryRow),
    unavailableReason: null,
  };
}

export function buildVisualExecutionGuidance(
  shell: SharedExecutionShell | null,
): VisualExecutionGuidanceViewModel {
  const guidanceStep = shell?.steps.find((step) => step.kind === 'guidance') ?? null;

  if (!shell || !guidanceStep) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'Nenhuma tag selecionada',
      title: 'Checklist e orientacao indisponiveis',
      summary: 'Nenhuma etapa local de orientacao foi carregada.',
      detail: 'O tecnico pode continuar, mas nao ha checklist ou referencias locais aqui.',
      checklistItems: [],
      guidedDiagnosisPrompts: [],
      linkedGuidance: [],
      riskItems: [],
      observationNotes: '',
      guidanceEvidenceSavedAtLabel: 'Ainda nao salvo',
      riskStateLabel: 'Indisponivel',
      riskSeverity: 'medium',
      submitReadinessLabel: 'Indisponivel',
      submitReadinessSeverity: 'medium',
      editable: false,
      unavailableReason:
        'Carregue um teste local da tag antes de usar o checklist.',
    };
  }

  return {
    state: mapGuidanceState(shell.guidance),
    tagCode: shell.tagCode,
    title: translateVisibleText(guidanceStep.title) ?? guidanceStep.title,
    summary: translateVisibleText(guidanceStep.summary) ?? guidanceStep.summary,
    detail: translateVisibleText(guidanceStep.detail) ?? guidanceStep.detail,
    checklistItems: shell.guidance.checklistItems.map(translateChecklistItem),
    guidedDiagnosisPrompts: shell.guidance.guidedDiagnosisPrompts.map(translateGuidanceItem),
    linkedGuidance: shell.guidance.linkedGuidance.map(translateLinkedGuidance),
    riskItems: shell.guidance.riskItems.map(translateRiskItem),
    observationNotes: shell.evidence.observationNotes,
    guidanceEvidenceSavedAtLabel: shell.evidence.guidanceEvidenceUpdatedAt
      ? formatTimestamp(shell.evidence.guidanceEvidenceUpdatedAt)
      : 'Ainda nao salvo',
    riskStateLabel:
      shell.guidance.riskState === 'flagged' ? 'Risco visivel ativo' : 'Sem risco visivel ativo',
    riskSeverity: shell.guidance.riskState === 'flagged' ? 'due' : 'ok',
    submitReadinessLabel:
      shell.guidance.submitReadiness === 'blocked'
        ? 'Pendencias que bloqueiam envio'
        : 'Sem bloqueio para envio',
    submitReadinessSeverity: shell.guidance.submitReadiness === 'blocked' ? 'due' : 'ok',
    editable: isTechnicianEditableReport(shell.report),
    unavailableReason: null,
  };
}

export function resolveLoopConversionMetadata(
  definition: SharedExecutionCalculationDefinition,
): VisualLoopConversionMetadata {
  const basisText = [
    definition.executionContext.conversionBasisSummary,
    definition.executionContext.expectedRangeSummary,
    definition.calculationRange?.unit,
  ]
    .filter(Boolean)
    .join(' ');
  const hasLoopBasis = /4\s*(?:-|to|a)\s*20\s*m?A/i.test(basisText);

  if (!hasLoopBasis) {
    return {
      ...unavailableConversion,
      reason:
        basisText.trim().length > 0
          ? 'Este teste tem faixa local, mas nao declara base analogica 4-20 mA/HART para conversao.'
          : unavailableConversion.reason,
    };
  }

  const processRange = resolveProcessRange(definition);

  return {
    state: 'available',
    reason: 'Conversao 4-20 mA disponivel localmente para este teste.',
    basisLabel: definition.executionContext.conversionBasisSummary ?? '4-20 mA loop',
    processRange,
    loopRange: {
      min: 4,
      max: 20,
      unit: 'mA',
    },
  };
}

function isTechnicianEditableReport(report: SharedExecutionShell['report']): boolean {
  // Story 8.12 finding #2: invalidated drafts (supervisor returned the
  // report; technician must start fresh on the next visit) are read-only.
  if (report.invalidated) {
    return false;
  }
  return report.state === 'technician-owned-draft' || report.state === 'submitted-pending-sync';
}

export function convertLoopValue(
  metadata: VisualLoopConversionMetadata,
  mode: VisualLoopConversionMode,
  rawValue: string,
): VisualLoopConversionResult {
  if (metadata.state !== 'available' || !metadata.loopRange) {
    return unavailableResult(metadata.reason);
  }

  const value = Number(rawValue.trim().replace(',', '.'));
  if (!Number.isFinite(value)) {
    return unavailableResult('Informe um valor numerico antes de converter.');
  }

  switch (mode) {
    case 'process-to-milliamp': {
      if (!metadata.processRange) {
        return unavailableResult('Faixa PV indisponivel para conversao.');
      }
      const converted = scaleValue(value, metadata.processRange, metadata.loopRange);
      return availableResult(converted, 'PV para mA', `${formatNumber(value)} ${metadata.processRange.unit} = ${formatNumber(converted)} mA.`);
    }
    case 'process-to-percent': {
      if (!metadata.processRange) {
        return unavailableResult('Faixa PV indisponivel para conversao.');
      }
      const converted = scaleValue(value, metadata.processRange, { min: 0, max: 100, unit: '%' });
      return availableResult(converted, 'PV para percentual', `${formatNumber(value)} ${metadata.processRange.unit} = ${formatNumber(converted)}%.`);
    }
    case 'milliamp-to-process': {
      if (!metadata.processRange) {
        return unavailableResult('Faixa PV indisponivel para conversao.');
      }
      const converted = scaleValue(value, metadata.loopRange, metadata.processRange);
      return availableResult(converted, 'mA para PV', `${formatNumber(value)} mA = ${formatNumber(converted)} ${metadata.processRange.unit}.`);
    }
    case 'milliamp-to-percent': {
      const converted = scaleValue(value, metadata.loopRange, { min: 0, max: 100, unit: '%' });
      return availableResult(converted, 'mA para percentual', `${formatNumber(value)} mA = ${formatNumber(converted)}%.`);
    }
    case 'percent-to-milliamp': {
      const converted = scaleValue(value, { min: 0, max: 100, unit: '%' }, metadata.loopRange);
      return availableResult(converted, 'Percentual para mA', `${formatNumber(value)}% = ${formatNumber(converted)} mA.`);
    }
    default:
      return unavailableResult('Modo de conversao indisponivel.');
  }
}

export function buildVisualHistoryPointOptions(
  history: VisualExecutionHistoryViewModel,
  conversion: VisualLoopConversionMetadata,
): VisualHistoryPointOption[] {
  if (conversion.state === 'available') {
    const points = [0, 25, 50, 75, 100];
    return points.map((point) => {
      const matchingRows = history.rows.filter((row) =>
        row.label.includes(`${point}%`) || row.value.includes(`${point}%`),
      );
      return {
        id: `point-${point}`,
        label: `${point}%`,
        pointPercent: point,
        rows: matchingRows,
        emptyLabel:
          matchingRows.length > 0
            ? ''
            : `Sem dados suficientes para grafico no ponto ${point}%.`,
      };
    });
  }

  return [
    {
      id: 'current-result',
      label: 'Resultado atual',
      pointPercent: null,
      rows: history.rows,
      emptyLabel: 'Sem dados suficientes para grafico nesta variavel.',
    },
  ];
}

function buildCalculationResult(calculation: SharedExecutionCalculationState) {
  if (!calculation.result) {
    return null;
  }

  return {
    signedDeviationLabel: formatDeviation(
      calculation.result.signedDeviation,
      calculation.definition.unit,
    ),
    absoluteDeviationLabel: formatDeviation(
      calculation.result.absoluteDeviation,
      calculation.definition.unit,
    ),
    percentOfSpanLabel:
      calculation.result.percentOfSpan !== null
        ? `${formatNumber(calculation.result.percentOfSpan)}%`
        : 'Indisponivel',
    acceptanceLabel: toAcceptanceLabel(calculation.result.acceptance),
    acceptanceSeverity: acceptanceSeverity(calculation.result.acceptance),
    acceptanceReason: translateVisibleText(calculation.result.acceptanceReason) ?? calculation.result.acceptanceReason,
  };
}

function resolveProcessRange(
  definition: SharedExecutionCalculationDefinition,
): SharedExecutionCalculationRange | null {
  const parsedRange = parseRangeSummary(definition.executionContext.expectedRangeSummary);
  if (parsedRange) {
    return parsedRange;
  }

  const calculationRange = definition.calculationRange;
  if (!calculationRange) {
    return null;
  }

  if (calculationRange.unit.trim().toLowerCase() === 'ma') {
    return { min: 0, max: 100, unit: '%' };
  }

  return calculationRange;
}

function parseRangeSummary(value: string | null): SharedExecutionCalculationRange | null {
  if (!value) {
    return null;
  }

  const match = value.match(
    /(-?\d+(?:\.\d+)?)\s*(?:to|-|a)\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z%]+)(?=.*4\s*(?:-|to|a)\s*20\s*m?A)/i,
  );

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  return {
    min: Number(match[1]),
    max: Number(match[2]),
    unit: match[3],
  };
}

function scaleValue(
  value: number,
  fromRange: SharedExecutionCalculationRange,
  toRange: SharedExecutionCalculationRange,
) {
  const fromSpan = fromRange.max - fromRange.min;
  const toSpan = toRange.max - toRange.min;

  if (fromSpan === 0) {
    return toRange.min;
  }

  return toRange.min + ((value - fromRange.min) / fromSpan) * toSpan;
}

function availableResult(value: number, label: string, detail: string): VisualLoopConversionResult {
  return {
    state: 'available',
    label,
    detail,
    value,
  };
}

function unavailableResult(detail: string): VisualLoopConversionResult {
  return {
    state: 'unavailable',
    label: 'Indisponivel',
    detail,
    value: null,
  };
}

function mapHistoryRow(field: SharedExecutionField): VisualExecutionHistoryRow {
  return {
    label: translateStepLabel(field.label),
    value: translateCommonValue(field.value) ?? translateVisibleText(field.value) ?? field.value,
    stateLabel: toFieldStateLabel(field.state),
    severity: field.state === 'available' ? 'ok' : field.state === 'missing' ? 'due' : 'medium',
  };
}

function translateStepLabel(value: string): string {
  switch (value) {
    case 'History state':
      return 'Estado do historico';
    case 'Current result':
      return 'Resultado atual';
    case 'Prior result':
      return 'Resultado anterior';
    case 'Recurrence cue':
      return 'Recorrencia';
    case 'Last observed':
      return 'Ultima observacao';
    case 'Expected range':
      return 'Faixa esperada';
    case 'Minimum evidence':
      return 'Evidencia minima';
    case 'Expected evidence':
      return 'Evidencia esperada';
    case 'Draft report':
      return 'Rascunho do relatorio';
    case 'Calculation evidence saved':
      return 'Calculo salvo';
    case 'Guidance evidence saved':
      return 'Checklist salvo';
    case 'Observation notes':
      return 'Observacoes';
    case 'Photo evidence':
      return 'Evidencia fotografica';
    case 'Guidance risk state':
      return 'Estado de risco';
    case 'Visible risk hooks':
      return 'Riscos visiveis';
    case 'Required justifications':
      return 'Justificativas obrigatorias';
    default:
      return translateVisibleText(value) ?? value;
  }
}

function translateCommonValue(value: string | undefined): string | null {
  switch (value) {
    case undefined:
      return null;
    case 'Available':
      return 'Disponivel';
    case 'Missing':
      return 'Ausente';
    case 'Unavailable':
      return 'Indisponivel';
    case 'Stale':
      return 'Desatualizado';
    case 'Pass':
      return 'OK';
    case 'Fail':
      return 'Falha';
    case 'Flagged':
      return 'Com risco';
    case 'Clear':
      return 'Sem risco';
    default:
      return translateVisibleText(value) ?? value;
  }
}

function mapHistoryState(
  state: SharedExecutionShell['riskInputs']['historyState'],
): VisualExecutionHistoryViewModel['state'] {
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

function mapGuidanceState(
  guidance: SharedExecutionShell['guidance'],
): VisualExecutionGuidanceViewModel['state'] {
  return guidance.checklistItems.length > 0 ||
    guidance.guidedDiagnosisPrompts.length > 0 ||
    guidance.linkedGuidance.length > 0
    ? 'available'
    : 'missing';
}

function toFieldStateLabel(state: SharedExecutionField['state']) {
  switch (state) {
    case 'available':
      return 'Disponivel';
    case 'missing':
      return 'Ausente';
    default:
      return 'Indisponivel';
  }
}

function toHistoryStateLabel(state: SharedExecutionShell['riskInputs']['historyState']) {
  switch (state) {
    case 'available':
      return 'Disponivel';
    case 'stale':
      return 'Desatualizado';
    case 'age-unknown':
      return 'Idade desconhecida';
    case 'missing':
      return 'Ausente';
    default:
      return 'Indisponivel';
  }
}

function formatRange(range: SharedExecutionCalculationRange | null) {
  return range ? `${formatNumber(range.min)} a ${formatNumber(range.max)} ${range.unit}` : 'Indisponivel';
}

function formatTolerance(definition: SharedExecutionCalculationDefinition) {
  if (definition.toleranceMode === 'percent-of-span' && definition.toleranceValue !== null) {
    return `${formatNumber(definition.toleranceValue)}% do span (${definition.toleranceSource})`;
  }

  if (definition.toleranceMode === 'absolute' && definition.toleranceValue !== null) {
    return definition.unit
      ? `${formatNumber(definition.toleranceValue)} ${definition.unit} (${definition.toleranceSource})`
      : `${formatNumber(definition.toleranceValue)} (${definition.toleranceSource})`;
  }

  return `${definition.toleranceSource} (tolerancia numerica indisponivel)`;
}

function formatDeviation(value: number, unit: string | null) {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function translateVisibleText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }

  const exact: Record<string, string> = {
    'Expected value': 'Valor esperado',
    'Observed value': 'Valor medido',
    'Expected flow': 'Vazao esperada',
    'Observed flow': 'Vazao medida',
    'Calculation setup': 'Medicoes e calculo',
    'History comparison': 'Comparacao historica',
    'Checklist and guidance': 'Checklist e orientacao',
    'Report draft review': 'Revisao do relatorio',
    'Point deviation': 'Desvio pontual',
    'point deviation': 'desvio pontual',
    'local tolerance': 'tolerancia local',
    'Ready to Submit': 'Pronto para envio',
    'In Progress': 'Em andamento',
    'Submitted - Pending Sync': 'Enviado - pendente de sync',
    'Submitted - Pending Supervisor Review': 'Enviado - em revisao do supervisor',
    'Returned by Supervisor': 'Devolvido pelo supervisor',
    'Returned by Manager': 'Devolvido pelo gerente',
    Approved: 'Aprovado',
  };

  if (exact[trimmed]) {
    return exact[trimmed];
  }

  return trimmed
    .replace(/\bCached history is stale\b/gi, 'Historico local desatualizado')
    .replace(/\bExpected evidence missing\b/gi, 'Evidencia esperada ausente')
    .replace(/\bMinimum evidence missing\b/gi, 'Evidencia minima ausente')
    .replace(/\bExpected photo is missing\b/gi, 'Foto esperada ausente')
    .replace(/\bPhoto evidence\b/gi, 'Evidencia fotografica')
    .replace(/\bphoto\b/gi, 'foto')
    .replace(/\bSubmit-blocking\b/gi, 'Bloqueia envio')
    .replace(/\bSubmit blocking\b/gi, 'Bloqueia envio')
    .replace(/\bRisk justification\b/gi, 'Justificativa de risco')
    .replace(/\bHistory is present but flagged as stale\b/gi, 'Historico existe, mas esta desatualizado')
    .replace(/\bHistory state\b/gi, 'Estado do historico')
    .replace(/\bCurrent result\b/gi, 'Resultado atual')
    .replace(/\bPrior result\b/gi, 'Resultado anterior')
    .replace(/\bPass\b/g, 'OK')
    .replace(/\bFail\b/g, 'Falha')
    .replace(/\bAvailable\b/g, 'Disponivel')
    .replace(/\bMissing\b/g, 'Ausente')
    .replace(/\bUnavailable\b/g, 'Indisponivel')
    .replace(/\bStale\b/g, 'Desatualizado')
    .replace(/\bExpected\b/g, 'Esperado')
    .replace(/\bObserved\b/g, 'Medido')
    .replace(/\bMeasured\b/g, 'Medido')
    .replace(/\bTolerance\b/g, 'Tolerancia')
    .replace(/\bspan\b/gi, 'span')
    .replace(/\bof\b/g, 'de');
}

function translateGuidanceItem<T extends { prompt: string; whyItMatters: string; helpsRuleOut: string; sourceReference: string }>(
  item: T,
): T {
  return {
    ...item,
    prompt: translateVisibleText(item.prompt) ?? item.prompt,
    whyItMatters: translateVisibleText(item.whyItMatters) ?? item.whyItMatters,
    helpsRuleOut: translateVisibleText(item.helpsRuleOut) ?? item.helpsRuleOut,
  };
}

function translateChecklistItem(item: SharedExecutionChecklistItem): SharedExecutionChecklistItem {
  return translateGuidanceItem(item);
}

function translateLinkedGuidance(
  item: SharedExecutionLinkedGuidanceSnippet,
): SharedExecutionLinkedGuidanceSnippet {
  return {
    ...item,
    title: translateVisibleText(item.title) ?? item.title,
    summary: translateVisibleText(item.summary) ?? item.summary,
    whyItMatters: translateVisibleText(item.whyItMatters) ?? item.whyItMatters,
  };
}

function translateRiskItem(item: SharedExecutionRiskItem): SharedExecutionRiskItem {
  return {
    ...item,
    title: translateVisibleText(item.title) ?? item.title,
    detail: translateVisibleText(item.detail) ?? item.detail,
    justificationPrompt:
      translateVisibleText(item.justificationPrompt) ?? item.justificationPrompt,
  };
}

function toAcceptanceLabel(value: SharedExecutionCalculationAcceptance) {
  switch (value) {
    case 'pass':
      return 'OK';
    case 'fail':
      return 'FALHA';
    default:
      return 'INDISPONIVEL';
  }
}

function acceptanceSeverity(value: SharedExecutionCalculationAcceptance): VisualExecutionSeverity {
  switch (value) {
    case 'pass':
      return 'ok';
    case 'fail':
      return 'high';
    default:
      return 'medium';
  }
}
