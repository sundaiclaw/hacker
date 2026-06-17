## ADDED Requirements

### Requirement: Hosted deployments use durable persistence
Hosted deployments SHALL persist runs, events, commands, and related projections in a durable database that survives process restarts and instance replacement.

#### Scenario: Service instance is replaced
- **WHEN** a hosted service instance restarts or is replaced
- **THEN** previously ingested runs, events, and commands remain available to the dashboard and run-detail views

### Requirement: Local development can use lightweight fallback storage
The system SHALL support a local-development storage mode that does not require a managed hosted database.

#### Scenario: Developer runs the app locally without hosted database configuration
- **WHEN** the app starts without hosted database settings in a local environment
- **THEN** it remains usable with a documented local fallback storage mode

### Requirement: Stored observability data is queryable by run and time order
The persistence layer SHALL support querying runs, events, and commands by run identifier and chronological order for dashboard and run-detail projections.

#### Scenario: Operator opens a run detail page
- **WHEN** the service retrieves data for a specific run
- **THEN** it returns the run, its events, and its commands in deterministic time-ordered form

### Requirement: Hosted storage supports raw observability retention
The system SHALL retain observability records for a configurable retention window appropriate for operator review and debugging.

#### Scenario: Retention window is configured
- **WHEN** observability data ages beyond the configured retention period
- **THEN** the service can expire or archive the data according to the configured policy
