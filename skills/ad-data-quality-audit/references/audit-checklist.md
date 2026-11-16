# Data quality checklist

## Checks

- Every selected project maps to the intended customer, product, platform, and ad account.
- Report dates cover the requested period and synchronization timestamps are current enough for the decision.
- Currency and timezone are consistent or explicitly normalized.
- Campaign/ad-group/ad identifiers are present and stable.
- Conversion events and values are mapped to the intended business outcome.
- Spend, clicks, conversions, and value reconcile across levels within expected platform reporting behavior.
- Missing values are distinguishable from true zeros.

## Severity

- **Critical:** cross-customer exposure, wrong account mapping, or unusable authentication.
- **High:** missing spend/conversion data, stale periods used for active decisions, or broken conversion mapping.
- **Medium:** partial entity mappings, inconsistent metadata, or delayed non-critical dimensions.
- **Low:** cosmetic naming or optional metadata gaps with no metric impact.

## Fitness statement

Conclude with one of:

- Fit for efficiency and allocation decisions.
- Fit only for directional analysis, with named limitations.
- Not fit for decision-making until named issues are resolved.
