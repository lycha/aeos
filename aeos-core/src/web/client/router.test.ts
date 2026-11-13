import { describe, expect, it } from 'vitest';

import { hrefFor, parseRoute, type Route } from './router.js';

describe('parseRoute', () => {
  it('maps an empty or root hash to the board', () => {
    expect(parseRoute('')).toEqual({ view: 'board' });
    expect(parseRoute('#')).toEqual({ view: 'board' });
    expect(parseRoute('#/')).toEqual({ view: 'board' });
  });

  it('parses ticket, epic, run, costs and create routes', () => {
    expect(parseRoute('#/t/EE/EE-1')).toEqual({
      view: 'ticket',
      projectKey: 'EE',
      ticketId: 'EE-1',
    });
    expect(parseRoute('#/e/EE/EE-1')).toEqual({ view: 'epic', projectKey: 'EE', epicId: 'EE-1' });
    expect(parseRoute('#/run/job-9')).toEqual({ view: 'run', jobId: 'job-9' });
    expect(parseRoute('#/costs')).toEqual({ view: 'costs' });
    expect(parseRoute('#/new/EE')).toEqual({ view: 'create', projectKey: 'EE' });
  });

  it('decodes percent-encoded segments', () => {
    expect(parseRoute('#/t/A%20B/T-1')).toEqual({
      view: 'ticket',
      projectKey: 'A B',
      ticketId: 'T-1',
    });
  });

  it('falls back to the board for an unknown or malformed hash', () => {
    expect(parseRoute('#/nope')).toEqual({ view: 'board' });
    expect(parseRoute('#/t/EE')).toEqual({ view: 'board' }); // missing ticket id
    expect(parseRoute('#/e/EE/EE-1/extra')).toEqual({ view: 'board' });
  });
});

describe('hrefFor round-trips with parseRoute', () => {
  const routes: Route[] = [
    { view: 'board' },
    { view: 'ticket', projectKey: 'EE', ticketId: 'EE-1' },
    { view: 'epic', projectKey: 'EE', epicId: 'EE-1' },
    { view: 'run', jobId: 'job-9' },
    { view: 'costs' },
    { view: 'create', projectKey: 'EE' },
  ];
  it.each(routes)('%o', (route) => {
    expect(parseRoute(hrefFor(route))).toEqual(route);
  });
});
