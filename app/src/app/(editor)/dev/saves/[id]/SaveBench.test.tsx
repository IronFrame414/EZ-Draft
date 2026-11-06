// EZD-340 U1 (vault/plans/EZD-340.md section 4; AC-EZD-340-1). The save test page's bench bar comes before the
// editor, so the editor's status bar, with the every-page disclaimer (EZD-136, Q-0229), is the last text on the page.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../editor/ProjectEditor', () => ({
  ProjectEditor: () => <p data-testid="editor-stub">editor</p>,
}));
vi.mock('../../../../../lib/outbox/model-api', () => ({ fetchModel: vi.fn() }));
vi.mock('../../../../../lib/outbox/outbox-sync', () => ({ createOutboxSync: vi.fn() }));

import { SaveBench } from './SaveBench';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

describe('EZD-340 save test page order', () => {
  it("EZD-340 U1 the bench bar comes before the editor, so nothing follows the editor's status bar", () => {
    const html = renderToStaticMarkup(<SaveBench projectId={PROJECT_ID} />);
    const editor = html.indexOf('data-testid="editor-stub"');

    for (const testId of ['bench-fifty', 'bench-fail', 'bench-result']) {
      const at = html.indexOf(`data-testid="${testId}"`);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(editor);
    }
    expect(html.endsWith('<p data-testid="editor-stub">editor</p>')).toBe(true);
  });
});
