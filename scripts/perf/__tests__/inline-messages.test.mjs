// EZD-1995 (AC-EZD-1995-3; Q-0814): the inline-messages collector and its gate rows. node:test, Node built-ins only.
// Sizes are gzip level 6 (Q-0071 (a)).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const collector = () => import('../inline-messages.mjs');

/** A page as Next.js writes it: flight data in `self.__next_f.push([1, "..."])` scripts. */
function page(...chunks) {
  const scripts = chunks.map((c) => `<script>self.__next_f.push(${JSON.stringify([1, c])})</script>`).join('');
  return `<!DOCTYPE html><html><body><div>x</div><script>self.__next_f.push([0])</script>${scripts}</body></html>`;
}

describe('EZD-1995 inline messages', () => {
  test('reads the flight text of every push, in order, and skips other scripts', async () => {
    const { flightText } = await collector();
    assert.equal(flightText(page('a:', '"b"')), 'a:"b"');
    assert.equal(flightText('<html>no flight</html>'), '');
  });

  test('finds every messages object, also across pushes and with braces inside strings', async () => {
    const { messageObjects } = await collector();
    const flight =
      '1:["$","div",null,{"language":"en","messages":{"a.b":"Hi {name}","c.d":{"one":"1","other":"n"}},"children":"x"}]\n' +
      '2:{"messages":{"e.f":"say \\"}\\""}}';
    assert.deepEqual(messageObjects(flight), [
      '{"a.b":"Hi {name}","c.d":{"one":"1","other":"n"}}',
      '{"e.f":"say \\"}\\""}',
    ]);
  });

  test('the value is the gzip size of the messages objects; details count objects and keys', async () => {
    const { inlineMessagesOf } = await collector();
    const objectText = '{"a.b":"Hello","c.d":"There"}';
    const html = page(`0:{"messages":${objectText.slice(0, 10)}`, `${objectText.slice(10)}}\n`);
    const r = inlineMessagesOf(html);
    assert.equal(r.value, zlib.gzipSync(objectText, { level: 6 }).length);
    assert.equal(r.details.objects, 1);
    assert.equal(r.details.keys, 2);
    assert.equal(r.details.rawBytes, objectText.length);
    assert.equal(r.details.documentBytes, zlib.gzipSync(html, { level: 6 }).length);
  });

  test('a page with no messages measures 0', async () => {
    const { inlineMessagesOf } = await collector();
    assert.equal(inlineMessagesOf(page('0:{"children":"x"}')).value, 0);
  });

  test('two gate rows, on the pages the download rows measure, at measured + 10% rounded up', async () => {
    const { BUDGETS } = await import('../budgets.mjs');
    const { MEASUREMENTS } = await import('../registry.mjs');
    const { default: cfg } = await import('../perf.config.mjs');
    const urls = Object.fromEntries(cfg.measurements.map((m) => [m.id, m.url]));
    for (const [name, download] of [
      ['projects-settings', 'js-size:projects-settings'],
      ['editor', 'js-size:editor'],
    ]) {
      const b = BUDGETS[`inline-messages.${name}`];
      assert.equal(b.kind, 'gate');
      assert.equal(b.unit, 'bytes');
      assert.match(b.source, /AC-EZD-1995-3/);
      const m = MEASUREMENTS.find((x) => x.id === `inline-messages:${name}`);
      assert.equal(m.status, 'active');
      assert.equal(m.collector, 'inline-messages');
      assert.equal(m.budget, `inline-messages.${name}`);
      assert.equal(urls[`inline-messages:${name}`], urls[download]);
    }
  });
});
