## Why

Agent Build Observatory has reached the point where the UI and local runtime introspection are useful, but the product boundary is still unclear. The current app mixes demo data, local transcript scraping, manual event ingestion, and hosted deployment without a single canonical ingest path or a production-ready persistence and access model.

This change is needed now because the app has already been deployed publicly. To make it trustworthy and broadly usable, observability must work as a real hosted service with durable storage, authenticated ingestion, and an operator console that reflects actual run state rather than local-machine assumptions.

## What Changes

- Define a canonical runtime telemetry ingestion path for hosted use, including source identity, event submission, and command telemetry delivery.
- Add a production-grade persistence model centered on durable hosted storage instead of local SQLite/runtime files.
- Upgrade the operator console from a visually strong V1 into a practical operations surface with triage-first information architecture, explicit next actions, clearer hierarchy, and investigation workflows.
- Simplify operator-facing language and separate operator triage from admin/integration details so the dashboard is optimized for operational decision-making instead of system exposition.
- Add access control for both event producers and dashboard viewers so command logs and run details are not exposed by default.
- Clarify the role of local runtime scraping as an adapter/debugging path rather than the primary hosted architecture.
- Establish the test and verification expectations required to trust ingestion, projection, and run-detail behavior.

## Capabilities

### New Capabilities
- `runtime-telemetry-ingestion`: Authenticated, structured telemetry ingestion from OpenClaw runtimes to the observability service.
- `observability-storage`: Durable hosted storage for runs, events, commands, and related observability projections.
- `operator-console`: Operator workflows for filtering, drilling into run state, inspecting failures, and navigating hierarchy.
- `observability-access-control`: Authentication and authorization for telemetry producers and dashboard consumers.

### Modified Capabilities
- None.

## Impact

- Affects `src/lib/openclaw-runtime.ts`, `src/lib/observability.ts`, `src/lib/observability-db.ts`, API routes, dashboard UI, and run detail UI.
- Introduces hosted-service requirements for database configuration, authentication, and deployment environment variables.
- Changes the expected integration model between OpenClaw runtimes and the observability app.
- Requires additional automated tests around ingestion, projection, and end-to-end runtime-to-UI flows.
