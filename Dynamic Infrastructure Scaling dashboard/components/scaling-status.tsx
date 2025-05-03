"use client"

import { ArrowDown, ArrowUp, Server } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useScalingStatus } from "@/lib/hooks/use-data"
import { forceScalingCheck } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { useMemo } from "react"

export function ScalingStatus() {
  const { scaling, isLoading, refresh } = useScalingStatus()
  const { toast } = useToast()

  const handleForceScalingCheck = async () => {
    try {
      await forceScalingCheck()
      toast({
        title: "Scaling check initiated",
        description: "A manual scaling check has been triggered.",
      })
      refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to trigger scaling check.",
        variant: "destructive",
      })
    }
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
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          VMSS Status
        </CardTitle>
        <CardDescription>Current scaling status and recommendations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
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
            <div className="text-sm font-medium">Cooldown</div>
            {isLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <div className="text-sm font-medium">
                {scaling?.cooldownRemaining ? `${scaling.cooldownRemaining} minutes remaining` : "Ready to scale"}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={isLoading || (scaling?.cooldownRemaining || 0) > 0}
            onClick={handleForceScalingCheck}
          >
            Force Scaling Check
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
