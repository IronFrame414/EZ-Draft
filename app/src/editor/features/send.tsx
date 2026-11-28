// EZD-1913c (editor plan 5.3 "features plug in"; 2.6 "Share → Send dialog"): the Send dialog as a registry feature,
// moved unchanged out of ProjectEditor.
// - EZD-111 (vault/plans/EZD-111.md D-Entry, C2; Q-0700; Q-0701): with Send to client, the header Share button opens
//   the Send dialog (lazy). Its no-client link opens Project settings for the session (the lock UI's switcher), after
//   the Send dialog closes.
// - EZD-121 (Q-0700 05): the newest sent version number from a send or a version.sent broadcast; the load's number
//   until one arrives (the page's sent number, read by features/versions.tsx for the header's version text).
// - EZD-719 (S13 Controls "Send to client | Header Share"; assumptions EZD-719): on the Sheets screen Share sends the
//   chosen set; a send numbered Rev N after Rev 0 moves the header to "Rev N issued" and reloads the revision log.
// The dialogs draw after the switcher, before the version cleanup sheet (feature order).
import { useCallback, useEffect, useState } from 'react';
import type { LockUi } from '../../lazy/lock-ui';
import { HeaderButton } from '../../components/shell/HeaderButton';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import type { SendSet } from '../../lib/sends/sends';
import type { EditorSession } from '../editor-session';
import { lazyPart } from '../shared/lazy-part';
import { newerVersionNo } from '../version-label';
import { hubVersionSent } from '../version-sent';
import type { LockOwn } from './lock';
import type { SheetsOwn } from './sheets';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-1910 (editor plan R11, L4): one `lazyPart` call (shared/lazy-part.tsx); nothing shows for the moment the module
// downloads, and a failed download is tried again the next time the part is wanted.
// EZD-111 (11 Budgets; EZD-120c B11): the Send dialog and the Project settings dialog it opens load when Share is
// first pressed.
const sendDialogModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/send-dialog.messages'),
    import('../../lazy/send-dialog'),
  ),
);

const LazySend = lazyPart(
  sendDialogModule,
  (
    mod,
    props: {
      projectId: string;
      sync: EditorSession['sync'];
      sendOpen: boolean;
      set: SendSet | null;
      settings: LockUi['switcher'] | null;
      onCloseSend: () => void;
      onSent: (versionNo: number, revNo: number | null) => void;
      onOpenSettings: () => void;
      onCloseSettings: () => void;
    },
  ) => {
    const { settings } = props;
    return (
      <>
        {props.sendOpen ? (
          <mod.SendDialog
            projectId={props.projectId}
            sync={props.sync}
            onClose={props.onCloseSend}
            onSent={props.onSent}
            set={props.set}
            onOpenProjectSettings={props.onOpenSettings}
          />
        ) : null}
        {settings ? (
          <mod.ProjectSettingsDialog
            {...settings.settings()}
            onClose={props.onCloseSettings}
            onSaved={(s) => {
              props.onCloseSettings();
              settings.saved(s);
            }}
          />
        ) : null}
      </>
    );
  },
);

export type SendOwn = {
  readonly sendOpen: boolean;
  readonly settingsOpen: boolean;
  readonly sendSet: SendSet | null;
  readonly open: (set: SendSet | null) => void;
  readonly closeSend: () => void;
  readonly openSettings: () => void;
  readonly closeSettings: () => void;
  readonly onSent: (n: number, rev?: number | null) => void;
};

const ownOf = (ctx: EditorFeatureContext): SendOwn | undefined =>
  ctx.own?.get('send') as SendOwn | undefined;

function useSendOwn(ctx: EditorFeatureContext): SendOwn {
  const { page, projectId } = ctx;
  const [sendOpen, setSendOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendSet, setSendSet] = useState<SendSet | null>(null);
  const onSent = useCallback(
    (n: number, rev?: number | null) => {
      if (page === undefined) return;
      if (Number.isInteger(n) && n >= 1) page.sentNo.set(newerVersionNo(page.sentNo.get(), n));
      // EZD-719: a send that took Rev N after Rev 0 tells the Sheets screen.
      if (typeof rev === 'number' && Number.isInteger(rev) && rev >= 0) page.revSent.notify(rev);
    },
    [page],
  );
  useEffect(() => hubVersionSent(projectId, onSent), [projectId, onSent]);
  return {
    sendOpen,
    settingsOpen,
    sendSet,
    open: (set) => {
      setSendSet(set);
      setSendOpen(true);
    },
    closeSend: () => setSendOpen(false),
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    onSent,
  };
}

function ShareButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <HeaderButton icon="share" data-testid="header-share" onClick={onClick}>
      {t('office.header.share')}
    </HeaderButton>
  );
}

export const feature: EditorFeature = {
  id: 'send',
  order: 750,
  active: (ctx) => ctx.ready !== undefined,
  useOwn: useSendOwn,
  headerProps: (ctx) => {
    const own = ownOf(ctx);
    if (ctx.props?.canSend !== true || own === undefined) return {};
    return {
      share: (
        <ShareButton
          onClick={() => {
            // EZD-719: the Sheets screen's chosen set goes with the send (its id once the sets have loaded).
            const screen = (ctx.own?.get('sheets') as SheetsOwn | undefined)?.screen ?? null;
            if (ctx.shownView === 'sheets' && screen !== null) {
              own.open({ kind: screen.get().kind, id: screen.set()?.id ?? null });
            } else own.open(null);
          }}
        />
      ),
    };
  },
  header: (ctx) => {
    const own = ownOf(ctx);
    const ready = ctx.ready;
    if (own === undefined || ready === undefined || !(own.sendOpen || own.settingsOpen))
      return null;
    const lock = (ctx.own?.get('lock') as LockOwn | undefined)?.lock ?? null;
    return (
      <LazySend
        projectId={ctx.projectId}
        sync={ready.session.sync}
        sendOpen={own.sendOpen}
        set={own.sendSet}
        settings={own.settingsOpen && lock ? lock.ui.switcher : null}
        onCloseSend={own.closeSend}
        onSent={own.onSent}
        onOpenSettings={own.openSettings}
        onCloseSettings={own.closeSettings}
      />
    );
  },
};
