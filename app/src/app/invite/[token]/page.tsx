// EZD-105 (Q-0695 decisions 10 row 61; 09n Invite expiry row 4; AC-EZD-105-4): the page the invite link opens.
// GET only reads whether the link is live (invite_status, nothing changes), so an email scanner that opens the
// link accepts nothing; the Accept button posts acceptInvite. Signed out, in the device's sign-in language.
// Referrer-Policy: no-referrer comes from app/next.config.ts headers(), as /auth/confirm.
import { LanguageSwitch } from '../../../components/auth/LanguageSwitch';
import styles from '../../../components/auth/auth.module.css';
import { Disclaimer } from '../../../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../../../lib/messages';
import { inviteStatusByHash, type InviteStatus } from '../../../server/auth/admin-auth';
import { getSignInLanguage } from '../../../server/auth/sign-in-language';
import { catalogFor } from '../../../server/messages/catalog';
import { getT } from '../../../server/messages/get-t';
import { inviteTokenHash, isInviteToken } from '../../../server/users/invite-token';
import { InviteAcceptForm } from './InviteAcceptForm';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const language = await getSignInLanguage();
  const { token } = await params;
  const t = getT('sign_in', language);
  const status: InviteStatus = isInviteToken(token)
    ? await inviteStatusByHash(inviteTokenHash(token))
    : { live: false };

  return (
    <main className={styles.canvas}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <div className={styles.card} data-testid="sign-in-card">
          <LanguageSwitch language={language} />
          {status.live ? (
            <>
              <h1 className={styles.title} data-testid="invite-title">
                {t('common.invite.title', { company: status.companyName })}
              </h1>
              <InviteAcceptForm token={token} />
            </>
          ) : (
            <>
              <h1 className={styles.title} data-testid="invite-title">
                {t('common.invite.invalid_title')}
              </h1>
              <div className={styles.form}>
                <p className={styles.error} role="alert" data-testid="invite-invalid">
                  {t('common.invite.invalid')}
                </p>
                <a className={styles.link} href="/sign-in">
                  {t('common.invite.to_sign_in')}
                </a>
              </div>
            </>
          )}
        </div>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
