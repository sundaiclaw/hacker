import { resolveObservabilityRuntimeConfig, type ObservabilityScopeRule } from "@/lib/observability-config";
import { ObservabilityHttpError, type ProducerAuthContext, type ViewerAuthContext } from "@/lib/observability-auth";
import type { ObservatoryCommand } from "@/lib/observability-schema";
import type { ObservabilitySourceIdentity } from "@/lib/observability-source";

export type ScopedRecord = {
  projectId?: string;
  environmentId?: string;
  runtimeId?: string;
};

export function assertProducerScope(authContext: ProducerAuthContext, source: ObservabilitySourceIdentity) {
  if (!matchesAnyScope(authContext.scopes, source)) {
    throw new ObservabilityHttpError(403, "producer_scope_forbidden", "Producer is not allowed for this scope.");
  }
}

export function assertViewerScope(authContext: ViewerAuthContext, target: ScopedRecord) {
  if (!matchesAnyScope(authContext.scopes, target)) {
    throw new ObservabilityHttpError(403, "viewer_scope_forbidden", "Viewer is not allowed for this scope.");
  }
}

export function canViewSensitiveLogs(authContext: ViewerAuthContext) {
  return authContext.canViewSensitiveLogs || authContext.bypass;
}

export function redactCommandForViewer(
  command: ObservatoryCommand,
  authContext: ViewerAuthContext
): ObservatoryCommand {
  if (!command.sensitive || canViewSensitiveLogs(authContext)) {
    return {
      ...command,
      logSummaryVisible: Boolean(command.logSummary),
    };
  }

  const runtimeConfig = resolveObservabilityRuntimeConfig();
  return {
    ...command,
    logSummary: command.redactedLogSummary ?? runtimeConfig.redactionPlaceholder,
    logSummaryVisible: false,
  };
}

export function buildScopeFilter(authContext: ViewerAuthContext | ProducerAuthContext) {
  return authContext.scopes.some(
    (scope) => isWildcard(scope.projectId) && isWildcard(scope.environmentId) && (!scope.runtimeId || isWildcard(scope.runtimeId))
  )
    ? undefined
    : authContext.scopes;
}

export function matchesAnyScope(scopes: ObservabilityScopeRule[], target: ScopedRecord) {
  return scopes.some((scope) => matchesScope(scope, target));
}

function matchesScope(scope: ObservabilityScopeRule, target: ScopedRecord) {
  const projectMatches = isWildcard(scope.projectId) || scope.projectId === target.projectId;
  const environmentMatches = isWildcard(scope.environmentId) || scope.environmentId === target.environmentId;
  const runtimeMatches = !scope.runtimeId || isWildcard(scope.runtimeId) || scope.runtimeId === target.runtimeId;
  return projectMatches && environmentMatches && runtimeMatches;
}

function isWildcard(value: string | undefined) {
  return value === "*";
}
