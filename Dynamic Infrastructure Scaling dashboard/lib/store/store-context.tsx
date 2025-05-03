"use client"

import type React from "react"
import { createContext, useContext, useReducer, useEffect, useMemo } from "react"
import { metricsReducer, initialMetricsState } from "./metrics-reducer"
import { scalingReducer, initialScalingState } from "./scaling-reducer"
import { modelReducer, initialModelState } from "./model-reducer"
import { logsReducer, initialLogsState } from "./logs-reducer"
import { fetchMetrics, fetchScalingStatus, fetchModelStatus, fetchLogs } from "@/lib/api"

// Define the store state type
export interface StoreState {
  metrics: typeof initialMetricsState
  scaling: typeof initialScalingState
  model: typeof initialModelState
  logs: typeof initialLogsState
  isLoading: {
    metrics: boolean
    scaling: boolean
    model: boolean
    logs: boolean
  }
  error: {
    metrics: string | null
    scaling: string | null
    model: string | null
    logs: string | null
  }
}

// Define the initial state
const initialState: StoreState = {
  metrics: initialMetricsState,
  scaling: initialScalingState,
  model: initialModelState,
  logs: initialLogsState,
  isLoading: {
    metrics: false,
    scaling: false,
    model: false,
    logs: false,
  },
  error: {
    metrics: null,
    scaling: null,
    model: null,
    logs: null,
  },
}

// Define action types
type Action =
  | { type: "SET_METRICS"; payload: typeof initialMetricsState }
  | { type: "SET_SCALING"; payload: typeof initialScalingState }
  | { type: "SET_MODEL"; payload: typeof initialModelState }
  | { type: "SET_LOGS"; payload: typeof initialLogsState }
  | { type: "SET_LOADING"; resource: keyof StoreState["isLoading"]; isLoading: boolean }
  | { type: "SET_ERROR"; resource: keyof StoreState["error"]; error: string | null }
  | { type: "RESET" }

// Create the reducer
function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "SET_METRICS":
      return {
        ...state,
        metrics: metricsReducer(state.metrics, action),
      }
    case "SET_SCALING":
      return {
        ...state,
        scaling: scalingReducer(state.scaling, action),
      }
    case "SET_MODEL":
      return {
        ...state,
        model: modelReducer(state.model, action),
      }
    case "SET_LOGS":
      return {
        ...state,
        logs: logsReducer(state.logs, action),
      }
    case "SET_LOADING":
      return {
        ...state,
        isLoading: {
          ...state.isLoading,
          [action.resource]: action.isLoading,
        },
      }
    case "SET_ERROR":
      return {
        ...state,
        error: {
          ...state.error,
          [action.resource]: action.error,
        },
      }
    case "RESET":
      return initialState
    default:
      return state
  }
}

// Create the context
const StoreContext = createContext<{
  state: StoreState
  dispatch: React.Dispatch<Action>
  refreshData: (resource?: keyof StoreState["isLoading"]) => Promise<void>
} | null>(null)

// Create the provider
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Function to refresh data
  const refreshData = async (resource?: keyof StoreState["isLoading"]) => {
    const fetchResources = resource ? [resource] : (["metrics", "scaling", "model", "logs"] as const)

    for (const res of fetchResources) {
      dispatch({ type: "SET_LOADING", resource: res, isLoading: true })
      dispatch({ type: "SET_ERROR", resource: res, error: null })

      try {
        let data
        switch (res) {
          case "metrics":
            data = await fetchMetrics()
            dispatch({ type: "SET_METRICS", payload: data })
            break
          case "scaling":
            data = await fetchScalingStatus()
            dispatch({ type: "SET_SCALING", payload: data })
            break
          case "model":
            data = await fetchModelStatus()
            dispatch({ type: "SET_MODEL", payload: data })
            break
          case "logs":
            data = await fetchLogs()
            dispatch({ type: "SET_LOGS", payload: data })
            break
        }
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          resource: res,
          error: error instanceof Error ? error.message : "An unknown error occurred",
        })
      } finally {
        dispatch({ type: "SET_LOADING", resource: res, isLoading: false })
      }
    }
  }

  // Initial data fetch
  useEffect(() => {
    refreshData()

    // Set up polling for real-time updates
    const intervalId = setInterval(() => {
      refreshData()
    }, 30000) // Poll every 30 seconds

    return () => clearInterval(intervalId)
  }, [])

  const value = useMemo(() => ({ state, dispatch, refreshData }), [state])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// Create a hook to use the store
export function useStore() {
  const context = useContext(StoreContext)
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider")
  }
  return context
}
