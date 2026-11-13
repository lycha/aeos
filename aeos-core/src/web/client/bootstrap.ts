// Web client — pure helper for the one-time-token bootstrap (AC-33): reads
// the token the browser was opened with and returns the URL with it removed,
// so it is never left sitting in the address bar for a later replay.

export interface TokenUrl {
  readonly token: string | null;
  readonly strippedUrl: string;
}

export function readLaunchToken(href: string): TokenUrl {
  const url = new URL(href);
  const token = url.searchParams.get('token');
  url.searchParams.delete('token');
  return { token, strippedUrl: url.toString() };
}
