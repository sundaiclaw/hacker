## ADDED Requirements

### Requirement: Operators can filter the run inventory
The operator console SHALL allow operators to filter runs by status, stage, source, and owner using the canonical run values exposed by the system. Status filters SHALL support at least `queued`, `planning`, `building`, `verifying`, `deploying`, `waiting`, `done`, and `failed`. Stage filters SHALL support at least `plan`, `build`, `verify`, `deploy`, `observe`, and `done`. Owner filters SHALL support at least `main`, `subagent`, `reviewer`, and `system`. When multiple filters are selected at the same time, the console SHALL combine them conjunctively so that only runs matching all selected filter dimensions remain visible.

#### Scenario: Operator isolates failed runs
- **WHEN** an operator filters the run inventory to failed runs
- **THEN** the console shows only runs whose status is `failed`

#### Scenario: Operator combines stage and owner filters
- **WHEN** an operator filters the run inventory to stage `verify` and owner `subagent`
- **THEN** the console shows only runs that match both stage `verify` and owner `subagent`

### Requirement: Dashboard presents a triage-first information architecture
The main dashboard SHALL render operator content in this order: a compact system-status summary, a needs-attention section, an active-runs section, a recent-activity section, and a runs inventory section. The needs-attention section SHALL appear before the active-runs section, and the active-runs section SHALL appear before recent activity and general run inventory.

For this console:
- runs needing attention SHALL include runs with status `failed` or `waiting`
- active runs SHALL include runs with status `queued`, `planning`, `building`, `verifying`, or `deploying`
- recent activity SHALL show recent run events in reverse chronological order

#### Scenario: Dashboard contains failed, active, and successful runs
- **WHEN** an operator opens the dashboard
- **THEN** the dashboard shows runs with status `failed` or `waiting` before active runs, and active runs before recent activity and the full runs inventory

#### Scenario: Dashboard has no attention-needed runs
- **WHEN** the dashboard has no runs with status `failed` or `waiting`
- **THEN** the needs-attention section renders an explicit empty state instead of disappearing silently

### Requirement: Dashboard separates operator triage from admin and integration details
The main operator dashboard SHALL keep ingestion contracts, backend/storage diagnostics, and similar admin or integration content out of the primary dashboard flow. Those details SHALL be moved to a separate admin, integration, or documentation surface, or otherwise placed below the main operator triage sections.

#### Scenario: Operator opens the main dashboard
- **WHEN** the main dashboard renders
- **THEN** the primary viewport content focuses on system status, needs-attention runs, active runs, recent activity, and run investigation rather than integration documentation

### Requirement: Operator-facing labels use direct operational language
The operator console SHALL use plain operational terminology in navigation, section headings, filters, row actions, and run-detail headings. The main operator surfaces SHALL use labels such as `Runs`, `Needs attention`, `Running`, `Failed`, `Recent activity`, `Run lineage`, `Failed commands`, and `View run` instead of metaphor-heavy alternatives.

#### Scenario: Operator scans the dashboard quickly
- **WHEN** the dashboard renders headings, filters, and investigation actions
- **THEN** the console uses direct operational labels for run state, investigation actions, and hierarchy

### Requirement: Run inventory exposes explicit investigation actions
Each visible run in the dashboard inventory SHALL expose a direct path into investigation. At minimum, each run row or card SHALL provide a visible `View run` action. Failed runs SHALL additionally expose a visible failure-oriented action, and child runs SHALL expose a visible lineage-oriented action.

#### Scenario: Operator sees a failed child run in the run inventory
- **WHEN** a run has status `failed` and also has a parent run
- **THEN** the console shows a visible `View run` action and also exposes investigation affordances for the failure and parent lineage

### Requirement: Operators can navigate run hierarchy
The operator console SHALL expose parent-child relationships between runs so operators can trace sub-agent activity from a root run. When a run has a parent, the run detail view SHALL show the parent run. When a run has child runs, the run detail view SHALL show those child runs. Hierarchy entries SHALL link to the relevant run detail pages.

