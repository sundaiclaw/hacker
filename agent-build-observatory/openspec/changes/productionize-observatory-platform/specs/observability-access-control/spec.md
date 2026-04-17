## ADDED Requirements

### Requirement: Telemetry producers must authenticate
The observability service SHALL require authenticated producer credentials for hosted telemetry ingestion.

#### Scenario: Unauthenticated producer submits telemetry
- **WHEN** a client sends telemetry without valid producer credentials
- **THEN** the service rejects the request and does not store the payload

### Requirement: Dashboard viewers must authenticate
The observability service SHALL require authenticated viewer access for dashboard and run-detail views in hosted deployments.

#### Scenario: Anonymous viewer requests the dashboard
- **WHEN** a viewer requests the hosted dashboard without valid viewer authentication
- **THEN** the service denies access to the dashboard data

### Requirement: Access is scoped by observability source boundary
The observability service SHALL enforce authorization boundaries that prevent a viewer or producer from accessing data outside its permitted project or environment scope.

#### Scenario: Viewer belongs to one project scope
- **WHEN** the viewer requests runs from another project or environment scope
- **THEN** the service denies access to those runs and associated command logs

### Requirement: Sensitive command output can be protected
The system SHALL support protection of sensitive command output through redaction, restricted access, or both.

#### Scenario: Command output contains sensitive content
- **WHEN** a command record contains content marked or treated as sensitive
- **THEN** the system prevents unauthorized viewers from seeing the raw output
