# Xmanmobi MCP

[中文文档](docs/README.zh-CN.md) | [Website](https://ai.xmanmobi.com/mcp.html) | [Support](https://ai.xmanmobi.com/mcp-support.html)

Xmanmobi is an MCP integration for Google Ads and Meta Ads analytics plus guarded advertising changes. It lets compatible AI clients inspect performance and, when separately authorized, propose and execute supported budget or delivery-status changes after explicit user confirmation.

This repository includes the MCP gateway source, OAuth reference implementation, plugin manifests, and domain-specific advertising analysis skills. See [Architecture and trust boundaries](docs/architecture.md).

## What it can do

- Summarize Google Ads and Meta Ads performance.
- Compare current and previous reporting periods.
- Rank campaigns, ad groups, ads, keywords, and search terms.
- Analyze creative performance and metadata quality.
- Review conversion funnels and reporting freshness.
- Diagnose campaign performance without changing advertising resources.

The 15 analysis tools are read-only. Three guarded tools handle proposals, confirmed execution, and audit history. Campaign creation, deletion, targeting, creative, billing, and unrestricted automation are not supported.

## Connect

The hosted MCP endpoint is:

```text
https://ai.xmanmobi.com/mcp
```

### Codex CLI

Add the server to your Codex MCP configuration:

```toml
[mcp_servers.xmanmobi]
url = "https://ai.xmanmobi.com/mcp"
auth = "oauth"
```

Then authenticate:

```bash
codex mcp login xmanmobi
```

Your browser will open the Xmanmobi OAuth page. Sign in and review the separate read and advertising-management permissions. Never paste passwords, access tokens, refresh tokens, or authorization codes into a chat.

### Plugin package

This repository is itself a portable plugin package. Download a release ZIP or clone the repository, then use the plugin installation flow supported by your client. The package points to the hosted MCP service; it does not run the private Xmanmobi backend locally.

## Example prompts

```text
Use Xmanmobi to analyze my Google Ads performance for the last 7 days and list campaigns that need attention.
```

```text
Compare my Google and Facebook advertising performance this month.
```

```text
Analyze my Google Ads search terms for the last 30 days and identify converting terms and possible negative keywords.
```

```text
Check my advertising data quality and identify stale synchronization or missing conversion values.
```

More examples are available in [docs/examples.md](docs/examples.md).

## Professional skills

- `ad-performance-diagnosis`: metric decomposition, prioritization, and optimization SOP.
- `ad-creative-analysis`: creative evidence grading, fatigue review, and controlled test planning.
- `ad-data-quality-audit`: access, freshness, completeness, consistency, and attribution checks.
- `get-started`: connection and first-analysis workflow.
- `ad-change-management`: guarded proposal, confirmation, execution, and audit workflow.

The methods avoid universal CPA/ROAS thresholds. They use the customer's objective when available and explicitly report insufficient evidence.

## Available tools

| Tool | Purpose |
| --- | --- |
| `list_customers` | List customers available to the connected user |
| `list_delivery_projects` | List authorized delivery projects |
| `list_products` | List products in the authorized scope |
| `list_ad_accounts` | List connected Google and Meta ad accounts |
| `get_ad_overview` | Summarize advertising KPIs |
| `get_campaign_performance` | Analyze campaign performance |
| `get_ad_group_performance` | Analyze ad group or ad set performance |
| `get_ad_performance` | Analyze individual ad performance |
| `get_google_keyword_performance` | Analyze Google keyword performance |
| `analyze_google_search_terms` | Analyze Google search terms |
| `analyze_ad_creatives` | Analyze creative results and metadata |
| `analyze_conversion_funnel` | Review the conversion funnel |
| `compare_ad_periods` | Compare two reporting periods |
| `diagnose_ad_campaigns` | Diagnose campaign performance |
| `check_data_quality` | Check bindings, freshness, and missing values |
| `propose_ad_change` | Create a short-lived budget/status proposal without changing the platform |
| `execute_ad_change` | Execute one explicitly confirmed proposal |
| `list_ad_change_audit` | Review proposal, rejection, execution, and before/after audit records |

## Repository scope

This public repository contains:

- Plugin and MCP manifests.
- The onboarding skill.
- Three advertising methodology skills with diagnostic rules and SOPs.
- TypeScript MCP gateway source and smoke tests.
- A ThinkPHP OAuth 2.1 + PKCE reference implementation.
- A guarded ThinkPHP advertising-change reference and audit schema.
- Public documentation and examples.
- Brand assets used by the plugin listing.

The private BI business API, advertising-platform credentials, customer data, and internal deployment configuration are intentionally not included.

## Roadmap and review

- [Write-action security design](docs/write-actions-roadmap.md)
- [Review account, simulated data, test report, and recording checklist](docs/review-readiness.md)

## Privacy and security

- OAuth is used for user authorization.
- Tool results are restricted to customers assigned to the connected Xmanmobi account.
- Analysis tools are read-only; write tools require a separate scope, role permission, explicit confirmation, and audit record.
- Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

See the [Privacy Policy](https://ai.xmanmobi.com/mcp-privacy.html) and [Terms of Service](https://ai.xmanmobi.com/mcp-terms.html).

## License

The files in this repository are available under the [MIT License](LICENSE). Use of the hosted Xmanmobi service remains subject to the Xmanmobi Terms of Service.
