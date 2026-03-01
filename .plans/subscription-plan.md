# Subscription Model Plan

## Core Principle

Gate features that scale with **team size**, **usage volume**, or **advanced workflows** — while keeping the solo developer experience compelling enough to get hooked.

---

## Free Tier — Solo Developer

Everything the app does today: single board, all 4 agents, drag-and-drop, priority, sorting, filters, retry. Enough to be genuinely useful.

**Limits:**
- 1 board / workspace
- 3 concurrent agent runs
- 7-day event history (auto-purge older logs)
- Community agents only (Copilot, Claude, Codex, OpenCode)

---

## Pro Tier — Power User / Small Team

| Feature | Why it's worth paying for |
|---------|--------------------------|
| **Multiple boards/workspaces** | Separate boards per project (frontend, backend, infra) |
| **Agent duration dashboard** | Cost visibility — "Claude spent 47 min this week" drives ROI decisions |
| **Unlimited event history + export** | Full audit trail, downloadable logs for compliance/debugging |
| **Project presets** (template pivot) | Save WorktreeDialog config per repo — time saver for multi-project devs |
| **"Done" → Reopen transition** | Iterate on completed work without recreating tasks |
| **Keyboard shortcuts** | Power user velocity — these users are the ones who pay |
| **Custom agent models** | Override model per task (e.g., use Opus for complex, Haiku for simple) |
| **Webhook notifications** | Slack/Discord/email when agent completes or fails |

---

## Team Tier — Organizations

| Feature | Why it's worth paying for |
|---------|--------------------------|
| **Multi-user with roles** | Shared board, assign tasks to team members, RBAC |
| **Task dependencies** | Complex workflows: "deploy after tests pass" |
| **Agent queue/orchestration** | Batch 20 tasks, run sequentially, get a report |
| **Shared project presets** | Team-wide repo configs, not per-user localStorage |
| **Usage analytics** | Who ran what, how much time/cost per person, per project |
| **SSO / SAML** | Enterprise auth requirement |
| **Audit log** | Who changed what, when — compliance requirement |
| **API access** | Integrate with CI/CD, create tasks programmatically |
| **Priority support** | SLA on response time |

---

## Features to Keep Free (Never Gate)

- Agent selection (all 4 agents) — this is the hook
- Priority, sorting, filters — basic UX shouldn't be paywalled
- Drag-and-drop, retry — core functionality
- Single board with unlimited tasks — let users go deep before upgrading

---

## Build Order for Subscription Readiness

Priority order — each step unlocks the next:

1. **Multi-user auth + boards** — hard prerequisite for any paid tier
2. **Usage tracking/limits** — need metering before you can enforce limits
3. **Agent duration dashboard** — immediate visible value, easy upsell trigger
4. **Webhook notifications** — low effort, high perceived value
5. **Export event log** — already have the data, just need a button
6. **Project presets in WorktreeDialog** — pivot existing template backend
7. **Task dependencies** — unlock Team tier workflows
8. **Agent queue/orchestration** — batch runs for power users and teams
