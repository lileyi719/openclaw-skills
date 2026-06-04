# ATS Tier Allowlist

Source of truth: `scripts/lib/ats-url-filter.mjs`

## Tier 1 — PRIMARY (auto-apply)

| Platform | URL signals |
|----------|-------------|
| Ashby | `jobs.ashbyhq.com`, `ashbyhq.com` |
| Ashby embed | any host with `ashby_jid=` query |
| Lever | `jobs.lever.co`, `lever.co/.../apply` |

**Rules:** Must attempt fill + Submit. `append-applied-job` rejects `skipped_platform` on Tier1 URLs.

## Tier 2 — SECONDARY (optional, `--include-secondary`)

| Platform | Host |
|----------|------|
| Rippling | `ats.rippling.com` |
| SmartRecruiters | `jobs.smartrecruiters.com` |
| PinpointHQ | `pinpointhq.com` |
| BambooHR | `bamboohr.com` (see `external-apply/bamboohr.md`) |
| ApplyToJob | `applytojob.com` |
| Sterling | `sterling-engineering.com` |

## MANUAL_ONLY (skip in external batch)

- Greenhouse (`greenhouse.io`, `gh_jid`)
- Workday (`myworkdayjobs.com`, `.wdN.myworkday`)

Use `workday-apply` pipeline for Workday.

## HARD BLOCK

**Aggregators:** sundayy, fetchjobs, ladders, remotehunter, braintrust, dataannotation, micro1, alignerr, jobright, haystack, … (full list in `ats-url-filter.mjs`)

**Enterprise ATS (batch):** ICIMS, Taleo, SuccessFactors, Oracle Cloud

## Pipeline usage

```bash
# Day 1–2: scan Tier1 queue + apply with URL validation
node scripts/scan-ats-external.mjs --limit=25 --pages=3
node scripts/run-external-apply.mjs --preflight-scan --from-queue --target=100

# Resume same batch
node scripts/run-external-apply.mjs --session-id=linkedin-ext-YYYYMMDD-HHMM --from-queue
```

## Agent must NOT

- Skip from LinkedIn listing without opening apply tab
- Use `linkedin.com/jobs/view` as skip/submit URL (except `skipped_aggregator`)
- Deep-pagination `start=300` on exhausted keywords
