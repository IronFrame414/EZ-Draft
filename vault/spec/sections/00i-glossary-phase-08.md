# Glossary addendum · Phase 8

Added by spec-check 8 (Q-0697). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00h.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Defaults registry | The one typed list of every company default (key, group, label, type, unit, default, per-project flag); the page and every reader use it. | none yet (EZD-116 plan names it) | EZD-116 row; S15d; Q-0697 |
| Company default | A value on Settings → Defaults, read live unless the project holds its own copy. | `tenant.defaults[key]` | S15d; 03c tenant |
| Project setting | The project's own copy of a per-project default, made at creation and changed in Project settings. | `project.settings.defaults[key]` | EZD-130; Q-0697 |
| Not set | A default with no stored value and no registry default. | none | S15d States |
| Set in Defaults | The note shown where a needed default is Not set. | none | S15d Entry points |
| Project settings | The dialog from the header project menu for the project's details and its copies of defaults. | none yet | EZD-130; Q-0396 |
| Project switcher | The menu under the header project name: recent projects, search, Back to projects, Project settings. | none yet | 04 Header card; S01 |
| Recent projects | The projects this user opened most recently. | none yet (EZD-128 plan) | Q-0697 |
| Lock holder | The one person who may change the model, sheets, options and markup of a project now. | `edit_lock.holder_app_user_id` | R24 #16; 03c; Q-0697 (replaces the glossary's `project.lock_holder`) |
| Edit request | A viewer's ask to take the lock; one pending per user; ends in Release, Keep, Cancel or the timer. | `edit_request` | S06; 03c |
| Auto release | The release that happens when a request goes unanswered for the Defaults minutes. | `lock.auto_released` | S06:76; Q-0188 |
| Start editing / Stop editing | Taking a free lock from the green toast; saving, checkpointing and releasing from the header. | none yet | S06:78-79 |
| View only | The editor state of anyone not holding the lock, shown in the status bar. | none yet | S06:80 |
| Presence | Who is in the project now, shown as header avatars; the holder has an amber ring. | Realtime Presence `appUserId` | S06:81 |
