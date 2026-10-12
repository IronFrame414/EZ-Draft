### 15 · Settings: Users + permissions

**Purpose:** Company-level administration. This section manages who can use EZ Draft, what each person may do (per-user permission checklist), each person's role, and each person's language. The same settings shell hosts the other company settings sections (15a to 15h) and the Translations queue (screen 16).

**Entry points:**

- Avatar menu → Company settings, or the Settings link on Projects (S01).
- "Change in settings" / "Change in company settings" links on other screens (S02 tolerance, S04b default overhangs) open 15d Defaults.
- Direct URL `ezdraft.ezcontractorbinder.com/settings/users`.
- Settings nav badge "Translations" opens screen 16.

**Permissions:**

- View and edit any company settings section: Manage users and settings.
- Translations section: Approve translations (see 16).
- Users without the permission do not see the Company settings link or nav items (controls a user lacks are hidden, Round 24).
- Every user can open My profile from the avatar menu to change their own language and iPad input mode.

**Layout:** Not the standard editor shell. Settings shell:

- Header card (60px): "ezdraft" wordmark, divider, "Settings" title, "Projects" back link, spacer, company name, current-user avatar.
- Left nav card 248px, label "Company settings": Company, Users + permissions (count badge), Title block, Sheet presets, Defaults (badge "ft-in"), Catalog (item count badge), Render models, Code edition, Libraries, Translations (unreviewed count badge, amber). No seats meter and no Billing item in v1.
- Main card: page title, subtitle, search, Invite user button; users table; Roles row (presets and custom roles); costs info note.
- Right inspector card 336px: selected user detail with role, language, grouped permission switches, footer with Save.
- Status bar: Company, Users, Languages, Sync, current location "Settings · Users".

**Permission list (Round 10 + Round 24, 28 switches, grouped in the inspector):**

- Projects: View projects; Create projects; Edit model; Delete projects; Upload references; Add markup; Run code check.
- Renders: Run fast renders; Run standard renders; Run photoreal renders; Approve renders; Mark client-ready.
- Money: See company costs; See sell prices; Edit catalog; Create change orders; Flag to supplier.
- Issue + send: Issue permit sets; Issue revisions; Send to client; Export (PDF / DXF / GLB / CSV).
- Field: Edit field tasks; Check off tasks; Photo notes; Flag conflict; Send field measurement; Approve field measurements.
- Admin: Approve translations; Manage users and settings.

**Preset defaults (Round 24):**

| Preset | Ticked |
| --- | --- |
| Owner | All 28. |
| Designer | All except Delete projects, Issue permit sets, Issue revisions, Manage users and settings (24). |
| Foreman | View projects (own jobs), Run fast renders, Export, Approve translations, Add markup, Edit field tasks, Check off tasks, Photo notes, Flag conflict, Send field measurement (10). |
| Crew | View projects (own jobs), Check off tasks, Photo notes, Flag conflict (4). |
| Custom roles | Unlimited; created from any user's current switches. |

