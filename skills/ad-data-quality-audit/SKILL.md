---
name: ad-data-quality-audit
description: Audit Xmanmobi Google and Meta reporting quality when a user asks about missing data, stale synchronization, attribution inconsistencies, or whether analysis is reliable.
---

# Advertising Data Quality Audit

1. Resolve the customer, platform, projects, date range, expected timezone, currency, and conversion events.
2. Call `check_data_quality`, `list_ad_accounts`, and `list_delivery_projects`. Use `get_ad_overview` or `analyze_conversion_funnel` to verify reported coverage.
3. Classify issues as access/binding, freshness, completeness, consistency, attribution, or identity/mapping.
4. Distinguish a confirmed zero from missing or stale data. Never fill absent metrics with assumed values.
5. Report severity, affected scope, evidence, likely analytical impact, and the owner or system best placed to verify it.
6. State whether the dataset is fit for directional analysis, efficiency decisions, or neither.

Read [references/audit-checklist.md](references/audit-checklist.md) for severity and acceptance criteria.
