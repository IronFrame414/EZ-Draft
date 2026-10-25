// EZD-136 Step 17 (vault/plans/EZD-136.md section 3; Q-0273 (b); Q-0305 (c)): the app's not-found page,
// status 404, for every URL no route matches and every notFound() with no nearer not-found file. The text
// and the disclaimer line in the person's language (getNotFoundLanguage).
import type { JSX } from 'react';
import { Disclaimer } from '../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../lib/messages';
import { catalogFor } from '../server/messages/catalog';
import { getT } from '../server/messages/get-t';
import { getNotFoundLanguage } from '../server/messages/not-found-language';
import styles from './home.module.css';

export default async function NotFound(): Promise<JSX.Element> {
  const language = await getNotFoundLanguage();
  const t = getT('sign_in', language);
  return (
    <main className={styles.page}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <p className={styles.message} data-testid="not-found">
          {t('error.page_not_found')}
        </p>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
