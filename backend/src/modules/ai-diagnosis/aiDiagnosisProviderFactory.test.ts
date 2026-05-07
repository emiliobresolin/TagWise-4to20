import { describe, expect, it, vi } from 'vitest';

import type { AiConfig } from '../../config/env';
import { createAiDiagnosisProvider } from './aiDiagnosisProviderFactory';
import { MockAiDiagnosisProvider } from './mockAiDiagnosisProvider';
import { OpenAiDiagnosisProvider } from './openAiDiagnosisProvider';
import type { AiDiagnosisInput } from './model';

const input: AiDiagnosisInput = {
  tagCode: 'PT-101',
  instrumentFamily: 'pressure transmitter',
  templateId: 'tpl-pressure-as-found',
  deterministicResultSummary: 'As-found deviation is outside tolerance.',
  historySummary: 'Previous calibration passed near the upper range.',
  riskFlags: [
    {
      id: 'e2e-high-risk-review',
      reasonType: 'higher-risk-signal',
      detail: 'Repeated high-end deviation was observed.',
    },
  ],
  evidenceSummary: 'Structured readings and one supporting photo are available.',
};

describe('createAiDiagnosisProvider', () => {
  it('uses the deterministic mock provider when AI is disabled or configured for mock', async () => {
    expect(createAiDiagnosisProvider(buildAiConfig({ enabled: false }))).toBeInstanceOf(
      MockAiDiagnosisProvider,
    );
    expect(createAiDiagnosisProvider(buildAiConfig({ enabled: true }))).toBeInstanceOf(
      MockAiDiagnosisProvider,
    );

    const provider = createAiDiagnosisProvider(buildAiConfig({ enabled: true }), {
      now: () => new Date('2026-05-07T00:00:00.000Z'),
    });
    const result = await provider.generateDiagnosis(input);

    expect(result).toEqual({
      provider: 'mock',
      model: 'mock-ai-diagnosis-v1',
      generatedAt: '2026-05-07T00:00:00.000Z',
      summary:
        'Mock assistive diagnosis for PT-101: review deterministic results, recent history, and captured evidence before supervisor review.',
      likelyIssuePatterns: [
        'pressure transmitter pattern requires field verification',
        'higher-risk-signal',
      ],
      recommendedChecks: [
        'Confirm deterministic calculation inputs before relying on AI suggestions.',
        'Compare the current result with the cached history summary.',
        'Verify minimum and expected evidence is captured before submission.',
      ],
      missingEvidenceWarnings: [],
      disclaimer: 'assistive-ai-suggestion',
    });
  });

  it('uses the OpenAI provider only when enabled and configured for OpenAI', () => {
    const provider = createAiDiagnosisProvider(
      buildAiConfig({
        enabled: true,
        provider: 'openai',
        openAi: {
          apiKey: 'sk-test-key',
          model: 'gpt-5-mini',
        },
      }),
    );

    expect(provider).toBeInstanceOf(OpenAiDiagnosisProvider);
  });

  it('fails closed when OpenAI provider config is incomplete', () => {
    expect(() =>
      createAiDiagnosisProvider(
        buildAiConfig({
          enabled: true,
          provider: 'openai',
          openAi: undefined,
        }),
      ),
    ).toThrow('OpenAI AI diagnosis configuration is incomplete.');
  });
});

describe('OpenAiDiagnosisProvider', () => {
  it('calls the OpenAI Responses API with backend-only authorization and maps text output', async () => {
    const fetchImplementation = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(
          JSON.stringify({
            output_text:
              'Likely impulse line restriction. Check manifold position and capture supporting evidence.',
          }),
          { status: 200 },
        ),
    );
    const provider = new OpenAiDiagnosisProvider({
      apiKey: 'sk-test-key',
      model: 'gpt-5-mini',
      requestTimeoutMs: 30000,
      fetchImplementation,
      now: () => new Date('2026-05-07T10:00:00.000Z'),
    });

    const result = await provider.generateDiagnosis(input);

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, request] = fetchImplementation.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(request?.headers).toMatchObject({
      authorization: 'Bearer sk-test-key',
      'content-type': 'application/json',
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: 'gpt-5-mini',
      input: expect.stringContaining('PT-101'),
    });
    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-5-mini',
      generatedAt: '2026-05-07T10:00:00.000Z',
      summary:
        'Likely impulse line restriction. Check manifold position and capture supporting evidence.',
      likelyIssuePatterns: [],
      recommendedChecks: [],
      missingEvidenceWarnings: [],
      disclaimer: 'assistive-ai-suggestion',
    });
  });

  it('raises a sanitized provider error when OpenAI rejects the request', async () => {
    const fetchImplementation = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
          status: 401,
        }),
    );
    const provider = new OpenAiDiagnosisProvider({
      apiKey: 'sk-test-key',
      model: 'gpt-5-mini',
      requestTimeoutMs: 30000,
      fetchImplementation,
    });

    await expect(provider.generateDiagnosis(input)).rejects.toThrow(
      'OpenAI diagnosis request failed with status 401.',
    );
  });
});

function buildAiConfig(overrides: Partial<AiConfig>): AiConfig {
  return {
    enabled: true,
    provider: 'mock',
    requestTimeoutMs: 30000,
    ...overrides,
  };
}
