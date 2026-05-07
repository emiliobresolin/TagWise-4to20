import type { AiConfig } from '../../config/env';
import type { AiDiagnosisProvider } from './aiDiagnosisProvider';
import { MockAiDiagnosisProvider } from './mockAiDiagnosisProvider';
import { OpenAiDiagnosisProvider } from './openAiDiagnosisProvider';
import { AiDiagnosisProviderError } from './model';

export interface AiDiagnosisProviderFactoryOptions {
  now?: () => Date;
  fetchImplementation?: typeof fetch;
}

export function createAiDiagnosisProvider(
  config: AiConfig,
  options: AiDiagnosisProviderFactoryOptions = {},
): AiDiagnosisProvider {
  if (!config.enabled || config.provider === 'mock') {
    return new MockAiDiagnosisProvider(options.now);
  }

  if (!config.openAi) {
    throw new AiDiagnosisProviderError('OpenAI AI diagnosis configuration is incomplete.');
  }

  return new OpenAiDiagnosisProvider({
    apiKey: config.openAi.apiKey,
    model: config.openAi.model,
    requestTimeoutMs: config.requestTimeoutMs,
    fetchImplementation: options.fetchImplementation,
    now: options.now,
  });
}
