"use client"

import { AlertCircle, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { useForm } from "@/lib/hooks/use-form"
import { manualScalingSchema, type ManualScalingFormData } from "@/lib/validation"
import { applyManualScaling } from "@/lib/api"
import { useScalingStatus } from "@/lib/hooks/use-data"

export function ManualScalingForm() {
  const { toast } = useToast()
  const { scaling, refresh } = useScalingStatus()

  // Initial form values
  const initialValues: ManualScalingFormData = {
    instances: scaling?.currentInstances || 5,
    bypassCooldown: false,
    bypassConfidence: false,
  }

  // Form submission handler
  const handleSubmit = async (values: ManualScalingFormData) => {
    await applyManualScaling(values)
    toast({
      title: "Scaling initiated",
      description: `Scaling to ${values.instances} instances has been initiated.`,
    })
    refresh()
  }

  // Use the form hook
  const {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit: onSubmit,
  } = useForm({
    initialValues,
    schema: manualScalingSchema,
    onSubmit: handleSubmit,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Manual Scaling
        </CardTitle>
        <CardDescription>Manually override the current scaling configuration</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>Manual scaling bypasses AI recommendations. Use with caution.</AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="instances">Number of Instances</Label>
            <Input
              id="instances"
              name="instances"
              type="number"
              min={1}
              max={100}
              value={values.instances}
              onChange={(e) => handleChange("instances", Number.parseInt(e.target.value) || 1)}
              className={errors.instances ? "border-red-500" : ""}
            />
            {errors.instances && <p className="text-sm text-red-500">{errors.instances}</p>}
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="bypassCooldown"
                checked={values.bypassCooldown}
                onCheckedChange={(checked) => handleChange("bypassCooldown", checked === true)}
              />
              <label
                htmlFor="bypassCooldown"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Bypass cooldown period
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="bypassConfidence"
                checked={values.bypassConfidence}
                onCheckedChange={(checked) => handleChange("bypassConfidence", checked === true)}
              />
              <label
                htmlFor="bypassConfidence"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Bypass confidence threshold
              </label>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Scaling..." : "Apply Scaling"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
