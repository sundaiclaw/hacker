import { expect, request as playwrightRequest, test } from "@playwright/test";
import { createViewerPage, seedSensitiveFailureScenario } from "./helpers";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

test("authorization failures are explicit and sensitive command output is redacted by viewer scope", async ({ browser, request }) => {
  const scenario = await seedSensitiveFailureScenario(request);

  const anonymousApi = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: {} });
  const unauthorizedResponse = await anonymousApi.get("/api/dashboard");
  expect(unauthorizedResponse.status()).toBe(401);
  expect(await unauthorizedResponse.text()).toContain("viewer_auth_required");
  await anonymousApi.dispose();

  const { context: readonlyContext, page } = await createViewerPage(browser);
  await page.goto(`/runs/${scenario.runId}`, { waitUntil: "commit" });
  await expect(page.getByText(scenario.redactedLog).first()).toBeVisible();
  await expect(page.getByText("Sensitive output is redacted for this viewer.").first()).toBeVisible();
  await expect(page.getByText(scenario.rawLog)).not.toBeVisible();
  await readonlyContext.close();

  const { context: fullViewerContext, page: fullViewerPage } = await createViewerPage(browser, {
    username: "ops-admin",
    password: "ops-admin-pass",
  });
  await fullViewerPage.goto(`${baseURL}/runs/${scenario.runId}`, { waitUntil: "commit" });
  await expect(fullViewerPage.getByText(scenario.rawLog)).toBeVisible();
  await expect(fullViewerPage.getByText(scenario.redactedLog)).not.toBeVisible();
  await fullViewerContext.close();
});
