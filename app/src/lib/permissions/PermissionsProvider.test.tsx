// EZD-102 U5 (vault/plans/EZD-102.md section 4; AC-EZD-102-2). Expected values: Decided `useCan` / `Can`
// (children when allowed, else nothing; no provider throws permissions_provider_missing) and Q-0214 /
// R24 "controls a user lacks are hidden", not disabled. Rendered with renderToStaticMarkup (no effects run,
// so no Realtime connection).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Can, PermissionsProvider, useCan } from './PermissionsProvider';

function NoProviderProbe() {
  useCan();
  return null;
}

describe('EZD-102 permissions provider', () => {
  it('U5 Can shows an allowed control, leaves out a missing one, never disables', () => {
    const html = renderToStaticMarkup(
      <PermissionsProvider initial={['edit_model']}>
        <Can permission="edit_model">
          <button type="button">x</button>
        </Can>
        <Can permission="delete_projects">
          <button type="button">y</button>
        </Can>
      </PermissionsProvider>,
    );
    expect(html).toContain('>x<');
    expect(html).not.toContain('>y<');
    expect(html).not.toContain('disabled');
  });

  it('U5 useCan without a provider throws permissions_provider_missing', () => {
    expect(() => renderToStaticMarkup(<NoProviderProbe />)).toThrow('permissions_provider_missing');
  });
});
