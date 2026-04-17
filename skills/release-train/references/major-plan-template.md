# Major plan template

Shape of `openspec/major/vX/plan.md`. Copy, fill, commit before `minor_spec(vX.1)` runs.

---

```markdown
# Major vX plan

_Written YYYY-MM-DD. Owner: <operator or bot name>._

## Goals

- <primary outcome this major must deliver>
- <secondary outcome>

## Non-goals

- <explicitly out of scope for vX>

## Constraints

- <platform, compliance, performance, deadline — one line each>

## Minor slices

Ordered. Each row is one `openspec/changes/vX.Y/` that will be authored on trigger.

| Minor | Intent (one line) | Depends on | Status |
|---|---|---|---|
| vX.1 | <intent> | — | planned |
| vX.2 | <intent> | vX.1 | planned |
| vX.3 | <intent> | vX.1 | planned |

Status values: `planned` (not yet specced), `active` (openspec change exists), `shipped` (tagged), `stale` (invalidated — must re-spec before build).

## Dependencies

Free-form: DAG notes, ordering constraints, "vX.3 cannot ship before vX.1 and vX.2", etc.

## Risks

- **<risk name>** — <what breaks, how likely, mitigation>.

## Cross-slice notes

"If we change slice A, revisit slices B…" — the kind of edit that would invalidate other slices.

- If **vX.1** changes <thing>, revisit **vX.2** because <reason>.
- If **vX.2** changes <thing>, revisit **vX.3** because <reason>.

## Invalidation log

Append-only. Each entry records when a `revise` or scope change marked a slice stale.

<!-- Example:
### 2026-04-20 — vX.2 widened to include <thing>
- Stale minors: vX.3 (depended on old vX.2 surface)
- Stale major: false
- Reason: acceptance criteria 3 in vX.2 now covers endpoint previously owned by vX.3.
- Action: refresh minor_spec(vX.3) before building.
-->
```
