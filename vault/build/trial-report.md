# Build v3 trial report

Written by scripts/loop.mjs on 2026-11-14 02:59 UTC, when 20 tickets had been handled (loop started 2026-11-13T03:30:03Z).
Dollar figures are the CLI's list-price estimates; on the subscription they measure usage share, not money spent.

## Results
- Merged: 20
- Set aside: 0
- Repair builds: 0

## Usage
```
Calls 68 · tickets 22 · total $287.29 (est.) · tokens 586.88M · agent time 1136 min
Fable: $54.58 = 19% of cost · 20.94M tokens = 4% of tokens
Opus: $232.72 = 81% of cost
Per ticket: $13.06 average, Fable $2.48 average
By role and model:
  builder · claude-opus-5-5: 25 calls, $224.25, 535.40M
  reviewer · claude-fable-5-2: 30 calls, $54.58, 20.94M
  builder-fix · claude-opus-5-5: 13 calls, $8.47, 30.54M
```

## Per ticket
| Ticket | Result | Est. cost | Fable | Agent minutes | Calls |
| --- | --- | --- | --- | --- | --- |
| EZD-397 | merged | $6.23 | $0.74 | 108 | 3 |
| EZD-421 | merged | $12.13 | $3.20 | 59 | 5 |
| EZD-135b | merged | $8.51 | $2.22 | 34 | 3 |
| EZD-105 | merged | $35.88 | $2.72 | 91 | 5 |
| EZD-106 | merged | $18.20 | $4.67 | 52 | 4 |
| EZD-105b | other | $13.21 | $3.90 | 43 | 6 |
| EZD-107 | merged | $15.53 | $6.16 | 50 | 6 |
| EZD-109 | merged | $8.52 | $2.11 | 28 | 2 |
| EZD-129 | merged | $11.07 | $1.65 | 32 | 2 |
| EZD-138 | merged | $8.95 | $1.74 | 40 | 2 |
| EZD-116 | other | $17.02 | $2.43 | 49 | 3 |
| EZD-234 | merged | $28.12 | $5.09 | 80 | 5 |
| EZD-226 | merged | $7.25 | $1.58 | 36 | 2 |
| EZD-227 | merged | $10.36 | $1.63 | 57 | 2 |
| EZD-131 | merged | $8.38 | $1.48 | 37 | 2 |
| EZD-223 | merged | $8.53 | $1.58 | 46 | 2 |
| EZD-231 | merged | $9.52 | $1.40 | 49 | 2 |
| EZD-233 | merged | $17.74 | $2.18 | 66 | 2 |
| EZD-301 | merged | $12.77 | $2.13 | 43 | 2 |
| EZD-302 | merged | $8.45 | $1.32 | 34 | 2 |
| EZD-303 | merged | $3.06 | $0.99 | 18 | 2 |
| EZD-307 | merged | $17.86 | $3.65 | 85 | 4 |

## Set aside
None.

Qualitative assessment (review findings real vs noise, fix tickets created, comparison with the old process) is added in the next interactive session.
