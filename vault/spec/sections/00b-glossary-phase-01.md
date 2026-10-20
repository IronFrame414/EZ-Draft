# Glossary addendum · Phase 1

Added by spec-check 1 (Q-0231). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md`.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Tenant (company) | One company using EZ Draft; Worth Properties is tenant 1. Every company-owned row carries its id. | `tenant`, `tenant_id` | 03 Tables tenant; docs/architecture.md Tenancy tables |
| Customer | A client of the company: name, email, phone, address. The email is what the client types to verify before signing. | `customer` | 03d customer; S15a Customers; R24 #32; Q-0227 |
| Role preset | One of the four fixed roles (Owner, Designer, Foreman, Crew) that pre-ticks a user's permission switches; custom roles are added by the owner. | `role` | 10 Permissions and settings; S15 Decisions 3 |
| Permission switch | One box on a user's permission checklist; the user may do the action only when it is ticked. | `user_permission` key | 10 Permissions and settings; S15 Permission list |
| Page switch | A permission switch that opens one Settings page (Users, Company, Title block, Sheet presets, Defaults, Catalog, Render models, Code edition, Libraries, System status; Translations per Q-0234). | `user_permission` key | Q-0210; Q-0225; Q-0234 |
| Project access | Whether a user sees All projects or only Listed projects (their own jobs). | `membership.scope` (`all`, `listed`), `membership_project` | S15 Decisions 13; Q-0202 |
| Source file | An uploaded original that belongs to a project (scan, PDF, DXF, photo and so on); never changed after upload. | `source_file` | 03c source_file |
| Off-site copy | The nightly copy of new stored files and the weekly database dump kept at a second provider (Backblaze B2). | — | 11 Data retention; Q-0074; Q-0075; EZD-025 |
| Surface | Which kind of screen a page is for, which decides its messages and language: office, field (crew phone), client link, sign-in, developer pages. | `Surface` (`office`, `field`, `client`, `sign_in`, `dev`) | docs/architecture.md Messages and language |
