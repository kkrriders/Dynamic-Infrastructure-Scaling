"use client"

import { useState } from "react"
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronUp } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// Sample data - in a real app, this would come from your API
const logs = [
  {
    id: "1",
    timestamp: "2023-08-24T15:30:00Z",
    action: "scale-up",
    fromInstances: 3,
    toInstances: 5,
    confidence: 0.85,
    reasoning:
      "CPU usage is consistently above 80% with increasing network traffic, suggesting the need for additional capacity.",
    model: "llama3:8b",
  },
  {
    id: "2",
    timestamp: "2023-08-24T10:15:00Z",
    action: "scale-up",
    fromInstances: 2,
    toInstances: 3,
    confidence: 0.78,
    reasoning: "Memory utilization trending upward, approaching 75% threshold.",
    model: "llama3:8b",
  },
  {
    id: "3",
    timestamp: "2023-08-23T22:45:00Z",
    action: "scale-down",
    fromInstances: 4,
    toInstances: 2,
    confidence: 0.92,
    reasoning: "Off-peak hours with CPU and memory utilization below 30% for the past 2 hours.",
    model: "llama3:8b",
  },
  {
    id: "4",
    timestamp: "2023-08-23T18:30:00Z",
    action: "no-change",
    fromInstances: 4,
    toInstances: 4,
    confidence: 0.88,
    reasoning: "Current metrics are within optimal ranges for the current instance count.",
    model: "llama3:8b",
  },
  {
    id: "5",
    timestamp: "2023-08-23T14:15:00Z",
    action: "scale-up",
    fromInstances: 2,
    toInstances: 4,
    confidence: 0.82,
    reasoning: "Rapid increase in network traffic and CPU utilization trending upward.",
    model: "llama3:8b",
  },
  {
    id: "6",
    timestamp: "2023-08-23T10:00:00Z",
    action: "no-change",
    fromInstances: 2,
    toInstances: 2,
    confidence: 0.75,
    reasoning: "Current metrics are within optimal ranges for the current instance count.",
    model: "llama3:8b",
  },
  {
    id: "7",
    timestamp: "2023-08-23T06:45:00Z",
    action: "scale-down",
    fromInstances: 3,
    toInstances: 2,
    confidence: 0.89,
    reasoning: "Off-peak hours with consistently low resource utilization.",
    model: "llama3:8b",
  },
]

export function LogsTable() {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Date</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Instances</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <>
              <TableRow key={log.id}>
                <TableCell className="font-medium">{formatDate(log.timestamp)}</TableCell>
                <TableCell>
                  {log.action === "scale-up" && (
                    <Badge className="bg-green-500 hover:bg-green-500">
                      <ArrowUp className="mr-1 h-3 w-3" />
                      Scale Up
                    </Badge>
                  )}
                  {log.action === "scale-down" && (
                    <Badge className="bg-amber-500 hover:bg-amber-500">
                      <ArrowDown className="mr-1 h-3 w-3" />
                      Scale Down
                    </Badge>
                  )}
                  {log.action === "no-change" && (
                    <Badge variant="outline">
                      <ArrowRight className="mr-1 h-3 w-3" />
                      No Change
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {log.fromInstances} → {log.toInstances}
                </TableCell>
                <TableCell>{(log.confidence * 100).toFixed(0)}%</TableCell>
                <TableCell>{log.model}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleRow(log.id)}>
                    {expandedRows[log.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </TableCell>
              </TableRow>
              {expandedRows[log.id] && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/50">
                    <div className="p-2">
                      <div className="font-medium">Reasoning:</div>
                      <div className="text-sm text-muted-foreground">{log.reasoning}</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
