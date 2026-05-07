import { loadAiConfig } from '../config/env';
import { createAiDiagnosisProvider } from '../modules/ai-diagnosis/aiDiagnosisProviderFactory';
import type { AiDiagnosisInput } from '../modules/ai-diagnosis/model';

export interface AiDiagnosisSmokeReport {
  status: 'ok';
  provider: 'openai';
  model: string;
  generatedAt: string;
  summary: string;
}

export interface AiDiagnosisSmokeOptions {
  source?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  now?: () => Date;
}

export async function runAiDiagnosisSmoke(
  options: AiDiagnosisSmokeOptions = {},
): Promise<AiDiagnosisSmokeReport> {
  const aiConfig = loadAiConfig(options.source ?? process.env);

  if (!aiConfig.enabled) {
    throw new Error('AI smoke requires TAGWISE_AI_ENABLED=true.');
  }

  if (aiConfig.provider !== 'openai') {
    throw new Error('AI smoke requires TAGWISE_AI_PROVIDER=openai.');
  }

  const provider = createAiDiagnosisProvider(aiConfig, {
    fetchImplementation: options.fetchImplementation,
    now: options.now,
  });
  const result = await provider.generateDiagnosis(buildSyntheticDiagnosisInput());

  if (result.provider !== 'openai') {
    throw new Error('AI smoke expected the OpenAI provider.');
  }

  return {
    status: 'ok',
    provider: result.provider,
    model: result.model,
    generatedAt: result.generatedAt,
    summary: result.summary,
  };
}

function buildSyntheticDiagnosisInput(): AiDiagnosisInput {
  return {
    tagCode: 'TW-SMOKE-PT-101',
    instrumentFamily: 'pressure transmitter',
    templateId: 'smoke-pressure-as-found',
    deterministicResultSummary:
      'Synthetic as-found check indicates mild high-end deviation outside nominal tolerance.',
    historySummary:
      'Synthetic history says the previous approved calibration was near the upper tolerance boundary.',
    riskFlags: [
      {
        id: 'smoke-history-drift',
        reasonType: 'history-drift',
        detail: 'Synthetic current result trends away from prior accepted result.',
      },
    ],
    evidenceSummary:
      'Synthetic structured readings and technician note are present. No real plant data is included.',
  };
}
