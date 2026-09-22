import { NextResponse } from 'next/server';
import * as jose from 'jose';

export async function proxy(request) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isDashboardPage = pathname.startsWith('/dashboard');

  if (isDashboardPage) {
    if (!token) {
      // Not authenticated, redirect to login
      const url = new URL('/login', request.url);
      return NextResponse.redirect(url);
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      await jose.jwtVerify(token, secret);
      // Valid token, proceed
      return NextResponse.next();
    } catch (error) {
      // Invalid/expired token, clear it and redirect to login
      const url = new URL('/login', request.url);
      const response = NextResponse.redirect(url);
      response.cookies.delete('auth_token');
      return response;
    }
  }

  if (isAuthPage) {
    if (token) {
      try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        await jose.jwtVerify(token, secret);
        const url = new URL('/dashboard', request.url);
        return NextResponse.redirect(url);
      } catch (error) {
        // Invalid token on login/signup page, clear it and let them stay
        const response = NextResponse.next();
        response.cookies.delete('auth_token');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
