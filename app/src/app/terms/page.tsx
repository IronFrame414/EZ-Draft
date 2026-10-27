// EZD-1707 Step 4 (vault/plans/EZD-1707.md sections 1, 3, 6; Q-0230): the terms of service page. Public
// (PUBLIC_PATHS); a signed-in visitor sees the same page. Language is the device's sign-in choice.
import { LanguageSwitch } from '../../components/auth/LanguageSwitch';
import styles from '../../components/auth/auth.module.css';
import { Disclaimer } from '../../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../../lib/messages';
import { getSignInLanguage } from '../../server/auth/sign-in-language';
import { catalogFor } from '../../server/messages/catalog';
import { getT } from '../../server/messages/get-t';

export default async function TermsPage() {
  const language = await getSignInLanguage();
  const t = getT('sign_in', language);

  return (
    <main className={styles.canvas}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <div className={`${styles.card} ${styles.termsCard}`} data-testid="terms-card">
          <LanguageSwitch language={language} />
          <h1 className={styles.title}>{t('common.terms.title')}</h1>
          <div className={styles.termsBody}>
            <p className={styles.text} data-testid="terms-no-certification">
              {t('common.terms.no_certification')}
            </p>
            <p className={styles.text} data-testid="terms-responsibility">
              {t('common.terms.responsibility')}
            </p>
            <p className={styles.secondaryText} data-testid="terms-placeholder">
              {t('common.terms.placeholder')}
            </p>
          </div>
          <a className={styles.link} href="/sign-in" data-testid="terms-back">
            {t('common.terms.back')}
          </a>
        </div>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