#### Scenario: Root run has sub-agent runs
- **WHEN** an operator inspects a run with child runs
- **THEN** the console shows the hierarchy and allows navigation between parent and child runs

### Requirement: Run detail prioritizes state-specific investigation content
The run detail view SHALL show a summary header first, followed by the highest-value investigation content for the run state.

For failed runs, the first investigation section below the summary SHALL show failure evidence, including the failed command or latest failed event.
For non-failed active runs, the first investigation section below the summary SHALL show current execution state and most recent activity.
For successful runs, the first investigation section below the summary SHALL show the latest meaningful completion context.
In all cases, lineage SHALL appear before secondary metadata or low-priority artifacts.

#### Scenario: Operator opens a failed run
- **WHEN** the run detail page loads for a failed run
- **THEN** the page shows run summary first and then surfaces the failed command or latest failed event before lower-priority metadata

#### Scenario: Operator opens an active run
- **WHEN** the run detail page loads for a run with status `queued`, `planning`, `building`, `verifying`, or `deploying`
- **THEN** the page shows run summary first and then surfaces current execution state and recent activity before lower-priority metadata

### Requirement: Operators can inspect command failures without leaving the console
The operator console SHALL surface failed commands with their command text, status, timing, and captured output summary. When a failed command is present, the run detail view SHALL provide a direct path from summary/failure evidence into the relevant failed-command section.

#### Scenario: Run contains a failed command
- **WHEN** an operator opens the run detail view
- **THEN** failed commands are visibly promoted for inspection within the console

### Requirement: Console views reflect the active data source clearly
The operator console SHALL indicate whether the displayed data comes from demo replay, local adapter mode, or hosted runtime ingestion. The dashboard SHALL present that source mode in the compact system-status summary, and run detail views SHALL preserve the source-mode context for the selected run.

#### Scenario: Operator is viewing hosted runtime data
- **WHEN** the dashboard renders a hosted dataset
- **THEN** the console identifies that source mode so operators do not confuse it with demo or local-only data

### Requirement: Dashboard shows compact freshness and live-status context
The dashboard SHALL show whether data is live, reconnecting, or stale, along with recent update timing, in a compact system-status summary near the top of the page.

For this console:
- `live` means the dataset has received or reflected an update within the last 60 seconds
- `reconnecting` means the live feed is attempting to reconnect and the last successful update is no more than 5 minutes old
- `stale` means the last successful update is more than 5 minutes old

#### Scenario: Telemetry stream is reconnecting
- **WHEN** the live feed is reconnecting and the last successful update is within the past 5 minutes
- **THEN** the dashboard shows a reconnecting state in the top-level system-status summary

#### Scenario: Dataset has gone stale
- **WHEN** the last successful update is more than 5 minutes old
- **THEN** the dashboard shows a stale state in the top-level system-status summary

### Requirement: Dashboard reduces scan cost by demoting secondary information
The main dashboard SHALL prioritize run-state and investigation information over decorative framing and secondary metadata. Secondary details such as changed files, deep implementation metadata, or integration specifics SHALL not appear above the primary operator triage sections.

#### Scenario: Operator opens the dashboard on a small screen
- **WHEN** the dashboard renders on a mobile-sized viewport
- **THEN** the initial dashboard flow still reaches needs-attention runs and active runs before secondary metadata-heavy sections

### Requirement: Console provides explicit empty, error, and redaction states
The operator console SHALL provide explicit states for empty data, missing hierarchy, unavailable sources, authentication denial, stale datasets, and redacted command output.

#### Scenario: No active runs are available
- **WHEN** the active-runs section has no runs with status `queued`, `planning`, `building`, `verifying`, or `deploying`
- **THEN** the console shows an explicit empty state for active runs

#### Scenario: Viewer lacks access to sensitive command output
- **WHEN** a command has sensitive output and the current viewer lacks access to the full log summary
- **THEN** the run detail view shows an explicit redacted state instead of blank output

#### Scenario: Viewer lacks dashboard authorization
- **WHEN** an unauthenticated or unauthorized viewer requests the dashboard
- **THEN** the console shows an authorization failure response instead of a misleading empty state
