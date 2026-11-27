// EZD-1995 (AC-EZD-1995-1, AC-EZD-1995-2): a lazy screen loads its own messages with its code, and an English
// provider that was sent only its page's messages then shows the screen's messages.
import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MissingMessageError, MissingMessageParamError } from './t';
import { MessagesProvider, useT, withScreenSlices } from './MessagesProvider';
import { addScreenMessages, resetScreenMessagesForTest, screenMessages, withScreenMessages } from './screen-messages';

const PAGE = { 'office.projects.title': 'Projects' } as const;
const SCREEN_KEY = 'office.countertops.panel.tab_pieces';
const SLICE = { [SCREEN_KEY]: 'Pieces', 'office.projects.title': 'Not this one', 'x.count': '{n} left' };

afterEach(() => resetScreenMessagesForTest());

describe('EZD-1995 lazy screen messages', () => {
  it('a key outside the page messages throws before the screen loads, as before', () => {
    const t = withScreenSlices('en', PAGE);
    expect(t('office.projects.title')).toBe('Projects');
    expect(() => t(SCREEN_KEY)).toThrow(MissingMessageError);
    expect(t.has(SCREEN_KEY)).toBe(false);
  });

  it('after a screen loads with withScreenMessages, the same t shows its messages', async () => {
    const t = withScreenSlices('en', PAGE);
    const screen = await withScreenMessages(Promise.resolve({ default: SLICE }), Promise.resolve({ name: 'screen' }));
    expect(screen).toEqual({ name: 'screen' });
    expect(t(SCREEN_KEY)).toBe('Pieces');
    expect(t.has(SCREEN_KEY)).toBe(true);
  });

  it('the page messages win, a second screen adds to the first, and missing keys and params still throw', () => {
    const t = withScreenSlices('en', PAGE);
    addScreenMessages(SLICE);
    addScreenMessages({ 'y.z': 'More' });
    expect(t('office.projects.title')).toBe('Projects');
    expect(t('y.z' as never)).toBe('More');
    expect(t(SCREEN_KEY)).toBe('Pieces');
    expect(() => t('nope.key' as never)).toThrow(MissingMessageError);
    expect(() => t('x.count' as never)).toThrow(MissingMessageParamError);
    expect(t('x.count' as never, { n: 2 })).toBe('2 left');
  });

  it('a Spanish provider never reads the English screen messages', () => {
    addScreenMessages(SLICE);
    const t = withScreenSlices('es', {});
    expect(() => t(SCREEN_KEY)).toThrow(MissingMessageError);
    expect(t.language).toBe('es');
  });

  it('a failed load of the code or of the messages fails the screen, and adds nothing', async () => {
    const before = screenMessages().version;
    await expect(
      withScreenMessages(Promise.resolve({ default: SLICE }), Promise.reject(new Error('code'))),
    ).rejects.toThrow('code');
    await expect(withScreenMessages(Promise.reject(new Error('messages')), Promise.resolve(1))).rejects.toThrow(
      'messages',
    );
    expect(screenMessages().version).toBe(before);
    expect(withScreenSlices('en', PAGE).has(SCREEN_KEY)).toBe(false);
  });

  it('MessagesProvider renders a screen message once the screen has loaded', () => {
    function Screen() {
      return <span>{useT()(SCREEN_KEY)}</span>;
    }
    const tree = (
      <MessagesProvider language="en" messages={PAGE}>
        <Screen />
      </MessagesProvider>
    );
    expect(() => renderToStaticMarkup(tree)).toThrow(MissingMessageError);
    addScreenMessages(SLICE);
    expect(renderToStaticMarkup(tree)).toContain('Pieces');
  });
});
