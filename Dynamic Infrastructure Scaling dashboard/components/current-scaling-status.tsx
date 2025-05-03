"use client"

import { ArrowDown, ArrowRight, ArrowUp, RefreshCw, Server } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useScalingStatus } from "@/lib/hooks/use-data"
import { Skeleton } from "@/components/ui/skeleton"
import { useMemo, useState } from "react"

export function CurrentScalingStatus() {
  const { scaling, isLoading, refresh } = useScalingStatus()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refresh()
    setTimeout(() => setIsRefreshing(false), 500) // Add a small delay for better UX
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"

    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  const scalingDirection = useMemo(() => {
    if (!scaling) return "stable"

    return scaling.recommendedInstances > scaling.currentInstances
      ? "scale-up"
      : scaling.recommendedInstances < scaling.currentInstances
        ? "scale-down"
        : "stable"
  }, [scaling])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Current Status
        </CardTitle>
        <CardDescription>Current VMSS status and scaling information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Current Instances</div>
            {isLoading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <div className="text-xl font-bold">{scaling?.currentInstances || 0}</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Recommended</div>
            {isLoading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <div className="flex items-center gap-1">
                {scalingDirection === "scale-up" && <ArrowUp className="h-4 w-4 text-green-500" />}
                {scalingDirection === "scale-down" && <ArrowDown className="h-4 w-4 text-amber-500" />}
                {scalingDirection === "stable" && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                <span className="text-xl font-bold">{scaling?.recommendedInstances || 0}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">VM Size</div>
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <div className="text-sm font-medium">{scaling?.vmSize || "N/A"}</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Last Scaling</div>
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <div className="text-sm font-medium">{formatDate(scaling?.lastScalingAction || "")}</div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Cooldown Status</div>
            {isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div>
                {(scaling?.cooldownRemaining || 0) > 0 ? (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
                  >
                    {scaling?.cooldownRemaining} min remaining
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                  >
                    Ready to scale
                  </Badge>
                )}
              </div>
            )}
          </div>
          <Button variant="outline" className="w-full" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            {isRefreshing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Status
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