**Controls:**

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Projects back link | Header | Returns to Projects list (S01). | If the inspector has unsaved edits, prompt Save / Discard / Cancel. |
| Avatar | Header right | Menu: My profile (language, iPad input mode), Company settings (only with Manage users and settings), Sign out. |  |
| Nav: Company | Left nav | Opens 15a (includes EZ Binder connection, user sync, customer sync). | Same unsaved-edits prompt on leave. |
| Nav: Users + permissions | Left nav | Opens this section. Badge = active user count. | Highlighted when current (`aria-current="page"`). |
| Nav: Title block | Left nav | Opens 15b. |  |
| Nav: Sheet presets | Left nav | Opens 15c (submittal profiles). |  |
| Nav: Defaults | Left nav | Opens 15d (all thresholds, tolerances, limits, waste factors and keyboard shortcuts). Badge "ft-in". | Imperial only in v1. |
| Nav: Catalog | Left nav | Opens 15e. Badge = catalog item count. |  |
| Nav: Render models | Left nav | Opens 15f (tier models, render allowance in dollars with auto-refill). |  |
| Nav: Code edition | Left nav | Opens 15g. |  |
| Nav: Libraries | Left nav | Opens 15h (notes, symbols, details, hatches, parts, field task templates). |  |
| Nav: Translations | Left nav | Opens screen 16. Badge = unreviewed count, amber when > 0. | Shown to users with Approve translations; for them it is the only nav item if they lack Manage users and settings. |
| Search users | Main header | Filters rows by name or email as typed. | Case-insensitive; empty result shows "No users match". |
| Invite user | Main header, primary | Opens invite dialog: email (required), name, role, language, project access (All projects / Listed projects). Send emails a magic-link invite; dialog then shows the invite link with "Copy link". Adds an "Invite pending" row. | No user limit in v1. Clients are not invited here; they are customers (15a) and receive share links (S18). |
| User row | Users table | Click selects the user and loads the inspector. Selected row: tint + 3px left accent bar, `aria-selected="true"`. | One selection at a time. |
| Row: Name cell | Users table | Avatar initials, name, email. | Every user has an email (Round 24). |
| Row: Role pill | Users table | Role name; colored per preset (Owner black, Designer blue, Foreman green, Crew gray, custom roles outlined). "Modified" suffix when switches differ from the role. | Pending invite shows dashed pill. |
| Row: Language tag | Users table | EN or ES. |  |
| Row: Permissions count | Users table | "n / 28" granted. |  |
| Row: Last active | Users table | Relative time ("Now", "12 min ago", "Yesterday"). | Pending invite row shows "Resend" and "Copy link". |
| Row: Resend (pending invite) | Users table | Re-sends the invite email; updates "sent \<date>". | Pending rows only. |
| Row: Copy link (pending invite) | Users table | Copies the invite link to the clipboard; toast "Link copied". | Pending rows only (Round 24: every emailed item has Copy link). |
| Row: More (…) menu | Users table | Edit, Resend invite, Copy invite link, Cancel invite (pending), Deactivate, Remove. | The last user holding Manage users and settings cannot be deactivated, removed or have that switch turned off. |
| Role card (presets + custom) | Roles row | Shows name and a one-line summary; click opens the role's switch list for editing (custom roles) or viewing (presets). | Presets: Owner "Everything"; Designer "Draw, render, export; no issuing, no deleting, no admin"; Foreman "Field pack, tasks, flags, measurements, markup, fast renders"; Crew "Field pack, tasks, photos, flags". Preset definitions are fixed; custom roles are editable and deletable when no user holds them. |
| New role | Roles row end | Creates a custom role from scratch or from a preset; name required. | Unlimited (Round 24). |
| Inspector close (X) | Inspector header | Clears selection. | Unsaved-edits prompt. |
| Role select | Inspector | Options: Owner, Designer, Foreman, Crew, then custom roles. Choosing a role re-ticks all switches to that role. When switches differ, the value reads "\<Role> (modified)". | Presets only pre-tick boxes; any box can change per person. |
| Save as new role | Inspector, under Role select | Saves the current switches as a custom role and assigns it to this user. | Shown only when the user is "(modified)". |
| Language toggle (English / Español) | Inspector | Sets the user's language. Helper text: "Field pack, tasks and notes open in Spanish for this user. Permit sheets stay in English." | Spanish users always see Spanish, reviewed or not (Round 24). |
| Permission switch (x29) | Inspector, grouped list | Toggles one permission. Names and groups as in the Permission list above. | Subtext on See company costs: "What the company pays: catalog cost, option cost lines, CO cost, render cost". Subtext on See sell prices: "What the client is charged: sell price, markup, allowances, CO total". Subtext on Create change orders: "Draft and send to EZ Binder". |
| Group header count | Inspector | "n of m" per group. |  |
| Permissions counter | Inspector, above list | "n of 28". Updates live. |  |
| Unsaved indicator | Inspector footer | Amber dot + "Unsaved changes". | Only when edits are pending. Preset drift is shown by "(modified)" in the Role select, not here (Claude). |
| Reset to role | Inspector footer | Re-ticks switches to the selected role's definition. | Does not save until Save. |
| Save | Inspector footer, primary | Saves role, language and switches; writes user\_permission and event\_log. | Disabled with no pending edits. Applies on the user's next request. |
| Keyboard: Up / Down | Users table | Moves selection. | Bindings editable in 15d. |
| Keyboard: Ctrl/Cmd+S | Inspector | Save. | Bindings editable in 15d. |

