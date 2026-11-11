// Test fixture — a contract small enough to read, in the file's own format.

export const FIXTURE_CONTRACT = `
contractVersion: 1
info: { title: T, binary: aeos, summary: S, license: Apache-2.0, runtime: node }
platforms: [darwin]
environment:
  AEOS_HOME: { description: Home, default: ~/.aeos, schema: { type: string } }
resources:
  project: { description: A project, fix: Run init }
  gh: { description: gh, fix: Install it, status: proposed, task: T-1 }
exitCodes:
  0: { name: success, meaning: ok }
  1: { name: failure, meaning: broke }
  2: { name: usage, meaning: bad arguments }
  4: { name: missing_resource, meaning: missing }
output:
  formats: [text, json]
  default: text
  json: { mediaType: application/json, envelope: { $ref: "#/components/schemas/Envelope" } }
  nonInteractive: stdin is not a TTY
globals:
  parameters:
    - $ref: "#/components/parameters/json"
  responses:
    "2": { $ref: "#/components/responses/usage" }
components:
  parameters:
    ticketId:
      { name: id, in: argument, position: 1, required: true, description: Ticket ID, schema: { type: string } }
    json: { name: json, in: flag, status: proposed, task: T-9, description: JSON output }
  responses:
    usage: { description: Invalid arguments }
    failure: { description: Something broke }
    missingResource: { description: Missing }
  schemas:
    Envelope: { type: object }
commands:
  ticket move:
    operationId: ticketMove
    summary: Move a ticket
    requires: [project]
    parameters:
      - $ref: "#/components/parameters/ticketId"
      - name: status
        in: argument
        position: 2
        required: true
        description: Target status
        pending: { task: T-2, description: Target column }
        schema: { type: string }
      - name: reason
        in: option
        valueName: text
        required: true
        description: Why
        schema: { type: string }
      - name: dry-run
        in: flag
        status: proposed
        task: T-3
        description: Change nothing
    responses:
      "0": { description: Moved, data: { type: object } }
      "1": { $ref: "#/components/responses/failure" }
      "4": { $ref: "#/components/responses/missingResource" }
  costs:
    operationId: costs
    status: proposed
    task: T-4
    summary: Report spend
    requires: []
    parameters: []
    responses:
      "0": { description: Spend, data: { type: object } }
`;
