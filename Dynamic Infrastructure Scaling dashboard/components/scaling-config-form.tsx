"use client"

import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Slider } from "@/components/ui/slider"
import { useForm } from "@/lib/hooks/use-form"
import { scalingConfigSchema, type ScalingConfigFormData } from "@/lib/validation"
import { updateScalingConfig } from "@/lib/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2 } from "lucide-react"
import { useEffect } from "react"

export function ScalingConfigForm() {
  const { toast } = useToast()

  // Initial form values
  const initialValues: ScalingConfigFormData = {
    minInstances: 2,
    maxInstances: 10,
    cooldownPeriod: 15,
    confidenceThreshold: 0.7,
    metricsInterval: 15,
    metricsLookback: 1,
  }

  // Form submission handler
  const handleSubmit = async (values: ScalingConfigFormData) => {
    await updateScalingConfig(values)
    toast({
      title: "Configuration saved",
      description: "Your scaling configuration has been updated.",
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
    setValues,
  } = useForm({
    initialValues,
    schema: scalingConfigSchema,
    onSubmit: handleSubmit,
  })

  // Handle slider change
  const handleSliderChange = (value: number[]) => {
    handleChange("confidenceThreshold", value[0] / 100)
  }

  // Update min/max instances validation
  useEffect(() => {
    if (values.minInstances > values.maxInstances) {
      setValues({
        ...values,
        maxInstances: values.minInstances,
      })
    }
  }, [values.minInstances, setValues, values.maxInstances])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scaling Configuration</CardTitle>
        <CardDescription>Configure scaling parameters and thresholds</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {isSuccess && (
            <Alert className="bg-green-500/10 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Configuration saved successfully!</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minInstances">Minimum Instances</Label>
              <Input
                id="minInstances"
                name="minInstances"
                type="number"
                min={1}
                max={100}
                value={values.minInstances}
                onChange={(e) => handleChange("minInstances", Number.parseInt(e.target.value) || 1)}
                className={errors.minInstances ? "border-red-500" : ""}
              />
              {errors.minInstances && <p className="text-sm text-red-500">{errors.minInstances}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxInstances">Maximum Instances</Label>
              <Input
                id="maxInstances"
                name="maxInstances"
                type="number"
                min={values.minInstances}
                max={100}
                value={values.maxInstances}
                onChange={(e) => handleChange("maxInstances", Number.parseInt(e.target.value) || values.minInstances)}
                className={errors.maxInstances ? "border-red-500" : ""}
              />
              {errors.maxInstances && <p className="text-sm text-red-500">{errors.maxInstances}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cooldownPeriod">Cooldown Period (minutes)</Label>
              <Input
                id="cooldownPeriod"
                name="cooldownPeriod"
                type="number"
                min={1}
                max={60}
                value={values.cooldownPeriod}
                onChange={(e) => handleChange("cooldownPeriod", Number.parseInt(e.target.value) || 1)}
                className={errors.cooldownPeriod ? "border-red-500" : ""}
              />
              {errors.cooldownPeriod && <p className="text-sm text-red-500">{errors.cooldownPeriod}</p>}
            </div>
            <div className="space-y-2">
              <Label>Confidence Threshold ({(values.confidenceThreshold * 100).toFixed(0)}%)</Label>
              <Slider
                value={[values.confidenceThreshold * 100]}
                max={100}
                step={1}
                onValueChange={handleSliderChange}
                className={`py-4 ${errors.confidenceThreshold ? "border-red-500" : ""}`}
              />
              {errors.confidenceThreshold && <p className="text-sm text-red-500">{errors.confidenceThreshold}</p>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="metricsInterval">Metrics Interval (minutes)</Label>
              <Input
                id="metricsInterval"
                name="metricsInterval"
                type="number"
                min={1}
                max={60}
                value={values.metricsInterval}
                onChange={(e) => handleChange("metricsInterval", Number.parseInt(e.target.value) || 1)}
                className={errors.metricsInterval ? "border-red-500" : ""}
              />
              {errors.metricsInterval && <p className="text-sm text-red-500">{errors.metricsInterval}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="metricsLookback">Metrics Lookback (hours)</Label>
              <Input
                id="metricsLookback"
                name="metricsLookback"
                type="number"
                min={1}
                max={24}
                value={values.metricsLookback}
                onChange={(e) => handleChange("metricsLookback", Number.parseInt(e.target.value) || 1)}
                className={errors.metricsLookback ? "border-red-500" : ""}
              />
              {errors.metricsLookback && <p className="text-sm text-red-500">{errors.metricsLookback}</p>}
            </div>
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
