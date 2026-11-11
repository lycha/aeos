// Driven port — PullRequestGateway: opens a pull request on the code host

export interface PullRequestRequest {
  /** The project's working tree. */
  readonly cwd: string;
  readonly base: string;
  readonly head: string;
  readonly title: string;
  readonly body: string;
}

export interface PullRequestGateway {
  /** Whether a pull request can be opened from `cwd`; `reason` names the cause and the fix. */
  isAvailable(cwd: string): { ok: boolean; reason?: string };

  /**
   * Opens a pull request, or returns the one already open for `head`.
   * Throws when the host refuses.
   */
  create(request: PullRequestRequest): { url: string };

  /**
   * Rewrites the body of the pull request open for `head` with what `update`
   * makes of the current one. Throws when the host refuses.
   */
  updateBody(request: { cwd: string; head: string; update: (body: string) => string }): void;
}
