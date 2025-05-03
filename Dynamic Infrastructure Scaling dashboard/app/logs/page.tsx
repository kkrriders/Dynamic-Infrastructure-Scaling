import type { Metadata } from "next"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { LogsTable } from "@/components/logs-table"
import { LogsFilters } from "@/components/logs-filters"

export const metadata: Metadata = {
  title: "Logs - Dynamic Infrastructure Scaling with Ollama",
  description: "View scaling action logs and history",
}

export default function LogsPage() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Logs" description="View scaling action logs and history" />
      <LogsFilters />
      <div className="mt-6">
        <LogsTable />
      </div>
    </DashboardShell>
  )
}
