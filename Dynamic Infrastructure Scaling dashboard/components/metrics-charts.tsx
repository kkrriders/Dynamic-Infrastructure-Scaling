"use client"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Sample data - in a real app, this would come from your API
const data = [
  { time: "00:00", cpu: 45, memory: 60, networkIn: 15, networkOut: 8 },
  { time: "01:00", cpu: 40, memory: 58, networkIn: 12, networkOut: 6 },
  { time: "02:00", cpu: 35, memory: 55, networkIn: 10, networkOut: 5 },
  { time: "03:00", cpu: 30, memory: 52, networkIn: 8, networkOut: 4 },
  { time: "04:00", cpu: 35, memory: 54, networkIn: 10, networkOut: 5 },
  { time: "05:00", cpu: 40, memory: 58, networkIn: 15, networkOut: 7 },
  { time: "06:00", cpu: 50, memory: 62, networkIn: 20, networkOut: 10 },
  { time: "07:00", cpu: 65, memory: 68, networkIn: 25, networkOut: 12 },
  { time: "08:00", cpu: 75, memory: 72, networkIn: 30, networkOut: 15 },
  { time: "09:00", cpu: 80, memory: 75, networkIn: 35, networkOut: 18 },
  { time: "10:00", cpu: 85, memory: 78, networkIn: 40, networkOut: 20 },
  { time: "11:00", cpu: 82, memory: 76, networkIn: 38, networkOut: 19 },
  { time: "12:00", cpu: 78, memory: 74, networkIn: 35, networkOut: 17 },
]

export function MetricsCharts() {
  return (
    <Tabs defaultValue="cpu" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="cpu">CPU Utilization</TabsTrigger>
        <TabsTrigger value="memory">Memory Usage</TabsTrigger>
        <TabsTrigger value="network">Network Traffic</TabsTrigger>
      </TabsList>
      <TabsContent value="cpu" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>CPU Utilization</CardTitle>
            <CardDescription>CPU usage percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="cpu" stroke="#8884d8" activeDot={{ r: 8 }} name="CPU %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="memory" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Memory Usage</CardTitle>
            <CardDescription>Memory usage percentage over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="memory" stroke="#82ca9d" activeDot={{ r: 8 }} name="Memory %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="network" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Network Traffic</CardTitle>
            <CardDescription>Network traffic in MB/s over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="networkIn"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                    name="Inbound (MB/s)"
                  />
                  <Line type="monotone" dataKey="networkOut" stroke="#82ca9d" name="Outbound (MB/s)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
