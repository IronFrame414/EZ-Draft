### 09l · AI assistant cost line: worked examples

Added by spec-check 56 (Q-0637). Formula: cost in dollars = (input tokens × input price + output tokens × output price) / 1,000,000, with the tokens the provider reports for that prompt, which include any photo. Prices are constants in the code with their source and read date; a change is a ticket. Stored as numeric(10,6). The line shows dollars to 2 places, half up. Any cost above zero that would show $0.00 shows $0.01. The session total adds unrounded costs, then rounds the same way. A failed call with no usage reported costs $0.00.

Prices per million tokens (claude.com/pricing and platform.claude.com/docs/en/models/overview, read 2026-11-07): Claude Sonnet 5.5 input $2, output $10; Claude Opus 5.5 input $4, output $20.

| Case | Model, input, output tokens | Cost | Shows |
| --- | --- | --- | --- |
| Zero | Sonnet, 0, 0 | $0.000000 | $0.00 |
| Typical | Sonnet, 3,000, 1,400 | $0.020000 | $0.02 |
| Typical | Opus, 3,000, 1,400 | $0.040000 | $0.04 |
| Rounding down | Sonnet, 1,000, 1,000 | $0.012000 | $0.01 |
| Rounding, half up | Sonnet, 2,500, 1,000 | $0.015000 | $0.02 |
| Above zero, under half a cent | Sonnet, 100, 0 | $0.000200 | $0.01 |
| Maximum | Opus, 200,000, 8,192 | $0.963840 | $0.96 |
| Session | $0.012000 + $0.012000 + $0.012000 | $0.036000 | $0.04 |
