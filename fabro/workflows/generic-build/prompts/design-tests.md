Analyze the project in $app_dir and the specifications in $spec_dir/specs/ to design a custom testing workflow. Write the workflow to $workflow_dir/test-workflow.fabro.

## Idempotency

If $workflow_dir/test-workflow.fabro already exists, read it and check whether it still matches the current project structure. If the test frameworks, test file locations, and spec coverage have not changed, skip regeneration and respond with a brief "Test workflow is up to date" message. Otherwise, regenerate it.

## Step 1: Analyze the project

Scan $app_dir to identify:
- **Languages and frameworks**: Check package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, etc.
- **Test frameworks**: Look for jest.config.*, vitest.config.*, pytest.ini, conftest.py, .mocharc.*, karma.conf.*, cypress.config.*, playwright.config.*, etc.
- **Test locations**: Find directories named tests/, test/, __tests__/, spec/, e2e/, integration/, etc.
- **Test commands**: Read package.json scripts (test, test:unit, test:integration, test:e2e), pyproject.toml [tool.pytest], Makefile test targets.
- **Test types needed**: Unit tests, integration tests, end-to-end tests, API tests, based on what the project contains and what the specs require.

Read all specs in $spec_dir/specs/ to identify acceptance criteria that should be tested.

## Step 2: Generate the test workflow

Write a valid .fabro file to $workflow_dir/test-workflow.fabro. The workflow must follow these rules:

### DOT language constraints (mandatory)

1. Wrap everything in `digraph CustomTests { ... }`
2. Include `graph [goal="Run project-specific tests for ..."]` with a descriptive goal
3. Include `rankdir=LR`
4. Include exactly one `start [shape=Mdiamond, label="Start"]`
5. Include exactly one `exit [shape=Msquare, label="Exit"]`
6. Every `box` (agent) and `tab` (prompt-only) node MUST have a `prompt` attribute
7. `diamond` (conditional) nodes must NOT have a prompt, and must have multiple outgoing edges with `condition` attributes
8. `parallelogram` (command) nodes must have a `script` attribute
9. All nodes must be reachable from start
10. No edges into start; no edges out of exit
11. Use `condition="outcome=success"` on edges leaving command nodes for the success path
12. Use `max_visits=3` on fix/retry agent nodes to prevent infinite loops

### Model stylesheet

Use a simple stylesheet. Do not reference models from the parent workflow -- the child workflow runs independently:

```
graph [model_stylesheet="
    *      { model: gpt-5.4;       }
    .code  { model: gpt-5.3-codex; }
"]
```

### Required topology: implement-test-fix loop

The generated workflow MUST follow this pattern:

```
start -> setup_tests -> run_tests -> gate_results
gate_results -> exit [condition="outcome=success"]
gate_results -> fix_tests
fix_tests -> run_tests
```

Where:
- `setup_tests` (parallelogram): Install test dependencies if needed (e.g., `pip install pytest-cov`, `npm install`, `pnpm install`, `yarn install`, `bun install`)
- `run_tests` (parallelogram): Run the actual test commands. Combine all test types into one script with `|| true` so output is captured even on failure. Include `set -e` only after capturing output.
- `gate_results` (diamond): Check if tests passed
- `fix_tests` (box, class="code"): Agent that reads test output and fixes failing tests or implementation code. Set `max_visits=3`.

### Adapting to the project

- **Python projects**: Use `uv run python -m pytest` with appropriate flags (-v, --tb=short, -x for fail-fast on fix iterations)
- **Node projects**: Detect the package manager from lockfiles (`bun.lock*`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) and use the matching command or the specific script from `package.json`
- **Multi-stack projects**: Run all test suites in sequence in one `run_tests` script
- **Integration tests**: If the project has a separate integration test suite, add it to the run_tests script after unit tests
- **E2E tests**: Only include if the project has e2e test infrastructure already set up (cypress, playwright). Do not invent e2e tests.

### What NOT to do

- Do NOT use `@prompts/` references -- the child workflow has no prompts directory. Inline all prompts.
- Do NOT use `shape=house` -- no nested sub-workflows.
- Do NOT use `shape=hexagon` -- no human gates in automated test workflows.
- Do NOT add a `[vars]` section or TOML config -- the child workflow runs standalone.
- Do NOT reference `$app_dir`, `$spec_dir`, or `$workflow_dir` in the generated DOT file -- these variables belong to the parent workflow. Use literal paths based on what you discovered in Step 1.
- Do NOT create test files -- only create the workflow that runs existing tests. If tests don't exist yet, the fix_tests agent node should write them.

## Step 3: Validate the output

After writing the file, read it back and verify:
1. It has exactly one start and one exit node
2. All edges reference existing nodes
3. All box/tab nodes have prompts
4. The diamond node has conditional edges
5. No syntax errors in the DOT
