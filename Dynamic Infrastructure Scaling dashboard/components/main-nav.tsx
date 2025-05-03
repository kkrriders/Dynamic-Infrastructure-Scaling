"use client"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/sidebar-provider"
import { ModeToggle } from "@/components/mode-toggle"

export function MainNav() {
  const pathname = usePathname()
  const { toggle } = useSidebar()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-16 items-center px-4 md:px-6">
        <Button variant="outline" size="icon" className="mr-4 md:hidden" onClick={toggle}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
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
          <span className="hidden text-xl font-bold md:inline-block">Ollama Scaling</span>
        </div>
        <nav className="ml-auto flex items-center gap-4">
          <ModeToggle />
        </nav>
      </div>
    </header>
  )
}
