import type { Metadata } from "next"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { ConfigTabs } from "@/components/config-tabs"

export const metadata: Metadata = {
  title: "Configuration - Dynamic Infrastructure Scaling with Ollama",
  description: "Configure your Azure credentials and Ollama settings",
}

export default function ConfigurationPage() {
  return (
    <DashboardShell>
      <DashboardHeader heading="Configuration" description="Configure your Azure credentials and Ollama settings" />
      <div className="mt-6">
        <ConfigTabs />
      </div>
    </DashboardShell>
  )
}
