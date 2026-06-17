## ADDED Requirements

### Requirement: Hosted runtimes can submit structured telemetry
The observability service SHALL provide a canonical hosted ingestion path that accepts structured telemetry for runs, events, and commands from OpenClaw runtimes.

#### Scenario: Runtime submits run and event telemetry
- **WHEN** an authenticated runtime sends a valid telemetry payload for a run
- **THEN** the service records the run and associated events without requiring access to local transcript files

### Requirement: Ingestion payloads preserve source identity
The observability service SHALL associate every ingested payload with explicit source identity metadata sufficient to distinguish project, environment, and runtime origin.

#### Scenario: Two runtimes report into the same service
- **WHEN** telemetry arrives from two different runtimes
- **THEN** the service stores enough source identity to distinguish the records in projections and operator views

### Requirement: Ingestion supports command telemetry as first-class data
The observability service SHALL accept command execution telemetry with command text, status, timestamps, exit code, working directory, and captured output summary.

#### Scenario: Runtime reports a failed command
- **WHEN** a runtime submits command telemetry with a failed exit state
- **THEN** the command is stored as a first-class command record and is available for run-detail inspection

### Requirement: Hosted ingestion is independent of local runtime scraping
Hosted ingestion SHALL function correctly even when the observability service has no access to the runtime host filesystem.

#### Scenario: Service runs on Cloud Run
- **WHEN** the observability service is deployed remotely without `~/.openclaw` session files
- **THEN** it can still ingest and project live telemetry from authenticated runtimes
