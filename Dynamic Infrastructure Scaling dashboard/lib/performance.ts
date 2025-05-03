// Performance monitoring utility

// Web Vitals
type WebVitalMetric = {
  id: string
  name: string
  value: number
  rating: "good" | "needs-improvement" | "poor"
  delta: number
}

// Function to report Web Vitals
export function reportWebVitals(metric: WebVitalMetric) {
  // In development, log to console
  if (process.env.NODE_ENV === "development") {
    console.log(`Web Vital: ${metric.name}`, metric)
    return
  }

  // In production, could send to analytics service
  // Example: sendToAnalytics(metric)
}

// Function to measure component render time
export function useRenderTime(componentName: string) {
  if (process.env.NODE_ENV !== "development") {
    return { startMeasure: () => {}, endMeasure: () => {} }
  }

  const startMeasure = () => {
    performance.mark(`${componentName}-start`)
  }

  const endMeasure = () => {
    performance.mark(`${componentName}-end`)
    performance.measure(`${componentName} render time`, `${componentName}-start`, `${componentName}-end`)

    const entries = performance.getEntriesByName(`${componentName} render time`)
    const lastEntry = entries[entries.length - 1]

    console.log(`${componentName} rendered in ${lastEntry.duration.toFixed(2)}ms`)

    // Clean up marks
    performance.clearMarks(`${componentName}-start`)
    performance.clearMarks(`${componentName}-end`)
    performance.clearMeasures(`${componentName} render time`)
  }

  return { startMeasure, endMeasure }
}

// Function to track API call performance
export function trackApiCall(apiName: string, startTime: number) {
  const duration = performance.now() - startTime

  // In development, log to console
  if (process.env.NODE_ENV === "development") {
    console.log(`API call to ${apiName} took ${duration.toFixed(2)}ms`)
    return
  }

  // In production, could send to analytics service
  // Example: sendToAnalytics({ name: apiName, duration })
}
