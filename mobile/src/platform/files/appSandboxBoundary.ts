export const appSandboxDirectories = {
  futureEvidenceRoot: 'evidence',
} as const;

export function getFutureEvidenceRelativePath(fileName: string): string {
  return `${appSandboxDirectories.futureEvidenceRoot}/${fileName}`;
}
