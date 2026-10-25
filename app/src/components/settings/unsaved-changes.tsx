'use client';
// EZD-103b Step 7 (vault/plans/EZD-103b.md Decided "Unsaved prompt", "Unsaved context", "Registration",
// "Leaving the tab", "Browser Back", "GuardedLink", "Draft hook"; AC-EZD-103-5; Q-0228; Q-0265 (b); Q-0302):
// the Settings unsaved-edits guard. Leaving a page with unsaved edits asks "Save your changes?"; closing the
// tab warns; browser Back is caught with an extra history entry; edits are kept on this device as drafts.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MouseEvent, MutableRefObject, ReactNode } from 'react';
import { draftKey, restoreDraft, syncDraft } from '../../lib/settings/draft';
import type { DraftPage, DraftStore } from '../../lib/settings/draft';
import touch from '../../styles/touch.module.css';
import { useConfirm } from '../states/ConfirmProvider';
import type { ConfirmFn } from '../states/ConfirmProvider';
import { useToast } from '../states/ToastProvider';
import { createIdbDraftStore } from './draft-store';

export type UnsavedEntry = { dirty: boolean; save: () => Promise<boolean>; clearDraft: () => void };
export type LeaveResult = 'left' | 'stayed';

export async function confirmLeave(
  entry: UnsavedEntry | null,
  ask: ConfirmFn,
  go: () => void,
): Promise<LeaveResult> {
  if (entry === null || !entry.dirty) {
    go();
    return 'left';
  }
  const choice = await ask({
    title: 'office.settings.unsaved_title',
    confirmLabel: 'office.settings.unsaved_save',
    discardLabel: 'office.settings.unsaved_discard',
  });
  if (choice === 'confirm') {
    let ok: boolean;
    try {
      ok = await entry.save();
    } catch {
      ok = false;
    }
    if (!ok) return 'stayed';
    entry.clearDraft();
    go();
    return 'left';
  }
  if (choice === 'discard') {
    entry.clearDraft();
    go();
    return 'left';
  }
  return 'stayed';
}

export async function handleHistoryBack(
  entry: UnsavedEntry | null,
  ask: ConfirmFn,
  back: () => void,
  rearm: () => void,
): Promise<LeaveResult> {
  const r = await confirmLeave(entry, ask, back);
  if (r === 'stayed') rearm();
  return r;
}

export function isOriginEntry(state: unknown, armedId: string | null): boolean {
  return (
    armedId !== null &&
    typeof state === 'object' &&
    state !== null &&
    (state as { ezdOrigin?: unknown }).ezdOrigin === armedId
  );
}

type UnsavedContextValue = {
  holderRef: MutableRefObject<UnsavedEntry | null>;
  armedRef: MutableRefObject<boolean>;
  armedIdRef: MutableRefObject<string | null>;
  leavingRef: MutableRefObject<boolean>;
  draftClearRef: MutableRefObject<(() => void) | null>;
  leave: (href: string) => Promise<LeaveResult>;
  draftScope: string;
  draftStore: DraftStore;
};

const UnsavedContext = createContext<UnsavedContextValue | null>(null);

function useUnsavedContext(name: string): UnsavedContextValue {
  const ctx = useContext(UnsavedContext);
  if (!ctx) throw new Error(`${name} must be used inside SettingsShell`);
  return ctx;
}

