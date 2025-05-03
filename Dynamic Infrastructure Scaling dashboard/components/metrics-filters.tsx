"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function MetricsFilters() {
  const [date, setDate] = useState<Date>()
  const [timeRange, setTimeRange] = useState("1h")
  const [refreshInterval, setRefreshInterval] = useState("off")

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal sm:w-[240px]",
                !date && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
          </PopoverContent>
        </Popover>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last 1 hour</SelectItem>
            <SelectItem value="3h">Last 3 hours</SelectItem>
            <SelectItem value="6h">Last 6 hours</SelectItem>
            <SelectItem value="12h">Last 12 hours</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={refreshInterval} onValueChange={setRefreshInterval}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Refresh interval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="30s">Every 30 seconds</SelectItem>
            <SelectItem value="1m">Every minute</SelectItem>
            <SelectItem value="5m">Every 5 minutes</SelectItem>
            <SelectItem value="15m">Every 15 minutes</SelectItem>
          </SelectContent>
        </Select>
        <Button>Refresh</Button>
      </div>
    </div>
  )
}
