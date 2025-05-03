"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AzureConfigForm } from "@/components/azure-config-form"
import { OllamaConfigForm } from "@/components/ollama-config-form"
import { ScalingConfigForm } from "@/components/scaling-config-form"

export function ConfigTabs() {
  return (
    <Tabs defaultValue="azure" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="azure">Azure</TabsTrigger>
        <TabsTrigger value="ollama">Ollama</TabsTrigger>
        <TabsTrigger value="scaling">Scaling</TabsTrigger>
      </TabsList>
      <TabsContent value="azure" className="mt-6">
        <AzureConfigForm />
      </TabsContent>
      <TabsContent value="ollama" className="mt-6">
        <OllamaConfigForm />
      </TabsContent>
      <TabsContent value="scaling" className="mt-6">
        <ScalingConfigForm />
      </TabsContent>
    </Tabs>
  )
}
