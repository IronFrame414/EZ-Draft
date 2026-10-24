import { MessagesProvider } from '../../../lib/messages/MessagesProvider';
import { languageFor } from '../../../lib/messages/language';
import type { Language } from '../../../lib/messages/types';
import { catalogFor } from '../../../server/messages/catalog';
import { SampleText } from './SampleText';

export function MessagesSample({ user }: { user: { language: Language } }) {
  const fieldLanguage = languageFor('dev', user);
  const officeLanguage = languageFor('office', user);
  return (
    <>
      <section data-testid="field-sample">
        <MessagesProvider language={fieldLanguage} messages={catalogFor('dev', fieldLanguage)}>
          <SampleText />
        </MessagesProvider>
      </section>
      <section data-testid="office-sample">
        <MessagesProvider language={officeLanguage} messages={catalogFor('dev', officeLanguage)}>
          <SampleText />
        </MessagesProvider>
      </section>
    </>
  );
}
