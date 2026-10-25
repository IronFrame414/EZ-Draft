// EZD-007f Step 6 (vault/plans/EZD-007f.md section 3; Q-0047; Q-0039 (c)): the sign-in page. Public
// (EZD-007d PUBLIC_PATHS); a signed-in visitor goes to /. Language is the device's choice (getSignInLanguage).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LanguageSwitch } from '../../components/auth/LanguageSwitch';
import styles from '../../components/auth/auth.module.css';
import { Disclaimer } from '../../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../../lib/messages';
import { captchaConfig } from '../../server/auth/captcha-config';
import { getSession } from '../../server/auth/session';
import { getSignInLanguage } from '../../server/auth/sign-in-language';
import { catalogFor } from '../../server/messages/catalog';
import { getT } from '../../server/messages/get-t';
import { SignInForm } from './SignInForm';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getSession()) redirect('/');
  const language = await getSignInLanguage();
  const { e } = await searchParams;
  const initialEmail = (await cookies()).get('ezd_sign_in_email')?.value || null;
  const t = getT('sign_in', language);
  // EZD-034 Step 6: the security check, only when the site key is set (read per request).
  const base = captchaConfig(process.env);

  return (
    <main className={styles.canvas}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <div className={styles.card} data-testid="sign-in-card">
          <LanguageSwitch language={language} />
          <h1 className={styles.title}>{t('common.sign_in.title')}</h1>
          <SignInForm
            initialEmail={initialEmail}
            initialError={e === 'no_access' ? 'no_access' : null}
            captcha={base && { ...base, language }}
          />
        </div>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
