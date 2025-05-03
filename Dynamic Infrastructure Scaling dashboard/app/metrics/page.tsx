import type { Metadata } from "next"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { MetricsCharts } from "@/components/metrics-charts"
import { MetricsFilters } from "@/components/metrics-filters"

export const metadata: Metadata = {
  title: "Metrics - Dynamic Infrastructure Scaling with Ollama",
  description: "View detailed metrics for your Azure infrastructure",
}

export default function MetricsPage() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Metrics" description="View detailed metrics for your Azure infrastructure" />
      <MetricsFilters />
      <div className="mt-6">
        <MetricsCharts />
      </div>
    </DashboardShell>
  )
}
