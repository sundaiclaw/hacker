## Context

Agent Build Observatory currently combines three concerns in one application: a demo replay UI, a local runtime inspector that parses OpenClaw session files from disk, and a hosted dashboard exposed over HTTP. This creates an architectural mismatch: when the app runs on Cloud Run, it cannot rely on colocated runtime files, but the current data model and projections still assume that local runtime scraping is a first-class source.

The repository already has solid building blocks: a dashboard, run detail view, SQLite/Postgres-backed projections, an event ingestion route, and runtime parsing logic that can extract command telemetry from local transcripts. The next step is to turn those building blocks into a coherent hosted observability platform.

Constraints:
- Existing demo and local runtime workflows are useful and should not be broken abruptly.
- Hosted deployments need durable storage and must not depend on local filesystem state.
- Command logs may contain sensitive data, so both ingestion and viewing require access control.
- The current UI is strong visually, but operator workflows are still shallow and the homepage mixes triage, investigation, and admin/integration concerns.
- The domain model already exposes canonical run states (`queued`, `planning`, `building`, `verifying`, `deploying`, `waiting`, `done`, `failed`), stages (`plan`, `build`, `verify`, `deploy`, `observe`, `done`), source modes, and owner kinds. The UX architecture should align directly to those canonical values instead of introducing a second vocabulary.

## Goals / Non-Goals

**Goals:**
- Establish a canonical hosted ingestion path for runs, events, and commands.
- Make durable hosted storage the default production model.
- Preserve local runtime scraping as an adapter/debugging source rather than the primary hosted architecture.
- Add enough authentication and authorization to safely expose the product beyond a single trusted operator.
- Expand the console to support practical operator workflows such as filtering, hierarchy navigation, failure inspection, and explicit next actions.
- Re-architect the dashboard as a triage-first surface that answers what needs attention now, what is active, what changed recently, and where to click next.
- Separate operator-facing triage flows from admin/integration details such as ingestion contracts and backend/source diagnostics.
- Simplify operator-facing copy and labels so the console is legible under time pressure.
- Define a verification plan that covers ingestion, projection, runtime parsing, and operator-facing workflow clarity.

**Non-Goals:**
- Rebuilding the UI from scratch.
- Solving every future multi-tenant billing or organization-management concern in this change.
- Replacing all existing local runtime parsing immediately.
- Designing a generic tracing platform for arbitrary non-OpenClaw systems.

## Decisions

### 1. Hosted observability will use push-based telemetry as the canonical source
The service will treat authenticated event ingestion as the canonical hosted path. OpenClaw runtimes SHALL send structured run, event, and command telemetry to the service.

Why:
- Works in Cloud Run and other remote deployments.
- Avoids dependence on host-local transcript files.
- Produces a stable, explicit contract instead of transcript-shape inference.

Alternative considered:
- Continue using local transcript parsing as the main source. Rejected because it cannot support hosted deployment cleanly and makes the product dependent on internal file formats.

### 2. Local runtime scraping remains as a local adapter mode
`openclaw-runtime.ts` style transcript parsing will remain available as a local adapter/source for development, bootstrapping, and debugging.

Why:
- It already provides value during development.
- It preserves compatibility with the current app while hosted ingestion matures.

Alternative considered:
- Remove runtime scraping immediately. Rejected because it would discard useful functionality and slow iteration.

### 3. Postgres becomes the default hosted persistence layer
Hosted deployments SHALL use Postgres for durable storage of runs, events, commands, and projections. SQLite remains acceptable for local development.

Why:
- Cloud Run filesystem state is ephemeral.
- Querying operator views over growing event sets needs durable indexing and persistence.

Alternative considered:
- Keep SQLite as the default everywhere. Rejected because it is not appropriate for production-hosted durability.

### 4. Access control is introduced at both producer and viewer boundaries
The system SHALL authenticate telemetry producers and SHALL require authenticated viewer access for dashboards and run details. Authorization will be scoped at least by project or environment source.

Why:
- Command output and run metadata can contain secrets or operationally sensitive information.
- Hosted observability is unsafe if event producers and viewers are unauthenticated.

