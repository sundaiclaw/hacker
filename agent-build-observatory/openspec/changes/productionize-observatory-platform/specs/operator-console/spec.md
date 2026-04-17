## ADDED Requirements

### Requirement: Operators can filter the run inventory
The operator console SHALL allow operators to filter runs by status, stage, source, and owner.

#### Scenario: Operator isolates failed runs
- **WHEN** an operator filters the run inventory to failed runs
- **THEN** the console shows only runs whose status is failed

### Requirement: Operators can navigate run hierarchy
The operator console SHALL expose parent-child relationships between runs so operators can trace sub-agent activity from a root run.

#### Scenario: Root run has sub-agent runs
- **WHEN** an operator inspects a run with child runs
- **THEN** the console shows the hierarchy and allows navigation between parent and child runs

### Requirement: Operators can inspect command failures without leaving the console
The operator console SHALL surface failed commands with their command text, status, timing, and captured output summary.

#### Scenario: Run contains a failed command
- **WHEN** an operator opens the run detail view
- **THEN** failed commands are visibly promoted for inspection within the console

### Requirement: Console views reflect the active data source clearly
The operator console SHALL indicate whether the displayed data comes from demo replay, local adapter mode, or hosted runtime ingestion.

#### Scenario: Operator is viewing hosted runtime data
- **WHEN** the dashboard renders a hosted dataset
- **THEN** the console identifies that source mode so operators do not confuse it with demo or local-only data
