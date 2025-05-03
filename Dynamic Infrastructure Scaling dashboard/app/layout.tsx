import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { SidebarProvider } from "@/components/sidebar-provider"
import { AuthProvider } from "@/lib/auth"
import { StoreProvider } from "@/lib/store/store-context"
import { MainNav } from "@/components/main-nav"
import { Sidebar } from "@/components/sidebar"

import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Dynamic Infrastructure Scaling with Ollama",
  description: "AI-driven solution for automatically scaling Azure infrastructure",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <StoreProvider>
              <SidebarProvider>
                <div className="flex min-h-screen flex-col">
                  <MainNav />
                  <div className="flex flex-1">
                    <Sidebar />
                    <main className="flex-1 p-6">{children}</main>
                  </div>
                </div>
              </SidebarProvider>
            </StoreProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
