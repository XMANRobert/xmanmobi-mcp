# Review readiness checklist

Code and manifests alone do not establish that a hosted plugin works. Complete this checklist against the production endpoint before submitting.

## Dedicated reviewer account

- Create a non-administrator reviewer user.
- Assign exactly one simulated customer.
- Disable MFA, magic links, VPN requirements, and first-login password changes for the review period.
- Keep credentials only in the private review form, never in GitHub or the plugin ZIP.
- Confirm the account cannot access any other customer.

## Simulated data

Provide at least 30 days for Google. Add Meta only when its developer permissions are available, including:

- Two ad accounts and delivery projects.
- Campaigns, ad groups/ad sets, ads, creatives, Google keywords, and search terms.
- Spend, impressions, clicks, conversions, and conversion value with non-zero examples.
- At least one high-spend/low-conversion campaign and one efficient campaign.
- At least one stale report, unbound account, or missing conversion value for data-quality testing.

Label the customer and records as simulated review data. Do not copy real customer personal data.

## Test report

For every published tool record:

- Prompt and parameters.
- Expected customer scope.
- Tool invoked.
- Result summary and timestamp.
- Pass/fail outcome.
- Screenshot or redacted output reference.

Also test expired tokens, unassigned customer IDs, invalid dates, empty data, and unsupported write requests.

## Recording

Record one continuous walkthrough showing:

1. Connecting the production MCP URL.
2. OAuth login and the separate read/write consent text.
3. Customer discovery and access scope.
4. The five positive review cases.
5. The three negative cases.
6. One proposal that visibly does not change the platform, followed by a separate explicit confirmation, execution, and audit lookup.
7. Evidence that unconfirmed, over-limit, unsupported, and cross-customer write requests are refused.

Use the executable checklist, prompts, simulated-data contract, and report template in [`review-kit/`](../review-kit/README.md).

Keep the recording URL accessible to reviewers without requesting access. Do not expose passwords, browser-stored tokens, real customer names, or developer tools containing authorization headers.
