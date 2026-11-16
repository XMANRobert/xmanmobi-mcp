---
name: ad-performance-diagnosis
description: Diagnose Google Ads and Meta Ads performance using Xmanmobi reporting data when a user asks why results changed, which campaigns need attention, or what to optimize next.
---

# Advertising Performance Diagnosis

Produce an evidence-backed diagnosis within the connected user's authorized customer scope.

1. Resolve the customer, platform, project, date range, business KPI, and comparison period. Ask for the target CPA/ROAS or business objective when it materially changes the conclusion.
2. Call `check_data_quality` when freshness or completeness is unknown. Treat stale, partial, or missing data as a limitation rather than a zero.
3. Use `get_ad_overview` and `compare_ad_periods` to establish account-level direction before drilling into campaigns, ad groups, ads, keywords, or search terms.
4. Separate observed metrics from interpretations. Cite spend, conversions, conversion value, CPA/ROAS, sample size, and period change behind each finding.
5. Prioritize findings by potential business impact and confidence. Do not label a campaign good or bad using a universal threshold when the customer's target is unknown.
6. Return a short action queue with owner, expected signal, observation window, and rollback or stop condition. Recommendations are proposals only; never claim an account change occurred.

Read [references/diagnosis-method.md](references/diagnosis-method.md) for metric gates, diagnostic branches, and the optimization SOP.
