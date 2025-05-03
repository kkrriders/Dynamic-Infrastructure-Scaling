import type { MetricsState } from "./store/metrics-reducer"
import type { ScalingState } from "./store/scaling-reducer"
import type { ModelState } from "./store/model-reducer"
import type { LogEntry } from "./store/logs-reducer"

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

// Helper function for API requests
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // In development, use mock data by default to prevent connection errors
  if (process.env.NODE_ENV === "development") {
    console.warn(`Using mock data for ${endpoint} in development mode`)
    
    // Return mock data based on the endpoint
    switch (endpoint) {
      case "/metrics":
        return mockFetchMetrics() as Promise<T>
      case "/scaling":
        return mockFetchScalingStatus() as Promise<T>
      case "/model":
        return mockFetchModelStatus() as Promise<T>
      case "/logs":
        return mockFetchLogs() as Promise<T>
      case "/scaling/check":
      case "/config/azure":
      case "/config/ollama":
      case "/config/scaling":
      case "/scaling/manual":
        return mockUpdateConfig() as Promise<T>
      default:
        return Promise.resolve({} as T)
    }
  }

  const url = `${API_BASE_URL}${endpoint}`

  const defaultOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('authToken')}` : '',
    },
    credentials: "include", // Include cookies for authentication
  }

  try {
    const response = await fetch(url, {
      ...defaultOptions,
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `API request failed with status ${response.status}`)
    }

    return response.json()
  } catch (error) {
    console.error(`API request to ${endpoint} failed:`, error)
    
    throw error
  }
}

// API functions with improved error handling
export async function fetchMetrics(): Promise<MetricsState> {
  return apiRequest<MetricsState>("/metrics")
}

export async function fetchScalingStatus(): Promise<ScalingState> {
  return apiRequest<ScalingState>("/scaling")
}

export async function fetchModelStatus(): Promise<ModelState> {
  return apiRequest<ModelState>("/model")
}

export async function fetchLogs(): Promise<LogEntry[]> {
  return apiRequest<LogEntry[]>("/logs")
}

export async function updateAzureConfig(config: any): Promise<void> {
  return apiRequest<void>("/config/azure", {
    method: "POST",
    body: JSON.stringify(config),
  })
}

export async function updateOllamaConfig(config: any): Promise<void> {
  return apiRequest<void>("/config/ollama", {
    method: "POST",
    body: JSON.stringify(config),
  })
}

export async function updateScalingConfig(config: any): Promise<void> {
  return apiRequest<void>("/config/scaling", {
    method: "POST",
    body: JSON.stringify(config),
  })
}

export async function applyManualScaling(config: any): Promise<void> {
  return apiRequest<void>("/scaling/manual", {
    method: "POST",
    body: JSON.stringify(config),
  })
}

export async function forceScalingCheck(): Promise<void> {
  return apiRequest<void>("/scaling/check", {
    method: "POST",
  })
}

// Mock API functions for development fallback
function mockFetchMetrics(): Promise<MetricsState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const now = new Date()
      const history = Array.from({ length: 12 }, (_, i) => {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString()
        return {
          timestamp,
          value: 30 + Math.floor(Math.random() * 50),
          inbound: 10 + Math.floor(Math.random() * 30),
          outbound: 5 + Math.floor(Math.random() * 15),
        }
      }).reverse()

      resolve({
        cpu: {
          current: 30 + Math.floor(Math.random() * 50),
          trend: ["increasing", "decreasing", "stable"][Math.floor(Math.random() * 3)] as
            | "increasing"
            | "decreasing"
            | "stable",
          history: history.map((h) => ({ timestamp: h.timestamp, value: h.value })),
        },
        memory: {
          current: 40 + Math.floor(Math.random() * 40),
          trend: ["increasing", "decreasing", "stable"][Math.floor(Math.random() * 3)] as
            | "increasing"
            | "decreasing"
            | "stable",
          history: history.map((h) => ({
            timestamp: h.timestamp,
            value: h.value - 10 + Math.floor(Math.random() * 20),
          })),
        },
        network: {
          inbound: 10 + Math.floor(Math.random() * 30),
          outbound: 5 + Math.floor(Math.random() * 15),
          trend: ["increasing", "decreasing", "stable"][Math.floor(Math.random() * 3)] as
            | "increasing"
            | "decreasing"
            | "stable",
          history: history.map((h) => ({
            timestamp: h.timestamp,
            inbound: h.inbound,
            outbound: h.outbound,
          })),
        },
        timestamp: now.toISOString(),
      })
    }, 500)
  })
}

function mockFetchScalingStatus(): Promise<ScalingState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        currentInstances: 3 + Math.floor(Math.random() * 3),
        recommendedInstances: 4 + Math.floor(Math.random() * 3),
        lastScalingAction: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
        vmSize: "Standard_D4s_v3",
        cooldownRemaining: Math.floor(Math.random() * 15),
      })
    }, 500)
  })
}

function mockFetchModelStatus(): Promise<ModelState> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        primaryModel: "llama3:8b",
        primaryModelStatus: Math.random() > 0.1 ? "online" : "offline",
        fallbackModel: "mistral:7b",
        fallbackModelStatus: Math.random() > 0.1 ? "online" : "offline",
        lastRecommendationConfidence: 0.7 + Math.random() * 0.25,
      })
    }, 500)
  })
}

function mockFetchLogs(): Promise<LogEntry[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const logs: LogEntry[] = Array.from({ length: 10 }, (_, i) => {
        const actions = ["scale-up", "scale-down", "no-change"] as const
        const action = actions[Math.floor(Math.random() * actions.length)]

        let fromInstances, toInstances

        if (action === "scale-up") {
          fromInstances = 2 + Math.floor(Math.random() * 3)
          toInstances = fromInstances + 1 + Math.floor(Math.random() * 2)
        } else if (action === "scale-down") {
          fromInstances = 3 + Math.floor(Math.random() * 3)
          toInstances = fromInstances - 1 - Math.floor(Math.random() * 2)
        } else {
          fromInstances = 2 + Math.floor(Math.random() * 5)
          toInstances = fromInstances
        }

        const reasons = [
          "CPU usage is consistently above 80% with increasing network traffic, suggesting the need for additional capacity.",
          "Memory utilization trending upward, approaching 75% threshold.",
          "Off-peak hours with CPU and memory utilization below 30% for the past 2 hours.",
          "Current metrics are within optimal ranges for the current instance count.",
          "Rapid increase in network traffic and CPU utilization trending upward.",
        ]

        return {
          id: `log-${i}`,
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          action,
          fromInstances,
          toInstances,
          confidence: 0.7 + Math.random() * 0.25,
          reasoning: reasons[Math.floor(Math.random() * reasons.length)],
          model: Math.random() > 0.2 ? "llama3:8b" : "mistral:7b",
        }
      })

      resolve(logs)
    }, 500)
  })
}

// Helper for mock update operations
export function mockUpdateConfig(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 1000)
  })
}
