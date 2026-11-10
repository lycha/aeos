// Application service — ConformanceService: gathers the deterministic evidence
// for an epic and builds its conformance report. Nothing calls it from a
// command yet; I1-M4-002b puts the report in front of the person at the gate.

import * as path from 'node:path';

import type { ConformanceReport } from '../../domain/model/conformance-report.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type {
  TestReportReader,
  TestResult,
} from '../../domain/ports/driven/test-report-reader.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import {
  buildConformanceReport,
  conformanceYaml,
  renderConformanceMarkdown,
} from '../../domain/services/conformance-builder.js';
import type { CriteriaCollector } from './criteria-collector.js';
import { featureOf } from './spec-pin.js';

/** A whole suite, not one check: generous, and still bounded. */
const TEST_REPORT_TIMEOUT_SECONDS = 1800;

export class ConformanceService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly ticketRepo: TicketRepository,
    private readonly criteriaCollector: CriteriaCollector,
    private readonly checksRunner: ChecksRunner,
    private readonly testReportReader: TestReportReader,
    private readonly gitGateway: GitGateway,
  ) {}

  async buildConformance(
    projectPath: string,
    epicId: string,
  ): Promise<{ report: ConformanceReport; yaml: string; markdown: string }> {
    const project = this.projectRepo.read(projectPath);
    const epic = this.ticketRepo.findById(project.id, epicId);
    if (!epic) throw new Error(`Ticket ${epicId} not found`);
    const pin = epic.specPin;
    if (!pin) {
      throw new Error(
        `${epicId} is not a spec-backed epic: a conformance report is a verdict per criterion of a spec.`,
      );
    }

    const testReport = this.projectRepo.readExecutorConfig(projectPath)?.criteria?.testReport;
    const report = buildConformanceReport({
      feature: featureOf(pin),
      epic: epic.id,
      trace: this.criteriaCollector.collect(projectPath, epic, pin),
      tests: testReport ? await this.runTests(projectPath, testReport) : [],
      spec: pin,
      // shortcut: no `base`; nothing resolves the `aeos-base/<epic>` tag to a
      // commit yet. Add it when a reader of the report needs the range.
      code: { repo: project.id, commit: this.gitGateway.headCommit(projectPath) },
      generatedAt: new Date().toISOString(),
      evidence: testReport?.path,
    });
    return { report, yaml: conformanceYaml(report), markdown: renderConformanceMarkdown(report) };
  }

  /** Runs the project's test-report command and reads what it wrote. */
  private async runTests(
    projectPath: string,
    testReport: { command: string; path: string; format: string },
  ): Promise<TestResult[]> {
    // The exit code is not looked at: a red suite is a result, and the report says which tests.
    const run = await this.checksRunner.run(
      { command: testReport.command, timeoutSeconds: TEST_REPORT_TIMEOUT_SECONDS },
      projectPath,
    );
    let results: TestResult[];
    try {
      results = this.testReportReader.read(
        path.join(projectPath, testReport.path),
        testReport.format,
      );
    } catch (err) {
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n\`${testReport.command}\` ${run.timedOut ? 'timed out' : `exited ${run.exitCode}`}:\n${run.outputTail}`,
      );
    }
    // Reports name files absolutely; the trace names them from the project root.
    return results.map((result) => ({
      ...result,
      file: path.isAbsolute(result.file) ? path.relative(projectPath, result.file) : result.file,
    }));
  }
}
