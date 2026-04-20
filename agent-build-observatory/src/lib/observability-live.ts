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
  if (
    JSON.stringify(previous.data) !== JSON.stringify(next.data) ||
    JSON.stringify(previous.commands) !== JSON.stringify(next.commands)
  ) {
    return [createSnapshotMessage(next)];
  }

  return [];
}

function buildCursor(data: DashboardData, commands: ObservatoryCommand[]): LiveCursor {
  return {
    runUpdatedAt: data.runs[0]?.updatedAt ?? null,
    eventTs: data.events.at(-1)?.ts ?? null,
    commandTs: commands.at(-1)?.endedAt ?? commands.at(-1)?.startedAt ?? null,
  };
}
