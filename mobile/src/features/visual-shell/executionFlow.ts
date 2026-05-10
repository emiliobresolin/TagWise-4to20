import type { SharedExecutionTemplateContract } from '../execution/model';
import type { LocalExecutionTemplateOption } from '../work-packages/model';

export type VisualExecutionPattern = 'loop' | 'single-point' | 'checklist' | 'unsupported';
export type VisualExecutionRoute = 'calculation' | 'loop-test' | 'diagnosis';

export interface VisualExecutionStage {
  id:
    | 'context'
    | 'test'
    | 'measurement'
    | 'compare'
    | 'checklist'
    | 'evidence'
    | 'report'
    | 'submit';
  label: string;
  route: 'detail' | 'calculation' | 'loop-test' | 'history' | 'diagnosis' | 'report';
}

export interface VisualExecutionPatternProjection {
  pattern: VisualExecutionPattern;
  route: VisualExecutionRoute;
  label: string;
  detail: string;
}

type TemplateLike = Pick<
  LocalExecutionTemplateOption | SharedExecutionTemplateContract,
  'title' | 'testPattern' | 'captureSummary'
> &
  Partial<Pick<SharedExecutionTemplateContract, 'calculationMode' | 'checklistPrompts'>>;

export function resolveVisualExecutionPattern(
  template: TemplateLike | null | undefined,
): VisualExecutionPatternProjection {
  if (!template) {
    return {
      pattern: 'unsupported',
      route: 'diagnosis',
      label: 'Teste local indisponivel',
      detail: 'Selecione um teste baixado para abrir o fluxo correto.',
    };
  }

  const haystack = [
    template.title,
    template.testPattern,
    template.captureSummary,
    template.calculationMode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(loop|curva|multi.?ponto|5\s*pontos|10\s*pontos|as.?found.*as.?left)/i.test(haystack)) {
    return {
      pattern: 'loop',
      route: 'loop-test',
      label: 'Teste de loop',
      detail: 'Executar pontos do loop com entrada PV ou mA.',
    };
  }

  if (/(checklist|procedimento|inspecao|inspection|procedure|orientacao)/i.test(haystack)) {
    return {
      pattern: 'checklist',
      route: 'diagnosis',
      label: 'Checklist tecnico',
      detail: 'Abrir checklist, orientacao e referencias locais.',
    };
  }

  if (/(calib|verifica|verification|expected|measured|basica|basic|point|desvio)/i.test(haystack)) {
    return {
      pattern: 'single-point',
      route: 'calculation',
      label: 'Medicao pontual',
      detail: 'Informar esperado e medido para calculo local.',
    };
  }

  return {
    pattern: 'unsupported',
    route: 'calculation',
    label: 'Teste generico',
    detail:
      'Padrao de teste nao classificado. O tecnico ainda pode registrar medicoes, observacoes e evidencias.',
  };
}

export function buildExecutionStages(pattern: VisualExecutionPattern): VisualExecutionStage[] {
  const measurementRoute = pattern === 'loop' ? 'loop-test' : 'calculation';
  return [
    { id: 'context', label: 'Contexto', route: 'detail' },
    { id: 'test', label: 'Teste', route: measurementRoute },
    { id: 'measurement', label: pattern === 'loop' ? 'Pontos' : 'Medicoes', route: measurementRoute },
    { id: 'compare', label: 'Comparar', route: 'history' },
    { id: 'checklist', label: 'Checklist', route: 'diagnosis' },
    { id: 'evidence', label: 'Evidencias', route: 'report' },
    { id: 'report', label: 'Relatorio', route: 'report' },
    { id: 'submit', label: 'Enviar', route: 'report' },
  ];
}

export function toPtBrTemplateLabel(value: string): string {
  return value
    .replace(/\bpressure transmitter\b/gi, 'transmissor de pressao')
    .replace(/\blevel transmitter\b/gi, 'transmissor de nivel')
    .replace(/\bflow transmitter\b/gi, 'transmissor de vazao')
    .replace(/\btemperature transmitter\b/gi, 'transmissor de temperatura')
    .replace(/\bas-found\b/gi, 'como encontrado')
    .replace(/\bas-left\b/gi, 'como deixado')
    .replace(/\bcalibration\b/gi, 'calibracao')
    .replace(/\bverification\b/gi, 'verificacao')
    .replace(/\bbasic\b/gi, 'basica')
    .replace(/\brange\b/gi, 'faixa')
    .replace(/\bexpected-versus-measured\b/gi, 'esperado versus medido')
    .replace(/\bcheck\b/gi, 'checagem')
    .replace(/\bloop\b/gi, 'loop');
}

export function shouldScrollRouteToTop(previousRoute: string, nextRoute: string): boolean {
  return previousRoute !== nextRoute;
}

