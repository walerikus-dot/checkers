'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';
import { authApi } from '../lib/api';
import { clsx } from 'clsx';

const LINKS = [
  { href: '/dashboard',   label: 'Play' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/history',     label: 'History' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/friends',     label: 'Friends' },
];

export default function Nav() {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    logout();
    router.push('/');
  };

  // Don't show nav on auth pages or landing
  if (!user || pathname === '/') return null;

  return (
    <nav className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-amber-400 font-bold text-lg tracking-tight">
            Checkers
          </Link>
          <div className="flex items-center gap-1">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm transition',
                  pathname.startsWith(href)
                    ? 'bg-gray-800 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                )}>
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/profile/${user.id}`}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition">
            <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-xs">
              {user.username[0].toUpperCase()}
            </div>
            <span className="hidden sm:block">{user.username}</span>
          </Link>
          <button onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300 transition px-2 py-1 rounded hover:bg-gray-800">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
