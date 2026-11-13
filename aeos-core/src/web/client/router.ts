// Web client — hash routing. The server serves the SPA only at `GET /` (every
// other path 404s), so views are selected by the URL fragment, which the
// browser keeps client-side. Pure functions: parse a hash into a route, and
// build the href for one. An unrecognised hash falls back to the board.

export type Route =
  | { readonly view: 'board' }
  | { readonly view: 'ticket'; readonly projectKey: string; readonly ticketId: string }
  | { readonly view: 'epic'; readonly projectKey: string; readonly epicId: string }
  | { readonly view: 'run'; readonly jobId: string }
  | { readonly view: 'costs' }
  | { readonly view: 'create'; readonly projectKey: string };

export function parseRoute(hash: string): Route {
  const segments = hash
    .replace(/^#/, '')
    .split('/')
    .filter((s) => s.length > 0)
    .map(decodeURIComponent);

  switch (segments[0]) {
    case 't':
      if (segments.length === 3) {
        return { view: 'ticket', projectKey: segments[1]!, ticketId: segments[2]! };
      }
      break;
    case 'e':
      if (segments.length === 3) {
        return { view: 'epic', projectKey: segments[1]!, epicId: segments[2]! };
      }
      break;
    case 'run':
      if (segments.length === 2) return { view: 'run', jobId: segments[1]! };
      break;
    case 'costs':
      if (segments.length === 1) return { view: 'costs' };
      break;
    case 'new':
      if (segments.length === 2) return { view: 'create', projectKey: segments[1]! };
      break;
  }
  return { view: 'board' };
}

export function hrefFor(route: Route): string {
  const enc = encodeURIComponent;
  switch (route.view) {
    case 'board':
      return '#/';
    case 'ticket':
      return `#/t/${enc(route.projectKey)}/${enc(route.ticketId)}`;
    case 'epic':
      return `#/e/${enc(route.projectKey)}/${enc(route.epicId)}`;
    case 'run':
      return `#/run/${enc(route.jobId)}`;
    case 'costs':
      return '#/costs';
    case 'create':
      return `#/new/${enc(route.projectKey)}`;
  }
}

/** Navigate by setting the hash; the `hashchange` event re-renders the app. */
export function go(route: Route): void {
  window.location.hash = hrefFor(route);
}
