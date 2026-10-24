'use client';
// EZD-034 Step 4 (vault/plans/EZD-034.md section 3; R-013 (4), (6); Q-0047 (a)): the sign-in security check.
// It loads the provider's script itself (explicit render, never next/script), renders the widget in the
// device's language and hands the token up. Tokens are single-use, so a new resetKey resets the widget. The
// widget's own text is the provider's; this component shows text only when the script fails to load.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/messages';
import type { Language } from '../../lib/messages';
import styles from './auth.module.css';

export type CaptchaSetup = { siteKey: string; scriptUrl: string; language: Language };

type TurnstileOptions = {
  sitekey: string;
  language: Language;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

type TurnstileApi = {
  render(el: HTMLElement, options: TurnstileOptions): string;
  reset(id: string): void;
  remove(id: string): void;
};

const loads = new Map<string, Promise<TurnstileApi>>();

function loadTurnstile(url: string): Promise<TurnstileApi> {
  const existing = loads.get(url);
  if (existing) return existing;
  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.addEventListener('load', () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api === undefined) reject(new Error('captcha_script_invalid'));
      else resolve(api);
    });
    script.addEventListener('error', () => reject(new Error('captcha_script_failed')));
    document.head.appendChild(script);
  });
  promise.catch(() => loads.delete(url));
  loads.set(url, promise);
  return promise;
}

export function Captcha({
  siteKey,
  scriptUrl,
  language,
  resetKey,
  onToken,
}: CaptchaSetup & { resetKey: number; onToken: (token: string | null) => void }) {
  const t = useT();
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<TurnstileApi | null>(null);
  const widgetId = useRef<string | null>(null);
  const lastResetKey = useRef(resetKey);
  const tokenSink = useRef(onToken);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    tokenSink.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let active = true;
    tokenSink.current(null);
    loadTurnstile(scriptUrl).then(
      (turnstile) => {
        if (!active || container.current === null) return;
        api.current = turnstile;
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          language,
          callback: (token) => tokenSink.current(token),
          'expired-callback': () => tokenSink.current(null),
          'error-callback': () => tokenSink.current(null),
        });
      },
      () => {
        if (active) setUnavailable(true);
      },
    );
    return () => {
      active = false;
      if (api.current !== null && widgetId.current !== null) api.current.remove(widgetId.current);
      api.current = null;
      widgetId.current = null;
      tokenSink.current(null);
    };
  }, [siteKey, scriptUrl, language]);

  useEffect(() => {
    if (resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    if (api.current !== null && widgetId.current !== null) {
      api.current.reset(widgetId.current);
      tokenSink.current(null);
    }
  }, [resetKey]);

  return (
    <div data-testid="captcha">
      <div ref={container} data-testid="captcha-widget" />
      {unavailable && (
        <p className={styles.error} role="alert" data-testid="captcha-unavailable">
          {t('error.captcha_unavailable')}
        </p>
      )}
    </div>
  );
}
