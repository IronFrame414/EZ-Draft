// EZD-5605 T18 (vault/plans/EZD-5605.md section 4; D-Tools off; AC-EZD-5605-8): with `only: 'select'` every other
// tool, the Assistant button included, is greyed (natively disabled); Select stays on.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ToolRail } from './index';
import type { RailTool } from './rail-types';

const render = (ui: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      {ui}
    </MessagesProvider>,
  );
const tool = (id: string, label: string): RailTool => ({
  kind: 'tool',
  id,
  icon: 'help',
  label: label as RailTool['label'],
});
const buttonFor = (html: string, id: string) =>
  html.match(new RegExp(`<button[^>]*data-rail-tool="${id}"[^>]*>`))?.[0] ?? '';

describe('EZD-5605 ToolRail only', () => {
  it('T18 every tool but the one named is disabled', () => {
    const html = render(
      <ToolRail
        top={[tool('select', 'office.tool.select'), tool('wall', 'office.tool.wall')]}
        bottom={[tool('assistant', 'office.assistant.title')]}
        activeId="select"
        onSelect={() => {}}
        only="select"
      />,
    );
    expect(buttonFor(html, 'select')).not.toContain('disabled');
    expect(buttonFor(html, 'wall')).toContain('disabled=""');
    expect(buttonFor(html, 'assistant')).toContain('disabled=""');
  });
});
