# Data model: tables added in Round 26
<!-- Moved word for word from vault/spec/sections/03-data-model.md lines 90-103 (Q-0218). Check: node --test scripts/spec/split.test.mjs -->

Added in Round 26 (Oct 11 build-readiness audit):

| Entity | Key fields | Rules |
| --- | --- | --- |
| edit\_lock (added fields) | lock\_epoch | Goes up each time the lock changes hands; every save must match it |
| model\_version, model\_object (added fields) | schema\_version | Set on write; documents are upgraded on read |
| project (added fields) | scope\_of\_work, settings (json) | Scope of work prints in the title block; settings holds the per-project copies of Defaults made at creation. The code rules also need these project fields (EZD-620): county, wind-borne debris region, flood zone and base flood elevation, year built, sewer or septic, renovation cost, assessed structure value, and the computed alteration level |
| library\_item | tenant\_id, kind (note, abbreviation, hatch, part, saved\_group, task\_template), name, data (json) | Backs every Settings library tab except Details (EZD-131) |
| code\_rule | rule\_id, code (NEC, FBC-R, FBC-M, FBC-P, FBC-EC, company), edition, section, title, applies\_to, severity, verified\_by, verified\_at | The rule list shown in Settings 15g. The check logic is code keyed by rule\_id; this table holds the text, the section per edition and who verified it |
| render\_worker | tenant\_id, name, key\_hash, last\_heartbeat\_at, last\_job\_id | The local GPU worker's own revocable key; never the service key |
| order\_line | source\_file\_id, line\_no, code, width, face, finish | Confirmed 2020 order-report lines (EZD-916) |
| glossary, translation\_usage | term\_en, term\_es, keep\_in\_english; translation\_id, project\_id, place | Translation review (EZD-1501) |
| benchmark\_run | device, app\_version, results (json), run\_at | Written by the benchmark page Josh runs on the iPad (EZD-237) |

