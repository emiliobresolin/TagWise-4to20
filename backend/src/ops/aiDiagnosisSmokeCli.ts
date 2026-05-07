import { runAiDiagnosisSmoke } from './aiDiagnosisSmoke';

void runAiDiagnosisSmoke()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'AI diagnosis smoke failed.';
    console.error(message);
    process.exitCode = 1;
  });
