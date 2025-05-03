"use client"

import { BarChart3, Cpu, HardDrive, Network } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMetrics } from "@/lib/hooks/use-data"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from "next/navigation"

export function MetricsOverview() {
  const { metrics, isLoading } = useMetrics()
  const router = useRouter()

  const handleViewDetailedMetrics = () => {
    router.push("/metrics")
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Key Metrics
        </CardTitle>
        <CardDescription>Current infrastructure metrics</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="cpu" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cpu">CPU</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
          </TabsList>
          <TabsContent value="cpu" className="mt-4">
            <div className="flex flex-col items-center gap-2">
              <Cpu className="h-8 w-8 text-muted-foreground" />
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold">{metrics?.cpu.current || 0}%</div>
              )}
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {metrics?.cpu.trend === "increasing" && "↗ Increasing"}
                  {metrics?.cpu.trend === "decreasing" && "↘ Decreasing"}
                  {metrics?.cpu.trend === "stable" && "→ Stable"}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="memory" className="mt-4">
            <div className="flex flex-col items-center gap-2">
              <HardDrive className="h-8 w-8 text-muted-foreground" />
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold">{metrics?.memory.current || 0}%</div>
              )}
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {metrics?.memory.trend === "increasing" && "↗ Increasing"}
                  {metrics?.memory.trend === "decreasing" && "↘ Decreasing"}
                  {metrics?.memory.trend === "stable" && "→ Stable"}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="network" className="mt-4">
            <div className="flex flex-col items-center gap-2">
              <Network className="h-8 w-8 text-muted-foreground" />
              {isLoading ? (
                <>
                  <Skeleton className="h-6 w-32 mb-1" />
                  <Skeleton className="h-6 w-32" />
                </>
              ) : (
                <div className="text-xl font-bold">
                  ↓ {metrics?.network.inbound || 0} MB/s
                  <br />↑ {metrics?.network.outbound || 0} MB/s
                </div>
              )}
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {metrics?.network.trend === "increasing" && "↗ Increasing"}
                  {metrics?.network.trend === "decreasing" && "↘ Decreasing"}
                  {metrics?.network.trend === "stable" && "→ Stable"}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <div className="mt-4">
          <Button variant="outline" className="w-full" onClick={handleViewDetailedMetrics}>
            View Detailed Metrics
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
