import { z } from "zod";

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

export const runStageSchema = z.enum([
  "plan",
  "build",
  "verify",
  "deploy",
  "observe",
  "done",
]);

export const runKindSchema = z.enum(["main", "subagent", "reviewer", "system"]);

export const eventPayloadSchema = z.record(z.string(), z.unknown()).optional();

export const observabilityEventInputSchema = z.object({
  runId: z.string().min(1),
  parentRunId: z.string().min(1).optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  meta: z.string().optional(),
  stage: runStageSchema.optional(),
  status: runStatusSchema.optional(),
  owner: runKindSchema.optional(),
  payload: eventPayloadSchema,
  ts: z.string().datetime().optional(),
  source: z.string().min(1).optional(),
});

export const observabilityEventSchema = observabilityEventInputSchema.extend({
  id: z.string().min(1),
  ts: z.string().datetime(),
});

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunStage = z.infer<typeof runStageSchema>;
export type RunKind = z.infer<typeof runKindSchema>;
export type ObservatoryEventInput = z.infer<typeof observabilityEventInputSchema>;
export type ObservatoryEvent = z.infer<typeof observabilityEventSchema>;
