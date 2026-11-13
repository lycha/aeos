// Web client — the app shell. Hash routing (router.ts) selects the view; the
// server serves the SPA only at `GET /`, so navigation stays in the fragment.

import { useSyncExternalStore } from 'react';

import { Board } from './Board.js';
import { Costs } from './Costs.js';
import { CreateTicket } from './CreateTicket.js';
import { Epic } from './Epic.js';
import { RunView } from './RunView.js';
import { Ticket } from './Ticket.js';
import { go, hrefFor, parseRoute, type Route } from './router.js';

function useRoute(): Route {
  const hash = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => window.location.hash,
    () => '',
  );
  return parseRoute(hash);
}

function renderRoute(route: Route) {
  switch (route.view) {
    case 'board':
      return <Board />;
    case 'ticket':
      return <Ticket projectKey={route.projectKey} ticketId={route.ticketId} />;
    case 'epic':
      return <Epic projectKey={route.projectKey} epicId={route.epicId} />;
    case 'run':
      return <RunView jobId={route.jobId} />;
    case 'costs':
      return <Costs />;
    case 'create':
      return <CreateTicket projectKey={route.projectKey} onDone={() => go({ view: 'board' })} />;
  }
}

export function App() {
  const route = useRoute();
  return (
    <main>
      <h1>
        <a href={hrefFor({ view: 'board' })}>AEOS</a>
      </h1>
      <nav aria-label="Primary">
        <a href={hrefFor({ view: 'board' })}>Board</a> ·{' '}
        <a href={hrefFor({ view: 'costs' })}>Costs</a>
      </nav>
      {renderRoute(route)}
    </main>
  );
}
