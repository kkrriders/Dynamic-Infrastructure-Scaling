"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Cog, Home, List, Scaling, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSidebar } from "@/components/sidebar-provider"

export function Sidebar() {
  const pathname = usePathname()
  const { isOpen, close } = useSidebar()

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden" onClick={close} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r bg-background transition-transform md:static md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M12 2H2v10h10V2z" />
              <path d="M22 12h-10v10h10V12z" />
              <path d="M12 12H2v10h10V12z" />
              <path d="M22 2h-10v10h10V2z" />
            </svg>
            <span className="text-xl font-bold">Ollama Scaling</span>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={close}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <div className="px-3 py-4">
            <nav className="flex flex-col gap-1">
              <Link
                href="/"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/" ? "bg-accent text-accent-foreground" : "transparent",
                )}
                onClick={() => close()}
              >
                <Home className="h-5 w-5" />
                Dashboard
              </Link>
              <Link
                href="/metrics"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/metrics" ? "bg-accent text-accent-foreground" : "transparent",
                )}
                onClick={() => close()}
              >
                <BarChart3 className="h-5 w-5" />
                Metrics
              </Link>
              <Link
                href="/configuration"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/configuration" ? "bg-accent text-accent-foreground" : "transparent",
                )}
                onClick={() => close()}
              >
                <Cog className="h-5 w-5" />
                Configuration
              </Link>
              <Link
                href="/logs"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/logs" ? "bg-accent text-accent-foreground" : "transparent",
                )}
                onClick={() => close()}
              >
                <List className="h-5 w-5" />
                Logs
              </Link>
              <Link
                href="/manual-scaling"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  pathname === "/manual-scaling" ? "bg-accent text-accent-foreground" : "transparent",
                )}
                onClick={() => close()}
              >
                <Scaling className="h-5 w-5" />
                Manual Scaling
              </Link>
            </nav>
          </div>
        </ScrollArea>
      </aside>
    </>
  )
}
