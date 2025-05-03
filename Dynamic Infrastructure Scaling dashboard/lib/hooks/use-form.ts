"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { z } from "zod"

interface UseFormProps<T> {
  initialValues: T
  schema: z.ZodType<T>
  onSubmit: (values: T) => Promise<void>
}

export function useForm<T extends Record<string, any>>({ initialValues, schema, onSubmit }: UseFormProps<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleChange = useCallback(
    (name: keyof T, value: any) => {
      setValues((prev) => ({ ...prev, [name]: value }))

      // Clear error when field is changed
      if (errors[name]) {
        setErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[name]
          return newErrors
        })
      }

      // Clear success state when form is changed
      if (isSuccess) {
        setIsSuccess(false)
      }
    },
    [errors, isSuccess],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setIsSubmitting(true)
      setErrors({})
      setIsSuccess(false)

      try {
        // Validate form data
        const validatedData = schema.parse(values)

        // Submit form data
        await onSubmit(validatedData)

        // Set success state
        setIsSuccess(true)
      } catch (error) {
        // Handle validation errors
        if (error instanceof z.ZodError) {
          const formattedErrors: Partial<Record<keyof T, string>> = {}

          error.errors.forEach((err) => {
            if (err.path.length > 0) {
              const fieldName = err.path[0] as keyof T
              formattedErrors[fieldName] = err.message
            }
          })

          setErrors(formattedErrors)
        } else {
          // Handle other errors
          console.error("Form submission error:", error)
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [values, schema, onSubmit],
  )

  return {
    values,
    errors,
    isSubmitting,
    isSuccess,
    handleChange,
    handleSubmit,
    setValues,
  }
}
