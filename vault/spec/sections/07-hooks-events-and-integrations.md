## Hooks, events and integrations

EZ Draft publishes events; EZ Binder subscribes by signed, retried webhook and calls EZ Draft's inbound API. Neither app writes to the other's database.

**Outbound webhooks to EZ Binder**

| Event | Fired when | Payload | EZ Binder action |
| --- | --- | --- | --- |
| `plan_set.issued` | A set issues (Rev 0 or Rev N) | project id, EZ Binder job id, rev no, PDF urls, sheet list, issued by, sent to | Attach the set to the job documents |
| `selection.approved` | Client verifies and signs a selection set (choosing alone does not fire it) | selection set, items, chosen options and edges, approver name, timestamp, IP, model version | Record approval; update selections |
| `revision.created` | Rev N is assigned | rev no, changed object ids, before/after image urls, quantity changes | Record the revision on the job (no CO draft; COs come only from change\_order.sent) |
| `change_order.sent` *(new)* | Send to EZ Binder pressed on a CO draft | approved images, scope text, lines (qty, unit, cost delta), schedule days, rev no | Create / update the CO record |
| `takeoff.updated` | A version is sent (the takeoff snapshot stored with it); never on working saves | lines by room and trade | Update estimate or material list (v2 push) |
| `model.exported` | GLB/USDZ export finishes | GLB and USDZ urls, version | Show the model in the job viewer |
| `field_task.completed` | A task is checked off | task, room, photos, by, at | Log progress |
| `field.conflict_flagged` *(new)* | Foreman flags a conflict | pin, photo, note, object id | Add to job feed |
| `client.commented` *(new)* | Client pins a comment | render or plan id, pin, text | Add to job feed |

Delivery rules: HMAC-signed body, idempotency key per event, retries with backoff, event log entry on every send and failure. Retry count and backoff are company settings. Added in Round 24: customer.synced (two-way customer sync), user.synced (optional user sync), render\_allowance.refilled (owner notice).

**Inbound API (called by EZ Binder)**

| Call | Result |
| --- | --- |
| Create design project from job | New EZ Draft project with client, address, job number |
| Open project / field pack with shared sign-on | Returns a signed URL; user lands signed in |
| Read latest approved version, renders, plan set, takeoff | Read-only data for the job |
| Mark change order approved | Locks the matching revision |

**Calls EZ Draft makes to EZ Binder** (added Oct 11; each needs matching work in the EZ Binder repo, fixed in the contract from EZD-019)

| Call | Used by |
| --- | --- |
| Search and read jobs the user can see | New project wizard job picker |
| List and upsert customers | Two-way customer sync |
| List users | Optional user sync |
| Verify a shared sign-on token | Opening EZ Draft from EZ Binder and Back to EZ Binder |
| Post a webhook (all outbound events above) | Webhook delivery |

Until the EZ Binder side exists, these run against the stub server from EZD-019.

**Internal app events (drive UI, notifications and recompute)**

| Event | Triggers |
| --- | --- |
| `model.saved` | Working copy saved (changed objects only; no new version row). The server recomputes nothing: schedules, symbol key, electrical calc and takeoff update in the browser for what is on screen. A background job compares the changed object ids with each approved or client-ready render's visible\_object\_ids and sets Model changed on renders that show a changed object or finish (badge + review pill, no save-time prompt; keep / outdated / hide per render) |
| `lock.acquired` / `lock.released` / `lock.requested` / `lock.auto_released` | Banner updates for viewers; prompt to holder; 5-minute timer |
| `import.completed` | Fired by Finish import: accepted items are in the model and Plan opens with the counts notice. Detection finishing is import.ready (new): Import review can open and the uploader is notified |
| `reference.version_uploaded` | Build diff; flag affected markups and objects |
| `render.completed` / `render.failed` | Notification; review pill count |
| `render.approved` | Render moves to Approved; Mark client-ready is the separate second step (render.client\_ready) |
| `translation.created` / `translation.approved` | Review queue; propagate edits to every use |
| `field.measurement_submitted` | Review pill; approval updates model |
| `share_link.expiring` | Reminder before 30-day expiry (lead time is a company setting) |
| `cleanup.due` | Cleanup sheet for unsent versions older than 30 days |
| `code_check.completed` | Warning list on Electrical and in the issue checklist |
| lock.request\_declined / lock.conflict | Requester told the holder kept editing; former holder gets the conflict list after an offline auto release |
| field.measurement\_approved / field.measurement\_rejected | Model update and conflict list; or the note goes back to the Foreman |
| field.measure\_sent | Import review items (source kind field\_measure); office notified |
| field\_pack.issued (new) | "New field pack issued" notification to assigned crew; phones refresh the cached pack |
| design\_option.created / design\_option.updated | Options panel and 3D; takeoff cost per option |
| version.sent / version.snapshot\_named / version.reverted / cleanup.deleted | Versions list; Version N / Rev N label; takeoff snapshot on send |
| render.client\_ready / render.rejected / render.model\_changed / render.outdated / render.hidden\_from\_client | Share link contents; review pill |

Canonical names: the event names in this section (outbound webhooks, Round 24 additions and internal events) are the only names for these events; every screen section uses them. Other screen events marked (new), such as catalog\_item.created or detail.placed, write the event log only and are not webhooks (Claude).

**External services**

| Service | Used for | Fallback |
| --- | --- | --- |
| Image-edit model APIs (configurable per tier) | Renders | The local GPU render worker runs first when online; these APIs are the fallback when it is off (Round 24 #50). Browser path tracer optional |
| Claude | Catalog extraction from URL, image or pasted text; Spanish translation; task drafts; CO scope text; panel label and directory photo reading; property appraiser page reading | User types the fields |
| Property appraiser sites (PBC, Broward) | Parcel, owner, legal, year built, living area | Paste page text or screenshot |
| Retail and supplier product pages | Catalog fields | Paste text or screenshot |
| Email provider | Share links, notifications, magic links | — |
| Polycam | Manual upload in v1 (DXF + GLB) | API pull evaluated in v2 |

AI never edits the drawing silently: every AI result is shown for confirmation before it is saved.
