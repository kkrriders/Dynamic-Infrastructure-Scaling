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
          // Token is invalid, remove it
          localStorage.removeItem("authToken")
          Cookies.remove("auth_token")
        }
      } catch (err) {
        console.error("Auth check error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

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

      const { user, token } = await response.json()
      
      // Store auth data in localStorage
      localStorage.setItem("authToken", token)
      localStorage.setItem("user", JSON.stringify(user))
      
      // Also set in cookies for server-side verification
      Cookies.set("auth_token", token, { 
        expires: 7, // 7 days
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
  const logout = async () => {
    setIsLoading(true)

    try {
      const token = localStorage.getItem("authToken")
      
      if (token) {
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
    logout
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