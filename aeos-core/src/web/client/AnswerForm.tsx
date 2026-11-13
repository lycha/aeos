// Web client — the answer/escalation-response form (AC-18, AC-19): one field
// per open question, or a single response field for an escalation, filled in
// from the staleness-guarded read and written back through T-008's write
// routes. A file changed on disk since it was shown is refused as
// `STALE_CONTENT`; the fix is to reload, never to resubmit blindly (AC-19).

import { useCallback, useEffect, useState } from 'react';

import {
  answerQuestions,
  getEscalation,
  getQuestions,
  resolveEscalation,
  type EscalationData,
  type QuestionsData,
} from './api.js';

export interface AnswerFormProps {
  readonly kind: 'answer' | 'resolve';
  readonly projectKey: string;
  readonly ticketId: string;
  /** Shown before the confirm control: answering and resolving both record a gate (AC-15). */
  readonly gitIdentity?: string | null;
  readonly onDone: () => void;
}

export function AnswerForm({ kind, projectKey, ticketId, gitIdentity, onDone }: AnswerFormProps) {
  const [questions, setQuestions] = useState<QuestionsData | null>(null);
  const [escalation, setEscalation] = useState<EscalationData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (kind === 'answer') {
      const document = await getQuestions(projectKey, ticketId);
      setQuestions(document);
      setAnswers(Object.fromEntries((document?.questions ?? []).map((q) => [q.id, q.answer])));
    } else {
      const document = await getEscalation(projectKey, ticketId);
      setEscalation(document);
      setResponse('');
    }
  }, [kind, projectKey, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: { preventDefault: () => void }): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome =
      kind === 'answer' && questions
        ? await answerQuestions(projectKey, ticketId, questions.staleness, answers)
        : kind === 'resolve' && escalation
          ? await resolveEscalation(projectKey, ticketId, escalation.staleness, response)
          : null;
    setBusy(false);
    if (!outcome) return;
    if (!outcome.ok) {
      setError(
        outcome.error?.code === 'STALE_CONTENT'
          ? 'This changed on disk since it was shown. Reloading the latest version.'
          : (outcome.error?.message ?? 'The action failed.'),
      );
      void load();
      return;
    }
    onDone();
  };

  if (kind === 'answer') {
    if (!questions) return <p>Loading…</p>;
    return (
      <form onSubmit={(event) => void submit(event)}>
        {questions.questions.map((question) => (
          <label key={question.id}>
            {question.id} — {question.question}
            {question.required && ' (required)'}
            <textarea
              required={question.required}
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))
              }
            />
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
        {gitIdentity !== undefined && (
          <p>Recorded as: {gitIdentity ?? 'no git identity configured'}</p>
        )}
        <button type="submit" disabled={busy}>
          Submit answers
        </button>
      </form>
    );
  }

  if (!escalation) return <p>Loading…</p>;
  return (
    <form onSubmit={(event) => void submit(event)}>
      <p>{escalation.reason}</p>
      <p>{escalation.why}</p>
      <label>
        Response
        <textarea required value={response} onChange={(event) => setResponse(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {gitIdentity !== undefined && (
        <p>Recorded as: {gitIdentity ?? 'no git identity configured'}</p>
      )}
      <button type="submit" disabled={busy}>
        Submit response
      </button>
    </form>
  );
}