Alternative considered:
- Add viewer auth only. Rejected because unauthenticated ingestion would still allow spoofing or poisoning of observability data.

### 5. Operator console improvements will prioritize triage-first architecture over homepage breadth
The dashboard SHALL prioritize urgent runs, active runs, recent activity, and explicit investigation actions ahead of secondary admin/debugging surfaces.

Why:
- Operators need the homepage to answer what is broken, active, and actionable within seconds.
- The current dashboard spreads attention across triage, files, ingest docs, and system exposition, which increases scan cost.

Alternative considered:
- Keep the current broad dashboard and only tune styling. Rejected because the problem is prioritization and workflow hierarchy, not cosmetics.

### 6. Operator-facing language will use direct operational terminology
The console SHALL favor plain labels like runs, failed, running, lineage, recent activity, and view run over metaphor-heavy labels.

Why:
- The console is an operational tool, not a marketing page.
- Translation cost matters when users are scanning for failures or blocked work.

Alternative considered:
- Preserve the current themed terminology for brand flavor. Rejected because it slows comprehension and obscures the core job-to-be-done.

### 7. Admin/integration concerns will move out of the main dashboard flow
Operator-facing dashboard views SHALL separate triage and investigation from ingestion contract details, backend/source diagnostics, and other admin/integration content.

Why:
- Operators, integrators, and platform admins overlap but do not share the same first-screen needs.
- Mixing those concerns makes the homepage feel like an internal system demo rather than a sharp control surface.

Alternative considered:
- Keep all information on one page for transparency. Rejected because transparency without prioritization hurts usability.

### 8. Verification will combine contract tests, parser fixtures, end-to-end flows, and browser-based UX checks
Testing will cover four layers:
- ingestion contract/API tests
- projection and persistence tests
- end-to-end runtime-to-dashboard flows
- browser-based UX checks for dashboard hierarchy, labeling, state prioritization, empty/error handling, and core operator tasks

Why:
- The current system combines schema validation, event projection, and inferred runtime parsing.
- Confidence requires coverage at multiple layers, not just UI snapshots.

Alternative considered:
- Expand only unit tests around helpers. Rejected because it would miss the integration seams where most failures are likely.

## Risks / Trade-offs

- **[Risk] Push-based telemetry requires upstream OpenClaw integration work** → Mitigation: keep the local runtime adapter working while the canonical ingest path is implemented.
- **[Risk] Introducing auth increases friction for local development** → Mitigation: support a local development mode with simplified credentials and documented setup.
- **[Risk] Postgres migration adds operational complexity** → Mitigation: keep SQLite for local use and provide a clear hosted configuration contract.
- **[Risk] Command logs may include secrets** → Mitigation: add redaction hooks, scoped viewer access, and explicit retention policies.
- **[Risk] Supporting both local-adapter and hosted-ingest modes can increase code complexity** → Mitigation: make source mode explicit in configuration and isolate source adapters behind clean interfaces.

## Migration Plan

1. Define the hosted telemetry schema and ingestion/auth contract.
2. Add producer authentication and viewer authentication behind configuration flags.
3. Implement Postgres-backed hosted deployment as the default production path.
4. Refactor runtime collection into an adapter model so hosted projection no longer depends on local file scraping.
5. Expand console workflows to consume richer projected data without changing the current visual system.
6. Add end-to-end and fixture-driven verification before shifting users toward hosted ingestion as the primary path.
7. Roll out hosted mode gradually while retaining local adapter mode for debugging and fallback.

Rollback strategy:
- If hosted ingestion proves unstable, continue serving the current dashboard using local/demo sources while disabling the new ingest path.
- Database changes should be additive where possible so projections can fall back to existing local/demo sources during rollback.

## Open Questions

- What is the minimal source identity model: project-level, environment-level, runtime-level, or all three?
- Should command log redaction happen in the producer, the service, or both?
- Does viewer access need per-project authorization immediately, or is single-operator auth sufficient for the first hosted version?
- Should event ingestion write raw append-only records plus projections, or only normalized projection tables?
- How much of the current static "tracked files" concept should survive once real file/artifact telemetry exists?
