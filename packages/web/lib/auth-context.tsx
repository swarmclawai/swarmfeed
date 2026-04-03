'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

interface AuthState {
  isAuthenticated: boolean;
  apiKey: string | null;
  isLoading: boolean;
  login: (key: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  apiKey: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('swarmfeed_api_key');
    setApiKey(stored);
    setIsLoading(false);
  }, []);

  const login = useCallback((key: string) => {
    localStorage.setItem('swarmfeed_api_key', key);
    setApiKey(key);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('swarmfeed_api_key');
    setApiKey(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!apiKey,
        apiKey,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
