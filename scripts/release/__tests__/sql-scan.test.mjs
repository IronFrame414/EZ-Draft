// EZD-023a (vault/plans/EZD-023a.md Step 3, section 3): the SQL scan functions behind T4, T5, T6 and T10.
// node:test, Node 22 built-ins only. Expected values come from Step 3 and the T4/T5/T10 rows.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../sql-scan.mjs');

describe('EZD-023a sql scan', () => {
  test('EZD-023a T5 stripComments and splitStatements keep literals and dollar bodies (Step 3)', async () => {
    const { stripComments, splitStatements } = await load();
    const sql = `-- drop column legacy_note\n/* drop table fixture_item */\nselect 1;`;
    assert.equal(stripComments(sql).trim(), 'select 1;');
    const kept = `select '-- not a comment'; select $$ /* kept */ $$;`;
    const stripped = stripComments(kept);
    assert.ok(stripped.includes('-- not a comment'), 'string literal kept');
    assert.ok(stripped.includes('/* kept */'), 'dollar body kept');

    const stmts = splitStatements(
      `create function f() returns void language plpgsql as $$ begin select 1; select 2; end $$; select ';'; select "a;b" from t; do $x$ select 1; $x$;`,
    );
    assert.equal(stmts.length, 4, 'four statements: quotes and dollar bodies are not split');
    assert.ok(stmts[0].includes('select 1; select 2;'));
    assert.ok(stmts[1].includes("';'"));
    assert.ok(stmts[2].includes('"a;b"'));
    assert.ok(stmts[3].includes('$x$ select 1; $x$'));
  });

  test('EZD-023a T4 findDestructive: drops and renames, qualified and lower-cased (Step 3)', async () => {
    const { findDestructive } = await load();
    const cases = [
      ['alter table fixture_item drop column legacy_note', [['column', 'public.fixture_item.legacy_note']]],
      ['ALTER TABLE "public"."fixture_item" DROP "legacy_note"', [['column', 'public.fixture_item.legacy_note']]],
      [
        'alter table if exists only public.fixture_item drop column if exists legacy_note',
        [['column', 'public.fixture_item.legacy_note']],
      ],
      ['alter table fixture_item rename column legacy_note to note', [['column', 'public.fixture_item.legacy_note']]],
      ['alter table fixture_item rename legacy_note to note', [['column', 'public.fixture_item.legacy_note']]],
      ['alter table fixture_item rename to item', [['table', 'public.fixture_item']]],
      ['drop table public.fixture_item', [['table', 'public.fixture_item']]],
      ['drop view fixture_view', [['view', 'public.fixture_view']]],
      ['drop function public.health()', [['function', 'public.health']]],
      ["alter type fixture_kind rename value 'a' to 'c'", [['type', 'public.fixture_kind']]],
      ['alter table fixture_item set schema extra', [['table', 'public.fixture_item']]],
      ['drop schema extra', [['schema', 'extra']]],
      [
        'drop table fixture_item, other_table',
        [
          ['table', 'public.fixture_item'],
          ['table', 'public.other_table'],
        ],
      ],
      ['drop materialized view public.mv', [['materialized_view', 'public.mv']]],
      ['drop sequence s1', [['sequence', 'public.s1']]],
      [
        'alter table fixture_item drop column a, drop b, rename c to d, add column e int',
        [
          ['column', 'public.fixture_item.a'],
          ['column', 'public.fixture_item.b'],
          ['column', 'public.fixture_item.c'],
        ],
      ],
    ];
    for (const [stmt, expected] of cases) {
      const got = findDestructive(stmt).map((o) => [o.kind, o.name]);
      assert.deepEqual(got, expected, stmt);
    }
  });

  test('EZD-023a T5 findDestructive: indexes, triggers, policies and constraints are not destructive (Step 3)', async () => {
    const { findDestructive } = await load();
    const clean = [
      'drop index fixture_item_idx',
      'drop policy p on fixture_item',
      'alter table fixture_item drop constraint fixture_item_check, add constraint fixture_item_check check (true)',
      'alter table fixture_item alter column legacy_note drop not null',
      'alter table fixture_item alter column legacy_note drop default',
      'drop trigger t on fixture_item',
      'alter index a rename to b',
      'alter table fixture_item rename constraint a to b',
      "create or replace function public.health() returns text language sql as $$ select 'ok' $$",
      'alter table fixture_item add column extra text',
    ];
    for (const stmt of clean) assert.deepEqual(findDestructive(stmt), [], stmt);
  });

  test('EZD-023a T6 findCreated: tables, columns and other objects (Step 3)', async () => {
    const { findCreated } = await load();
    const cases = [
      ['create table public.tmp_x (a int, b int)', [['table', 'public.tmp_x']]],
      ['create table if not exists tmp_x (a int)', [['table', 'public.tmp_x']]],
      ['alter table fixture_item add column temp_c text', [['column', 'public.fixture_item.temp_c']]],
      ['alter table fixture_item add if not exists temp_c text', [['column', 'public.fixture_item.temp_c']]],
      ['create or replace view v as select 1', [['view', 'public.v']]],
      ['create schema extra', [['schema', 'extra']]],
      ["create function public.health() returns text language sql as $$ select 'ok' $$", [['function', 'public.health']]],
      ['drop table tmp_x', []],
    ];
    for (const [stmt, expected] of cases) {
      assert.deepEqual(
        findCreated(stmt).map((o) => [o.kind, o.name]),
        expected,
        stmt,
      );
    }
  });

  test('EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)', async () => {
    const { findUnverifiable } = await load();
    assert.deepEqual(
      findUnverifiable('drop table tmp_y cascade').map((u) => u.reason),
      ['cascade'],
    );
    assert.deepEqual(
      findUnverifiable("do $$ begin execute 'drop table fixture_item'; end $$").map((u) => u.reason),
      ['dynamic'],
    );
    assert.deepEqual(
      findUnverifiable(
        'create function f() returns void language plpgsql as $$ begin alter table fixture_item drop column legacy_note; end $$',
      ).map((u) => u.reason),
      ['dynamic'],
    );
    assert.deepEqual(findUnverifiable('drop table tmp_y'), []);
    assert.deepEqual(findUnverifiable("select 'nothing to see'"), []);
    assert.deepEqual(findUnverifiable('alter table fixture_item add column extra text'), []);
  });
});
