// EZD-020 Step 1 (vault/plans/EZD-020.md): the phone field pack entry point (11 Performance rule 7).
// EZD-2004 (audit 2026-11-27 A14): the field pages are in the user's language, so the wrapper and the page's <html>
// say so (lang); signed out (the sign-in redirect is the page's) it stays English.
import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { HtmlLang } from '../../a11y/HtmlLang';
import type { Language } from '../../lib/messages/types';
import { getRequestLanguage } from '../../server/messages/request-language';

async function fieldLanguage(): Promise<Language> {
  try {
    return await getRequestLanguage('field');
  } catch (e) {
    unstable_rethrow(e);
    return 'en';
  }
}

export default async function FieldLayout({ children }: { children: ReactNode }) {
  const language = await fieldLanguage();
  return (
    <div data-entry="field" lang={language} style={{ display: 'contents' }}>
      <HtmlLang language={language} />
      {children}
    </div>
  );
}
