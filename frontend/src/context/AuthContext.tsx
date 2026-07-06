'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser, logout as clearSession, User, Permissions } from '@/lib/api';

export interface AuthContextType {
  user: User | null;
  permissions: Permissions | null;
  loading: boolean;
  logout: () => void;
  canAccess: (tool: string) => boolean;
  canApprove: () => boolean;
  canReject: () => boolean;
  canRunTools: () => boolean;
}

export const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (pathname === '/login') {
      setLoading(false);
      return;
    }

    const loadUser = async () => {
      setLoading(true);

      try {
        const data = await getCurrentUser();
        if (cancelled) return;
        setUser(data.user);
        setPermissions(data.permissions);
      } catch (err) {
        if (cancelled) return;
        setUser(null);
        setPermissions(null);
        router.replace('/login');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  const logout = async () => {
    await clearSession();
    setUser(null);
    setPermissions(null);
    router.replace('/login');
  };

  const canAccess = (tool: string): boolean => {
    return permissions?.allowed_tools.includes(tool) ?? false;
  };

  const canApprove = (): boolean => permissions?.can_approve ?? false;
  const canReject = (): boolean => permissions?.can_reject ?? false;
  const canRunTools = (): boolean => permissions?.can_run_tools ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        loading,
        logout,
        canAccess,
        canApprove,
        canReject,
        canRunTools,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
