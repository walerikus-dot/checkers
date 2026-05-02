import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types/game';
import { setAccessToken } from '../lib/api';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, token) => {
        setAccessToken(token);
        // Sync to cookie so middleware (server-side) can read it
        document.cookie = `checkers-auth-token=${token};path=/;max-age=${7 * 24 * 3600};SameSite=Lax`;
        set({ user, accessToken: token });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        setAccessToken(null);
        document.cookie = 'checkers-auth-token=;path=/;max-age=0';
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: 'checkers-auth',
      onRehydrateStorage: () => (state) => {
        // Restore token into axios interceptor after page reload
        if (state?.accessToken) setAccessToken(state.accessToken);
      },
    }
  )
);
