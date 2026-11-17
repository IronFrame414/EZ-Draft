// EZD-307 (AC-EZD-307-2; S02 Show 3D mesh): every mesh load reads a fresh signed link, so a link that expired while
// the review was open (900 s, SIGNED_DOWNLOAD_SECONDS) does not keep Show 3D mesh failing. Storage refuses an
// expired link (400); the GLB is the synthetic fixture (triangleCount from its expected JSON).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { fetchGlb } from '../../lazy/mesh-view';
import { loadMesh, readMeshUrl } from './mesh-source';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GLB = path.join(repo, 'fixtures/synthetic/room-12x10-sloped.glb');
const expected = JSON.parse(readFileSync(`${GLB}.expected.json`, 'utf8'));
const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const OLD = 'https://storage.example.test/sign/sources/mesh.glb?token=old';
const NEW = 'https://storage.example.test/sign/sources/mesh.glb?token=new';

describe('EZD-307 Show 3D mesh link', () => {
  it('reads the current link from the review route on each call', async () => {
    const links = [OLD, NEW];
    const api = vi.fn(async () => Response.json({ review: { meshUrl: links.shift() } }));
    expect(await readMeshUrl(P, J, api)).toBe(OLD);
    expect(await readMeshUrl(P, J, api)).toBe(NEW);
    expect(api).toHaveBeenCalledWith(`/api/projects/${P}/imports/${J}`, expect.anything());
    const none = vi.fn(async () => Response.json({ review: { meshUrl: null } }));
    expect(await readMeshUrl(P, J, none)).toBeNull();
    const gone = vi.fn(async () => new Response('{}', { status: 404 }));
    await expect(readMeshUrl(P, J, gone)).rejects.toThrow();
  });

  it('a refused (expired) link fails the load, and the retry succeeds with a new link', async () => {
    const links = [OLD, NEW];
    const meshUrl = vi.fn(async () => links.shift() ?? null);
    const storage = async (url: string | URL | Request) =>
      String(url) === NEW
        ? new Response(readFileSync(GLB))
        : new Response('{"error":"InvalidJWT"}', { status: 400 });
    const glb = (url: string) => fetchGlb(url, storage as typeof fetch);
    await expect(loadMesh({ meshUrl, fetchGlb: glb })).rejects.toThrow();
    const mesh = await loadMesh({ meshUrl, fetchGlb: glb });
    expect(mesh.triangleCount).toBe(expected.triangleCount);
    expect(meshUrl).toHaveBeenCalledTimes(2);
  });

  it('fails when the import has no mesh any more', async () => {
    await expect(
      loadMesh({
        meshUrl: async () => null,
        fetchGlb: async () => Promise.reject(new Error('unused')),
      }),
    ).rejects.toThrow('no mesh');
  });
});
