import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateCaptureFieldSnapshot,
  AssignedWorkPackageTemplateGuidanceItemSnapshot,
} from '../work-packages/model';
import type { SharedExecutionGuidanceItem, SharedExecutionTemplateContract } from './model';

const sharedExecutionSteps = [
  { id: 'context', title: 'Context', kind: 'context' as const },
  { id: 'calculation', title: 'Calculation setup', kind: 'calculation' as const },
  { id: 'history', title: 'History comparison', kind: 'history' as const },
  { id: 'guidance', title: 'Checklist and guidance', kind: 'guidance' as const },
  { id: 'report', title: 'Report draft review', kind: 'report' as const },
];

export class LocalExecutionTemplateRegistry {
  resolveTemplate(
    snapshot: AssignedWorkPackageSnapshot,
    tag: AssignedWorkPackageTagSnapshot,
    templateId: string,
  ): SharedExecutionTemplateContract | null {
    if (!tag.templateIds.includes(templateId)) {
      return null;
    }

    const template = snapshot.templates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      return null;
    }

    return {
      id: template.id,
      title: template.title,
      version: snapshot.summary.snapshotContractVersion,
      instrumentFamily: template.instrumentFamily,
      testPattern: template.testPattern,
      calculationMode: template.calculationMode,
      acceptanceStyle: template.acceptanceStyle,
      captureSummary: normalizeCaptureSummary(template.captureSummary, template.testPattern),
      captureFields: normalizeCaptureFields(template.captureFields),
      calculationRangeOverride: normalizeCalculationRange(template.calculationRangeOverride),
      conversionBasisSummary: normalizeOptionalSummary(template.conversionBasisSummary),
      expectedRangeSummary: normalizeOptionalSummary(template.expectedRangeSummary),
      checklistPrompts: normalizeChecklistPrompts(template.checklistPrompts),
      checklistSteps: [
        ...buildNrMandatoryItems(template.instrumentFamily, template.id),
        ...normalizeGuidanceItems(
          template.checklistSteps,
          normalizeChecklistPrompts(template.checklistPrompts),
          snapshot,
          tag,
        ),
      ],
      guidedDiagnosisPrompts: normalizeDiagnosisPrompts(
        template.guidedDiagnosisPrompts,
        snapshot,
        tag,
      ),
      minimumSubmissionEvidence: template.minimumSubmissionEvidence,
      expectedEvidence: Array.isArray(template.expectedEvidence) ? template.expectedEvidence : [],
      historyComparisonExpectation: template.historyComparisonExpectation,
      steps: sharedExecutionSteps,
    };
  }
}

function normalizeCaptureSummary(
  captureSummary: string | undefined,
  testPattern: string,
): string {
  return typeof captureSummary === 'string' && captureSummary.trim().length > 0
    ? captureSummary
    : `Capture the local execution values for ${testPattern}.`;
}

function normalizeCaptureFields(
  captureFields: AssignedWorkPackageTemplateCaptureFieldSnapshot[] | undefined,
): SharedExecutionTemplateContract['captureFields'] {
  if (Array.isArray(captureFields) && captureFields.length > 0) {
    return captureFields;
  }

  return [
    { id: 'expectedValue', label: 'Expected value', inputKind: 'numeric' },
    { id: 'observedValue', label: 'Observed value', inputKind: 'numeric' },
  ];
}

function normalizeOptionalSummary(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeChecklistPrompts(value: string[] | undefined): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    : [];
}

function normalizeGuidanceItems(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
  fallbackPrompts: string[],
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): SharedExecutionGuidanceItem[] {
  const explicitItems = normalizeExplicitGuidanceItems(value);
  if (explicitItems.length > 0) {
    return explicitItems;
  }

  const sourceReference = resolveFallbackSourceReference(snapshot, tag);
  return fallbackPrompts.map((prompt, index) => ({
    id: `checklist-${index + 1}`,
    prompt,
    whyItMatters: 'Keeps the check grounded in the cached field baseline before escalation.',
    helpsRuleOut: 'Common setup, wiring, or operating-condition issues before escalating the result.',
    sourceReference,
  }));
}

function normalizeDiagnosisPrompts(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): SharedExecutionGuidanceItem[] {
  const explicitItems = normalizeExplicitGuidanceItems(value);
  if (explicitItems.length > 0) {
    return explicitItems;
  }

  return snapshot.guidance
    .filter((item) => tag.guidanceReferenceIds.includes(item.id))
    .map((item, index) => ({
      id: `diagnosis-${index + 1}`,
      prompt: item.summary,
      whyItMatters: item.whyItMatters,
      helpsRuleOut: 'Simple field-condition or setup issues before treating the result as a confirmed device fault.',
      sourceReference: item.sourceReference,
    }));
}

function normalizeExplicitGuidanceItems(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
): SharedExecutionGuidanceItem[] {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id.trim() : '',
          prompt: typeof item.prompt === 'string' ? item.prompt.trim() : '',
          whyItMatters: typeof item.whyItMatters === 'string' ? item.whyItMatters.trim() : '',
          helpsRuleOut: typeof item.helpsRuleOut === 'string' ? item.helpsRuleOut.trim() : '',
          sourceReference:
            typeof item.sourceReference === 'string' ? item.sourceReference.trim() : '',
        }))
        .filter(
          (item) =>
            item.id.length > 0 &&
            item.prompt.length > 0 &&
            item.whyItMatters.length > 0 &&
            item.helpsRuleOut.length > 0 &&
            item.sourceReference.length > 0,
        )
    : [];
}

function resolveFallbackSourceReference(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): string {
  const reference = snapshot.guidance.find((item) => tag.guidanceReferenceIds.includes(item.id));
  return reference?.sourceReference ?? 'LOCAL-TEMPLATE-BASELINE';
}

