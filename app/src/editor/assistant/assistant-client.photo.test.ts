// EZD-5603b T7 (vault/plans/EZD-5603b.md section 3 C1, section 4; AC-EZD-5603-8). With a photo the FormData
// holds `request` then `photo`, the photo a File named photo.jpg of type image/jpeg. The fetch is a stub.
import { describe, expect, it, vi } from 'vitest';
import { postAssistantPrompt } from './assistant-client';

const INPUT = {
  prompt: 'add a door',
  history: [] as { role: 'user' | 'assistant'; text: string }[],
  model: 'sonnet' as const,
  floorId: 'f-1',
  selectedIds: [] as string[],
};

describe('EZD-5603b assistant-client photo', () => {
  it('T7 the photo part is a File named photo.jpg after the request part', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await postAssistantPrompt('p-1', INPUT, {
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      photo: new Blob(['abc'], { type: 'image/jpeg' }),
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(['request', 'photo']);
    const photo = form.get('photo');
    expect(photo).toBeInstanceOf(File);
    expect((photo as File).name).toBe('photo.jpg');
    expect((photo as File).type).toBe('image/jpeg');
    expect(await (photo as File).text()).toBe('abc');
  });
});
