# Data model: tables added in Rounds 24 and 25
<!-- Moved word for word from vault/spec/sections/03-data-model.md lines 75-89 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

Added in Rounds 24 and 25 and the Oct 11 audit:

| Entity | Key fields | Rules |
| --- | --- | --- |
| customer | name, email, phone, address, ezbinder\_customer\_id, synced\_at | Two-way sync with EZ Binder when connected. The email is what a client types to verify before signing |
| role | tenant\_id, name, default\_permissions | Unlimited custom roles per tenant |
| render\_allowance | tenant\_id, amount\_usd, balance\_usd, refill\_amount\_usd, last\_refilled\_at | Auto-refills when used up; notifies owner |
| sent\_package | project\_id, model\_version\_id, kind (client, permit, CO, supplier), recipients, email\_sent\_at, copy\_link\_token | Every email send also produces a copyable link |
| field\_measurement\_review | measurement ids, reviewer, decided\_at | Backs the Field measurements review screen |
| sheet\_set | project\_id, kind (permit / client), sheet\_ids, size (permit 24x36; client 11x17 or 24x36), key\_placement (every sheet / cover only), submittal\_profile\_id, last\_issued\_version\_id | One permit set and one client set per project; countertop sheets only in the client set (Claude) |
| field\_measure\_session | project\_id, device\_id, rooms (name, shape, wall letters and lengths, ceiling height, closure result), sent\_by, sent\_at, status (saved / sent / imported) | Phone 17b capture; on send it becomes an import\_session with source\_kind field\_measure (Round 25) |
| field\_pack\_issue | project\_id, model\_version\_id, task\_ids, issued\_by, issued\_at, note | Created by Issue field pack on the Field tasks screen; drives the "New field pack issued" notification (Claude) |
| model\_object | project\_id, object\_id, type, data (json), updated\_seq, updated\_by, deleted | The working copy, one row per model object. Autosave upserts only changed rows; opening a project reads them in one query. A checkpoint assembles them into a model\_version (Claude, performance audit) |
| job | tenant\_id, project\_id, kind (import, export, render, ai\_read, thumbnail, diff, cleanup), payload (json), status (queued, running, done, failed), progress, attempts, error, run\_after | The background queue. Progress is pushed to the browser over Realtime; nothing polls |

