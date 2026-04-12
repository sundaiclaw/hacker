Read spec/spec.md first when present for the Design Direction details, then read the project's OpenSpec design doc at $spec_dir/changes/*/design.md and the proposal at $spec_dir/changes/*/proposal.md, then review all frontend files in $app_dir/.

Score the implementation 1-5 on each dimension:

1. **Color consistency** — Does the app use the palette from the spec? Are neutrals tinted (not pure gray)? Is the 60-30-10 ratio roughly maintained?
2. **Typography hierarchy** — Are there clear heading/body/caption levels? Is body text readable (line-height >= 1.5, line length 45-75 chars)?
3. **Responsive layout** — Does the layout work at 320px, 768px, and 1024px without breaking or horizontal scrolling?
4. **State coverage** — Do async operations have loading indicators? Are there empty states? Do errors show actionable messages?
5. **Overall polish** — Does the UI feel intentional, not generic? Are there hover/focus states? Is spacing consistent?

## Scoring

- 5: Excellent, no issues
- 4: Good, minor nitpicks only
- 3: Acceptable, a few noticeable gaps
- 2: Below par, multiple obvious issues
- 1: Poor, major gaps that hurt usability

## Output

If ALL scores are 3 or above:
{"context_updates": {"design_ok": "true"}}

If ANY score is below 3, list the specific files and fixes needed, then output:
{"context_updates": {"design_ok": "false"}}