function buildNrMandatoryItems(
  instrumentFamily: string,
  templateId: string,
): SharedExecutionGuidanceItem[] {
  const family = instrumentFamily.toLowerCase();
  const id = templateId.toLowerCase();
  const items: SharedExecutionGuidanceItem[] = [];

  // NR-10: ALL instrument families (electrical isolation for 4-20mA loops)
  items.push({
    id: 'nr10-electrical-isolation',
    prompt:
      'Realize o teste de isolamento elétrico do loop 4-20 mA (NR-10 item 10.8.3). Registre o resultado.',
    whyItMatters:
      'NR-10 exige verificação do isolamento elétrico antes de qualquer intervenção em circuitos de instrumentação.',
    helpsRuleOut: 'Falhas de isolamento, correntes de fuga e riscos de choque elétrico.',
    sourceReference: 'NR-10 item 10.8.3',
    nrMandatory: true,
    nrArticle: 'NR-10',
  });

  // NR-12: ALL instrument families (lockout/tagout for machine-associated instruments)
  items.push({
    id: 'nr12-lockout-tagout',
    prompt:
      'Verifique e registre o bloqueio/etiquetagem (Lockout/Tagout) do equipamento conforme NR-12 item 12.11.2 antes de iniciar a intervenção.',
    whyItMatters:
      'NR-12 exige bloqueio de energia e etiquetagem antes de qualquer manutenção em máquinas e equipamentos.',
    helpsRuleOut: 'Energização acidental, lesões durante a manutenção.',
    sourceReference: 'NR-12 item 12.11.2',
    nrMandatory: true,
    nrArticle: 'NR-12',
  });

  // NR-13: pressure instruments
  if (
    family.includes('pressure') ||
    family.includes('pressao') ||
    family.includes('pressão') ||
    id.includes('pt') ||
    id.includes('pressure')
  ) {
    items.push({
      id: 'nr13-pressure-inspection',
      prompt:
        'Registre a categoria NR-13 do vaso/equipamento associado (I a V para vasos, A/B para caldeiras). Verifique e documente o estado dos dispositivos de segurança (válvulas de alívio, discos de ruptura) conforme NR-13 item 13.3.6.',
      whyItMatters:
        'NR-13 exige inspeção e calibração periódica de todos os instrumentos de controle e segurança em vasos de pressão e caldeiras.',
      helpsRuleOut:
        'Não conformidades que podem levar a falhas catastróficas em equipamentos sob pressão.',
      sourceReference: 'NR-13 itens 13.3.6 e 13.4.1.5',
      nrMandatory: true,
      nrArticle: 'NR-13',
    });
    items.push({
      id: 'nr13-calibration-cert',
      prompt:
        'Registre o número do certificado de calibração rastreável à RBC/INMETRO com incerteza de medição declarada. Documente leituras "como encontrado" e "como deixado" separadamente.',
      whyItMatters:
        'INMETRO/RBC exige rastreabilidade metrológica e declaração de incerteza de medição em certificados de calibração (NBR ISO/IEC 17025).',
      helpsRuleOut: 'Não conformidades regulatórias em auditorias de calibração.',
      sourceReference: 'NR-13 / NBR ISO/IEC 17025 / CGCRE',
      nrMandatory: true,
      nrArticle: 'NR-13',
    });
  }

  // NR-13: level instruments
  if (
    family.includes('level') ||
    family.includes('nivel') ||
    family.includes('nível') ||
    id.includes('lt') ||
    id.includes('level')
  ) {
    items.push({
      id: 'nr13-level-safety',
      prompt:
        'Verifique o nível crítico de segurança do vaso associado. Documente a condição do instrumento de nível como dispositivo de segurança conforme NR-13 item 13.3.6.',
      whyItMatters:
        'Instrumentos de nível são dispositivos de segurança em vasos de pressão e caldeiras — NR-13 exige inspeção e calibração periódica.',
      helpsRuleOut: 'Falha do sistema de proteção por nível em vasos de pressão.',
      sourceReference: 'NR-13 item 13.3.6',
      nrMandatory: true,
      nrArticle: 'NR-13',
    });
  }

  // NR-13: control valves / positioners
  if (
    family.includes('valve') ||
    family.includes('valvula') ||
    family.includes('válvula') ||
    family.includes('positioner') ||
    id.includes('cv') ||
    id.includes('valve')
  ) {
    items.push({
      id: 'nr13-valve-calibration',
      prompt:
        'Calibre o posicionador e registre os pontos de calibração (0%, 25%, 50%, 75%, 100% de abertura). A calibração da válvula de controle deve respeitar o mesmo intervalo da inspeção interna do vaso protegido (NR-13 item 13.4.4.7).',
      whyItMatters:
        'NR-13 vincula o intervalo de calibração da válvula ao intervalo de inspeção interna do equipamento protegido.',
      helpsRuleOut:
        'Válvula descalibrada mascarando condições de processo fora dos limites de segurança.',
      sourceReference: 'NR-13 itens 13.4.4.7 e 13.5.4.9',
      nrMandatory: true,
      nrArticle: 'NR-13',
    });
  }

  return items;
}

function normalizeCalculationRange(
  range:
    | AssignedWorkPackageSnapshot['templates'][number]['calculationRangeOverride']
    | undefined,
): SharedExecutionTemplateContract['calculationRangeOverride'] {
  if (
    typeof range?.min === 'number' &&
    typeof range?.max === 'number' &&
    typeof range.unit === 'string' &&
    range.unit.trim().length > 0
  ) {
    return {
      min: range.min,
      max: range.max,
      unit: range.unit,
    };
  }

  return null;
}
