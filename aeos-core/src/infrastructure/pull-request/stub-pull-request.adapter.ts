// Adapter — stub PullRequestGateway, selected under AEOS_EXECUTOR=stub

import type {
  PullRequestGateway,
  PullRequestRequest,
} from '../../domain/ports/driven/pull-request-gateway.port.js';

export class StubPullRequestGateway implements PullRequestGateway {
  readonly needsPush = false;

  isAvailable(): { ok: boolean } {
    return { ok: true };
  }

  create(request: PullRequestRequest): { url: string } {
    return { url: `https://stub.invalid/pull/${request.head}` };
  }

  updateBody(): void {
    // No host to update.
  }
}
