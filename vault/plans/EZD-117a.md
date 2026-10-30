# EZD-117a · Projects page: query and cards

- **ACs:** AC-EZD-117a-1, AC-EZD-117a-2, AC-EZD-117a-3, AC-EZD-117a-4, AC-EZD-117a-5, AC-EZD-117a-6, AC-EZD-117a-7
- **Complexity:** high
- **Areas:** ui, migrations, security, testing, data-model
- **User-visible result:** after sign-in Josh sees Projects: status tabs with counts, a sort menu and 4-column project cards that load 48 at a time as he scrolls.
- Phase: 2 · Planned by: planner · Date: 2026-10-29 · Status: planned

## 1. What to build

Data: no table or column. Two `security invoker` SQL functions over `public.project` (RLS = tenant and listed scope, 03b rule 1; ARCH Permission enforcement) and `public.customer` (ARCH Customers). No money field. Text run on the pinned local stack inside a rolled-back transaction on 2026-10-29 (L-009): 200 seeded rows gave counts 200/40×5, page 1 = 48 items, five `status` pages = 200 distinct ids, unknown sort = `{"items": [], "next": null}`.

M1 `list_projects` (copy verbatim):
```sql
create function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at,
      c.name as client_name,
      (c.name is null) as client_missing,
      left(lower(coalesce(c.name, '')), 500) as client_key,
      left(lower(p.name), 500) as name_key,
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    where p.archived_at is null
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (p_status is null or p.status = p_status)
  ),
  after_cursor as (
    select b.* from base b
    where p_after is null or case p_sort
      when 'edited' then (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
      when 'name' then (b.name_key, b.id) > (p_after ->> 'n', (p_after ->> 'id')::uuid)
      when 'client' then (b.client_missing, b.client_key, b.id) > ((p_after ->> 'm')::boolean, p_after ->> 'c', (p_after ->> 'id')::uuid)
      when 'status' then b.status_rank > (p_after ->> 'r')::integer
        or (b.status_rank = (p_after ->> 'r')::integer and (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid))
      when 'open_items' then (b.open_items_count, b.updated_at, b.id) < ((p_after ->> 'o')::integer, (p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
    end
  ),
  ranked as (
    select a.*, row_number() over (order by
      case when p_sort = 'name' then a.name_key end asc,
      case when p_sort = 'client' then a.client_missing end asc,
      case when p_sort = 'client' then a.client_key end asc,
      case when p_sort = 'status' then a.status_rank end asc,
      case when p_sort = 'open_items' then a.open_items_count end desc,
      case when p_sort in ('edited', 'status', 'open_items') then a.updated_at end desc,
      case when p_sort in ('name', 'client') then a.id end asc,
      case when p_sort in ('edited', 'status', 'open_items') then a.id end desc) as rn
    from after_cursor a
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'clientName', r.client_name, 'address', r.address,
        'status', r.status, 'openItems', r.open_items_count)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb) to authenticated;
```
M2 `count_projects` (copy verbatim):
```sql
create function public.count_projects()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'all', count(*),
    'draft', count(*) filter (where p.status = 'draft'),
    'client_review', count(*) filter (where p.status = 'client_review'),
    'permit_submitted', count(*) filter (where p.status = 'permit_submitted'),
    'approved', count(*) filter (where p.status = 'approved'),
    'in_build', count(*) filter (where p.status = 'in_build'))
  from public.project p
  where p.archived_at is null;
$$;
revoke all on function public.count_projects() from public, anon, service_role;
grant execute on function public.count_projects() to authenticated;
```

