'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../store/auth.store';

export default function OAuthCallbackPage() {
  const { setAuth } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.slice(1); // strip leading '#'
    const params = new URLSearchParams(hash);
    const token = params.get('oauth_token');
    const userRaw = params.get('oauth_user');

    if (token && userRaw) {
      try {
        const user = JSON.parse(decodeURIComponent(userRaw));
        setAuth(user, token);
        router.replace('/dashboard');
      } catch {
        router.replace('/auth/login?error=oauth_failed');
      }
    } else {
      router.replace('/auth/login?error=oauth_failed');
    }
  }, [setAuth, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}
