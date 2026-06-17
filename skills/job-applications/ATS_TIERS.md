# ATS Tier Allowlist

Source of truth: `scripts/lib/ats-url-filter.mjs`

## Tier 1 — PRIMARY (auto-apply)

| Platform | URL signals |
|----------|-------------|
| Ashby | `jobs.ashbyhq.com`, `ashbyhq.com`, `?ashby_jid=` |
| Lever | `jobs.lever.co`, `lever.co/.../apply` |
| **Greenhouse** | `*.greenhouse.io`, `job-boards.*.greenhouse.io`, URL 含 `gh_jid=` / `gh_src=` |

**Rules:** Must attempt fill + Submit. read `greenhouse-apply/` for GH. `append-applied-job` rejects `skipped_platform` on Tier1 URLs.

## Tier 2 — SECONDARY (default on)

| Platform | Host |
|----------|------|
| **Rippling** | `ats.rippling.com` |
| **UltiPro** | `recruiting.ultipro.com`, `recruiting2.ultipro.com` |
| **Hiresome** | `*.hiresome.ai` |
| SmartRecruiters | `jobs.smartrecruiters.com` |
| PinpointHQ | `pinpointhq.com` |
| BambooHR | `bamboohr.com` |
| ApplyToJob | `applytojob.com` |
| Sterling | `sterling-engineering.com` |

## WORKDAY (auto-apply in external loop)

| Platform | URL signals |
|----------|-------------|
| Workday | `myworkdayjobs.com`, `.wdN.myworkday` |

**Rules:** read `workday-apply/`; append `submitted_workday`.

## Tier2 MASTER skills (browser fill)

| Platform | Skill folder |
|----------|--------------|
| Hiresome | `hiresome-apply/MASTER_apply.md` |
| UltiPro | `ultipro-apply/MASTER_apply.md` |
| Rippling | `rippling-apply/MASTER_apply.md` |

## HARD BLOCK

**Aggregators:** sundayy, fetchjobs, ladders, remotehunter, …

**Enterprise ATS (batch):** ICIMS, Taleo, SuccessFactors, Oracle Cloud

## Pipeline usage

```bash
node scripts/run-external-apply.mjs --target=100 --unlimited-continuations
# Tier2 included by default; optional --open-allowlist for ICIMS/custom sites
```

## Agent must NOT

- Skip Greenhouse with `skipped_platform reason:Greenhouse` without filling
- Skip Tier1/Tier2 from LinkedIn listing without opening apply tab
- Use `linkedin.com/jobs/view` as skip/submit URL (except `skipped_aggregator`)
