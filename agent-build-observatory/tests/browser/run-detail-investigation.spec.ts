import { expect, test } from "@playwright/test";
import { createViewerPage, seedDashboardScenario } from "./helpers";

test("failed run detail prioritizes failure evidence, lineage, and failed command inspection", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const scenario = await seedDashboardScenario(request);
  const { context, page } = await createViewerPage(browser);

  try {
    await page.goto(`/runs/${scenario.failedRunId}`, { waitUntil: "commit" });

    await expect(page.getByRole("heading", { name: "Failure evidence", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run lineage", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Failed commands", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: scenario.failedTask, exact: true })).toBeVisible();

    const primaryInvestigation = await page.getByTestId("primary-investigation-section").boundingBox();
    const runLineage = await page.getByTestId("run-lineage-section").boundingBox();
    const failedCommands = await page.getByTestId("failed-commands-section").boundingBox();

    expect(primaryInvestigation && runLineage && failedCommands).toBeTruthy();
    expect(primaryInvestigation!.y).toBeLessThan(runLineage!.y);
    expect(runLineage!.y).toBeLessThan(failedCommands!.y);

    const failedCommandLink = page.getByRole("link", { name: "View failed command" }).first();
    await expect(failedCommandLink).toBeVisible();
    await expect(failedCommandLink).toHaveAttribute("href", /#command-/);

    await expect(page.getByTestId("primary-investigation-section").getByText("npm run verify", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View child" }).first()).toBeVisible();
  } finally {
    try {
      await context.close();
    } catch {
      // ignore cleanup errors from already-disposed contexts
    }
  }
});
