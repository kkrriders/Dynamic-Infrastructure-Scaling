"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Cookies from 'js-cookie'

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

// Create context
const AuthContext = createContext(null)

// Auth provider
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const router = useRouter()

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("authToken") || Cookies.get("auth_token")
        
        if (!token) {
          setIsLoading(false)
          return
        }
        
        // Validate token with backend
        const response = await fetch(`${API_BASE_URL}/auth/validate`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          credentials: "include"
        })
        
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
        } else {
          // Token is invalid, try to refresh it
          await refreshToken()
        }
      } catch (err) {
        console.error("Auth check error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  // Refresh token
  const refreshToken = async () => {
    try {
      const refreshToken = Cookies.get("refresh_token")
      
      if (!refreshToken) {
        // No refresh token available, log user out
        logout(false) // Silent logout (no API call)
        return false
      }
      
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      })
      
      if (response.ok) {
        const { user, token, refreshToken: newRefreshToken } = await response.json()
        
        // Update tokens
        localStorage.setItem("authToken", token)
        localStorage.setItem("user", JSON.stringify(user))
        
        Cookies.set("auth_token", token, { 
          expires: 7,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production"
        })
        
        Cookies.set("refresh_token", newRefreshToken, { 
          expires: 30, // 30 days
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production"
        })
        
        setUser(user)
        return true
      } else {
        // Refresh failed, clear all auth data
        logout(false) // Silent logout
        return false
      }
    } catch (err) {
      console.error("Token refresh error:", err)
      logout(false) // Silent logout
      return false
    }
  }

  // Login function
  const login = async (email, password) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Invalid credentials")
      }

      const { user, token, refreshToken } = await response.json()
      
      // Store auth data in localStorage
      localStorage.setItem("authToken", token)
      localStorage.setItem("user", JSON.stringify(user))
      
      // Also set in cookies for server-side verification
      Cookies.set("auth_token", token, { 
        expires: 7, // 7 days
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production"
      })
      
      Cookies.set("refresh_token", refreshToken, { 
        expires: 30, // 30 days
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production"
      })
      
      setUser(user)
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  // Logout function
  const logout = async (callApi = true) => {
    setIsLoading(true)

    try {
      const token = localStorage.getItem("authToken")
      
      if (token && callApi) {
        // Call logout endpoint
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }).catch(err => console.error("Logout API error:", err))
      }
      
      // Clear local storage and cookies
      localStorage.removeItem("authToken")
      localStorage.removeItem("user")
      Cookies.remove("auth_token")
      Cookies.remove("refresh_token")

      setUser(null)
      router.push("/login")
    } catch (err) {
      console.error("Logout error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const contextValue = {
    user,
    isLoading,
    error,
    login,
    logout,
    refreshToken
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// Auth hook
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
} 