export function UnsavedChangesProvider(props: {
  draftScope: string;
  draftStore?: DraftStore;
  children: ReactNode;
}) {
  const { draftScope, children } = props;
  const ask = useConfirm();
  const router = useRouter();
  const [draftStore] = useState(() => props.draftStore ?? createIdbDraftStore());
  const holderRef = useRef<UnsavedEntry | null>(null);
  const armedRef = useRef(false);
  const armedIdRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const draftClearRef = useRef<(() => void) | null>(null);

  const leave = useCallback(
    (href: string) =>
      confirmLeave(holderRef.current, ask, () => {
        if (armedRef.current) {
          armedRef.current = false;
          router.replace(href);
        } else {
          router.push(href);
        }
      }),
    [ask, router],
  );

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!armedRef.current) return;
      armedRef.current = false;
      if (!isOriginEntry(event.state, armedIdRef.current)) return;
      const back = () => {
        leavingRef.current = true;
        window.history.back();
      };
      const rearm = () => {
        window.history.pushState(null, '', window.location.href);
        armedRef.current = true;
      };
      void handleHistoryBack(holderRef.current, ask, back, rearm);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [ask]);

  const value = useMemo<UnsavedContextValue>(
    () => ({
      holderRef,
      armedRef,
      armedIdRef,
      leavingRef,
      draftClearRef,
      leave,
      draftScope,
      draftStore,
    }),
    [leave, draftScope, draftStore],
  );

  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

export function useUnsavedChanges(dirty: boolean, save: () => Promise<boolean>): void {
  const { holderRef, draftClearRef, armedRef, armedIdRef, leavingRef } =
    useUnsavedContext('useUnsavedChanges');

  useEffect(() => {
    const entry: UnsavedEntry = {
      dirty,
      save,
      clearDraft: () => {
        draftClearRef.current?.();
      },
    };
    holderRef.current = entry;
    return () => {
      if (holderRef.current === entry) holderRef.current = null;
    };
  }, [holderRef, draftClearRef, dirty, save]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, leavingRef]);

  useEffect(() => {
    if (!dirty) return;
    leavingRef.current = false;
    if (!armedRef.current) {
      const id = window.crypto.randomUUID();
      armedIdRef.current = id;
      window.history.replaceState({ ezdOrigin: id }, '', window.location.href);
      window.history.pushState(null, '', window.location.href);
      armedRef.current = true;
    }
  }, [dirty, armedRef, armedIdRef, leavingRef]);
}

export function useSettingsDraft<T>(
  page: DraftPage,
  value: T | null,
  restore: (value: T) => void,
): void {
  const { draftScope, draftStore, draftClearRef } = useUnsavedContext('useSettingsDraft');
  const key = draftKey(draftScope, page);
  const toast = useToast();
  const latestRef = useRef<T | null>(value);
  const restoreRef = useRef(restore);
  const prevRef = useRef<unknown>(null);
  const restoredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    latestRef.current = value;
    restoreRef.current = restore;
  });

  useEffect(() => {
    if (restoredKeyRef.current === key) return;
    restoredKeyRef.current = key;
    void restoreDraft<T>(
      draftStore,
      key,
      () => latestRef.current !== null,
      (v) => {
        restoreRef.current(v);
        toast.show({ message: 'office.settings.draft_restored' });
      },
    );
  }, [draftStore, key, toast]);

  useEffect(() => {
    void syncDraft(draftStore, key, value, prevRef.current !== null);
    prevRef.current = value;
  }, [draftStore, key, value]);

  useEffect(() => {
    const fn = () => {
      void draftStore.clear(key);
    };
    draftClearRef.current = fn;
    return () => {
      if (draftClearRef.current === fn) draftClearRef.current = null;
    };
  }, [draftClearRef, draftStore, key]);
}

export function useLeave(): (href: string) => Promise<LeaveResult> {
  return useUnsavedContext('useLeave').leave;
}

export type GuardedLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
  [data: `data-${string}`]: string | undefined;
};

export function GuardedLink(props: GuardedLinkProps) {
  const { holderRef, armedRef, leave } = useUnsavedContext('GuardedLink');
  const pathname = usePathname();
  const { href, className, children, ...rest } = props;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    if (href === pathname) {
      e.preventDefault();
      return;
    }
    if (!holderRef.current?.dirty && !armedRef.current) return;
    e.preventDefault();
    void leave(href);
  };
  return (
    <Link
      {...rest}
      href={href}
      className={`${className ?? ''} ${touch.target}`.trim()}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
