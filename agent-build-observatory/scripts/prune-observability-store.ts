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
  const retentionModuleUrl = pathToFileURL(path.join(process.cwd(), "src", "lib", "observability-retention.ts")).href;
  const { resolveObservabilityRuntimeConfig } = await import(configModuleUrl);
  const { pruneObservabilityStore } = await import(retentionModuleUrl);
  const runtimeConfig = resolveObservabilityRuntimeConfig();

  if (!runtimeConfig.retentionDays) {
    console.log("OBSERVABILITY_RETENTION_DAYS is not set; nothing to prune.");
    return;
  }

  const summary = await pruneObservabilityStore();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
