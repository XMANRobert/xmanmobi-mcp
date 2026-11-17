# Google Ads operations SOP

## Launch gate

- Confirm account currency, timezone, billing readiness, conversion tracking, final URL availability, geography, language, schedule, and owner.
- Search Campaigns require a coherent Campaign, Ad Group, responsive search ad, and keyword structure.
- Create every new object paused. Verify IDs and policy status before any enable request.
- Keep one material change per test where possible so the result remains attributable.

## Optimization evidence

- Confirm report freshness and attribution lag before evaluating CPA or ROAS.
- Use the customer's target; never infer a universal profitable CPA or ROAS.
- Require minimum spend and conversion volume before budget scaling.
- For zero-conversion pauses, require a configured spend threshold and document the observation window.
- Apply cooldown and daily action limits. Do not repeatedly adjust the same Campaign inside the cooldown period.

## Budget rules

- Single automated budget movement is capped at 20%.
- Respect account-specific minimum and maximum budgets.
- Scaling requires stable tracking and efficiency near or above target.
- Reductions require material efficiency deterioration, not one noisy day.

## Rollback

- Record the pre-change value and performance window.
- Wait for the configured post-change observation window.
- Roll back budget changes when CPA worsens or ROAS falls beyond the configured threshold.
- Do not automatically re-enable a Campaign paused for zero conversions.
- All rollback actions use the audited change-batch path and remain subject to the global kill switch.

## Required output

For every operation report: resource and account, evidence, old/new value, risk, confirmation status, platform result, audit reference, observation window, and rollback condition.
