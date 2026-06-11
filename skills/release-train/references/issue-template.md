# Tracking issue template

Body of the GitHub issue opened for each `vX.Y` after preview is live. One issue per minor.

---

```markdown
# Release train: vX.Y

**Version:** `vX.Y`
**Preview:** <deploy URL>
**Spec:** [`openspec/changes/vX.Y/`](../tree/main/openspec/changes/vX.Y)
**Major plan:** [`openspec/major/vX/plan.md`](../tree/main/openspec/major/vX/plan.md)

## Test checklist

Rendered from `openspec/changes/vX.Y/specs/**/spec.md` acceptance criteria. Tick each item after verifying against the preview.

- [ ] <acceptance criterion 1>
- [ ] <acceptance criterion 2>
- [ ] <acceptance criterion 3>

## Commands

Comment on this issue with:

- `@sundaibot approve` — all boxes checked, preview confirmed. Tag `vX.Y.0`, archive the change, append `CHANGELOG.md`, close this issue, run the `post_approve` hook.
- `@sundaibot revise <text>` — describe what needs to change. The bot will triage: code patch, spec amendment, cross-impact replan, or major replan.

Silence costs nothing. Approval costs nothing. Redirection costs LLM time — be specific in `revise` text.
```
