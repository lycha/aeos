// Web client — the board view (AC-4, AC-5, AC-6, AC-7). Polls
// `project board` on a 5s interval, running only while the tab is visible and
// refreshing immediately when it becomes visible again (WEB-1 decision
// D-001) — no server push, per that decision.

import { useCallback, useEffect, useState } from 'react';

import { postCli } from './api.js';
import { buildBoardView, type BoardView, type TicketRow } from './board-data.js';
import { hrefFor } from './router.js';
import type { ProjectBoardData } from '../../cli/generated/types.gen.js';

/** The detail route for a board row — the epic page for an epic, the ticket page otherwise. */
function ticketHref(projectKey: string, ticket: Pick<TicketRow, 'id' | 'kind'>): string {
  return hrefFor(
    ticket.kind === 'EPIC'
      ? { view: 'epic', projectKey, epicId: ticket.id }
      : { view: 'ticket', projectKey, ticketId: ticket.id },
  );
}

const POLL_MS = 5000;

export function Board() {
  const [view, setView] = useState<BoardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const envelope = await postCli('project board');
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'Failed to load the board.');
      return;
    }
    setError(null);
    setView(buildBoardView(envelope.data as ProjectBoardData));
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = (): void => {
      if (interval !== null) return;
      void refresh();
      interval = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = (): void => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };

    if (document.visibilityState === 'visible') start();

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  if (error) return <p role="alert">{error}</p>;
  if (!view) return <p>Loading…</p>;

  return (
    <div>
      {view.needsHuman.length > 0 && (
        <section aria-label="Needs you">
          <h2>Needs you</h2>
          <ul>
            {view.needsHuman.map((ticket) => (
              <li key={ticket.id}>
                <a href={ticketHref(ticket.projectKey, ticket)}>
                  {ticket.projectName} — {ticket.title} ({ticket.columnLabel}
                  {ticket.subState ? ` · ${ticket.subState}` : ''})
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.projects.map((project) => (
        <section key={project.key} aria-label={project.name}>
          <h2>
            {project.name}
            {!project.available && <span> (unavailable)</span>}{' '}
            <a href={hrefFor({ view: 'create', projectKey: project.key })}>+ New ticket</a>
          </h2>
          <ul>
            {project.tickets.map((ticket) => (
              <li key={ticket.id}>
                <a href={ticketHref(project.key, ticket)}>
                  {ticket.title} — {ticket.columnLabel}
                  {ticket.subState ? ` · ${ticket.subState}` : ''}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
