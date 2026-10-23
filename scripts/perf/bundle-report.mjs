// EZD-020 Step 6 (vault/plans/EZD-020.md): the bundle report, built from the `entry-contents:*` rows of a run.
// Printed by run.mjs after the per-measurement lines and written to <out>/bundle-report.md (overwritten).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { WATCH_PACKAGES } from '../../eslint-rules/boundaries.mjs';

export const REPORT_TITLE =
  'BUNDLE REPORT (minified bytes from source maps; budgets are compressed totals)';
const TOP_GROUPS = 15;

function section(row, sizeRows) {
  const d = row.details ?? {};
  const lines = [`## ${row.id}`, '', `- url: ${d.url ?? '(none)'}`, `- status: ${row.status}`];
  if (row.error !== undefined) lines.push(`- error: ${row.error}`);
  // The compressed total of the same page, from a js-size row measured in this run.
  const size = sizeRows.find((s) => s.details?.url === d.url && typeof s.value === 'number');
  if (size) lines.push(`- compressed total: ${size.value} bytes (budget ${size.budget}, ${size.id})`);
  lines.push(`- files: ${(d.files ?? []).length}`);
  if (d.missingMaps?.length) lines.push(`- files without a source map: ${d.missingMaps.join(', ')}`);
  if (d.reason) lines.push(`- reason: ${d.reason}`);

  const groups = Object.entries(d.byGroup ?? {}).sort((a, b) => b[1] - a[1]);
  lines.push('', 'Largest groups (bytes):');
  for (const [g, b] of groups.slice(0, TOP_GROUPS)) lines.push(`- ${g}: ${b}`);
  if (groups.length > TOP_GROUPS) {
    const rest = groups.slice(TOP_GROUPS).reduce((sum, [, b]) => sum + b, 0);
    lines.push(`- (rest): ${rest}`);
  }

  lines.push('', 'Watched packages:');
  for (const w of WATCH_PACKAGES) {
    const b = d.watch?.[w];
    lines.push(`- ${w}: ${typeof b === 'number' ? b : 'absent'}`);
  }

  lines.push('', 'Findings:');
  const forbidden = d.forbidden ?? [];
  if (forbidden.length === 0) lines.push('- none');
  for (const f of forbidden) lines.push(`- ${f.category} ${f.key}: ${f.bytes}`);
  lines.push('');
  return lines.join('\n');
}

/** The report text, or null when no `entry-contents:*` row was measured. */
export function bundleReport(results) {
  const rows = (results.measurements ?? []).filter(
    (r) => r.id.startsWith('entry-contents:') && r.status !== 'pending',
  );
  if (rows.length === 0) return null;
  const sizeRows = results.measurements.filter((r) => r.id.startsWith('js-size:'));
  return [REPORT_TITLE, '', ...rows.map((r) => section(r, sizeRows))].join('\n');
}

/** Overwrites <outDir>/bundle-report.md. */
export function writeBundleReport(outDir, text) {
  writeFileSync(path.join(outDir, 'bundle-report.md'), `# ${text}`);
}
