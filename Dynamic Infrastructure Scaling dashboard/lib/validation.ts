import { z } from "zod"

// Azure Config Schema
export const azureConfigSchema = z.object({
  tenantId: z.string().min(1, "Tenant ID is required"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  subscriptionId: z.string().min(1, "Subscription ID is required"),
  resourceGroup: z.string().min(1, "Resource Group is required"),
  vmssName: z.string().min(1, "VMSS Name is required"),
})

export type AzureConfigFormData = z.infer<typeof azureConfigSchema>

// Ollama Config Schema
export const ollamaConfigSchema = z.object({
  apiUrl: z.string().url("Must be a valid URL"),
  primaryModel: z.string().min(1, "Primary Model is required"),
  fallbackModel: z.string().min(1, "Fallback Model is required"),
  systemPrompt: z.string().min(10, "System Prompt must be at least 10 characters"),
})

export type OllamaConfigFormData = z.infer<typeof ollamaConfigSchema>

// Scaling Config Schema
export const scalingConfigSchema = z.object({
  minInstances: z.number().int().min(1, "Minimum instances must be at least 1"),
  maxInstances: z
    .number()
    .int()
    .min(1, "Maximum instances must be at least 1")
    .refine((val) => val >= 1, {
      message: "Maximum instances must be greater than or equal to minimum instances",
      path: ["maxInstances"],
    }),
  cooldownPeriod: z.number().int().min(1, "Cooldown period must be at least 1 minute"),
  confidenceThreshold: z
    .number()
    .min(0.1, "Confidence threshold must be at least 0.1")
    .max(1, "Confidence threshold must be at most 1"),
  metricsInterval: z.number().int().min(1, "Metrics interval must be at least 1 minute"),
  metricsLookback: z.number().int().min(1, "Metrics lookback must be at least 1 hour"),
})

export type ScalingConfigFormData = z.infer<typeof scalingConfigSchema>

// Manual Scaling Schema
export const manualScalingSchema = z.object({
  instances: z.number().int().min(1, "Number of instances must be at least 1"),
  bypassCooldown: z.boolean(),
  bypassConfidence: z.boolean(),
})

export type ManualScalingFormData = z.infer<typeof manualScalingSchema>
