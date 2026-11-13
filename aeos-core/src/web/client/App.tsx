// Web client — the app shell. Only the board exists so far (T-012); ticket/
// epic detail (T-013), run streaming (T-014) and costs/create-ticket (T-015)
// are out of this ticket's scope and will add their own views here.

import { Board } from './Board.js';

export function App() {
  return (
    <main>
      <h1>AEOS</h1>
      <Board />
    </main>
  );
}
