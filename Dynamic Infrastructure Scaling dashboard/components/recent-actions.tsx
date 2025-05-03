"use client"

import { ArrowDown, ArrowRight, ArrowUp, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLogs } from "@/lib/hooks/use-data"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

export function RecentActions() {
  const { logs, isLoading } = useLogs()
  const router = useRouter()

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  const handleViewAllActions = () => {
    router.push("/logs")
  }

  // Get the 3 most recent logs
  const recentLogs = useMemo(() => {
    return logs.slice(0, 3)
  }, [logs])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Scaling Actions
        </CardTitle>
        <CardDescription>History of recent infrastructure scaling actions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            // Skeleton loading state
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex flex-col space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))
          ) : recentLogs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">No recent actions found</div>
          ) : (
            recentLogs.map((action) => (
              <div key={action.id} className="flex flex-col space-y-2 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {action.action === "scale-up" && (
                      <Badge className="bg-green-500 hover:bg-green-500">
                        <ArrowUp className="mr-1 h-3 w-3" />
                        Scale Up
                      </Badge>
                    )}
                    {action.action === "scale-down" && (
                      <Badge className="bg-amber-500 hover:bg-amber-500">
                        <ArrowDown className="mr-1 h-3 w-3" />
                        Scale Down
                      </Badge>
                    )}
                    {action.action === "no-change" && (
                      <Badge variant="outline">
                        <ArrowRight className="mr-1 h-3 w-3" />
                        No Change
                      </Badge>
                    )}
                    <span className="text-sm font-medium">
                      {action.fromInstances} → {action.toInstances} instances
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(action.timestamp)}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Confidence:</span> {(action.confidence * 100).toFixed(0)}%
                </div>
                <div className="text-sm">
                  <span className="font-medium">Model:</span> {action.model}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Reasoning:</span> {action.reasoning}
                </div>
              </div>
            ))
          )}
          <Button variant="outline" className="w-full" onClick={handleViewAllActions}>
            View All Actions
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
