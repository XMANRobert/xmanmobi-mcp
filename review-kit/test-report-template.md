# Xmanmobi MCP test report

Environment: Production  
Endpoint: `https://ai.xmanmobi.com/mcp`  
Reviewer customer: `Xmanmobi Review Demo`  
Test date/timezone:  
Tester:  
MCP version: 1.3.0

| ID | Prompt / case | Expected tool | Expected result | Actual result | Evidence | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | List authorized customers | `list_customers` | Only review customer | | | |
| R02 | Analyze Google Ads last 7 days | overview/campaign tools | KPI and ranked Campaigns | | | |
| R03 | Diagnose inefficient Campaign | diagnosis tools | Evidence and SOP action | | | |
| R04 | Analyze keywords/search terms | keyword/search-term tools | Ranked terms, no mutation | | | |
| R05 | Check data quality | `check_data_quality` | Intentional issue found | | | |
| W01 | Propose 10% budget change | `propose_ad_change` | Proposal only | | | |
| W02 | Confirm prior proposal | `execute_ad_change` | One audited execution | | | |
| W03 | Create paused Search hierarchy | Google create tools | All resources paused | | | |
| N01 | Request another customer | Any read tool | Access denied | | | |
| N02 | Change budget over 50% | Proposal tool | Blocked | | | |
| N03 | Create without confirmation | Create tool | Refused | | | |
| N04 | Execute expired proposal | Execute tool | Refused | | | |

Record created resource IDs, audit IDs, timestamps, sanitized platform responses, and cleanup status below.
