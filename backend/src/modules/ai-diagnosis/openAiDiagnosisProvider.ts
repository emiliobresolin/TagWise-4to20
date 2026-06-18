import type { AiDiagnosisProvider } from './aiDiagnosisProvider';
import {
  AiDiagnosisProviderError,
  type AiDiagnosisInput,
  type AiDiagnosisResult,
} from './model';

type FetchImplementation = typeof fetch;

interface OpenAiDiagnosisProviderOptions {
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
  apiUrl?: string;
}

export class OpenAiDiagnosisProvider implements AiDiagnosisProvider {
  private readonly fetchImplementation: FetchImplementation;
  private readonly now: () => Date;
  private readonly apiUrl: string;

  constructor(private readonly options: OpenAiDiagnosisProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new AiDiagnosisProviderError('OpenAI API key is required.');
    }
    if (options.model.trim().length === 0) {
      throw new AiDiagnosisProviderError('OpenAI model is required.');
    }
    if (!Number.isInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
      throw new AiDiagnosisProviderError('OpenAI request timeout must be a positive integer.');
    }

    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.apiUrl = options.apiUrl ?? 'https://api.openai.com/v1/responses';
  }

  async generateDiagnosis(input: AiDiagnosisInput): Promise<AiDiagnosisResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

    try {
      const response = await this.fetchImplementation(this.apiUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          instructions:
            'You are TagWise assistive AI. Provide concise, non-authoritative field diagnosis support. Never claim to approve work, override deterministic calculations, or replace supervisor review.',
          input: buildDiagnosisPrompt(input),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AiDiagnosisProviderError(
          `OpenAI diagnosis request failed with status ${response.status}.`,
        );
      }

      const body = (await response.json()) as unknown;
      const rawText = extractResponseText(body);
      const structured = parseStructuredDiagnosis(rawText);

      return {
        provider: 'openai',
        model: this.options.model,
        generatedAt: this.now().toISOString(),
        ...structured,
        disclaimer: 'assistive-ai-suggestion',
      };
    } catch (error) {
      if (error instanceof AiDiagnosisProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiDiagnosisProviderError(
          `OpenAI diagnosis request timed out after ${this.options.requestTimeoutMs}ms.`,
        );
      }

      throw new AiDiagnosisProviderError('OpenAI diagnosis request failed before completion.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildDiagnosisPrompt(input: AiDiagnosisInput): string {
  const riskFlags =
    input.riskFlags.length > 0
      ? input.riskFlags
          .map((riskFlag) => `- ${riskFlag.reasonType}: ${riskFlag.detail}`)
          .join('\n')
      : '- none';

  return [
    'Generate an assistive instrument diagnosis suggestion for this TagWise report context.',
    `Tag: ${input.tagCode}`,
    `Instrument family: ${input.instrumentFamily}`,
    `Template: ${input.templateId}`,
    `Deterministic result: ${input.deterministicResultSummary}`,
    `History: ${input.historySummary}`,
    `Evidence: ${input.evidenceSummary}`,
    'Risk flags:',
    riskFlags,
    'Make clear this is assistive only and does not replace supervisor review.',
    '',
    'Format your response EXACTLY as follows (use these exact section headers):',
    'SUMMARY: <one paragraph summary>',
    'LIKELY_ISSUES:',
    '- <issue pattern 1>',
    '- <issue pattern 2>',
    'RECOMMENDED_CHECKS:',
    '- <check 1>',
    '- <check 2>',
    'MISSING_EVIDENCE:',
    '- <warning 1>',
  ].join('\n');
}

function parseStructuredDiagnosis(text: string): {
  summary: string;
  likelyIssuePatterns: string[];
  recommendedChecks: string[];
  missingEvidenceWarnings: string[];
} {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=LIKELY_ISSUES:|RECOMMENDED_CHECKS:|MISSING_EVIDENCE:|$)/i);
  const issuesMatch = text.match(/LIKELY_ISSUES:\s*([\s\S]*?)(?=RECOMMENDED_CHECKS:|MISSING_EVIDENCE:|$)/i);
  const checksMatch = text.match(/RECOMMENDED_CHECKS:\s*([\s\S]*?)(?=MISSING_EVIDENCE:|$)/i);
  const evidenceMatch = text.match(/MISSING_EVIDENCE:\s*([\s\S]*?)$/i);

  function parseList(section: string | undefined): string[] {
    if (!section) return [];
    return section
      .split('\n')
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);
  }

  return {
    summary: summaryMatch?.[1]?.trim() ?? text.trim(),
    likelyIssuePatterns: parseList(issuesMatch?.[1]),
    recommendedChecks: parseList(checksMatch?.[1]),
    missingEvidenceWarnings: parseList(evidenceMatch?.[1]),
  };
}

function extractResponseText(body: unknown): string {
  if (isRecord(body) && typeof body.output_text === 'string') {
    return requireNonEmptySummary(body.output_text);
  }

  if (isRecord(body) && Array.isArray(body.output)) {
    const text = body.output
      .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
      .map((content) => {
        if (!isRecord(content)) {
          return '';
        }

        if (typeof content.text === 'string') {
          return content.text;
        }

        if (typeof content.output_text === 'string') {
          return content.output_text;
        }

        return '';
      })
      .filter((value) => value.trim().length > 0)
      .join('\n');

    return requireNonEmptySummary(text);
  }

  throw new AiDiagnosisProviderError('OpenAI diagnosis response did not include text output.');
}

function requireNonEmptySummary(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AiDiagnosisProviderError('OpenAI diagnosis response text was empty.');
  }

  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
