"use client"

import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useForm } from "@/lib/hooks/use-form"
import { azureConfigSchema, type AzureConfigFormData } from "@/lib/validation"
import { updateAzureConfig } from "@/lib/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2 } from "lucide-react"

export function AzureConfigForm() {
  const { toast } = useToast()

  // Initial form values
  const initialValues: AzureConfigFormData = {
    tenantId: "",
    clientId: "",
    clientSecret: "",
    subscriptionId: "",
    resourceGroup: "",
    vmssName: "",
  }

  // Form submission handler
  const handleSubmit = async (values: AzureConfigFormData) => {
    await updateAzureConfig(values)
    toast({
      title: "Configuration saved",
      description: "Your Azure configuration has been updated.",
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
    schema: azureConfigSchema,
    onSubmit: handleSubmit,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Azure Configuration</CardTitle>
        <CardDescription>Configure your Azure credentials and resource details</CardDescription>
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
            <Label htmlFor="tenantId">Tenant ID</Label>
            <Input
              id="tenantId"
              name="tenantId"
              value={values.tenantId}
              onChange={(e) => handleChange("tenantId", e.target.value)}
              placeholder="Azure Tenant ID"
              className={errors.tenantId ? "border-red-500" : ""}
            />
            {errors.tenantId && <p className="text-sm text-red-500">{errors.tenantId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientId">Client ID</Label>
            <Input
              id="clientId"
              name="clientId"
              value={values.clientId}
              onChange={(e) => handleChange("clientId", e.target.value)}
              placeholder="Service Principal Client ID"
              className={errors.clientId ? "border-red-500" : ""}
            />
            {errors.clientId && <p className="text-sm text-red-500">{errors.clientId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientSecret">Client Secret</Label>
            <Input
              id="clientSecret"
              name="clientSecret"
              type="password"
              value={values.clientSecret}
              onChange={(e) => handleChange("clientSecret", e.target.value)}
              placeholder="Service Principal Secret"
              className={errors.clientSecret ? "border-red-500" : ""}
            />
            {errors.clientSecret && <p className="text-sm text-red-500">{errors.clientSecret}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subscriptionId">Subscription ID</Label>
            <Input
              id="subscriptionId"
              name="subscriptionId"
              value={values.subscriptionId}
              onChange={(e) => handleChange("subscriptionId", e.target.value)}
              placeholder="Azure Subscription ID"
              className={errors.subscriptionId ? "border-red-500" : ""}
            />
            {errors.subscriptionId && <p className="text-sm text-red-500">{errors.subscriptionId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resourceGroup">Resource Group</Label>
            <Input
              id="resourceGroup"
              name="resourceGroup"
              value={values.resourceGroup}
              onChange={(e) => handleChange("resourceGroup", e.target.value)}
              placeholder="Azure Resource Group Name"
              className={errors.resourceGroup ? "border-red-500" : ""}
            />
            {errors.resourceGroup && <p className="text-sm text-red-500">{errors.resourceGroup}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vmssName">VMSS Name</Label>
            <Input
              id="vmssName"
              name="vmssName"
              value={values.vmssName}
              onChange={(e) => handleChange("vmssName", e.target.value)}
              placeholder="Virtual Machine Scale Set Name"
              className={errors.vmssName ? "border-red-500" : ""}
            />
            {errors.vmssName && <p className="text-sm text-red-500">{errors.vmssName}</p>}
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