**Data shown:**

- tenant: name, user count.
- user / membership: name, email, avatar initials, role, modified flag, since date, last active, invite status and sent date.
- user\_permission: 28 booleans; user: language (EN/ES), iPad input mode; membership: project access.
- role: presets (fixed) and custom roles (name, switches).
- EZ Binder user sync status and last sync time ("EZ Binder · 2 min ago") when connected (15a).
- Status bar: Users "n active · n invited"; Languages "EN n · ES n".
- Info note: "Company costs (catalog cost, option cost lines, CO cost, render cost) are hidden everywhere for users without See company costs, and sell prices, markup and totals for users without See sell prices, including exports and the field pack."

**States:**

- Empty: only the owner exists; one row plus an "Invite your team" prompt.
- Loading: table skeleton rows; inspector skeleton.
- Error: save fails; inspector keeps edits, shows inline error and Retry.
- No selection: inspector shows "Select a user".
- Pending invite selected: inspector shows invite details, Resend, Copy link and Cancel invite; switches editable before acceptance.
- EZ Binder not connected: Sync item hidden from the status bar.
- EZ Binder sync failure: Sync value shows an error with last success time.
- Offline: settings are read-only; Save disabled with "Offline" note.
- No permission: the section is not reachable (link hidden); a typed URL redirects to Projects with "You don't have access to company settings."

**Validation & warnings:**

- Invite email required, valid, and not already a member of the tenant.
- At least one user must keep Manage users and settings.
- Custom role names are unique within the tenant.
- Unsaved-edits prompt on leaving the section or changing selection.
- Turning off See company costs or See sell prices hides those numbers in every view, export and field pack for that user.

**Events emitted:**

- user.invited (new), user.invite\_resent (new), user.joined (new), user.deactivated (new), user.removed (new)
- user\_permission.updated (new): user id, changed permissions, role, actor.
- role.created (new), role.updated (new), role.deleted (new)
- user.language\_changed (new)
- All of the above also write event\_log (actor, action, object, at).

**Decisions:**

1. Permission list is the 28 switches above: Round 10 plus the Round 24 additions; mockup names are replaced by plan names (Round 24).
2. Approve renders and Mark client-ready are separate permissions; Edit field tasks is included (Round 24).
3. Presets are Owner, Designer, Foreman, Crew; Client is not a preset (clients are customers with share links); unlimited custom roles (Round 24).
4. Preset defaults match the permission table in section 9 (Permissions and settings), which is authoritative; Foreman and Crew see their own jobs only.
5. Field actions have their own permissions: Check off tasks, Photo notes, Flag conflict, Send field measurement (Round 24).
6. Preset definitions are fixed; tenants add custom roles from the Roles row or with "Save as new role" (Claude).
7. "(modified)" in the Role select shows preset drift; the footer indicator shows only unsaved edits (Claude).
8. No user limit and no seats meter in v1; Billing is not in the v1 nav (Round 24 for no limit; Billing hidden (Claude)).
9. Every user must have an email; phone-only users are not allowed (Round 24).
10. Users are invited in EZ Draft; when EZ Binder is connected, optional user sync is set in 15a; the apps stay separate (Round 24).
11. Every user can change their own language and iPad input mode in My profile; admins can change it here too (Claude).
12. Avatar menu: My profile, Company settings (permission-gated), Sign out (Claude).
13. Field task templates live in 15h Libraries; EZ Binder connection lives in 15a Company; notifications have no settings section in v1 and always go in-app and by email (Claude). Project access: the inspector has a Project access control (All projects, or Listed projects with a project picker) and the invite dialog has the same field; Foreman and Crew default to Listed projects; it writes membership.scope (Claude; ticket EZD-129).