### Build steps
| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |
| --- | --- | --- | --- | --- | --- |
| 1 | `supabase/migrations/<ts>_create_list_projects.sql` (`pnpm supabase migration new create_list_projects` at build time, so `<ts>` is newer than develop's newest file) | new | M1, header comment citing this plan | `supabase/migrations/20261026233829_create_list_customers.sql` | `pnpm db:up`; D4, D5 |
| 2 | `supabase/migrations/<ts>_create_count_projects.sql` (`pnpm supabase migration new create_count_projects`) | new | M2 | same | D1 |
| 3 | `app/src/server/db/database.types.ts` | regenerate | `pnpm db:types` | ARCH Local database | `node scripts/db/gen-types.mjs --check` |
| 4 | `app/src/lib/projects/projects.ts` | new | `PROJECT_PAGE_SIZE = 48`; `PROJECT_STATUSES = ['draft','client_review','permit_submitted','approved','in_build'] as const`; `type ProjectStatus`; `PROJECT_TABS = ['all', ...PROJECT_STATUSES] as const`; `type ProjectTab`; `PROJECT_SORTS = ['edited','name','client','status','open_items'] as const`; `type ProjectSort`; `DEFAULT_PROJECT_SORT: ProjectSort = 'edited'`; `type ProjectSummary = { id: string; name: string; clientName: string \| null; address: string; status: ProjectStatus; openItems: number }`; `type ProjectPage = { items: ProjectSummary[]; next: string \| null }`; `type ProjectCounts = Record<ProjectTab, number>`; `projectsUrl(q: { tab: ProjectTab; sort: ProjectSort; after: string \| null }): string` | `app/src/lib/customers/customers.ts` | U3 |
| 5 | `app/src/server/projects/projects.ts` | new | `type ProjectCursor = { id: string; u: string; n: string; m: boolean; c: string; r: number; o: number }`; `type ProjectListQuery = { tab: ProjectTab; sort: ProjectSort; after: ProjectCursor \| null }`; `encodeCursor(c: ProjectCursor): string`; `decodeCursor(s: string): ProjectCursor \| null`; `parseProjectListQuery(params: URLSearchParams): ProjectListQuery \| null`; `listProjects(client: SupabaseClient<Database>, q: ProjectListQuery): Promise<ProjectPage>`; `countProjects(client: SupabaseClient<Database>): Promise<ProjectCounts>` | `app/src/server/customers/customers.ts` (`parseListQuery`, `listCustomers`) | U1, U2, D1–D6 |
| 6 | `app/src/app/api/projects/route.ts` | new | `GET(request: Request): Promise<Response>`; `dynamic = 'force-dynamic'` | `app/src/app/api/settings/customers/route.ts` GET | R1, R3 |
| 7 | `app/src/app/api/projects/counts/route.ts` | new | `GET(): Promise<Response>`; `dynamic = 'force-dynamic'` | same | R2, R3 |
| 8 | `app/src/lib/projects/projects-store.ts` | new | `type ProjectListApi`, `type ProjectListState`, `type ProjectListStore`, `createProjectListStore(api: ProjectListApi): ProjectListStore`, `projectHttpApi: ProjectListApi` (section 3) | `app/src/lib/permissions/permission-store.ts` | U3–U6 |
| 9 | icon `sort`: `app/src/components/icon/svg/sort.svg`, `icons.json`, `icon-names.generated.ts`, `app/public/icons/sprite.svg` | new / change | name `sort`: `pnpm --filter @ezdraft/app icons:fetch sort`, add `"sort"` to `icons.json` in sorted order, `pnpm --filter @ezdraft/app icons:build` | ARCH Design tokens, fonts and icons ("To add an icon"); upstream file has `viewBox="0 -960 960 960"` (fetched 2026-10-29) | `icons.test.ts` T8; E2 |
| 10 | `app/src/server/messages/catalogs/en.ts` | change | the `office.projects.*` keys of section 6 and Decided "Strings" | existing `office.customers.*` block | U7, U8 |
| 11 | `app/src/components/projects/Projects.module.css` | new | classes of Decided "CSS" | `app/src/components/settings/company/Customers.module.css` (colors, radii, shadow and fonts as tokens; spacing and sizes plain px; no `composes` from shell) | B5 |
| 12 | `app/src/components/projects/ProjectCard.tsx` | new | `ProjectCard(props: { project: ProjectSummary }): ReactElement` | `CustomersPanel.tsx` row markup | U7 |
| 13 | `app/src/components/projects/ProjectsView.tsx` | new, `'use client'` | `ProjectsBoard(props: ProjectsBoardProps)`, `ProjectsView(props: { actions?: ReactNode })`, `ProjectsNoAccessView(props: { actions?: ReactNode })`, `type ProjectsBoardProps` (section 3) | `app/src/components/settings/company/CustomersPanel.tsx`; Radix import as in `CustomerDialog.tsx` | U8, B1–B8 |
| 14 | `app/src/app/(office)/page.tsx` new; `app/src/app/page.tsx` deleted (same commit) | new / delete | default `ProjectsPage(): Promise<ReactElement>` | `app/src/app/page.tsx`; `app/src/server/settings/settings-root.tsx` | B1, B8, U6 of EZD-136 (E1) |
| 15 | `docs/architecture.md` | change | new `### Projects page (EZD-117a)` after `### Customers (EZD-113)` (functions, routes, cursor, store, testids, Sign out stand-in); EZD-020 bullet "`/` stays EZD-007's …" → "`/` is Projects (`app/src/app/(office)/page.tsx`, EZD-117a)"; Disclaimer "Where" `/` → "Projects page, after `main`"; `home.module.css` now serves `not-found.tsx` only | existing subsections | review |

### Decided for the builder
| Choice | Decision | Source |
| --- | --- | --- |
| Route of the page | `/`, file `app/src/app/(office)/page.tsx`; delete `app/src/app/page.tsx` | ARCH Entry points (EZD-020 table: EZD-117a `/`); EZD-110 D2 stores `/` |
| Page server part | Imports (relative from the file): `connection` from `next/server`; `requireSession` `server/auth/session`; `getPermissionContext`, `can` `server/permissions`; `reportError` `server/errors/report`; `catalogFor` `server/messages/catalog`; `MessagesProvider` `lib/messages`; `StateHost` `components/states/StateHost`; `Disclaimer` `components/disclaimer/Disclaimer`; `SignOutButton` `components/auth/SignOutButton`; `ProjectsView`, `ProjectsNoAccessView` `components/projects/ProjectsView`; styles `components/projects/Projects.module.css`. Body: `await connection(); await requireSession();` then `allowed = can(await getPermissionContext(), 'view_projects')`; a thrown load → `await reportError(e, { source: 'function', location: 'projects.page' })` and `allowed = true` (the routes then answer). Render `MessagesProvider language="en" messages={catalogFor('office','en')}` > `StateHost` > `<div className={styles.page}>` { allowed ? `<ProjectsView actions={<SignOutButton />} />` : `<ProjectsNoAccessView actions={<SignOutButton />} />` } `<Disclaimer placement="page" />` `</div>` | S01 Permissions; ARCH Permission enforcement ("No access in place"); ARCH State components; ARCH Disclaimer ("Every page"); ARCH Errors and logging |
| Sign out stand-in | The existing `SignOutButton` (`data-testid="sign-out"`) sits at the right end of the title row in both views until EZD-117b mounts EZD-108's `AvatarMenu`; EZD-117b removes it and edits the specs that click `sign-out` | `app/e2e/sign-in.spec.ts`, `password-sign-in.spec.ts`, `harness.spec.ts`, `gate-secret.spec.ts` rely on it; EZD-108 Decided "Where the menu shows" |
| Editor code | Nothing under `app/src/components/shell/` is imported (it is `EDITOR_CODE`); card and button styles are written in `Projects.module.css` with tokens | `eslint-rules/boundaries.mjs` `EDITOR_CODE`, `ENTRY_RULES.office`; B3 |
| Data requests | Load = exactly `GET /api/projects?status=all&sort=edited` and `GET /api/projects/counts`, in parallel; scrolling = `GET /api/projects?...&after=` only; tab or sort change = one `GET /api/projects` (counts unchanged); no per-card request; thumbnail is CSS only | ticket Scope; AC-2, AC-3; Q-0402 (counts follow search only, EZD-117b); Q-0403 (empty thumbnail) |
| Query params | `status` ∈ `PROJECT_TABS` (absent → `all`), `sort` ∈ `PROJECT_SORTS` (absent → `edited`), `after` = cursor (absent → none); any other value or `status=`/`sort=` empty → 400 `invalid_input`; unknown param names ignored | ARCH Errors and logging (400) |
| `projectsUrl` | `/api/projects?status=<tab>&sort=<sort>` plus `&after=<after>` when `after` is not null (cursor chars are `[A-Za-z0-9_-]`, no encoding needed) | this plan |
| Cursor | `encodeCursor` = `Buffer.from(JSON.stringify(c)).toString('base64url')`; `decodeCursor`: null when `s.length > 4000` or not `/^[A-Za-z0-9_-]+$/`, when `JSON.parse` throws, or when `z.strictObject({ id: z.uuid(), u: z.iso.datetime({ offset: true }), n: z.string().max(1000), m: z.boolean(), c: z.string().max(1000), r: z.number().int().min(1).max(5), o: z.number().int().min(0) })` fails. Opaque to the browser | M1 `next`; zod 4.6.7 accepts `+00:00` and 6-digit fractions (checked 2026-10-29) |
| `listProjects` | one `client.rpc('list_projects', { p_sort, p_status?: tab (omitted for `all`), p_after?: cursor object (omitted when null) })`, never `.from()`; error → throw it; result parsed with `z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), clientName: z.string().nullable(), address: z.string(), status: z.enum(PROJECT_STATUSES), openItems: z.number().int().nonnegative() })), next: <cursor schema>.nullable() })`, failure → `throw new Error('list_projects_bad_result')`; returns `{ items, next: next === null ? null : encodeCursor(next) }` | `listCustomers` pattern |
| `countProjects` | one `client.rpc('count_projects')`; `z.strictObject` of the six `PROJECT_TABS` keys, each `z.number().int().nonnegative()`; failure → `throw new Error('count_projects_bad_result')` | same |
| Routes | Order: `requireApiPermission('view_projects')` (401/403 as EZD-102), parse (400 `invalid_input` / `error.invalid_input`), rpc through `createSessionClient()`; 200 body `ProjectPage` or `ProjectCounts`; catch → `await reportRouteFailure(e, ROUTE)` and 500 `db_unavailable` / `error.db_unavailable`; every response `Cache-Control: no-store`. `ROUTE` = `/api/projects`, `/api/projects/counts` | customers route; ARCH Errors and logging; EZD-110 D8 (`view_projects`) |
| Visible projects | RLS only (tenant claim; scope `listed` sees `membership_project` rows); archived (`archived_at` set) never listed or counted | 03b rule 1; Q-0202; ARCH Permission enforcement; S01 Card overflow menu "Archive hides from default list"; Q-0201 |
| Client shown | `customer.name` through `project.customer_id`; `project.client_name` is not read (customers are the one client list; a renamed customer shows its new name) | ARCH Customers "Project link"; Q-0190; Q-0400; S01 Decisions (clients from the customer list) |
| Sort orders | `edited`: `updated_at` desc, `id` desc · `name`: `lower(name)` asc, `id` asc · `client`: projects with a client first, `lower(client)` asc, `id` asc · `status`: Draft, Client review, Permit submitted, Approved, In build, then `updated_at` desc, `id` desc · `open_items`: `open_items_count` desc, `updated_at` desc, `id` desc. Text keys compare their first 500 lower-case characters | Q-0403 ("sort order … settled in the plans"); S01 Decisions (status list order); M1 |
| Paging | keyset (no offset), 48 per page; `next` null on the last page | ticket Scope; 11 rule 9 |
| Store | Initial `{ status: 'loading', tab: 'all', sort: 'edited', items: [], next: null, moreStatus: 'idle', counts: null, countsStatus: 'loading' }`. `start()`: no-op while started; else (fresh or after `dispose()`) fetches page `{all|tab, sort, null}` and counts in parallel. `setTab(t)` / `setSort(s)`: same value → no-op; else abort page and more loads, set `{ tab|sort, status: 'loading', items: [], next: null, moreStatus: 'idle' }`, fetch page 1. `loadMore()`: only when `status === 'ready'`, `next !== null` and `moreStatus !== 'loading'`; appends items whose `id` is not already listed; sets `next`. Success: page → `status 'ready'`; counts → `countsStatus 'ready'`. Failure: page → `status 'error'`; more → `moreStatus 'error'`; counts → `countsStatus 'error'`. An `AbortError` changes nothing; a response from an older load (sequence number) is dropped. `dispose()` aborts all. Every change replaces the state object and calls subscribers once | ARCH State components (loading/error states are EZD-117b's); `permission-store.ts` pattern |
| `projectHttpApi` | `fetch(projectsUrl(q), { cache: 'no-store', credentials: 'same-origin', signal })`, non-200 → `throw new Error('projects_load_failed')`; counts `fetch('/api/projects/counts', same)`, non-200 → `throw new Error('project_counts_load_failed')` | `CustomersPanel.tsx` |
| Client imports | `ProjectsView.tsx` / `ProjectCard.tsx`: `useT` from `lib/messages`; `NoAccess` from `components/states`; `Icon` from `components/icon/Icon`; `DropdownMenu` from `radix-ui`; store and types from `lib/projects/*`. Routes: `requireApiPermission` `server/permissions`; `createSessionClient` `server/auth/supabase-server`; `reportRouteFailure` `server/errors/route-failure` | `settings-root.tsx`; customers route; `CustomersPanel.tsx` |
| View wiring | `ProjectsView`: `const [store] = useState(() => createProjectListStore(projectHttpApi))`; `useEffect(() => { store.start(); return () => store.dispose(); }, [store])`; state via `useSyncExternalStore(store.subscribe, store.get, store.get)`; renders `ProjectsBoard` | EZD-102 `useCan` pattern |
| Board markup | `<main className={styles.main}>` > title row (`h1` `projects-title`, tabs group, `span.spacer`, sort menu, `actions`) > grid > sentinel. Grid `aria-busy={status === 'loading'}`; cards rendered only when `status === 'ready'`. With `status` `loading` or `error`, or 0 items, the grid is empty and nothing else renders (no message, no extra testid; `data-state` carries the status); skeletons, error banner and empty texts are EZD-117b's | S01 Layout; board S01 |
| Tabs | `div role="group" aria-label=t('office.projects.status_label')` with six `button type="button"` in `PROJECT_TABS` order, `aria-pressed`; label `t('office.projects.status.<tab>')`, then `span.count` = `counts[tab]` only when `counts !== null` | S01 Controls; Q-0402 |
| Sort menu | `DropdownMenu` from `radix-ui`: Trigger `asChild` `button.sortButton`, `aria-label=t('office.projects.sort_label', { sort: label })`, children `<Icon name="sort" size={18} />` + label; `Portal` > `Content align="end" sideOffset={8}` > `RadioGroup value={sort}` (`onValueChange` passes only a `PROJECT_SORTS` value) > `RadioItem` per sort, text `t('office.projects.sort.<sort>')`. No check icon | S01 Controls (sort options; button shows current sort); board S01 `.b` |
| Card | `article.card` > `div.thumb` (`aria-hidden`, empty) + body: `.top` (`h2.name`, `span.pill` = status label) · `span.place` = `t('office.projects.card.place', { client, address })`, or the address when `clientName` is null · `.bottom` (`span.version` = `working_copy`; `span.open` = `span.dot` + `to_review` with `count` when n > 0, else `nothing_to_review`). Testids and attributes per section 3. No `<a>`, `href`, `role`, `tabIndex` or click handler | S01 Controls, Data shown; AC-4; Q-0394; Q-0403 |
| Scroll loading | Sentinel `div.more` (`aria-hidden`) rendered when `status === 'ready' && next !== null`; one `IntersectionObserver` per mounted sentinel, `rootMargin: '0px 0px 400px 0px'`; on intersect → `onMore()`; it keeps an "in view" ref, and after each change of `items.length` or `moreStatus` calls `onMore()` again when in view and `moreStatus === 'idle'` | AC-3 |
| No-access view | `ProjectsNoAccessView`: `main` > title row (`h1`, spacer, `actions`) > `NoAccess` (from `app/src/components/states`) | Q-0403 (Q-0214 text); EZD-102 |
| Strings | Office, `en` only: `office.projects.title` "Projects"; `office.projects.status.{all,draft,client_review,permit_submitted,approved,in_build}` "All", "Draft", "Client review", "Permit submitted", "Approved", "In build"; `office.projects.sort.{edited,name,client,status,open_items}` "Last edited", "Name", "Client", "Status", "Open items"; `office.projects.card.working_copy` "Working copy"; `office.projects.card.to_review` "{count} to review"; `office.projects.card.nothing_to_review` "Nothing to review"; `office.projects.card.place` "{client} · {address}"; plus section 6 | board S01; S01 Controls, Data shown; ARCH Messages |
| CSS | Colors, radii, shadow and fonts are tokens; spacing and sizes stay plain px (tokens.css has no spacing tokens, L-013). Fonts: `var(--ez-font-sans)` and `var(--ez-font-mono)` are set on `<html>` by the root layout from `app/src/styles/fonts.ts` (ARCH Design tokens, fonts and icons). Copy the declarations of the board S01 `<style>` classes, with `font: … 'Instrument Sans'` → `var(--ez-font-sans)`, mono → `var(--ez-font-mono)` and colors → tokens (`#fff` `--ez-surface`, `#14171c` `--ez-ink`, `#5e6672` `--ez-slate-500`, `#9aa3af` `--ez-slate-300`, `#dfe2e6` `--ez-border`, `#c9ced5` `--ez-border-hover`, `#eef0f3` `--ez-divider`, `#f2f4f7` `--ez-hover`, `#f6f7f9` `--ez-canvas`, `#e6e9ed` `--ez-canvas-grid`, `#eef1ff` `--ez-cobalt-tint`, `oklch(0.45 0.17 262)` `--ez-cobalt-text`, `oklch(0.96 0.04 80)` `--ez-amber-tint`, `oklch(0.48 0.13 65)` `--ez-amber-text`, `oklch(0.72 0.16 65)` `--ez-amber`, `oklch(0.95 0.05 150)` `--ez-green-tint`, `oklch(0.42 0.12 150)` `--ez-green`; radii → `--ez-radius-<n>`, `50%` → `--ez-radius-999`, shadow → `--ez-shadow-card`). Map: `.page` = board root (background, color, font; plus box-sizing border-box, min-height 100vh, flex column) · `.main` = `main` · `.titleRow` = title row div · `.h1` = `h1` · `.tabs` = tabs `.card` (no shadow, radius 10) · `.tab` = `.ft` plus inline-flex, baseline, gap 4px; `.tab[aria-pressed='true']` = `.fton` · `.count` mono · `.spacer` flex 1 · `.sortButton` = `.b` (+ hover) · `.menu` = New project menu `.card` (padding 6px, min-width 200px, z-index 20) · `.menuItem` = `.mi` (`[data-highlighted]` = `.mi:hover`; `[data-state='checked']` `--ez-cobalt-text`, 600) · `.grid` = grid div · `.card` = `.card.pc` without `:hover` · `.thumb` = `.th` (no svg) · `.body`, `.top`, `.place`, `.bottom` = the card's inner divs and spans · `.name` 15px/600, margin 0 · `.pill` = `.pill`, colors by `[data-status]` from `renderVals` `st` · `.version` mono · `.open` gap 5px, 500, `--ez-slate-300`; `[data-has-items='true']` `--ez-amber-text` · `.dot` 7px circle `--ez-border`, `--ez-amber` inside `[data-has-items='true']` (`openColor`, `openDot`) · `.more` height 1px | `vault/mockups/html/project/S01Projects.dc.html`; `app/src/styles/tokens.css` (L-013) |

### Do not touch
`app/src/app/home.module.css` (`not-found.tsx` uses it; EZD-136 U5 reads it) · `app/src/components/shell/**` · `SignOutButton.tsx` · `scripts/perf/*` (`projects-first-cards-ms` stays `pending`, owner EZD-117b: the perf runner has no Supabase env, so cannot open a signed-in page) · `eslint-rules/*` · existing migrations · the four sign-out specs · `scripts/tooling/__tests__/messages-lint.test.mjs` (virtual `app/src/app/page.tsx` path).

Ticket row (phase-01.md): Scope: Uses the project table from EZD-005; one card query with no per-card requests, 48 cards per page with more loaded on scroll, tab counts from one grouped count; status tabs with counts; sort menu (Last edited, Name, Client, Status, Open items); 4-column cards with thumbnail slot, status pill colors, version label, open items. / Done when: Every tab count is correct; with 200 seeded projects the page makes two data requests, shows the first cards within budget and loads no editor code. / Depends on: EZD-102, EZD-110 / Spec ref: S01 Controls, Data shown, States.

## 2. Sources
- Spec: `vault/spec/sections/screens/S01-projects.md` (Purpose, Permissions, Layout, Controls, Data shown, States, Decisions); `03b-architecture-rules.md` rules 1, 9; `03c-tables.md` project; `04-app-shell-and-global-ui.md` (Projects is a separate page); `11-non-functional-requirements.md` Budgets (Projects page 1 s; download size 200 KB), rules 7, 9, 13; `00c-glossary-phase-02.md` (Status tab, Working copy, Project status); `acceptance-criteria.md` AC-EZD-117a-1…7.
- Decisions (`vault/spec/decisions/05-screens.md`): Q-0394, Q-0402, Q-0401, Q-0201, Q-0199. Answered: Q-0403, Q-0413 (`QUESTIONS-answered.md`), Q-0202, Q-0190, Q-0400, Q-0214 (via EZD-102).
- Mockup: `vault/mockups/S01Projects.png`, `html/project/S01Projects.dc.html` (title row, tabs, sort button, card, pill colors, open-items colors); header, New project menu and EZ Binder link are not this ticket (EZD-117b, EZD-118, Q-0401).
- Code: files in section 1; `supabase/migrations/20261019165203_create_project.sql`, `20261019170006_create_tenancy_policies.sql`, `20261026233827_add_project_customer_id.sql`; `scripts/perf/budgets.mjs` (`download.projects-settings` 200,000 bytes; `projects.first-cards` 1000 ms), `registry.mjs`; `app/test-harness/e2e/{test.ts,traffic.ts}`.
- Dependency contracts: EZD-102 section 3; EZD-110 section 3 (D2 link `/`; bell mounted by EZD-117b); EZD-108 section 3 (`AvatarMenu`, EZD-117b mounts it).
- No research report covers this ticket.

Architecture: Entry points and lazy modules (EZD-020); Entry contents and bundle report (EZD-020); Performance check (EZD-017); Server-only data access and can(); Permission enforcement (EZD-102); Customers (EZD-113); Tenancy tables (EZD-005); Row-level security (EZD-006); Local database; Migrations; State components (EZD-015); Messages and language (t()); Disclaimer (EZD-136); Design tokens, fonts and icons; Browser tests (EZD-016a)

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| SQL | `public.list_projects(p_sort text, p_status text default null, p_after jsonb default null) → jsonb` | M1; `{ items: [{ id, name, clientName, address, status, openItems }], next: { id, u, n, m, c, r, o } \| null }` |
| SQL | `public.count_projects() → jsonb` | M2; `{ all, draft, client_review, permit_submitted, approved, in_build }` |
| module | `app/src/lib/projects/projects.ts` | Step 4 exports |
| module | `app/src/server/projects/projects.ts` | Step 5 exports |
| route | `GET /api/projects?status=&sort=&after=` | 200 `ProjectPage`; 400 `{ error: { code: 'invalid_input', message_key: 'error.invalid_input' } }`; 401 `not_signed_in`; 403 `permission_denied`/`error.not_authorized`; 500 `db_unavailable`/`error.db_unavailable`; `Cache-Control: no-store` |
| route | `GET /api/projects/counts` | 200 `ProjectCounts`; 401; 403; 500; `no-store` |
| store | `ProjectListApi` | `{ fetchPage(q: { tab: ProjectTab; sort: ProjectSort; after: string \| null }, signal: AbortSignal): Promise<ProjectPage>; fetchCounts(signal: AbortSignal): Promise<ProjectCounts> }` |
| store | `ProjectListState` | `{ status: 'loading' \| 'ready' \| 'error'; tab: ProjectTab; sort: ProjectSort; items: ProjectSummary[]; next: string \| null; moreStatus: 'idle' \| 'loading' \| 'error'; counts: ProjectCounts \| null; countsStatus: 'loading' \| 'ready' \| 'error' }` |
| store | `ProjectListStore` | `{ get(): ProjectListState; subscribe(cb: () => void): () => void; start(): void; setTab(tab: ProjectTab): void; setSort(sort: ProjectSort): void; loadMore(): void; dispose(): void }` |
| props | `ProjectsBoardProps` | `{ state: ProjectListState; actions?: ReactNode; onTab(tab: ProjectTab): void; onSort(sort: ProjectSort): void; onMore(): void }` |
| props | `ProjectsView`, `ProjectsNoAccessView` | `{ actions?: ReactNode }` in this ticket only; EZD-117b step 12 replaces them with `ProjectsView({ account; canCreate; onNewProject? })` and `ProjectsNoAccessView({ account })` and removes the Sign out stand-in (P117b section 1) |
| data-testid | page | `projects-title`, `projects-tab-<tab>` (`aria-pressed`), `projects-tab-count`, `projects-sort`, `projects-sort-menu`, `projects-sort-<sort>`, `projects-grid` (`data-state`), `projects-more` (`data-more-state`), `no-access`, `sign-out`, `disclaimer` |
| data-testid | card | `project-card` (`data-project-id`, `data-status`), `project-card-thumb`, `project-card-name`, `project-card-status` (`data-status`), `project-card-place`, `project-card-version`, `project-card-open` (`data-open-items`, `data-has-items`) |
| harness | `app/test-harness/e2e/js-contents.ts` (test-author), re-exported by `test.ts` | `signedInJsContents(browser: Browser, storageState: StorageState, url: string): Promise<{ value: number; details: object } \| { error: string; details: object }>` = `measureJsContents({ browser: wrapped, profile: PROFILES.desktop, baseUrl: 'http://127.0.0.1:3000' }, url, 'office')`; `signedInJsSize(browser, storageState, url)` = `measureJsSize(wrapped, PROFILES.desktop, 'http://127.0.0.1:3000', url)` (bytes compressed); `wrapped = { newContext: (o) => browser.newContext({ ...o, storageState }) }`; `StorageState = Awaited<ReturnType<BrowserContext['storageState']>>`. Imports `../../../scripts/perf/js-contents.mjs`, `js-size.mjs`, `perf.config.mjs` (require of these ESM files works on Node 22.23, checked 2026-10-29; run `playwright test --list` once, L-017) |

## 4. Tests
Every file: top-level `describe('EZD-117a …')`. U7 and U8 render inside `MessagesProvider language="en" messages={catalogFor('office','en')}` (the real office catalog); the sort menu's items sit in a Radix `Portal` that static markup does not render, so they are asserted only in B5. DB and route tests use `app/test-harness/rls/fixtures.ts` (own tenants, `cleanup()`, `setPermissions(t, m, ['view_projects'])`); route tests sign in as in `app/src/app/api/settings/customers/route.test.ts`. Browser tests import only from `app/test-harness/e2e/test.ts` and use own tenants (never tenant 1, which other specs may add to).

Fixture S (D1–D4, B5–B7; `harnessSql` inserts with explicit `updated_at`; customers "Zed Co", "acme", "Mid" with emails): P1 "bravo" Zed Co approved open 0 `2026-10-05T12:00Z`; P2 "Alpha" no client draft open 2 `10-04`; P3 "charlie" acme draft open 5 `10-03`; P4 "Delta" Mid in_build open 2 `10-06`; P5 "echo" no client client_review open 0 `10-02`; P6 "foxtrot" acme permit_submitted open 1 `10-01`; P7 "golf" draft `10-07` archived; addresses "<n> Sort St". A second tenant holds 2 projects. Members: owner (all), listed (P3, P4), noperm (all, no switches). `ids(a,b)` = the two ids sorted as lowercase strings (uuid byte order).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| D1 counts | 1 | unit (db) | `countProjects` as owner | `{ all: 6, draft: 2, client_review: 1, permit_submitted: 1, approved: 1, in_build: 1 }` (P7 archived and other tenant excluded) | fixture S; Q-0201; RLS |
| D2 listed scope | 7 | unit (db) | listed member: `countProjects`; `listProjects({ tab: 'all', sort: 'edited', after: null })` | `{ all: 2, draft: 1, client_review: 0, permit_submitted: 0, approved: 0, in_build: 1 }`; ids `[P4, P3]` | Q-0202; fixture S |
| D3 status filter | 1 | unit (db) | owner, tab `draft`, sort `edited` | ids `[P2, P3]` | S01 Controls; fixture S |
| D4 sort orders | 6 | unit (db) | owner, tab `all`, each sort | edited `[P4,P1,P2,P3,P5,P6]`; name `[P2,P1,P3,P4,P5,P6]`; client `[...ids(P3,P6), P4, P1, ...ids(P2,P5)]`; status `[P2,P3,P5,P6,P1,P4]`; open_items `[P3,P4,P2,P6,P1,P5]` | Decided "Sort orders" |
| D5 paging | 3 | unit (db) | tenant L, 100 projects: name `'item' \|\| lpad((i % 37)::text, 2, '0')`, customer none when `i % 3 = 0` else "Able"/"baker" by `i % 2`, status `(i - 1) % 5`, open `i % 4`, `updated_at = '2026-10-01T12:00Z' - (i % 50) hours`; walk every sort with `next` | page sizes `48, 48, 4`, last `next` null; the 100 ids are distinct and equal a JS sort of the rows by Decided "Sort orders" | ticket Scope (48); Decided "Paging" |
| D6 fields, one call | 3, 4 | unit (db) | owner page; spy `serverDb.rpc` and `.from` | P3 item `toEqual({ id, name: 'charlie', clientName: 'acme', address: '3 Sort St', status: 'draft', openItems: 5 })`; P2 `clientName: null`; 1 `rpc('list_projects', …)` call, 0 `from` calls; `countProjects` 1 `rpc('count_projects')` | Decided "listProjects", "Client shown" |
| U1 query parse | 1, 6 | unit | `parseProjectListQuery`: empty; `status=draft&sort=name`; `status=bogus`; `sort=`; `status=complete`; valid `after`; `after=!!` | `{ tab: 'all', sort: 'edited', after: null }`; `{ tab: 'draft', sort: 'name', after: null }`; `null` ×3; cursor object; `null` | Decided "Query params" |
| U2 cursor | 3 | unit | round-trip of a cursor; `''`; `'!!'`; base64url of `{"id":"x"}`; `n` of 1001 chars; 4001-char string | equal object; `null` ×5 | Decided "Cursor" |
| U3 store start | 2, 3 | unit | fake api; `start()` twice | one `fetchPage({ tab: 'all', sort: 'edited', after: null })` and one `fetchCounts` (2 calls total); after both resolve `status 'ready'`, `countsStatus 'ready'`; `projectsUrl({ tab: 'all', sort: 'edited', after: null })` = `/api/projects?status=all&sort=edited`, with `after: 'abc'` ends `&after=abc` | Decided "Data requests", "Store", "projectsUrl" |
| U4 store paging | 3 | unit | ready with `next: 'n1'`; `loadMore()` twice while pending; page 2 repeats one id; then `next: null`, `loadMore()` | one call with `after: 'n1'`; items appended without the repeat; no call when `next` null | Decided "Store" |
| U5 store tab/sort | 1, 6 | unit | `setTab('draft')` during a pending page; old page resolves late; `setSort('name')`; `setTab('draft')` again | first signal aborted; late result dropped; `items` from the new page only; `fetchCounts` still called once; same tab → no call | Decided "Store" |
| U6 store errors | 3 | unit | page rejects; counts rejects; more rejects; `AbortError` | `status 'error'`; `countsStatus 'error'`; `moreStatus 'error'` then `loadMore()` calls again; abort leaves state unchanged | Decided "Store" |
| U7 card markup | 4, 5 | unit (`renderToStaticMarkup`) | `ProjectCard` for P3, P1, P2 | P3: name "charlie", status "Draft" `data-status="draft"`, place "acme · 3 Sort St", version "Working copy", open "5 to review" `data-has-items="true"`; P1 "Nothing to review"; P2 place "2 Sort St"; thumb empty; markup has no `<a`, `href`, `role=`, `tabindex`, `onclick` | S01 Data shown; Q-0394; Q-0403; board S01 |
| U8 board markup | 1, 6 | unit | `ProjectsBoard` ready with counts D1 and sort `name`; then `counts: null`; then `status: 'loading'` | six tabs in order All…In build, counts `6,2,1,1,1,1`, `projects-tab-all` `aria-pressed="true"`; sort trigger text "Name", `aria-label` "Sort by Name"; no `projects-tab-count` with null counts; loading: grid `data-state="loading"`, no cards, no `projects-more` | Decided "Tabs", "Sort menu", "Board markup" |
| R1 list route | 1, 3, 7 | unit (route) | signed out; noperm; `status=bogus`; `after=!!`; owner OK; owner `after=<next>` | 401 `not_signed_in`; 403 `permission_denied`/`error.not_authorized`; 400 `invalid_input` ×2; 200 `ProjectPage`; page 2 continues the order; every response `Cache-Control: no-store` | Decided "Routes" |
| R2 counts route | 1, 7 | unit (route) | signed out; noperm; owner; listed | 401; 403; 200 D1 body; 200 D2 counts | Decided "Routes" |
| R3 route 500 | 1, 3 | unit (route) | `listProjects` / `countProjects` mocked to reject `new Error('boom')`; `reportRouteFailure` mocked | 500 `db_unavailable`/`error.db_unavailable`; `reportRouteFailure` called with that error and `/api/projects` or `/api/projects/counts` | ARCH Errors and logging; lesson EZD-169 |
| B1 two requests | 2, 3 | browser | tenant B: 200 projects by `generate_series` (status `(i-1) % 5`, `updated_at` minus i minutes), member with `view_projects`; `captureTraffic` before `goto('/')`; `settle()` | `/api/` request paths sorted = `['/api/projects', '/api/projects/counts']`; `/api/projects` response `items.length` 48, `next` non-null; 48 `project-card` | AC-2; ticket row Scope and Done when; Q-0450 (a) (exact match on every `/api/` request; EZD-117b E4 adds the bell's two) |
| B2 first cards | 2 | browser | tenant B member; one warm-up `goto('/')` until a card shows; `addInitScript` MutationObserver writes `window.__firstCardMs = performance.now()` at the first `[data-testid="project-card"]`; `goto('/')` | `__firstCardMs < 1000` | 11 Budgets "Projects page"; `budgets.mjs` `projects.first-cards` 1000; warm static cache per 11 rule 13 |
| B3 no editor code | 2 | browser | tenant B member; `signedInJsContents(browser, await page.context().storageState(), '/')`; `signedInJsSize(...)` | contents: no `error`, `value` 0; size: no `error`, `value` ≤ 200,000 | `ENTRY_RULES.office`; `budgets.mjs` `download.projects-settings` |
| B4 scroll | 3 | browser | tenant B; `captureTraffic`; each step: `projects-more`.`scrollIntoViewIfNeeded()`, then wait for the next card count and `data-more-state="idle"` (one page per step: 48 new cards put the sentinel about 12 rows, over 3,000 px, below a 1000 px viewport plus the 400 px margin); repeat until `projects-more` is gone | cards 96 after the first scroll, then 144, 192, 200; `/api/projects` requests 5 (4 with `after`), `/api/projects/counts` 1; `projects-more` absent at 200; one more scroll adds no request | AC-3; 200 = 4 × 48 + 8 |
| B5 tabs, sort, cards | 1, 4, 6 | browser | fixture S owner | counts 6,2,1,1,1,1; card names `[Delta, bravo, Alpha, charlie, echo, foxtrot]`; click Draft → `[Alpha, charlie]`, counts unchanged; All, open sort, pick Name → button "Name", `[Alpha, bravo, charlie, Delta, echo, foxtrot]`; P3 card texts as U7; each pill's computed `background-color` and `color` equal a probe `div` styled with the Decided "CSS" token pair; P3 open color = probe `--ez-amber-text`, P1 = `--ez-slate-300` | S01 Controls; board S01; tokens.css |
| B6 not a link | 5 | browser | fixture S owner; count `framenavigated` and `/api/` requests; click P1 card centre; wait 500 ms | pathname `/`; 0 navigations; 0 new requests; card has no `href`, `role`, `tabindex` and no `a` ancestor | Q-0394 |
| B7 listed member | 7 | browser | fixture S listed member | cards `[Delta, charlie]`; counts 2,1,0,0,0,1 | Q-0202 |
| B8 no switch | — | browser | fixture S noperm; `captureTraffic` | `no-access` and `sign-out` visible; no `projects-grid`; 0 `/api/` requests | S01 Permissions; Q-0403/Q-0214 |

Test-author edits to earlier tests (L-021, lesson EZD-136): E1 `app/test-harness/e2e/disclaimer-pages.ts`: row `file` `src/app/page.tsx` → `src/app/(office)/page.tsx` (path `/`, signedIn true, placement `page`). E2 `app/src/components/shell/HeaderButton.icon.test.tsx` `EXPECTED_ICONS`: add `'sort'` in sorted place; length = develop's list at build start + 1 (41 + 1 = 42 after EZD-110's 12; 45 if EZD-108's 3 merged first). E3 `app/test-harness/rls/gate.ts` `GATED_RPC_CALLS`: add `{ fn: 'list_projects', args: { p_sort: 'edited' } }` and `{ fn: 'count_projects', args: {} }`. E4 `app/test-harness/e2e/test.ts`: re-export `signedInJsContents`, `signedInJsSize`.

## 5. Visual checklist
Viewport: desktop 1600 × 1000.
| Element | State | Mockup |
| --- | --- | --- |
| Title row: H1 "Projects", tabs card with All active and mono counts on every tab, sort button with icon and "Last edited" (Sign out stand-in at the right end) | filled | S01Projects.png |
| Sort menu open, current option highlighted | filled | S01 menu style (`.mi`), not drawn for sort |
| Grid of 4 columns, gap 20 | filled | S01Projects.png |
| Card: grid thumbnail with no drawing, name, status pill colors, client · address, "Working copy" mono, open-items dot and text | filled | S01Projects.png; Q-0403 |
| No-access line under the title row | no permission | none (EZD-102 `NoAccess`) |
| Disclaimer line at the page bottom | filled | EZD-136 |

## 6. Proposed wording
| Where | Text |
| --- | --- |
| Status tabs group `aria-label` (`office.projects.status_label`) | Project status |
| Sort button `aria-label` (`office.projects.sort_label`) | Sort by {sort} |

## 7. Security review
security-review: yes — data access (two invoker RPCs over `project` and `customer`; listed scope through RLS), API (two GET routes, `view_projects`), migrations (function grants, `GATED_RPC_CALLS`).
Reviewers needed: code-reviewer · calc-auditor no · ui-verifier yes · security-reviewer yes.

## 8. Complexity and model recommendation
High: two migrations with keyset SQL, two routes, a store, a Radix menu and eight browser tests including bundle and timing checks across about 20 files. Test-author Opus 5.5, builder Opus 5.5.

## 9. Dependencies
Row: EZD-102 (can, `requireApiPermission`, `NoAccess`, `setPermissions`), EZD-110 (nothing imported; it adds 12 icons to the same list, so E2's count follows it). Missing from the row (all done): EZD-016a (browser harness, visual checklist), EZD-015 (`StateHost`), EZD-020 (office entry, contents collector), EZD-017 (`measureJsSize`, budgets), EZD-113 (`customer`, `project.customer_id`), EZD-136 (`Disclaimer`, `DISCLAIMER_PAGES`), EZD-007f (`SignOutButton`), EZD-010b (icon pipeline).
Risks: EZD-117b must replace the Sign out stand-in with `AvatarMenu` and edit the four sign-out specs; EZD-118 must fill `project.customer_id` (cards ignore `client_name`); EZD-117b adds `p_search` to both functions (new migration, `GATED_RPC_CALLS` args); B2 is wall-clock under 4 workers; Radix `DropdownMenu` adds to the 200 KB office budget (B3 measures it); `icons.json` edits by EZD-108 and EZD-110 can conflict at merge.

## 10. Open questions
None
