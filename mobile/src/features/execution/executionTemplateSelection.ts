import type { LocalExecutionTemplateOption } from '../work-packages/model';

export function resolveExplicitExecutionTemplateSelection(
  templates: LocalExecutionTemplateOption[],
  selectedTemplateId: string | null,
): LocalExecutionTemplateOption | null {
  if (!selectedTemplateId) {
    return null;
  }

  return templates.find((template) => template.id === selectedTemplateId) ?? null;
}

export function canProceedToExecutionShell(
  templates: LocalExecutionTemplateOption[],
  selectedTemplateId: string | null,
): boolean {
  return resolveExplicitExecutionTemplateSelection(templates, selectedTemplateId) !== null;
}
