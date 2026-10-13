// Application service — a small, pure line-level diff for `aeos project sync --diff`.
//
// Spec/agent files are short (tens to low-hundreds of lines), so a plain
// O(n·m) LCS is more than fast enough and keeps this dependency-free and
// trivially testable. Output is a compact unified-style listing: unchanged
// lines prefixed with a space, removals with '-', additions with '+'.

export interface DiffLine {
  readonly tag: ' ' | '-' | '+';
  readonly text: string;
}

/** Longest-common-subsequence line diff of `before` → `after`. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of LCS of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tag: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ tag: '-', text: a[i] });
      i++;
    } else {
      out.push({ tag: '+', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ tag: '-', text: a[i++] });
  while (j < m) out.push({ tag: '+', text: b[j++] });

  return out;
}

/**
 * Renders a diff as text, collapsing long runs of unchanged lines to keep the
 * output focused on what actually changed. `context` unchanged lines are kept
 * around each change; longer runs are elided with a `⋯` marker.
 */
export function formatLineDiff(before: string, after: string, context = 2): string {
  const diff = lineDiff(before, after);
  const keep = new Array<boolean>(diff.length).fill(false);

  for (let k = 0; k < diff.length; k++) {
    if (diff[k].tag !== ' ') {
      for (let c = Math.max(0, k - context); c <= Math.min(diff.length - 1, k + context); c++) {
        keep[c] = true;
      }
    }
  }

  const lines: string[] = [];
  let elided = false;
  for (let k = 0; k < diff.length; k++) {
    if (keep[k]) {
      lines.push(`${diff[k].tag} ${diff[k].text}`);
      elided = false;
    } else if (!elided) {
      lines.push('  ⋯');
      elided = true;
    }
  }

  return lines.join('\n');
}
