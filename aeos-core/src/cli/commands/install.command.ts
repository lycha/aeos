// CLI command — aeos install

import type { Command } from 'commander';
import type { InstallPort } from '../../domain/ports/driving/install.port.js';

export function registerInstallCommand(program: Command, installUseCase: InstallPort): void {
  program
    .command('install')
    .description('One-time global setup')
    .action(() => {
      try {
        installUseCase.execute();
        // eslint-disable-next-line no-console
        console.log("✓ AEOS installed. Run 'aeos project init' in your project.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
