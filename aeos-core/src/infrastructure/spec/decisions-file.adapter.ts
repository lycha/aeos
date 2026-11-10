// Adapter — DecisionsFile over `decisions.yaml`.
//
// New entries are inserted as text at the end of the `decisions:` list, so the
// comments and layout a person gave the file survive an amendment.

import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

import type {
  AmendedDecision,
  Amendment,
  DecisionsFile,
} from '../../domain/ports/driven/decisions-file.port.js';

/** One past the highest `<prefix>-<n>` anywhere in the file. */
function nextNumber(text: string, prefix: string): number {
  const numbers = [...text.matchAll(new RegExp(`\\b${prefix}-(\\d+)`, 'g'))].map((match) =>
    Number(match[1]),
  );
  return Math.max(0, ...numbers) + 1;
}

export class YamlDecisionsFile implements DecisionsFile {
  amend(featureDir: string, amendments: readonly Amendment[]): AmendedDecision[] {
    const file = path.join(featureDir, 'decisions.yaml');
    const text = fs.readFileSync(file, 'utf-8');
    const firstAbsence = nextNumber(text, 'NEW');
    const firstCriterion = nextNumber(text, 'AC');
    const ids = amendments.map((_, index) => ({
      absence: `NEW-${firstAbsence + index}`,
      becomes: `AC-${firstCriterion + index}`,
    }));
    const entries = amendments.map((amendment, index) => ({
      absence: ids[index]!.absence,
      outcome: 'DECIDED',
      resolution: amendment.resolution,
      becomes: ids[index]!.becomes,
      decided_by: 'human',
      question: amendment.question,
      evidence: amendment.evidence,
    }));

    const lines = text.split('\n');
    const key = lines.findIndex((line) => /^decisions:\s*(#.*)?$/.test(line));
    if (key < 0) {
      // No block-style list to append to: an absent key, or a flow-style one.
      const document = yaml.load(text) as Record<string, unknown>;
      const existing = Array.isArray(document.decisions) ? (document.decisions as unknown[]) : [];
      fs.writeFileSync(
        file,
        'decisions' in document
          ? yaml.dump({ ...document, decisions: [...existing, ...entries] }, { lineWidth: -1 })
          : `${text.trimEnd()}\n${yaml.dump({ decisions: entries }, { lineWidth: -1 })}`,
        'utf-8',
      );
      return ids;
    }

    // The list runs to the next top-level key; insert after its last entry line.
    let last = key;
    let indent = '  ';
    for (let i = key + 1; i < lines.length && !/^[^\s#]/.test(lines[i]!); i++) {
      const line = lines[i]!;
      if (line.trim() === '' || line.trim().startsWith('#')) continue;
      if (last === key) indent = /^\s*/.exec(line)![0];
      last = i;
    }
    const added = yaml
      .dump(entries, { lineWidth: -1 })
      .trimEnd()
      .split('\n')
      .map((line) => indent + line);
    lines.splice(last + 1, 0, ...added);
    fs.writeFileSync(file, lines.join('\n'), 'utf-8');
    return ids;
  }
}
