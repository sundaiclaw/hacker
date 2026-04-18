## 1. Hosted telemetry ingestion

- [ ] 1.1 Define the canonical telemetry payloads for runs, events, commands, and source identity
- [ ] 1.2 Add authenticated hosted ingestion endpoints for telemetry producers
- [ ] 1.3 Refactor runtime ingestion so local transcript parsing is an adapter instead of the primary hosted source
- [ ] 1.4 Add request validation, idempotency/deduplication handling, and ingestion error reporting

## 2. Durable hosted storage

- [x] 2.1 Make Postgres the default hosted persistence path and document the required configuration
- [x] 2.2 Add or formalize schema initialization/migration support for runs, events, and commands
- [ ] 2.3 Implement retention configuration for observability records
- [ ] 2.4 Verify dashboard and run-detail queries behave correctly against hosted persistence

## 3. Access control and data protection

- [ ] 3.1 Add authentication for telemetry producers
- [ ] 3.2 Add authentication for hosted dashboard and run-detail viewers
- [ ] 3.3 Enforce project/environment-scoped authorization boundaries
- [ ] 3.4 Add protection for sensitive command output through redaction, restricted access, or both

## 4. Operator console improvements

- [ ] 4.1 Add run inventory filters for status, stage, source, and owner
- [ ] 4.2 Add parent-child run hierarchy navigation to dashboard and run detail
- [ ] 4.3 Improve run-detail inspection for failed commands and related operational context
- [ ] 4.4 Make source mode labeling explicit across dashboard and run-detail views

## 5. Verification and rollout

- [ ] 5.1 Add ingestion contract tests covering valid and invalid producer submissions
- [ ] 5.2 Add fixture-driven runtime parser tests for local adapter mode
- [ ] 5.3 Add end-to-end tests from telemetry ingestion through dashboard/run-detail projection
- [x] 5.4 Document deployment, rollback, and local-development modes for hosted observability
