---
title: Anthropic API error bodies, status codes, spend-limit behaviour, and GET /v1/models shape
scope: platform.claude.com/docs/en/api/errors, platform.claude.com/docs/en/api/rate-limits, platform.claude.com/docs/en/api/models/list (Anthropic official API docs only)
ticket: none given in brief
---

# Findings (read 2026-11-07)

## (1) Error body and types
- Body: `{"type":"error","error":{"type":"<type>","message":"..."},"request_id":"req_..."}`. Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 400 invalid_request_error; also used for an org or workspace spend limit you set (not Claude Code workspace, which uses 429). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 401 authentication_error (bad, revoked or expired key). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 402 billing_error (billing or payment information issue). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 403 permission_error (key lacks permission for the resource). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 404 not_found_error. Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 413 request_too_large (Messages 128 MB, Batch 256 MB, Files 500 MB). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 429 rate_limit_error (rate limit, tier spend cap, or Claude Code workspace limit). Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- 500 api_error; 504 timeout_error; 529 overloaded_error. Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- Not documented: a full 401 or 402 sample body. The page documents only the generic shape.

## (2) No credit, usage limit, or spend limit
- No credit balance or "no credit" body is documented on the pages read. The 402 billing_error entry is the only billing-status text. Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- Limit you set yourself: HTTP 400, invalid_request_error, message starts "You have reached your specified API usage limits" (or "...workspace API usage limits"). Source: https://platform.claude.com/docs/en/api/rate-limits (read 2026-11-07).
- Tier monthly cap (Start $500, Build $1,000, Scale $200,000): HTTP 429, rate_limit_error, with `error.details.error_code` = `enforced_spend_limit_reached`, no retry-after header. Source: https://platform.claude.com/docs/en/api/rate-limits (read 2026-11-07).

## (3) Sample bodies
- 401: no verbatim sample documented; shape only (see errors page above).
- 402: no verbatim sample documented; shape only.
- 429 spend cap (documented verbatim):
  `{"type":"error","error":{"type":"rate_limit_error","message":"You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-09-01 at 00:00 UTC.","details":{"error_code":"enforced_spend_limit_reached"}},"request_id":"req_018EeWyXxfu5pfWkrYcMdjWG"}`
  Source: https://platform.claude.com/docs/en/api/rate-limits (read 2026-11-07).
- 429 ordinary rate limit: body not shown; the page says the message names the limit exceeded and that `retry-after` gives seconds to wait. Source: https://platform.claude.com/docs/en/api/rate-limits (read 2026-11-07).
- request-id: header `request-id` (example `req_018EeWyXxfu5pfWkrYcMdjWG`), also the `request_id` body field. Source: https://platform.claude.com/docs/en/api/errors (read 2026-11-07).
- Retry-after: header in seconds, present on rate-limit 429s but not on the spend-cap 429. Source: https://platform.claude.com/docs/en/api/rate-limits (read 2026-11-07).

## (4) GET /v1/models
- Success body: `{"data":[{"type":"model","id":"...","display_name":"...","created_at":"...","lifecycle":"active|deprecated|retired","capabilities":{...},"max_input_tokens":n,"max_tokens":n,...}],"first_id":"...","has_more":true,"last_id":"..."}`. Source: https://platform.claude.com/docs/en/api/models/list (read 2026-11-07).
- Auth example uses `Authorization: Bearer` and `anthropic-version` headers. Source: https://platform.claude.com/docs/en/api/models/list (read 2026-11-07).
- Free or credit-free status: not documented on this page.
