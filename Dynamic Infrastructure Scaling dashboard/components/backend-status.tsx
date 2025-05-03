"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, RefreshCw, Server, Activity, AlertTriangle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { forceScalingCheck } from "@/lib/api"

// API base URL from env
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

interface EndpointStatus {
  url: string
  name: string
  status: "success" | "error" | "pending"
  responseTime?: number
  errorMessage?: string
}

export function BackendStatus() {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [mockMode, setMockMode] = useState(process.env.NODE_ENV === "development")
  const [endpointsStatus, setEndpointsStatus] = useState<EndpointStatus[]>([
    { url: "/metrics", name: "Metrics API", status: "pending" },
    { url: "/scaling", name: "Scaling API", status: "pending" },
    { url: "/model", name: "Model API", status: "pending" },
    { url: "/logs", name: "Logs API", status: "pending" },
  ])

  // Test connection to all endpoints
  const testConnections = async (forceLiveCheck = false) => {
    setIsLoading(true)
    
    const newStatus = [...endpointsStatus]
    
    for (let i = 0; i < newStatus.length; i++) {
      const endpoint = newStatus[i]
      endpoint.status = "pending"
      endpoint.errorMessage = undefined
      setEndpointsStatus([...newStatus])
      
      try {
        // Skip real API calls if in mock mode and not forcing live check
        if (mockMode && !forceLiveCheck) {
          newStatus[i] = {
            ...endpoint,
            status: "success",
            responseTime: 0
          }
          continue
        }
        
        const startTime = performance.now()
        const response = await fetch(`${API_BASE_URL}${endpoint.url}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Authorization": typeof window !== "undefined" 
              ? `Bearer ${localStorage.getItem("authToken") || ""}` 
              : "",
          },
        })
        const endTime = performance.now()
        
        if (response.ok) {
          newStatus[i] = {
            ...endpoint,
            status: "success",
            responseTime: Math.round(endTime - startTime)
          }
        } else {
          let errorMessage = `Status: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch (e) {
            // If we can't parse JSON, just use the status code
          }
          
          newStatus[i] = {
            ...endpoint,
            status: "error",
            responseTime: Math.round(endTime - startTime),
            errorMessage
          }
        }
      } catch (error) {
        newStatus[i] = {
          ...endpoint,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Network error"
        }
      }
      
      setEndpointsStatus([...newStatus])
    }
    
    setIsLoading(false)
  }

  // Toggle between mock and real API mode
  const toggleMockMode = () => {
    const newMode = !mockMode;
    setMockMode(newMode);
    
    toast({
      title: newMode ? "Mock Mode Enabled" : "Live Mode Enabled",
      description: newMode 
        ? "Using mock data for all API endpoints" 
        : "Attempting to connect to real backend API",
    });
    
    testConnections(!newMode);
  }

  // Force a scaling check through the API
  const handleForceScalingCheck = async () => {
    setIsLoading(true)
    
    try {
      await forceScalingCheck()
      toast({
        title: "Scaling check initiated",
        description: mockMode 
          ? "MOCK MODE: Simulated scaling check" 
          : "The system will perform a scaling check now.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to initiate scaling check",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  // Test connection when component loads
  useEffect(() => {
    testConnections()
  }, [])
  
  // Get overall status
  const overallStatus = mockMode 
    ? "connected" 
    : endpointsStatus.every(e => e.status === "success") 
      ? "connected" 
      : endpointsStatus.every(e => e.status === "error") 
        ? "disconnected" 
        : "partial"

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Backend Connectivity Test
        </CardTitle>
        <CardDescription>
          Verify connection to all backend API endpoints
          {mockMode && " (Using Mock Data)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium">Status:</span>
            {mockMode && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Mock Mode
              </Badge>
            )}
            {!mockMode && overallStatus === "connected" && (
              <Badge variant="outline" className="bg-green-500/10 text-green-500">
                <Check className="h-3.5 w-3.5 mr-1" />
                Connected
              </Badge>
            )}
            {!mockMode && overallStatus === "disconnected" && (
              <Badge variant="outline" className="bg-red-500/10 text-red-500">
                <X className="h-3.5 w-3.5 mr-1" />
                Disconnected
              </Badge>
            )}
            {!mockMode && overallStatus === "partial" && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500">
                <Activity className="h-3.5 w-3.5 mr-1" />
                Partially Connected
              </Badge>
            )}
          </div>
          
          {mockMode && (
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Mock Mode Active</AlertTitle>
              <AlertDescription>
                The dashboard is using mock data instead of connecting to a real backend. Click "Test Real Backend" to attempt a real connection.
              </AlertDescription>
            </Alert>
          )}
          
          {!mockMode && overallStatus === "disconnected" && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>
                Could not connect to any backend API endpoints. Make sure your backend is running and accessible at {API_BASE_URL}, or switch to mock mode for testing.
              </AlertDescription>
            </Alert>
          )}
          
          <div>
            <span className="text-sm text-muted-foreground">Backend URL: {API_BASE_URL}</span>
          </div>
        </div>
        
        <div className="space-y-3">
          {endpointsStatus.map((endpoint) => (
            <div key={endpoint.url} className="flex items-center justify-between border-b pb-2">
              <div>
                <div className="font-medium">{endpoint.name}</div>
                <div className="text-xs text-muted-foreground">{API_BASE_URL}{endpoint.url}</div>
                {endpoint.errorMessage && (
                  <div className="text-xs text-red-500 mt-1">{endpoint.errorMessage}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {endpoint.responseTime !== undefined && endpoint.status === "success" && (
                  <span className="text-xs text-muted-foreground">{endpoint.responseTime}ms</span>
                )}
                {endpoint.status === "success" && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500">
                    <Check className="h-3.5 w-3.5" />
                  </Badge>
                )}
                {endpoint.status === "error" && (
                  <Badge variant="outline" className="bg-red-500/10 text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </Badge>
                )}
                {endpoint.status === "pending" && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        <Button 
          variant={mockMode ? "outline" : "default"}
          onClick={toggleMockMode} 
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          {mockMode ? (
            <>
              <Server className="mr-2 h-4 w-4" />
              Test Real Backend
            </>
          ) : (
            <>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Switch to Mock Mode
            </>
          )}
        </Button>
        <Button 
          variant="outline" 
          onClick={() => testConnections(!mockMode)} 
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Status
        </Button>
        <Button 
          onClick={handleForceScalingCheck} 
          disabled={isLoading || (!mockMode && overallStatus !== "connected")}
          className="w-full sm:w-auto"
        >
          <Activity className="mr-2 h-4 w-4" />
          Force Scaling Check
        </Button>
      </CardFooter>
    </Card>
  )
} 