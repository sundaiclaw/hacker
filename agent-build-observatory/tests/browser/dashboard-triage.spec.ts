import { expect, test, type Page } from "@playwright/test";
import { createViewerPage, seedDashboardScenario } from "./helpers";

test("dashboard renders triage sections in spec order and supports conjunctive inventory filters", async ({ browser, request }) => {
  const scenario = await seedDashboardScenario(request);
  const { context, page } = await createViewerPage(browser);

  try {
    await page.goto("/", { waitUntil: "commit" });

    await expect(page.getByRole("heading", { name: "System status", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs attention", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active runs", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent activity", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();

    const systemStatusTop = await getTop(page, "system-status");
    const needsAttentionTop = await getTop(page, "needs-attention-section");
    const activeRunsTop = await getTop(page, "active-runs-section");
    const recentActivityTop = await getTop(page, "recent-activity-section");
    const runInventoryTop = await getTop(page, "runs-inventory-section");

    expect(systemStatusTop).toBeLessThan(needsAttentionTop);
    expect(needsAttentionTop).toBeLessThan(activeRunsTop);
    expect(activeRunsTop).toBeLessThan(recentActivityTop);
    expect(recentActivityTop).toBeLessThan(runInventoryTop);

    await expect(page.getByTestId("needs-attention-section").getByText(scenario.failedTask).first()).toBeVisible();
    await expect(page.getByTestId("needs-attention-section").getByText(scenario.waitingTask).first()).toBeVisible();
    await expect(page.getByTestId("active-runs-section").getByText(scenario.activeTask).first()).toBeVisible();

    await expect(page.getByRole("link", { name: "View run" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View failed command" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "View parent" }).first()).toBeVisible();

    const filteredResponse = page.waitForResponse((response) => {
      const url = response.url();
      return (
        url.includes("/api/dashboard?") &&
        url.includes("status=failed") &&
        url.includes("stage=verify") &&
        url.includes("owner=subagent") &&
        response.ok()
      );
    });

    await page.getByLabel("Status").selectOption("failed");
    await page.getByLabel("Stage").selectOption("verify");
    await page.getByLabel("Owner").selectOption("subagent");
    await filteredResponse;

    const runsInventory = page.getByTestId("runs-inventory-section");
    await expect(runsInventory.getByText(scenario.childTask).first()).toBeVisible();
    await expect(runsInventory.getByText(scenario.activeTask).first()).not.toBeVisible();
    await expect(runsInventory.getByText(scenario.waitingTask).first()).not.toBeVisible();
  } finally {
    await safeCloseContext(context);
  }
});

test("dashboard keeps needs-attention ahead of active runs on a small viewport", async ({ browser, request }) => {
  const { context, page } = await createViewerPage(browser);
  await seedDashboardScenario(request);

  try {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/", { waitUntil: "commit" });

    const needsAttentionTop = await getTop(page, "needs-attention-section");
    const activeRunsTop = await getTop(page, "active-runs-section");

    expect(needsAttentionTop).toBeLessThan(activeRunsTop);
  } finally {
    await safeCloseContext(context);
  }
});

async function getTop(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + window.scrollY;
  });
}

async function safeCloseContext(context: { close(): Promise<void> }) {
  try {
    await context.close();
  } catch {
    // ignore cleanup errors from already-closed contexts in slow CI/browser environments
  }
}
