import type { ObservatoryCommand, ObservatoryEvent } from "@/lib/observability-schema";
import {
  getDashboardData,
  getRecentCommands,
  type DashboardData,
  type DashboardQuery,
  type RunSummary,
} from "@/lib/observability";

export type LiveCursor = {
  runUpdatedAt: string | null;
  eventTs: string | null;
  commandTs: string | null;
};

export type LiveMessage =
  | {
      type: "snapshot";
      cursor: LiveCursor;
      data: DashboardData;
    }
  | {
      type: "run.upsert";
      cursor: LiveCursor;
      run: RunSummary;
    }
  | {
      type: "event.append";
      cursor: LiveCursor;
      event: ObservatoryEvent;
    }
  | {
      type: "command.upsert";
      cursor: LiveCursor;
      command: ObservatoryCommand;
    };

export type LiveState = {
  cursor: LiveCursor;
  data: DashboardData;
  commands: ObservatoryCommand[];
};

export async function buildLiveState(query: DashboardQuery = {}): Promise<LiveState> {
  const [data, commands] = await Promise.all([getDashboardData(query), getRecentCommands(query)]);

  return {
    cursor: buildCursor(data, commands),
    data,
    commands,
  };
}

export function createSnapshotMessage(state: LiveState): LiveMessage {
  return {
    type: "snapshot",
    cursor: state.cursor,
    data: state.data,
  };
}

export function diffLiveState(previous: LiveState, next: LiveState): LiveMessage[] {
  const messages: LiveMessage[] = [];
  const previousRuns = new Map(previous.data.runs.map((run) => [run.id, JSON.stringify(run)]));
  const previousEvents = new Set(previous.data.events.map((event) => event.id));
  const previousCommands = new Map(previous.commands.map((command) => [command.id, JSON.stringify(command)]));

  for (const run of next.data.runs) {
    if (previousRuns.get(run.id) !== JSON.stringify(run)) {
      messages.push({ type: "run.upsert", cursor: next.cursor, run });
    }
  }

  for (const event of next.data.events) {
    if (!previousEvents.has(event.id)) {
      messages.push({ type: "event.append", cursor: next.cursor, event });
    }
  }

  for (const command of next.commands) {
    if (previousCommands.get(command.id) !== JSON.stringify(command)) {
      messages.push({ type: "command.upsert", cursor: next.cursor, command });
    }
  }

  return messages;
}

function buildCursor(data: DashboardData, commands: ObservatoryCommand[]): LiveCursor {
  return {
    runUpdatedAt: data.runs[0]?.updatedAt ?? null,
    eventTs: data.events.at(-1)?.ts ?? null,
    commandTs: commands.at(-1)?.endedAt ?? commands.at(-1)?.startedAt ?? null,
  };
}
