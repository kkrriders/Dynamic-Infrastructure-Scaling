"use client"

import { Brain, Check, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useModelStatus } from "@/lib/hooks/use-data"
import { Skeleton } from "@/components/ui/skeleton"
import { useState } from "react"

export function ModelStatus() {
  const { model, isLoading, refresh } = useModelStatus()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refresh()
    setTimeout(() => setIsRefreshing(false), 500) // Add a small delay for better UX
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Ollama Models
        </CardTitle>
        <CardDescription>Model status and confidence</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Primary Model</div>
            {isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{model?.primaryModel || "N/A"}</span>
                {model?.primaryModelStatus === "online" ? (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Online
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-red-500/10 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                  >
                    Offline
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Fallback Model</div>
            {isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{model?.fallbackModel || "N/A"}</span>
                {model?.fallbackModelStatus === "online" ? (
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Online
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-red-500/10 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                  >
                    Offline
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Last Confidence</div>
            {isLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : (
              <div className="text-sm font-medium">
                {model?.lastRecommendationConfidence
                  ? `${(model.lastRecommendationConfidence * 100).toFixed(0)}%`
                  : "N/A"}
              </div>
            )}
          </div>
          <Button variant="outline" className="w-full" onClick={handleRefresh} disabled={isLoading || isRefreshing}>
            {isRefreshing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              "Check Model Status"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
