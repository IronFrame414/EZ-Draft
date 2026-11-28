'use client';
// EZD-2004 (audit 2026-11-27 A14): while a field page is shown, the page's language is the user's (Spanish crews hear
// Spanish text with Spanish pronunciation). The root layout always says "en" and the wrappers that carry `lang` are
// display: contents, which screen readers may drop, so the <html> element takes the field language too and gets
// its old value back when the page goes.
import { useEffect } from 'react';
import type { Language } from '../lib/messages/types';

export function HtmlLang({ language }: { language: Language }): null {
  useEffect(() => {
    const html = document.documentElement;
    const before = html.lang;
    html.lang = language;
    return () => {
      html.lang = before;
    };
  }, [language]);
  return null;
}
