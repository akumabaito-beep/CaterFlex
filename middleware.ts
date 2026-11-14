import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { decodeSession, SESSION_COOKIE } from '@/lib/session-cookie'

function homeForRole(role: string) {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'owner') return '/owner/dashboard'
  return '/customer/home'
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const tableSession = await decodeSession(request.cookies.get(SESSION_COOKIE)?.value)

   const publicRoutes = ['/', '/login', '/signup', '/menu']
  if (publicRoutes.includes(pathname)) {
    // A customer who just signed in with Google lands on /signup?step=contact to add a phone number.
    const addingContact = pathname === '/signup' && request.nextUrl.searchParams.get('step') === 'contact'
    if ((pathname === '/login' || pathname === '/signup') && tableSession && !addingContact) {
      return NextResponse.redirect(new URL(homeForRole(tableSession.role), request.url))
    }
    return NextResponse.next()
  }

  // Owners and customers who already have a valid sign-in cookie go straight through. The Supabase
  // client and session lookup (used only for admin accounts) are skipped for them, which keeps
  // every page request quick.
  const isOwnerArea = pathname.startsWith('/owner') || pathname.startsWith('/macroflex') || pathname.startsWith('/menu-management')
  if (isOwnerArea && tableSession?.role === 'owner') return NextResponse.next()
  if (pathname.startsWith('/customer') && tableSession?.role === 'customer') return NextResponse.next()

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            response.cookies.set(name, value)
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const supabaseRole = session?.user?.app_metadata?.role || null
  const isSupabaseAuthenticated = !!session

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      if (isSupabaseAuthenticated && supabaseRole === 'admin') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
      }
      return NextResponse.next()
    }
    if (!isSupabaseAuthenticated || supabaseRole !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
    return NextResponse.next()
  }

  // MacroFlex and Menu Management are owner-only pages that live outside /owner.
  if (pathname.startsWith('/owner') || pathname.startsWith('/macroflex') || pathname.startsWith('/menu-management')) {
    if (tableSession?.role === 'owner') {
      return NextResponse.next()
    }
    if (isSupabaseAuthenticated && supabaseRole === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    if (isSupabaseAuthenticated && supabaseRole === 'owner') {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/login?role=owner', request.url))
  }

  if (pathname.startsWith('/customer')) {
    if (tableSession?.role === 'customer') {
      return NextResponse.next()
    }
    if (isSupabaseAuthenticated && supabaseRole === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
    if (isSupabaseAuthenticated && supabaseRole === 'customer') {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
}
