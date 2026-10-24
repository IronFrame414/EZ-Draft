// EZD-034 Step 7 (vault/plans/EZD-034.md section 3; AC-EZD-034-2; R-013 (5); Q-0243 (c)): the sign-in form with
// the security check, using Cloudflare's always-pass test site key and the same-origin stub script, so tests
// never load Cloudflare. Not found in production.
import { notFound } from 'next/navigation';
import styles from '../../../components/auth/auth.module.css';
import { MessagesProvider } from '../../../lib/messages';
import { DEV_CAPTCHA_STUB_URL, TURNSTILE_TEST_SITE_KEY } from '../../../server/auth/captcha-config';
import { getSignInLanguage } from '../../../server/auth/sign-in-language';
import { catalogFor } from '../../../server/messages/catalog';
import { SignInForm } from '../../sign-in/SignInForm';

export default async function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const language = await getSignInLanguage();
  return (
    <main className={styles.canvas}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <div className={styles.card}>
          <SignInForm
            initialEmail={null}
            initialError={null}
            captcha={{
              siteKey: TURNSTILE_TEST_SITE_KEY,
              scriptUrl: DEV_CAPTCHA_STUB_URL,
              language,
            }}
          />
        </div>
      </MessagesProvider>
    </main>
  );
}
