'use client';
// EZD-007f Step 4 (vault/plans/EZD-007f.md section 3; Q-0047): English / Español on the signed-out pages.
// The action sets the device cookie and does not redirect, so the URL (and a confirm token_hash) stays.
import { useT } from '../../lib/messages';
import type { Language } from '../../lib/messages';
import { setSignInLanguage } from '../../server/auth/actions';
import styles from './auth.module.css';

export function LanguageSwitch({ language }: { language: Language }) {
  const t = useT();
  return (
    <form action={setSignInLanguage} className={styles.languages}>
      <button
        type="submit"
        name="lang"
        value="en"
        lang="en"
        aria-pressed={language === 'en' ? 'true' : 'false'}
        className={styles.language}
        data-testid="sign-in-lang-en"
      >
        {t('common.sign_in.lang_en')}
      </button>
      <button
        type="submit"
        name="lang"
        value="es"
        lang="es"
        aria-pressed={language === 'es' ? 'true' : 'false'}
        className={styles.language}
        data-testid="sign-in-lang-es"
      >
        {t('common.sign_in.lang_es')}
      </button>
    </form>
  );
}
