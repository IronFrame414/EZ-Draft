# 15a · Settings: Company

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 4: Screen-by-screen spec. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

**Purpose:** Company identity used by the title block, client pages, selections PDF and email, plus the optional EZ Binder connection (user sync and customer sync).

**Entry points:** Settings nav "Company".

**Permissions:** Manage users and settings (view and edit). Section hidden without it.

**Layout:** Settings shell (see 15). Main card: Identity, Contact, EZ Binder connection, Customers. No inspector.

**Controls:** (Section not in mockup; the mockup shows only the nav item.)

| Control | Location | Action / result | Rules & states |
| --- | --- | --- | --- |
| Company name input | Identity | Edits tenant.name. Used in header, client pages ("WORTH PROPERTIES"), status bar. | Required. |
| Logo upload / replace / remove | Identity | Uploads company logo (title block, client view, selections PDF). | PNG, JPG or SVG, up to 5 MB (Claude); preview shown. |
| License number input | Identity | tenant.license\_no (e.g. CGC license). | Shown in title block when "Company logo, license and contact" is on (15b). |
| Contact: phone, email, website, address | Contact | Company contact block. | Same on/off rule as license. |
| EZ Binder: Connect / Disconnect | EZ Binder connection | Connects the tenant to its EZ Binder company (shared sign-on, webhooks). Shows status and last sync. | Apps stay separate; EZ Draft works without the connection (Round 24). |
| Sync users (switch) | EZ Binder connection | On: EZ Binder users can be imported and matched to EZ Draft users by email; deactivation in either app is mirrored. | Optional; off by default (Claude). Shown only when connected. |
| Sync customers (switch) | EZ Binder connection | On: customer list syncs both ways with EZ Binder (name, email, phone, address). | Round 24. Shown only when connected. |
| Sync now | EZ Binder connection | Runs user and customer sync immediately. | Shown only when connected. |
| Customers list | Customers | Lists customers (name, email, projects). Add, edit, archive. | Customer email is what a client enters to verify before signing (S18). Hidden fields: none. |
| Save | Footer | Saves company fields and switches. | Disabled with no edits. |

**Data shown:** tenant name, logo, license\_no, contact fields, EZ Binder link status and last sync, customer records.

**States:** loading, error on save, offline read-only, EZ Binder not connected (sync switches hidden), sync error (message with last success time).

**Validation & warnings:**

- Company name required.
- Logo: PNG, JPG or SVG, at most 5 MB.
- Customer email required and unique within the tenant (needed for client verification).
- Sync conflict (same customer edited in both apps since last sync): latest edit wins and the change is logged (Claude).

**Events emitted:** tenant.updated (new); ezbinder.connected (new); ezbinder.disconnected (new); customer.created (new); customer.updated (new); customer.synced (new).

**Decisions:**

1. Field list is as above (identity, contact, EZ Binder connection, customers); logo limit PNG, JPG or SVG up to 5 MB (Claude).
2. Logo and license changes apply only to future sends; sent versions are permanent and never change (Round 24).
