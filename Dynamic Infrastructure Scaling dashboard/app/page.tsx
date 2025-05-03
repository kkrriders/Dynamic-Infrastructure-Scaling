import type { Metadata } from "next"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { MetricsOverview } from "@/components/metrics-overview"
import { ScalingStatus } from "@/components/scaling-status"
import { RecentActions } from "@/components/recent-actions"
import { ModelStatus } from "@/components/model-status"
import { BackendStatus } from "@/components/backend-status"

export const metadata: Metadata = {
  title: "Dashboard - Dynamic Infrastructure Scaling with Ollama",
  description: "Monitor your Azure infrastructure scaling metrics and status",
}

export default function DashboardPage() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Dashboard" description="Monitor your Azure infrastructure scaling metrics and status" />
      
      {/* Backend connectivity test component */}
      <BackendStatus />
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ScalingStatus />
        <ModelStatus />
        <MetricsOverview />
      </div>
      <div className="mt-6">
        <RecentActions />
      </div>
    </DashboardShell>
  )
}
