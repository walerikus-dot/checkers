import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/play', '/profile', '/history'];
const AUTH_ONLY = ['/auth/login', '/auth/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read persisted auth from cookie (we'll sync localStorage → cookie on login)
  const token = request.cookies.get('checkers-auth-token')?.value;

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  const isAuthPage  = AUTH_ONLY.some(p => pathname.startsWith(p));

  if (isProtected && !token) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/play/:path*', '/profile/:path*', '/history/:path*', '/auth/:path*'],
};
