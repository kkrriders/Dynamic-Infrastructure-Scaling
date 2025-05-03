// Define the scaling state type
export interface ScalingState {
  currentInstances: number
  recommendedInstances: number
  lastScalingAction: string
  vmSize: string
  cooldownRemaining: number
}

// Define the initial state
export const initialScalingState: ScalingState = {
  currentInstances: 0,
  recommendedInstances: 0,
  lastScalingAction: new Date().toISOString(),
  vmSize: "",
  cooldownRemaining: 0,
}

// Define the reducer
export function scalingReducer(state: ScalingState, action: { type: string; payload?: any }): ScalingState {
  switch (action.type) {
    case "SET_SCALING":
      return {
        ...state,
        ...action.payload,
      }
    default:
      return state
  }
}
