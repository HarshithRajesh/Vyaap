/**
 * hooks/useAuth.js
 * Provides auth state and actions across the app.
 */
import { useState, useEffect, useCallback } from 'react';
import { storage, authApi } from '../api/client';

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(null); // null = loading
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await storage.get('vyaap_access_token');
        const userStr = await storage.get('vyaap_user');
        if (token) {
          setIsLoggedIn(true);
          if (userStr) {
            setUser(JSON.parse(userStr));
          }
        } else {
          setIsLoggedIn(false);
        }
      } catch {
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Listen for unauthorized events (token expired)
    const handleUnauthorized = () => {
      setIsLoggedIn(false);
      setUser(null);
    };
    window.addEventListener('vyaap:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('vyaap:unauthorized', handleUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await authApi.login(email, password);
    setIsLoggedIn(true);
    setUser({ email });
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setIsLoggedIn(false);
    setUser(null);
  }, []);

  return { isLoggedIn, user, loading, login, logout };
}
