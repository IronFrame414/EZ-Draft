# Phase 1 spec gaps for Josh · Company settings and customers

Stage 0 (spec-check 1), 2026-10-20. Phase-auditor run 1 found 14 gaps against `vault/spec/READINESS.md`: 9 below need Josh (business, wording, scope), 5 an agent decides with a citation (end of file). Answer by number; "all recommended" is fine.

## For Josh

**1 (Q-0223). Who gets the Settings page switches by default?** Q-0210 replaced "Manage users and settings" with one switch per Settings page (Users, Company, Title block, Sheet presets, Defaults, Catalog, Render models, Code edition, Libraries, Translations). Nothing says which roles get which by default. Any box can still be changed per person.
- Recommended: Owner all ten; Designer Catalog, Libraries, Translations (Designer already edits the catalog and approves translations); Foreman Libraries, Translations (the EZD-103 ticket already says this); Crew none. The Translations page switch opens the page; "Approve translations" still decides who can approve.

**2 (Q-0224). Can Foreman and Crew start projects by default?** Q-0178 says any staff member can start a project, but the permission table has Create projects off for Foreman and Crew.
- Recommended: keep it off by default; you tick it for any person who should start projects (Q-0178's own "fully customizable permissions"). Alternative: on by default for Foreman and Crew.

**3 (Q-0225). System status page.** Q-0211 says System status (last backup, failed jobs, render usage) is owner only. It is not in Q-0210's list of ten.
- Recommended: an eleventh switch "System status", on for Owner only, created now so nothing changes later. Alternative: hard-wired to owners, no switch.

**4 (Q-0226). Settings pages that don't exist yet.** In Phase 1 only Company (with Customers) is built; the other nine Settings pages arrive in later phases.
- Recommended: hide a nav item until its page is built (no "coming soon" text). Alternative: show all items, with a "Not built yet" line on the unbuilt ones.

**5 (Q-0227). Customers: archive, required fields, delete.** The spec says only "add, edit, archive".
- Recommended: name and email required (phone, address optional); an Archived filter with Restore, like projects; an archived customer's email still can't be reused (the client verifies by email); no delete in v1. Only people with the Company switch manage customers (Phase 2 will ask how someone without it picks a customer when starting a project).

**6 (Q-0228). Wording users see.** Recommended drafts:
- Empty company name: "Enter your company name."
- Logo too big: "Logos can be up to 5 MB. Choose a smaller file."
- Logo wrong type: "Logos must be PNG, JPG or SVG."
- SVG logo with scripts in it (refused for safety): "This SVG can't be used. Save it as PNG and try again."
- Customer without email: "Enter the customer's email."
- Duplicate customer email: "A customer with this email already exists."
- No customers: "No customers yet" with the button "Add customer".
- Unsaved edits prompt: "Save your changes?" with Save / Discard / Cancel.
- Nav label stays "Sheet presets" (Q-0210 called it "Departments").

**7 (Q-0229). Where the disclaimer sits.** Q-0208 gave the words, not the place.
- Recommended: one small grey line at the bottom of every page: in the editor's status bar; a footer line on Projects, Settings, sign-in, terms, the client link and phone screens. Never on sheets or PDFs. Phone screens in Spanish for Spanish users (builder writes it, a crew member checks, Q-0030).

**8 (Q-0230). Terms of service: accept or just link?**
- Recommended: just a link on the sign-in page in v1, no "I agree" checkbox (Worth Properties is the only company; R24 #42). Claude drafts the placeholder terms with the two required statements; you or the attorney replace them later.

**9 (Q-0231). Glossary.** The glossary lacks Tenant, Customer, Role preset, Permission switch, Page switch, Project access (All / Listed projects), Source file, Off-site copy, Surface.
- Recommended: OK to add these as a glossary addendum file written from the spec and decisions (definitions only, no new rules).

## Agent-decided (Q-0232, answered-agent; cited)

- No-access behaviour: in-place message "You don't have access to this. Ask your supervisor.", no redirect. Q-0214 overrides S15 States and the EZD-103 ticket text (decisions files override the spec).
- Customers: the Company page switch gates the list (S15a Permissions, Q-0210); email unique ignoring case, stored lower-case (docs/architecture.md sign-in email rule); EZ Binder fields and controls dropped (Q-0190, Q-0222).
- Logo: stored in the tenant's private bucket path and shown through a signed link as an image, never inlined; not a source_file row (03c: source_file belongs to a project).
- Signed download link lifetime: 15 minutes (11 Operations "short-lived"; same 15 minutes as Q-0049); security-reviewer confirms.
- Backup "current": last nightly file copy succeeded under 26 hours ago and last weekly dump is under 8 days old (11 Data retention, EZD-025).
- Testability: the "not on PDFs" check (AC-EZD-136-2) runs fully in Phase 25, when sheets exist; Phase 1 checks the disclaimer message is outside every print/export message group.

Note for the field check: in Phase 1 Settings opens only by typing its address (/settings); the avatar menu link is EZD-108 in Phase 2.
