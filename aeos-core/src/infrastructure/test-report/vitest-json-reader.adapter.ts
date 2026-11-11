// Adapter — TestReportReader for `vitest run --reporter=json`.

import * as fs from 'node:fs';

import type {
  TestReportReader,
  TestResult,
} from '../../domain/ports/driven/test-report-reader.port.js';

interface VitestJsonReport {
  testResults?: Array<{
    name: string;
    assertionResults?: Array<{ fullName: string; status: string }>;
  }>;
}

const STATUS: Record<string, TestResult['status']> = { passed: 'pass', failed: 'fail' };

export class VitestJsonReader implements TestReportReader {
  read(reportPath: string, format: string): TestResult[] {
    if (format !== 'vitest-json') {
      throw new Error(`Test report format "${format}" is not supported; use "vitest-json".`);
    }
    let report: VitestJsonReport;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as VitestJsonReport;
    } catch (err) {
      throw new Error(
        `Cannot read the test report ${reportPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!Array.isArray(report?.testResults)) {
      throw new Error(`${reportPath} is not a Vitest JSON report: it has no "testResults" list.`);
    }
    return report.testResults.flatMap((file) =>
      (file.assertionResults ?? []).map((test) => ({
        name: test.fullName,
        file: file.name,
        // Anything not run (skipped, pending, todo) answered nothing.
        status: STATUS[test.status] ?? 'skipped',
      })),
    );
  }
}
