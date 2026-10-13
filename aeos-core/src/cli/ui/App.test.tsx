import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';

import { AppShell } from './App.js';
import type { Container } from '../container.js';
import type { TicketRunPort } from '../../domain/ports/driving/ticket-run.port.js';

afterEach(() => {
  cleanup();
});

function createContainerMock(ticketRun?: TicketRunPort): Container {
  return {
    projectRepo: {
      findRoot: vi.fn().mockReturnValue('/test'),
      read: vi.fn().mockReturnValue({
        uuid: 'u1',
        id: 'proj-1',
        name: 'Test Project',
        key: 'AEOS',
        path: '/test',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    },
    ticketRun:
      ticketRun ??
      ({
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          ticketId: 'AEOS-1',
          artifactPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl.md',
          reviewPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl-review.md',
        }),
        interrupt: vi.fn().mockResolvedValue(undefined),
      } as TicketRunPort),
  } as unknown as Container;
}

describe('AppShell', () => {
  it('shows shell help when the user submits help', async () => {
    const app = render(
      <AppShell
        container={createContainerMock()}
        cwd="/test"
        buildProgram={() => {
          throw new Error('buildProgram should not be called for shell help');
        }}
      />,
    );

    app.stdin.write('help');
    app.stdin.write('\r');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.lastFrame()).toContain('AEOS Ink shell');
    expect(app.lastFrame()).toContain('ticket run AEOS-1');
  });

  it('dispatches ticket run commands through the use case from the footer', async () => {
    const ticketRun: TicketRunPort = {
      execute: vi.fn().mockResolvedValue({
        status: 'success',
        ticketId: 'AEOS-1',
        artifactPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl.md',
        reviewPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl-review.md',
      }),
      interrupt: vi.fn().mockResolvedValue(undefined),
    };

    const app = render(
      <AppShell
        container={createContainerMock(ticketRun)}
        cwd="/test"
        buildProgram={() => {
          throw new Error('buildProgram should not be called for ticket run');
        }}
      />,
    );

    app.stdin.write('ticket run AEOS-1');
    app.stdin.write('\r');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ticketRun.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      undefined,
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
    expect(app.lastFrame()).toContain('AEOS ticket run');
    expect(app.lastFrame()).toContain('Ticket AEOS-1 completed successfully.');
  });
});
