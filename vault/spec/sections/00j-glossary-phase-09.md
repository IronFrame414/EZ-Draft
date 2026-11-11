# Glossary addendum · Phase 9

Added by spec-check 9 (Q-0700). Definitions only, each from the source named; no new rules. Read with `vault/spec/glossary.md` and addenda 00b to 00i.

| Term | Meaning | Code name | Source |
| --- | --- | --- | --- |
| Send | Emailing a frozen version to another party; every send makes a numbered version and a sent package. | `sent_package`; `version.sent` | R24 #4a, #15; 03d |
| Sent package | The record of one send: who, which version, when, and the link's token hash. | `sent_package` | 03d; Q-0700 |
| Copy link | The button beside Send that copies the same link the email carries; only right after the send. | `SendEmailResult.link` | R24 #15; Q-0700 |
| Client link | The URL a sent package opens, /c/ plus the token; the page itself comes in phase 39. | `token_hash` | 03b rule 11 |
| Version N | A client send before the first permit issue, counted from 1. | `model_version.is_sent`, `version_no` | R24 #26 (replaces the glossary's `kind = sent`, `rev_number`) |
| Working version | An unnumbered checkpoint (Stop editing, lock release, Finish import, Revert, snapshot, send). | `model_version` not sent, not snapshot | 03a |
| Checkpoint cause | Why a working version was written, shown on its row. | `model_version.cause` | board S20; Q-0700 |
| Named snapshot | A working version given a name; never deleted by cleanup. | `is_snapshot`, `label` | S20; 03c |
| Revert | Making a new working version from an older one after saving the current one. | `version.reverted` | S20; Q-0700 |
| Cleanup sheet | The window listing old working versions with Keep and Name before they are deleted. | `cleanup_due`; `cleanup_shown_at` | R24 #4; W15 |
| Cleanup age / grace | The two Defaults values, 30 and 7 days by default. | two registry keys | S15d:44; Q-0697 |
| Change summary | "N added · N changed · N removed" against the parent version. | computed | Q-0700 |
| Project card menu | The three-dot menu on a project card. | EZD-124 | S01 Controls |
| Archive / Restore | Hiding a project under Archived and bringing it back. | `project.archived_at` | Q-0201; Q-0227 |
| Completed | The status Mark complete sets; Reopen returns the prior status. | `status = complete`, `completed_from` | Q-0191; Q-0700 |
| Visual diff | Highlights on an opened old version showing what differs from the working copy. | EZD-139 | Q-0220 |
