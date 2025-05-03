import type React from "react"
interface DashboardHeaderProps {
  heading: string
  description?: string
  children?: React.ReactNode
}

export function DashboardHeader({ heading, description, children }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}
