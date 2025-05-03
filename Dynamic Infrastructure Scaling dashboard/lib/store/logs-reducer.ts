// Define the log entry type
export interface LogEntry {
  id: string
  timestamp: string
  action: "scale-up" | "scale-down" | "no-change"
  fromInstances: number
  toInstances: number
  confidence: number
  reasoning: string
  model: string
}

// Define the logs state type
export type LogsState = LogEntry[]

// Define the initial state
export const initialLogsState: LogsState = []

// Define the reducer
export function logsReducer(state: LogsState, action: { type: string; payload?: any }): LogsState {
  switch (action.type) {
    case "SET_LOGS":
      return action.payload
    default:
      return state
  }
}
