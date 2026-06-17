import path from "node:path";
import { pathToFileURL } from "node:url";

type RegisterHooksModule = {
  registerHooks?: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

async function installAliasHook() {
  const moduleHooks = (await import("node:module")) as RegisterHooksModule;

  moduleHooks.registerHooks?.({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/")) {
        return {
          shortCircuit: true,
          url: pathToFileURL(path.join(process.cwd(), "src", `${specifier.slice(2)}.ts`)).href,
        };
      }

      return nextResolve(specifier, context);
    },
  });
}

async function main() {
  await installAliasHook();
  const configModuleUrl = pathToFileURL(path.join(process.cwd(), "src", "lib", "observability-config.ts")).href;
  const dbModuleUrl = pathToFileURL(path.join(process.cwd(), "src", "lib", "observability-db.ts")).href;
  const { resolveObservabilityRuntimeConfig } = await import(configModuleUrl);
  const { getObservabilitySchemaVersion, getStorageContractSummary, initializeStorage } = await import(dbModuleUrl);
  const runtimeConfig = resolveObservabilityRuntimeConfig();
  const summary = getStorageContractSummary(runtimeConfig.storage);

  console.log(`[OpenSpec] Initializing observability storage`);
  console.log(`- driver: ${summary.driver}`);
  console.log(`- target: ${summary.target}`);
  console.log(`- source mode: ${runtimeConfig.resolvedSourceMode}`);
  console.log(`- producer auth: ${runtimeConfig.requireProducerAuth ? "required" : "optional"}`);
  console.log(`- viewer auth: ${runtimeConfig.requireViewerAuth ? "required" : "optional"}`);
  console.log(`- retention days: ${runtimeConfig.retentionDays ?? "disabled"}`);

  await initializeStorage(runtimeConfig.storage);

  console.log(`Schema version ${getObservabilitySchemaVersion()} is ready.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
