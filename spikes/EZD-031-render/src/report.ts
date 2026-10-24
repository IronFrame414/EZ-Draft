// EZD-031 Step 5: costs.json, costs.csv and the contact sheet index.html.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CostsFile, CostRecord } from './trial';

const HEADER = 'room,provider,model,status,error_code,cost_usd,ms,width,height,output';

function field(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: CostRecord[]): string {
  const lines = records.map((r) =>
    [r.roomId, r.provider, r.model, r.status, r.errorCode, r.costUsd, r.ms, r.width, r.height, r.output]
      .map(field)
      .join(','),
  );
  return [HEADER, ...lines].join('\n') + '\n';
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `inputs` maps a room id to its saved input path (relative to the run folder); default `<id>/input.png`. */
export function toHtml(costs: CostsFile, inputs: Record<string, string> = {}): string {
  const rooms: string[] = [];
  for (const r of costs.records) if (!rooms.includes(r.roomId)) rooms.push(r.roomId);
  const cell = (src: string, caption: string) =>
    `<figure><img src="${escapeHtml(src)}" alt=""><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  const rows = rooms.map((roomId) => {
    const cells = [cell(inputs[roomId] ?? `${roomId}/input.png`, `${roomId} input`)];
    for (const r of costs.records.filter((x) => x.roomId === roomId)) {
      if (r.status === 'ok' && r.output) {
        const usd = r.costUsd === null ? '—' : '$' + String(r.costUsd);
        cells.push(cell(r.output, `${r.provider} ${r.model} ${usd} ${(r.ms / 1000).toFixed(1)} s`));
      } else {
        cells.push(`<figure><figcaption>${escapeHtml(`${r.provider} ${r.model} ${r.errorCode ?? 'failed'}`)}</figcaption></figure>`);
      }
    }
    return `<section><h2>${escapeHtml(roomId)}</h2><div class="row">${cells.join('')}</div></section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>EZD-031 render trial ${escapeHtml(costs.runId)}</title>
<style>body{font-family:sans-serif;margin:16px}.row{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;max-width:320px}img{max-width:100%;image-rendering:pixelated}figcaption{font-size:12px}</style>
</head><body><h1>${escapeHtml(costs.runId)}</h1>
${rows.join('\n')}
</body></html>
`;
}

export async function writeReports(runDir: string, costs: CostsFile, inputs: Record<string, string> = {}): Promise<void> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'costs.json'), JSON.stringify(costs, null, 2));
  await fs.writeFile(path.join(runDir, 'costs.csv'), toCsv(costs.records));
  await fs.writeFile(path.join(runDir, 'index.html'), toHtml(costs, inputs));
}
