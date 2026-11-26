// EZD-1997 (AC-EZD-1997-1; audit F6): the appraiser read takes its user channel through the deferred Realtime
// loader. A given channel (tests) is used as is; a failed download fails the read; a cancel during the download
// (unmount or a newer read) never takes a channel.
import { describe, expect, it } from 'vitest';
import { openReadChannel, type ReadChannel } from './read-channel';

const fakeChannel = {} as ReadChannel;

function hubLoader() {
  let users = 0;
  let resolve: () => void = () => {};
  let reject: () => void = () => {};
  const load = () =>
    new Promise<{ user(): ReadChannel }>((res, rej) => {
      resolve = () =>
        res({
          user: () => {
            users++;
            return fakeChannel;
          },
        });
      reject = () => rej(new Error('chunk_failed'));
    });
  return { load, resolve: () => resolve(), reject: () => reject(), users: () => users };
}

describe('EZD-1997 openReadChannel', () => {
  it('a given channel is used without downloading anything', async () => {
    let loads = 0;
    const got = await openReadChannel(
      () => fakeChannel,
      () => {
        loads++;
        return Promise.reject(new Error('unused'));
      },
      () => {},
    );
    expect(got).toBe(fakeChannel);
    expect(loads).toBe(0);
  });

  it('takes the user channel once the hub has loaded and clears the cancel', async () => {
    const h = hubLoader();
    const stops: Array<(() => void) | null> = [];
    const pending = openReadChannel(undefined, h.load, (s) => stops.push(s));
    expect(typeof stops[0]).toBe('function');
    h.resolve();
    expect(await pending).toBe(fakeChannel);
    expect(h.users()).toBe(1);
    expect(stops[stops.length - 1]).toBe(null);
  });

  it('a failed download is a failed read', async () => {
    const h = hubLoader();
    const pending = openReadChannel(undefined, h.load, () => {});
    h.reject();
    expect(await pending).toBe('failed');
    expect(h.users()).toBe(0);
  });

  it('a cancel while the download runs never takes a channel', async () => {
    const h = hubLoader();
    let stop: (() => void) | null = null;
    const pending = openReadChannel(undefined, h.load, (s) => {
      stop = s;
    });
    (stop as unknown as () => void)();
    h.resolve();
    expect(await pending).toBe('cancelled');
    expect(h.users()).toBe(0);
  });
});
