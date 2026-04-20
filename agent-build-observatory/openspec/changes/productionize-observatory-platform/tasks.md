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

- [ ] 4.1 Rework the dashboard into a triage-first layout with needs-attention, active-runs, recent-activity, and runs inventory sections
- [ ] 4.2 Add explicit row/card actions for investigation flows such as View run, View failed command, and View parent
- [ ] 4.3 Simplify operator-facing labels and headings across dashboard and run detail into plain operational language
- [ ] 4.4 Move ingestion contract and similar admin/integration content out of the main operator dashboard flow
- [ ] 4.5 Improve run-detail inspection so failure evidence, lineage, and recommended next actions appear before secondary metadata
- [ ] 4.6 Make source mode freshness/status visible in a compact system-status strip rather than broad explanatory sections
- [ ] 4.7 Reduce mobile and desktop scan cost by trimming decorative chrome, nested cards, and low-priority metadata density while preserving fast access to needs-attention and active runs

## 5. Verification and rollout

- [ ] 5.1 Add ingestion contract tests covering valid and invalid producer submissions
- [ ] 5.2 Add fixture-driven runtime parser tests for local adapter mode
- [ ] 5.3 Add end-to-end tests from telemetry ingestion through dashboard/run-detail projection
- [ ] 5.4 Add browser-based UX checks covering dashboard triage order, navigation affordances, and run-detail investigation flows
- [x] 5.5 Document deployment, rollback, and local-development modes for hosted observability
