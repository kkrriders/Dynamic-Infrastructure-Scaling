import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname

  // Define public paths that don't require authentication
  const isPublicPath = path === "/login"

  // Check for authentication in cookies or localStorage
  const authCookie = request.cookies.get("auth_token")
  
  // Client-side localStorage can't be accessed in middleware directly,
  // so we use cookies as the primary auth mechanism for server-side checks
  const isAuthenticated = !!authCookie?.value

  // If the path requires authentication and the user is not authenticated,
  // redirect to the login page
  if (!isPublicPath && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // If the user is authenticated and trying to access a public path,
  // redirect to the dashboard
  if (isPublicPath && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Otherwise, continue
  return NextResponse.next()
}

// Specify the paths that should be processed by the middleware
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
