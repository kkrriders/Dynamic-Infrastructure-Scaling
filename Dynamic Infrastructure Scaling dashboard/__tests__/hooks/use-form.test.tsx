import type React from "react"
import { renderHook, act } from "@testing-library/react"
import { useForm } from "@/lib/hooks/use-form"
import { z } from "zod"

describe("useForm", () => {
  // Define a simple schema for testing
  const schema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
    age: z.number().min(18, "Must be at least 18"),
  })

  // Define initial values
  const initialValues = {
    name: "",
    email: "",
    age: 0,
  }

  // Define a mock submit function
  const onSubmit = jest.fn()

  it("initializes with the provided values", () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues,
        schema,
        onSubmit,
      }),
    )

    expect(result.current.values).toEqual(initialValues)
    expect(result.current.errors).toEqual({})
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.isSuccess).toBe(false)
  })

  it("updates values when handleChange is called", () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues,
        schema,
        onSubmit,
      }),
    )

    act(() => {
      result.current.handleChange("name", "John Doe")
    })

    expect(result.current.values.name).toBe("John Doe")
  })

  it("validates form data on submit", async () => {
    const { result } = renderHook(() =>
      useForm({
        initialValues,
        schema,
        onSubmit,
      }),
    )

    // Create a mock event
    const mockEvent = {
      preventDefault: jest.fn(),
    } as unknown as React.FormEvent

    // Submit the form with invalid data
    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    // Check if validation errors are set
    expect(result.current.errors).toHaveProperty("name")
    expect(result.current.errors).toHaveProperty("email")
    expect(result.current.errors).toHaveProperty("age")
    expect(onSubmit).not.toHaveBeenCalled()

    // Update values to valid data
    act(() => {
      result.current.handleChange("name", "John Doe")
      result.current.handleChange("email", "john@example.com")
      result.current.handleChange("age", 25)
    })

    // Submit the form with valid data
    await act(async () => {
      await result.current.handleSubmit(mockEvent)
    })

    // Check if onSubmit was called with the correct data
    expect(onSubmit).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
      age: 25,
    })
    expect(result.current.isSuccess).toBe(true)
  })
})
