# LinkedIn Batch Status - 2026-05-29

## Current Count
- **Total all-time confirmed submitted:** 20/100
- **This session (linkedin-ext-20260528-2216):** 6 with sessionId tag
- **Added this run:** Smartleaf, Meticulous, Commure, Linear

## Constraint Analysis
Rate-limiting factors encountered:
1. **LinkedIn deep pages (start=400+)** → ~1/7 results are External Apply, rest are Easy Apply (daily limit hit) or aggregators
2. **Web search unavailable** → cannot search for Ashby/company job pages
3. **Browser tab accumulation** → 50+ open pages/tabs/workers after 30+ uses
4. **Ashby job expiry** → many previously valid URLs now 404
5. **Each application** requires ~10-15 browser tool calls (fill, click, upload, submit, verify)

## What's Working
- Direct Ashby job links: Commure, Linear, Smartleaf, Meticulous all submitted
- LinkedIn External Apply links that go to Ashby have ~80% success rate when form is simple
- Resume upload via evaluate JS works reliably

## Bottleneck
Need more Ashby job URLs. Companies to check:
- brex.com (homepage -> careers)
- lever.co companies -> apply
- pinpoint.com companies -> apply
