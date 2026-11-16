---
name: ad-change-management
description: Safely propose, confirm, execute, and audit supported Google or Meta advertising changes through Xmanmobi when a user explicitly asks to change budget or delivery status.
---

# Advertising Change Management

Use the guarded two-step workflow. Never call `execute_ad_change` in the same user turn that first proposes the change.

1. Resolve the exact customer, platform, local resource ID, current value, intended value, and reason. Use read tools when any target is ambiguous.
2. Call `propose_ad_change`. This records a proposal but does not modify the advertising platform.
3. Show the user the platform, resource name and ID, current value, new value, risk level, and expiry time. Ask for explicit confirmation of that exact change.
4. Only after a later user message clearly confirms the displayed change, call `execute_ad_change` with the proposal ID and confirmation token.
5. Report the actual execution result and audit status. Never claim success from the proposal response.
6. Use `list_ad_change_audit` when the user asks what changed or when an outcome needs verification.

Do not reinterpret a general request such as "optimize my account" as authorization to execute changes. Do not split a blocked budget increase into smaller proposals to bypass the safety limit. Unsupported creation, deletion, targeting, keyword, creative, billing, or bulk changes must remain recommendations only.
