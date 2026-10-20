# Data model: tables
<!-- Moved word for word from vault/spec/sections/03-data-model.md lines 27-74 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

**Tables**

| Entity | Key fields | Rules |
| --- | --- | --- |
| tenant | name, logo, license\_no, contact, title\_block, code\_edition, defaults (json) | One per GC company |
| user | name, email, language (en/es), ipad\_input\_mode, role\_preset | Email required. Language is per user, not a field-pack toggle |
| membership | user\_id, tenant\_id, scope (all projects / listed projects) | Clients and crew scoped to their projects |
| user\_permission | user\_id, permission\_key, granted | One row per checklist box (section 9) |
| project | name, client\_name, address, type, status, ezbinder\_job\_id, ezbinder\_job\_no, property\_record\_id, submittal\_profile\_id, code\_edition, phase\_default, thumbnail\_path, open\_items\_count (stored counter behind the review pill and the card) | Status: Draft, Client review, Permit submitted, Approved, In build |
| property\_record | parcel\_no, owner, legal\_description, year\_built, living\_area, source\_url, confirmed\_by | Year built before 1978 sets the lead flag |
| model\_version | project\_id, model\_json, parent\_version\_id, label, is\_snapshot, created\_by, created\_at | Immutable. Written only at checkpoints (see Working copy and saves); model\_json is never selected by list queries. Also: preview\_path, is\_sent, sent\_to, version\_no (only when sent), keep flag. Unsent versions auto-delete at 30 days unless kept; sent versions are permanent |
| source\_file | project\_id, kind (polycam\_dxf, polycam\_glb, pdf, supplier\_pdf, dxf, image, order\_report, photo, panel\_photo, field\_measure), storage\_path, scale\_calibration, uploaded\_by, supplier\_name and supplier\_contact\_email (supplier files) | Originals never changed |
| reference\_drawing | project\_id, source\_file\_id, version\_no, rev\_label (the architect's letter), layer\_state (json), convert\_status per layer | Full fidelity; new upload = new version of same reference |
| reference\_diff | reference\_drawing\_id, from\_version, to\_version, changes (json), affected\_markup\_ids, affected\_object\_ids | Built on upload of a new version |
| markup | project\_id, target (reference / render / plan / supplier image), kind (cloud, comment, arrow, dim, text, cabinet\_tag), geometry, text, linked\_object\_id, author | Never alters the target |
| import\_session | project\_id, source\_file\_id, source\_kind (scan, pdf, dxf, supplier, field\_measure), mode (one-by-one / accept-fix / by-room), status, items (json with confidence) | Nothing becomes model data until accepted |
| edit\_lock | project\_id, holder\_user\_id, since, device\_id, offline (bool) | One editor per project |
| edit\_request | project\_id, requester\_id, requested\_at, response (release/keep/auto), responded\_at | Auto-release after 5 minutes with no answer |
| offline\_change | project\_id, device\_id, base\_version\_id, ops (json), queued\_at, synced\_at | The device outbox (Round 26). Model changes are made while holding the lock; field actions (task checks, photo pins, measurements) queue without it. Each queued change carries the object's base sequence number and the lock generation; a conflict is a server sequence newer than the base, and the user resolves each one with Keep mine or Keep theirs |
| camera\_view | project\_id, name, mode (orbit / walk / ortho), position, target, fov, eye\_height, thumb\_path (captured on Save view and on overwrite only), created\_by | Used by renders and client gallery |
| design\_option | project\_id, group (e.g. Beams), label (A/B/C), name, model\_delta (json), internal\_cost\_lines (json), status (draft / sent / approved / archived) | Costs never shown to clients |
| render | project\_id, model\_version\_id, camera\_view\_id or site\_photo\_id, tier, style, instructions, mask, inputs (json), visible\_object\_ids (captured when the render is requested), code, name, render\_no, previous\_render\_id, design\_option\_id, output\_path, thumb\_path (400 px), preview\_path (1600 px), cost\_usd, status (pending, running, failed, needs review, approved, rejected, client-ready, outdated, hidden), model\_changed (true or false, shown as the Model changed badge; cleared by Keep as-is), error\_text, created\_by, approved\_by, approved\_at, client\_ready\_by, client\_ready\_at | Reproducible record of what was shown |
| render\_comment | render\_id, pin\_xy, author (user or client), text, resolved | Client pins and staff pins |
| catalog\_item | tenant\_id, category, name, brand, model/sku, dims, finish, cost, sell, supplier, lead\_time, install\_specs, spec\_sheet\_path, texture\_path, source\_url, ai\_confidence (per field), allowance\_category, project\_id (set only when saved to one project), subcategory, markup\_pct (empty = category default), is\_standard\_spec, lead\_time\_text, lead\_time\_days, thumb\_path (256 px), created\_at | Every AI field confirmed by a user before save |
| project\_price\_snapshot | project\_id, catalog\_item\_id, cost, sell, captured\_at | Refresh shows changes before applying |
| countertop\_piece | project\_id (in model), label (A/B…), outline, material\_item\_id, thickness, edges\[\] | See countertop edge below |
| countertop\_edge | piece\_id, segment, kind (exposed / wall / seating / flush), overhang, backsplash\_height, profile\_id | Profile applies to exposed edges only |
| edge\_profile | tenant\_id, name, section\_svg, no stored per-LF price (the price is entered per top in 04b) | Library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom |
| selection\_offer | project\_id, kind (edge\_profile, option group, finish), choices\[\], price\_deltas | What the client may pick from |
| selection | project\_id, offer\_id, choice, chosen\_by, chosen\_at, signature\_id | Flows back into model and schedules |
| selection\_set | project\_id, items, approved\_by, approved\_at, signature\_path, ip, model\_version\_id | Approval locks that model version |
| sheet | project\_id, number, title, viewports, scale, size | Generated, adjustable |
| permit\_revision | project\_id, rev\_no, model\_version\_id, issued\_at, issued\_by, sent\_to (client/department), delta\_object\_ids, description | Drives clouds and revision log |
| submittal\_profile | tenant\_id, department, submittal\_type, sheet\_size (permit 24x36 default), file\_split (combined / per discipline / per sheet), max\_file\_mb, naming\_template, revision\_naming (version in name / same name), flatten, stamp\_box (size, position), bookmarks, toc\_sheet, resubmittal\_mode (changed sheets / full set + narrative), transmittal, min\_scale, export\_unsigned, required\_notes, signer (none / EC / architect / engineer) | A new department rule is a setting |
| detail | tenant\_id or project\_id, title, scale or NTS, linework, hatches, parts, keynotes, steps/layers, library\_source\_id, sheet placement, extrusions (profile, length) | Library copy is edited in place on the job |
| electrical\_calc | model\_version\_id, case, method, inputs, results | Computed in the browser from the working copy while the load calc is on screen and at Check; a row is stored when a version is sent or a set issues |
| panel | project\_id, existing/new, service\_size, main\_breaker, spaces, brand, label\_photo\_id, circuits\[\] | The panel is a model object inside model\_json (EZD-604, EZD-606), not a table; this row lists its fields. AI reads label photo for confirmation |
| code\_check\_run | project\_id, model\_version\_id, warnings\[\], accepted\_notes\[\] | Run on demand and at issue |
| takeoff | model\_version\_id, lines by room and trade | Waste factors applied. Computed in the browser (worker) while Takeoff is open; a row is stored only for sent versions |
| field\_task | project\_id, room, phase, text\_en, text\_es, status, photos, done\_by | Published by office |
| field\_pin | project\_id, xy, photo, note, kind (note / conflict) | Conflict notifies office |
| field\_measurement | project\_id, object\_id, measured\_value, drawing\_value, status (pending / approved / rejected) | Updates model only after approval |
| translation | phrase\_en, text\_es, status (unreviewed / approved), approved\_by | Cached across jobs; edit updates every use |
| share\_link | project\_id, scope, token, expires\_at (30 days), renewed\_at | Renewable |
| change\_order\_draft | project\_id, permit\_revision\_id, before\_images, after\_images, image\_approved flags, scope\_text, lines (qty, unit, cost delta), schedule\_days, status, ezbinder\_co\_id | Sent to EZ Binder by webhook |
| notification | user\_id, kind, project\_id, payload, read\_at, emailed\_at | In-app + email |
| event\_log | actor, action, object, at, ip | Audit for approvals, issues, locks |

