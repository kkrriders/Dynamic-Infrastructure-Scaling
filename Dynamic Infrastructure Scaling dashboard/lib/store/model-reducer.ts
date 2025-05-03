// Define the model state type
export interface ModelState {
  primaryModel: string
  primaryModelStatus: "online" | "offline"
  fallbackModel: string
  fallbackModelStatus: "online" | "offline"
  lastRecommendationConfidence: number
}

// Define the initial state
export const initialModelState: ModelState = {
  primaryModel: "",
  primaryModelStatus: "offline",
  fallbackModel: "",
  fallbackModelStatus: "offline",
  lastRecommendationConfidence: 0,
}

// Define the reducer
export function modelReducer(state: ModelState, action: { type: string; payload?: any }): ModelState {
  switch (action.type) {
    case "SET_MODEL":
      return {
        ...state,
        ...action.payload,
      }
    default:
      return state
  }
}
