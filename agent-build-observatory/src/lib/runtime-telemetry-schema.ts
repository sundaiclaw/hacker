import { z } from "zod";
import {
  commandStatusSchema,
  runKindSchema,
  runStageSchema,
  runStatusSchema,
} from "@/lib/observability-schema";
import {
  observabilitySourceIdentitySchema,
  observabilitySourceModeSchema,
} from "@/lib/observability-source";

export const telemetrySourceSchema = observabilitySourceIdentitySchema.extend({
  sourceMode: z.literal(observabilitySourceModeSchema.enum.hosted),
});

export const telemetryRunSchema = z.object({
  id: z.string().trim().min(1),
  parentRunId: z.string().trim().min(1).optional(),
  task: z.string().trim().min(1),
  status: runStatusSchema,
  stage: runStageSchema,
  owner: runKindSchema,
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const telemetryEventSchema = z.object({
  id: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  parentRunId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  meta: z.string().trim().min(1).optional(),
  stage: runStageSchema.optional(),
  status: runStatusSchema.optional(),
  owner: runKindSchema.optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  ts: z.string().datetime(),
});

export const telemetryCommandSchema = z.object({
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
});

export const telemetryEnvelopeSchema = z
  .object({
    requestId: z.string().trim().min(1),
    source: telemetrySourceSchema,
    run: telemetryRunSchema,
    events: z.array(telemetryEventSchema).default([]),
    commands: z.array(telemetryCommandSchema).default([]),
  })
  .superRefine((value, context) => {
    value.events.forEach((event, index) => {
      if (event.runId !== value.run.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "runId"],
          message: "Event runId must match run.id.",
        });
      }
    });

    value.commands.forEach((command, index) => {
      if (command.runId !== value.run.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["commands", index, "runId"],
          message: "Command runId must match run.id.",
        });
      }
    });
  });

export type TelemetrySource = z.infer<typeof telemetrySourceSchema>;
export type TelemetryRun = z.infer<typeof telemetryRunSchema>;
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type TelemetryCommand = z.infer<typeof telemetryCommandSchema>;
export type TelemetryEnvelope = z.infer<typeof telemetryEnvelopeSchema>;
