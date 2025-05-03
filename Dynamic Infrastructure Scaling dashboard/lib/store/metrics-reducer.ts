// Define the metrics state type
export interface MetricsState {
  cpu: {
    current: number
    trend: "increasing" | "decreasing" | "stable"
    history: { timestamp: string; value: number }[]
  }
  memory: {
    current: number
    trend: "increasing" | "decreasing" | "stable"
    history: { timestamp: string; value: number }[]
  }
  network: {
    inbound: number
    outbound: number
    trend: "increasing" | "decreasing" | "stable"
    history: { timestamp: string; inbound: number; outbound: number }[]
  }
  timestamp: string
}

// Define the initial state
export const initialMetricsState: MetricsState = {
  cpu: {
    current: 0,
    trend: "stable",
    history: [],
  },
  memory: {
    current: 0,
    trend: "stable",
    history: [],
  },
  network: {
    inbound: 0,
    outbound: 0,
    trend: "stable",
    history: [],
  },
  timestamp: new Date().toISOString(),
}

// Define the reducer
export function metricsReducer(state: MetricsState, action: { type: string; payload?: any }): MetricsState {
  switch (action.type) {
    case "SET_METRICS":
      return {
        ...state,
        ...action.payload,
      }
    default:
      return state
  }
}
