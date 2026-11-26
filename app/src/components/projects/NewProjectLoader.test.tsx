// EZD-1999 (performance audit 2026-11-26 F10, Q-0814; AC-EZD-1999-1): the New project wizard loads when it is opened,
// not with the Projects page. Projects reaches the wizard only through the lazy module app/src/lazy/new-project; the
// loader draws nothing until the module is there, then the wizard with the props Projects gave it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ToastProvider } from '../states/ToastProvider';
import { NewProjectLoader, newProjectModule, type NewProjectModule } from './NewProjectLoader';
import type { NewProjectDialogProps } from '../../lazy/new-project';

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

/** The module names of every static import or re-export that is not type-only (as fields.test.ts, EZD-1994). */
function staticValueImports(text: string): string[] {
  const found: string[] = [];
  const re = /^(import|export)\s+(type\s+)?[^;]*?\sfrom\s+'([^']+)';/gms;
  for (const m of text.matchAll(re)) if (m[2] === undefined) found.push(m[3]!);
  for (const m of text.matchAll(/^import\s+'([^']+)';/gm)) found.push(m[1]!);
  return found;
}

const wrap = (node: React.ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <ToastProvider>{node}</ToastProvider>
    </MessagesProvider>,
  );

const props: NewProjectDialogProps = {
  start: 'file',
  canImport: true,
  onClose: () => {},
  onCreated: () => {},
};

function Stub(p: NewProjectDialogProps) {
  return <div data-testid="stub-wizard" data-start={p.start} data-can-import={String(p.canImport)} />;
}

describe('EZD-1999 AC-EZD-1999-1 New project wizard loads when it is opened', () => {
  it('ProjectsView and the loader take the wizard only as types; the lazy module is reached by import()', () => {
    for (const path of ['./ProjectsView.tsx', './NewProjectLoader.tsx']) {
      const imports = staticValueImports(source(path));
      expect(imports, path).not.toContain('./NewProjectDialog');
      expect(imports, path).not.toContain('./NewProjectStep2');
      expect(imports, path).not.toContain('../../lazy/new-project');
    }
    expect(source('./NewProjectLoader.tsx')).toContain("import('../../lazy/new-project')");
    expect(staticValueImports(source('./ProjectsView.tsx'))).toContain('./NewProjectLoader');
  });

  it('the lazy module exports the wizard itself', async () => {
    const mod = await newProjectModule.load();
    const { NewProjectDialog } = await import('./NewProjectDialog');
    expect(mod.NewProjectDialog).toBe(NewProjectDialog);
  });

  it('draws nothing while the module downloads, and does not ask for it before it is drawn', () => {
    const load = vi.fn(() => new Promise<NewProjectModule>(() => {}));
    const mod = lazyModule(load);
    expect(load).not.toHaveBeenCalled();
    // The pending module has no wizard to draw; a real wizard would never appear in this markup.
    expect(wrap(<NewProjectLoader {...props} module={mod} />)).not.toContain('stub-wizard');
  });

  it('once loaded, draws the wizard with the props Projects passed', async () => {
    const mod = lazyModule(async () => ({ NewProjectDialog: Stub }) as unknown as NewProjectModule);
    await mod.load();
    const html = wrap(<NewProjectLoader {...props} module={mod} />);
    expect(html).toContain('<div data-testid="stub-wizard" data-start="file" data-can-import="true"></div>');
  });

  it('the failure toast has its message', () => {
    expect(catalogFor('office', 'en')).toHaveProperty('office.new_project.load_failed');
  });
});
