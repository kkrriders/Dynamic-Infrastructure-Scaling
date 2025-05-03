import { render, screen, waitFor } from "@testing-library/react"
import { ScalingStatus } from "@/components/scaling-status"
import * as hooks from "@/lib/hooks/use-data"
import * as api from "@/lib/api"

// Mock the hooks
jest.mock("@/lib/hooks/use-data", () => ({
  useScalingStatus: jest.fn(),
}))

// Mock the API
jest.mock("@/lib/api", () => ({
  forceScalingCheck: jest.fn(),
}))

// Mock the toast
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

describe("ScalingStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders loading state correctly", () => {
    // Mock the hook to return loading state
    jest.spyOn(hooks, "useScalingStatus").mockReturnValue({
      scaling: null,
      isLoading: true,
      error: null,
      refresh: jest.fn(),
    })

    render(<ScalingStatus />)

    // Check if loading skeletons are rendered
    expect(screen.getAllByRole("status")).toHaveLength(4)
  })

  it("renders scaling data correctly", () => {
    // Mock the hook to return data
    jest.spyOn(hooks, "useScalingStatus").mockReturnValue({
      scaling: {
        currentInstances: 5,
        recommendedInstances: 7,
        lastScalingAction: "2023-08-24T15:30:00Z",
        vmSize: "Standard_D4s_v3",
        cooldownRemaining: 0,
      },
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    })

    render(<ScalingStatus />)

    // Check if data is rendered correctly
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(screen.getByText("Standard_D4s_v3")).toBeInTheDocument()
    expect(screen.getByText("Ready to scale")).toBeInTheDocument()
  })

  it("handles force scaling check correctly", async () => {
    // Mock the API function
    const mockForceScalingCheck = jest.fn().mockResolvedValue({})
    jest.spyOn(api, "forceScalingCheck").mockImplementation(mockForceScalingCheck)

    // Mock the refresh function
    const mockRefresh = jest.fn()

    // Mock the hook to return data
    jest.spyOn(hooks, "useScalingStatus").mockReturnValue({
      scaling: {
        currentInstances: 5,
        recommendedInstances: 7,
        lastScalingAction: "2023-08-24T15:30:00Z",
        vmSize: "Standard_D4s_v3",
        cooldownRemaining: 0,
      },
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    })

    render(<ScalingStatus />)

    // Click the force scaling check button
    const button = screen.getByText("Force Scaling Check")
    button.click()

    // Check if the API function was called
    await waitFor(() => {
      expect(mockForceScalingCheck).toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
})
