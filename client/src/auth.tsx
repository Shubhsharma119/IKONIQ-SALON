import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';
export type User = {
  id: number;
  name: string;
  phone: string;
  role: string;
  branchId: number | null;
};
type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);
  async function login(phone: string, password: string) {
    const d = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    localStorage.setItem('token', d.token);
    setUser(d.user);
  }
  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
