// Web client — entry point. Trades the one-time launch token the browser was
// opened with for a session cookie (AC-33) before rendering the app, then
// scrubs the token from the address bar so it cannot be replayed from
// history.

import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { exchangeSession } from './api.js';
import { readLaunchToken } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const { token, strippedUrl } = readLaunchToken(window.location.href);
  if (token) {
    await exchangeSession(token);
    window.history.replaceState({}, '', strippedUrl);
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root element');
  createRoot(root).render(<App />);
}

void bootstrap();
