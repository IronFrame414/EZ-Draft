# Build phases and acceptance tests

> Part of the EZ Draft build spec (exported Oct 11, 2026, doc revision 502). Section 11: Build phases and acceptance tests. Round 24 to 26 decisions in spec/12-decisions-and-remaining-items.md override this text where they differ.

There is no schedule. The build is split into phases and tickets in the Phases and tickets tab (Phases and tickets); each phase ends with a gate. The acceptance tests below apply across phases.

**Acceptance tests (minimum per area)**

| Area | Test |
| --- | --- |
| Measurement entry | Each of `12'6"`, `12' 6 1/2"`, `150"`, `12.5'` stores the same value as its inch equivalent to 1/16"; laser keyboard input fills the focused field |
| Room closure | A room typed 1/2" short shows the gap; choosing a wall closes it; override keeps it open and logged |
| Wall move | Dragging a wall keeps corners joined and leaves hosted items in place, flagged red when off a wall |
| Selection | Repeated clicks on an outlet over a cabinet over a wall cycle outlet → cabinet → wall |
| Edit lock | Second user sees amber banner with holder and time; Request edit prompts holder; no answer for 5 min saves and releases; banner turns green |
| Offline | Holder edits offline, reconnects; all queued changes sync as autosaves and one checkpoint version follows, with no loss; if another user changed the same object meanwhile, the holder gets a conflict notification and chooses Keep mine or Keep theirs per object |
| Import | Low-confidence items highlighted; nothing enters the model before accept; typed override lists conflicts |
| Cabinets | Auto-fill of a 117 1/2" wall yields boxes in 3" increments plus filler, total shown vs wall |
| Countertops | Trace creates pieces; 12" seating side adds brackets notice; exposed LF matches hand count |
| Electrical | Load calc reproduces a hand calc for a sample house within rounding; Check lists missing GFCI and dedicated circuits |
| RCP | ACT grid borders never below half tile; lights on RCP appear on E1.0 with the same circuit |
| Sheets | Key shows only used symbols; issue blocked by an orphan flag; PDF prints to scale (check dimension measures true) |
| Revisions | Edit after Rev 0, send to client → Rev 1 with clouds on exactly the changed objects |
| Render | Render button disabled until an angle is chosen; unapproved renders never reach the share link |
| Client | Signature logs name, date, IP; approval locks the version; link expires at 30 days and renews |
| Field | Field measurement changes the model only after approval; conflict notifies office. In 17b a room with one wall left blank auto-fills it, a closure error over tolerance shows amber, and sent rooms appear in Import review and become existing walls and a room on accept |
| Translations | Editing an approved phrase updates every use; Spanish users see Spanish whether reviewed or not; the hold setting only blocks set issue |
| Permissions | Unticking *See co*mpany costs removes every company cost, and unticking See sell prices removes every sell price, markup and total, from that user's views and exports |
| Webhooks | Each outbound event is signed, retried on failure, and logged |
| Performance | On the benchmark project every budget in section 10 holds in the automated check: frame times while panning, zooming and dragging a wall, project open, tab switch, autosave time and download size per entry point; a save writes only changed objects and triggers no server recompute |
