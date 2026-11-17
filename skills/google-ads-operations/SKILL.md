---
name: google-ads-operations
description: Plan and safely perform Google Ads campaign creation, replacement creative or landing-page changes, keyword and targeting changes, and guarded automation through Xmanmobi when the user requests advertising operations.
---

# Google Ads Operations

Keep analysis, creation, and autonomous optimization as separate authorization levels.

## Create or replace resources

1. Resolve the authorized account, campaign hierarchy, business objective, conversion goal, geography, language, budget, bidding assumptions, creative, and HTTPS landing page.
2. Validate policy-sensitive text and URL inputs. State missing prerequisites instead of inventing them.
3. Show the exact resource preview and ask for explicit confirmation.
4. Call the relevant creation tool only after confirmation. New Campaigns, Ad Groups, Ads, and keywords must remain `PAUSED`.
5. Re-read the created resource and report its real platform result. Enabling delivery is a separate operation.

Do not mutate historical ad text, keyword text, match type, or landing pages in place. Create a paused replacement so history and rollback evidence remain available.

## Budget and status changes

Use `propose_ad_change`, then wait for a later user turn confirming the exact proposal before calling `execute_ad_change`. Never treat “optimize this account” as execution permission.

## Autonomous optimization

Autonomous budget adjustment, low-efficiency pause, and rollback are configured only in the Xmanmobi BI automation page. Do not enable an account policy from a general optimization request. Require the administrator to set a CPA or ROAS target, limits, cooldown, data-freshness guard, rollback threshold, and global kill-switch state.

Read [references/google-ads-operations-sop.md](references/google-ads-operations-sop.md) before preparing a launch or automation policy.
