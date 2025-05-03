import type { Metadata } from "next"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { ManualScalingForm } from "@/components/manual-scaling-form"
import { CurrentScalingStatus } from "@/components/current-scaling-status"
import { BackendStatus } from "@/components/backend-status"

export const metadata: Metadata = {
  title: "Manual Scaling - Dynamic Infrastructure Scaling with Ollama",
  description: "Manually control your Azure infrastructure scaling",
}

export default function ManualScalingPage() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Manual Scaling" description="Manually control your Azure infrastructure scaling" />
      
      {/* Backend connectivity test component */}
      <BackendStatus />
      
      <div className="grid gap-6 md:grid-cols-2">
        <CurrentScalingStatus />
        <ManualScalingForm />
      </div>
    </DashboardShell>
  )
}
