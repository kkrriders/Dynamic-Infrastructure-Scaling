"use client"

import useSWR from "swr"
import { useCallback } from "react"
import { fetchMetrics, fetchScalingStatus, fetchModelStatus, fetchLogs } from "@/lib/api"

// Generic fetcher function for SWR
const fetcher = async (key: string) => {
  switch (key) {
    case "metrics":
      return fetchMetrics()
    case "scaling":
      return fetchScalingStatus()
    case "model":
      return fetchModelStatus()
    case "logs":
      return fetchLogs()
    default:
      throw new Error(`Unknown key: ${key}`)
  }
}

// Hook for fetching metrics data
export function useMetrics(refreshInterval = 30000) {
  const { data, error, isLoading, mutate } = useSWR("metrics", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  })

  const refresh = useCallback(() => mutate(), [mutate])

  return {
    metrics: data,
    isLoading,
    error,
    refresh,
  }
}

// Hook for fetching scaling status
export function useScalingStatus(refreshInterval = 30000) {
  const { data, error, isLoading, mutate } = useSWR("scaling", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  })

  const refresh = useCallback(() => mutate(), [mutate])

  return {
    scaling: data,
    isLoading,
    error,
    refresh,
  }
}

// Hook for fetching model status
export function useModelStatus(refreshInterval = 30000) {
  const { data, error, isLoading, mutate } = useSWR("model", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  })

  const refresh = useCallback(() => mutate(), [mutate])

  return {
    model: data,
    isLoading,
    error,
    refresh,
  }
}

// Hook for fetching logs
export function useLogs(refreshInterval = 60000) {
  const { data, error, isLoading, mutate } = useSWR("logs", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    dedupingInterval: 10000,
  })

  const refresh = useCallback(() => mutate(), [mutate])

  return {
    logs: data || [],
    isLoading,
    error,
    refresh,
  }
}
