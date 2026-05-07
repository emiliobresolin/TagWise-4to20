import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { runAiDiagnosisSmoke } from './aiDiagnosisSmoke';

describe('runAiDiagnosisSmoke', () => {
  it('fails fast when AI is disabled', async () => {
    await expect(
      runAiDiagnosisSmoke({
        source: {
          TAGWISE_AI_ENABLED: 'false',
          TAGWISE_AI_PROVIDER: 'openai',
        },
      }),
    ).rejects.toThrow('AI smoke requires TAGWISE_AI_ENABLED=true.');
  });

  it('fails fast when the OpenAI provider is not selected', async () => {
    await expect(
      runAiDiagnosisSmoke({
        source: {
          TAGWISE_AI_ENABLED: 'true',
          TAGWISE_AI_PROVIDER: 'mock',
        },
      }),
    ).rejects.toThrow('AI smoke requires TAGWISE_AI_PROVIDER=openai.');
  });

  it('fails closed when enabled OpenAI credentials are missing', async () => {
    await expect(
      runAiDiagnosisSmoke({
        source: {
          TAGWISE_AI_ENABLED: 'true',
          TAGWISE_AI_PROVIDER: 'openai',
          OPENAI_MODEL: 'gpt-5-mini',
        },
      }),
    ).rejects.toThrow('OPENAI_API_KEY');
  });

  it('runs a redacted synthetic diagnosis through the OpenAI provider path', async () => {
    const fetchImplementation = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(
          JSON.stringify({
            output_text:
              'Synthetic smoke diagnosis completed. Review deterministic readings and evidence.',
          }),
          { status: 200 },
        ),
    );

    const report = await runAiDiagnosisSmoke({
      source: {
        TAGWISE_AI_ENABLED: 'true',
        TAGWISE_AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
        OPENAI_MODEL: 'gpt-5-mini',
        TAGWISE_AI_REQUEST_TIMEOUT_MS: '30000',
      },
      fetchImplementation,
      now: () => new Date('2026-05-07T12:00:00.000Z'),
    });

    expect(report).toEqual({
      status: 'ok',
      provider: 'openai',
      model: 'gpt-5-mini',
      generatedAt: '2026-05-07T12:00:00.000Z',
      summary:
        'Synthetic smoke diagnosis completed. Review deterministic readings and evidence.',
    });
    expect(JSON.stringify(report)).not.toContain('sk-test-key');
  });

  it('keeps OpenAI API keys out of mobile source files', () => {
    const mobileSourceFiles = listFiles(join(process.cwd(), '..', 'mobile', 'src'));
    const matchingFiles = mobileSourceFiles.filter((filePath) =>
      readFileSync(filePath, 'utf-8').includes('OPENAI_API_KEY'),
    );

    expect(matchingFiles).toEqual([]);
  });
});

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
