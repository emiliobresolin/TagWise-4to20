import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
} from '../work-packages/model';
import type { SharedExecutionTemplateContract } from './model';

const sharedExecutionSteps = [
  { id: 'context', title: 'Context', kind: 'context' as const },
  { id: 'calculation', title: 'Calculation setup', kind: 'calculation' as const },
  { id: 'history', title: 'History comparison', kind: 'history' as const },
  { id: 'guidance', title: 'Checklist and guidance', kind: 'guidance' as const },
];

export class LocalExecutionTemplateRegistry {
  resolveTemplate(
    snapshot: AssignedWorkPackageSnapshot,
    tag: AssignedWorkPackageTagSnapshot,
  ): SharedExecutionTemplateContract | null {
    const template = tag.templateIds
      .map((templateId) => snapshot.templates.find((item) => item.id === templateId) ?? null)
      .find((item): item is NonNullable<typeof item> => item !== null);

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
      minimumSubmissionEvidence: template.minimumSubmissionEvidence,
      historyComparisonExpectation: template.historyComparisonExpectation,
      steps: sharedExecutionSteps,
    };
  }
}
