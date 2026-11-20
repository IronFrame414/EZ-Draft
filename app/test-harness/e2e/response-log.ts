// EZD-427 (AC-EZD-427-1): the response log for the EZD-009 T1 leak check (app/e2e/jobs.spec.ts). Headers are read
// when the response arrives; the body is read only when the request has finished, which is when the page has the
// whole body. A request the browser drops before its body ends (a navigation away from the page that made it)
// never finishes and Playwright's response.body() for it never settles, so nothing here waits on one: that wait
// was the cause of the random EZD-009 failures. Such a response keeps its headers and an empty body.
import type { Request, Response } from '@playwright/test';

export type LoggedResponse = { url: string; headers: string[]; body: string };

export type ResponseSource = {
  on(event: 'response', listener: (response: Response) => void): unknown;
  on(event: 'requestfinished', listener: (request: Request) => void): unknown;
};

export type ResponseLog = { settle(): Promise<LoggedResponse[]> };

export function logResponses(source: ResponseSource): ResponseLog {
  const pending: Promise<void>[] = [];
  const entries: LoggedResponse[] = [];
  const byResponse = new Map<Response, LoggedResponse>();

  source.on('response', (response) => {
    const entry: LoggedResponse = { url: response.url(), headers: [], body: '' };
    entries.push(entry);
    byResponse.set(response, entry);
    pending.push(
      response.allHeaders().then(
        (headers) => {
          entry.headers = Object.values(headers);
        },
        () => {
          // The page or context closed before the headers were read.
        },
      ),
    );
  });

  source.on('requestfinished', (request) => {
    pending.push(
      (async () => {
        try {
          const response = await request.response();
          const entry = response ? byResponse.get(response) : undefined;
          if (!response || !entry) return;
          entry.body = (await response.body()).toString('utf8');
        } catch {
          // Redirect responses have no body; a finished request of an earlier page may have none kept.
        }
      })(),
    );
  });

  return {
    async settle() {
      // A read can start while earlier ones are awaited, so wait until none was added.
      let count = -1;
      while (count !== pending.length) {
        count = pending.length;
        await Promise.all(pending);
      }
      return entries;
    },
  };
}
