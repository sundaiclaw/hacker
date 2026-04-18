import { z } from "zod";
import { observabilitySourceModeSchema } from "@/lib/observability-source";

export const runStatusSchema = z.enum([
  "queued",
  "planning",
  "building",
  "verifying",
  "deploying",
  "waiting",
  "done",
  "failed",
]);

export const runStageSchema = z.enum(["plan", "build", "verify", "deploy", "observe", "done"]);

export const runKindSchema = z.enum(["main", "subagent", "reviewer", "system"]);

export const eventPayloadSchema = z.record(z.string(), z.unknown()).optional();

export const commandStatusSchema = z.enum(["running", "done", "failed"]);

const scopedRecordFields = {
  source: z.string().trim().min(1).optional(),
  sourceMode: observabilitySourceModeSchema.optional(),
  projectId: z.string().trim().min(1).optional(),
  environmentId: z.string().trim().min(1).optional(),
  runtimeId: z.string().trim().min(1).optional(),
};

export const observabilityEventInputSchema = z.object({
  runId: z.string().trim().min(1),
  parentRunId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  meta: z.string().trim().min(1).optional(),
  stage: runStageSchema.optional(),
  status: runStatusSchema.optional(),
  owner: runKindSchema.optional(),
  payload: eventPayloadSchema,
  ts: z.string().datetime().optional(),
  ...scopedRecordFields,
});

export const observabilityEventSchema = observabilityEventInputSchema.extend({
  id: z.string().trim().min(1),
  ts: z.string().datetime(),
});

export const observabilityCommandSchema = z.object({
  id: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1).optional(),
  status: commandStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  exitCode: z.number().int().optional(),
  logSummary: z.string().trim().min(1).optional(),
  sensitive: z.boolean().optional(),
  redactedLogSummary: z.string().trim().min(1).optional(),
  logSummaryVisible: z.boolean().optional(),
  ...scopedRecordFields,
});

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunStage = z.infer<typeof runStageSchema>;
export type RunKind = z.infer<typeof runKindSchema>;
export type CommandStatus = z.infer<typeof commandStatusSchema>;
export type ObservatoryEventInput = z.infer<typeof observabilityEventInputSchema>;
export type ObservatoryEvent = z.infer<typeof observabilityEventSchema>;
export type ObservatoryCommand = z.infer<typeof observabilityCommandSchema>;
