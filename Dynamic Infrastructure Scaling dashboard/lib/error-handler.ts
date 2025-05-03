// Error types
export enum ErrorType {
  API = "API_ERROR",
  VALIDATION = "VALIDATION_ERROR",
  AUTHENTICATION = "AUTHENTICATION_ERROR",
  AUTHORIZATION = "AUTHORIZATION_ERROR",
  NETWORK = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN_ERROR",
}

// Error class
export class AppError extends Error {
  type: ErrorType
  statusCode?: number
  details?: any

  constructor(message: string, type: ErrorType = ErrorType.UNKNOWN, statusCode?: number, details?: any) {
    super(message)
    this.name = "AppError"
    this.type = type
    this.statusCode = statusCode
    this.details = details
  }
}

// Error handler
export function handleError(error: unknown): AppError {
  // If it's already an AppError, return it
  if (error instanceof AppError) {
    return error
  }

  // If it's a regular Error, convert it to an AppError
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes("Failed to fetch") || error.message.includes("Network request failed")) {
      return new AppError(error.message, ErrorType.NETWORK)
    }

    return new AppError(error.message)
  }

  // If it's something else, convert it to a string and create an AppError
  return new AppError(String(error))
}

// Function to log errors
export function logError(error: unknown): void {
  const appError = handleError(error)

  // In development, log to console
  if (process.env.NODE_ENV === "development") {
    console.error(`[${appError.type}]`, appError.message, appError.details || "")
    return
  }

  // In production, could send to error tracking service
  // Example: Sentry.captureException(appError)
}
