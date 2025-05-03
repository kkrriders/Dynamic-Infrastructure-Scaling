"use client"

import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useForm } from "@/lib/hooks/use-form"
import { ollamaConfigSchema, type OllamaConfigFormData } from "@/lib/validation"
import { updateOllamaConfig } from "@/lib/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2 } from "lucide-react"

export function OllamaConfigForm() {
  const { toast } = useToast()

  // Initial form values
  const initialValues: OllamaConfigFormData = {
    apiUrl: "http://localhost:11434",
    primaryModel: "llama3:8b",
    fallbackModel: "mistral:7b",
    systemPrompt: `You are an AI assistant specialized in cloud infrastructure scaling. Analyze the provided metrics and recommend an optimal instance count for the Azure Virtual Machine Scale Set.

Based on the metrics, respond with a JSON object containing:
1. recommended_instances: The optimal number of instances (integer)
2. confidence: Your confidence in this recommendation (0-1)
3. reasoning: A brief explanation of your recommendation

Consider CPU usage, memory utilization, and network traffic trends in your analysis.`,
  }

  // Form submission handler
  const handleSubmit = async (values: OllamaConfigFormData) => {
    await updateOllamaConfig(values)
    toast({
      title: "Configuration saved",
      description: "Your Ollama configuration has been updated.",
    })
  }

  // Use the form hook
  const {
    values,
    errors,
    isSubmitting,
    isSuccess,
    handleChange,
    handleSubmit: onSubmit,
  } = useForm({
    initialValues,
    schema: ollamaConfigSchema,
    onSubmit: handleSubmit,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ollama Configuration</CardTitle>
        <CardDescription>Configure your Ollama API settings and model preferences</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {isSuccess && (
            <Alert className="bg-green-500/10 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Configuration saved successfully!</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiUrl">Ollama API URL</Label>
            <Input
              id="apiUrl"
              name="apiUrl"
              value={values.apiUrl}
              onChange={(e) => handleChange("apiUrl", e.target.value)}
              placeholder="http://localhost:11434"
              className={errors.apiUrl ? "border-red-500" : ""}
            />
            {errors.apiUrl && <p className="text-sm text-red-500">{errors.apiUrl}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="primaryModel">Primary Model</Label>
            <Select value={values.primaryModel} onValueChange={(value) => handleChange("primaryModel", value)}>
              <SelectTrigger className={errors.primaryModel ? "border-red-500" : ""}>
                <SelectValue placeholder="Select primary model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llama3:8b">llama3:8b</SelectItem>
                <SelectItem value="llama3:70b">llama3:70b</SelectItem>
                <SelectItem value="mistral:7b">mistral:7b</SelectItem>
                <SelectItem value="mixtral:8x7b">mixtral:8x7b</SelectItem>
                <SelectItem value="gemma:7b">gemma:7b</SelectItem>
              </SelectContent>
            </Select>
            {errors.primaryModel && <p className="text-sm text-red-500">{errors.primaryModel}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fallbackModel">Fallback Model</Label>
            <Select value={values.fallbackModel} onValueChange={(value) => handleChange("fallbackModel", value)}>
              <SelectTrigger className={errors.fallbackModel ? "border-red-500" : ""}>
                <SelectValue placeholder="Select fallback model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mistral:7b">mistral:7b</SelectItem>
                <SelectItem value="llama3:8b">llama3:8b</SelectItem>
                <SelectItem value="gemma:7b">gemma:7b</SelectItem>
              </SelectContent>
            </Select>
            {errors.fallbackModel && <p className="text-sm text-red-500">{errors.fallbackModel}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              name="systemPrompt"
              value={values.systemPrompt}
              onChange={(e) => handleChange("systemPrompt", e.target.value)}
              placeholder="Enter system prompt for Ollama"
              className={`min-h-[200px] ${errors.systemPrompt ? "border-red-500" : ""}`}
            />
            {errors.systemPrompt && <p className="text-sm text-red-500">{errors.systemPrompt}</p>}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Save className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
