// Value Object — orchestration event stream for `aeos ticket run`

export type TicketRunPhase =
  | 'eligibility'
  | 'context'
  | 'preflight'
  | 'state'
  | 'worker'
  | 'validation'
  | 'artifact'
  | 'rubrics'
  | 'review-context'
  | 'reviewer'
  | 'sign-off'
  | 'complete';

export interface TicketRunEventBase {
  readonly type: string;
  readonly runId: string;
  readonly projectId: string;
  readonly ticketId: string;
  readonly column: string;
  readonly phase: TicketRunPhase;
  readonly at: string;
  readonly sequence: number;
}

export type TicketRunLifecycleEvent =
  | (TicketRunEventBase & {
      type: 'ticket-run.started';
      payload: { executor: string; model?: string };
    })
  | (TicketRunEventBase & {
      type: 'ticket-run.completed';
      payload: { artifactPath: string; reviewPath: string };
    })
  | (TicketRunEventBase & {
      type: 'ticket-run.failed';
      payload: { message: string; reviewPath?: string };
    })
  | (TicketRunEventBase & { type: 'ticket-run.blocked'; payload: { blockers: string[] } })
  | (TicketRunEventBase & {
      type: 'ticket-run.interrupted';
      payload: { message: string; stage?: TicketRunPhase };
    })
  // Terminal, and deliberately not a failure: the run completed correctly and
  // needs a human decision. Renderers should present it as a pause, not an error.
  | (TicketRunEventBase & {
      type: 'ticket-run.escalated';
      payload: {
        reason: string;
        message: string;
        attempt: number;
        artifactPath?: string;
      };
    })
  | (TicketRunEventBase & {
      type: 'run.attempt.started';
      payload: { attempt: number; maxAttempts: number; carryingFeedback: boolean };
    })
  | (TicketRunEventBase & {
      type: 'stage.started' | 'stage.completed' | 'stage.failed';
      payload: {
        stage: TicketRunPhase;
        message: string;
        role?: 'preflight' | 'worker' | 'reviewer';
        /** The agent spec driving this stage, e.g. "architect-agent". */
        agent?: string;
        executor?: string;
        model?: string;
        mode?: 'artifact' | 'agentic';
      };
    })
  | (TicketRunEventBase & {
      type: 'sub-state.changed';
      payload: { from: string | null; to: string | null };
    });

export type TicketRunArtifactEvent =
  | (TicketRunEventBase & {
      type: 'artifact.written';
      payload: { role: 'worker' | 'reviewer'; path: string };
    })
  | (TicketRunEventBase & {
      type: 'artifact.committed';
      payload: { role: 'worker' | 'reviewer'; path: string; commitMessage: string };
    })
  | (TicketRunEventBase & {
      type: 'review.rejected';
      payload: { reviewPath: string; reason: string };
    })
  | (TicketRunEventBase & {
      type: 'cost.recorded';
      payload: {
        role: 'worker' | 'reviewer';
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      };
    });

export type ExecutorChunkEvent = TicketRunEventBase & {
  type: 'executor.stdout.chunk' | 'executor.stderr.chunk';
  payload: {
    source: 'preflight' | 'worker' | 'reviewer';
    chunk: string;
  };
};

export type TicketRunEvent = TicketRunLifecycleEvent | TicketRunArtifactEvent | ExecutorChunkEvent;

export interface TicketRunObserver {
  onEvent?(event: TicketRunEvent): void;
}

type TicketRunEventStampKeys = 'runId' | 'projectId' | 'ticketId' | 'column' | 'at' | 'sequence';

type UnstampedTicketRunEvent<T extends TicketRunEvent> = T extends TicketRunEvent
  ? Omit<T, TicketRunEventStampKeys>
  : never;

export type TicketRunEventInput = UnstampedTicketRunEvent<TicketRunEvent>;
