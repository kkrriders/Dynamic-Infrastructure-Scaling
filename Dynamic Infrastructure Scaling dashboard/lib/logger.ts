// Logger utility

// Log levels
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

// Log entry
type LogEntry = {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
}

// Logger class
export class Logger {
  private static instance: Logger
  private logLevel: LogLevel = LogLevel.INFO
  private logs: LogEntry[] = []
  private maxLogs = 1000

  private constructor() {}

  // Get logger instance (singleton)
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  // Set log level
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  // Set max logs
  public setMaxLogs(maxLogs: number): void {
    this.maxLogs = maxLogs
  }

  // Log message
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    // Check if log level is enabled
    if (this.shouldLog(level)) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
      }

      // Add to logs
      this.logs.push(entry)

      // Trim logs if needed
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs)
      }

      // Log to console in development
      if (process.env.NODE_ENV === "development") {
        const consoleMethod = this.getConsoleMethod(level)
        if (context) {
          console[consoleMethod](`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, context)
        } else {
          console[consoleMethod](`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`)
        }
      }
    }
  }

  // Check if log level is enabled
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentLevelIndex = levels.indexOf(this.logLevel)
    const logLevelIndex = levels.indexOf(level)
    return logLevelIndex >= currentLevelIndex
  }

  // Get console method for log level
  private getConsoleMethod(level: LogLevel): "debug" | "info" | "warn" | "error" {
    switch (level) {
      case LogLevel.DEBUG:
        return "debug"
      case LogLevel.INFO:
        return "info"
      case LogLevel.WARN:
        return "warn"
      case LogLevel.ERROR:
        return "error"
      default:
        return "info"
    }
  }

  // Public logging methods
  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  public error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  // Get logs
  public getLogs(): LogEntry[] {
    return [...this.logs]
  }

  // Clear logs
  public clearLogs(): void {
    this.logs = []
  }
}

// Export logger instance
export const logger = Logger.getInstance()
