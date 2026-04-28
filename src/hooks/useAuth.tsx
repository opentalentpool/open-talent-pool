import { useState, useEffect, createContext, useContext } from "react";
import api from "@/lib/api";
import type { AuthMeResponse, AuthSession, AuthUser, PublicAccountRole } from "@/types/auth";

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchActiveRole: (role: PublicAccountRole) => Promise<AuthUser>;
  enableRole: (role: PublicAccountRole, options?: { makeActive?: boolean }) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
  switchActiveRole: async () => {
    throw new Error("AuthProvider is required");
  },
  enableRole: async () => {
    throw new Error("AuthProvider is required");
  },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then((resp: AuthMeResponse) => {
        setUser(resp.user ?? null);
        setSession({ method: "cookie" });
      })
      .catch(() => {
        setUser(null);
        setSession(null);
      })
      .finally(() => setLoading(false));

    return () => {};
  }, []);

  const refreshUser = async () => {
    try {
      const resp = await api.auth.me();
      setUser(resp.user ?? null);
      setSession({ method: "cookie" });
    } catch {
      setUser(null);
      setSession(null);
    }
  };

  const signOut = async () => {
    try {
      await api.auth.signOut();
    } catch {
      // The server may already consider the session invalid; local state should still be cleared.
    }

    setUser(null);
    setSession(null);
  };

  const switchActiveRole = async (role: PublicAccountRole) => {
    const response = await api.auth.setActiveRole({ role });
    setUser(response.user);
    setSession({ method: "cookie" });
    return response.user;
  };

  const enableRole = async (role: PublicAccountRole, options: { makeActive?: boolean } = {}) => {
    const response = await api.auth.enableRole({
      role,
      makeActive: options.makeActive ?? false,
    });
    setUser(response.user);
    setSession({ method: "cookie" });
    return response.user;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshUser, switchActiveRole, enableRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
