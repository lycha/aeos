// Domain service — StateMachineService
//
// Enforces forward-only column movement and sub-state transitions.
// Receives TicketRepository and TransitionRepository ports via constructor injection.
// Does NOT depend on any infrastructure type (no Database, no SQLite).
//
// class StateMachineService {
//   constructor(ticketRepo: TicketRepository, transitionRepo: TransitionRepository)
//   transition(projectId, ticketId, targetColumn): TransitionResult
//   setSubState(projectId, ticketId, subState): SetSubStateResult
// }
