// EZD-007f Step 8 (vault/plans/EZD-007f.md section 3; Q-0047): the page the emailed link opens. GET never
// verifies; the button posts confirmSignInLink. Referrer-Policy comes from app/next.config.ts headers().
import { LanguageSwitch } from '../../../components/auth/LanguageSwitch';
import styles from '../../../components/auth/auth.module.css';
import { Disclaimer } from '../../../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../../../lib/messages';
import { getSignInLanguage } from '../../../server/auth/sign-in-language';
import { catalogFor } from '../../../server/messages/catalog';
import { getT } from '../../../server/messages/get-t';
import { ConfirmForm } from './ConfirmForm';

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const language = await getSignInLanguage();
  const { token_hash: tokenHash, type } = await searchParams;
  const t = getT('sign_in', language);

  return (
    <main className={styles.canvas}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <div className={styles.card} data-testid="sign-in-card">
          <LanguageSwitch language={language} />
          <h1 className={styles.title}>{t('common.sign_in.confirm_title')}</h1>
          {typeof tokenHash === 'string' &&
          tokenHash !== '' &&
          typeof type === 'string' &&
          type !== '' ? (
            <ConfirmForm tokenHash={tokenHash} type={type} />
          ) : (
            <div className={styles.form}>
              <p className={styles.error} role="alert" data-testid="confirm-error">
                {t('error.link_invalid')}
              </p>
              <a className={styles.link} href="/sign-in">
                {t('common.sign_in.title')}
              </a>
            </div>
          )}
        </div>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
