import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { db, hashPin, type User, type UserRole } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

interface AuthCtx {
  user: User | null;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

const TIMEOUT_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const logout = useCallback(() => setUser(null), []);

  // Auto-logout on inactivity
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > TIMEOUT_MS) logout();
    }, 30000);
    return () => clearInterval(interval);
  }, [user, lastActivity, logout]);

  // Track activity
  useEffect(() => {
    if (!user) return;
    const handle = () => setLastActivity(Date.now());
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, handle, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handle));
  }, [user]);

  const login = async (pin: string): Promise<boolean> => {
    const hash = await hashPin(pin);
    const found = await db.users.where("pinHash").equals(hash).first();
    if (found && found.active) {
      setUser(found);
      setLastActivity(Date.now());
      const roleLabel = found.role.charAt(0).toUpperCase() + found.role.slice(1);
      toast.success(`Welcome ${found.name}`, { description: `Logged in as ${roleLabel}` });
      logAudit("login", found.name);
      return true;
    }
    logAudit("login_fail", "(unknown)", { message: "Invalid PIN attempt" });
    return false;
  };

  const hasRole = (roles: UserRole[]) => !!user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
