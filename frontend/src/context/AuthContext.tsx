"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "BUYER" | "SELLER" | "QC_INSPECTOR";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  company_name: string;
  city: string;
  industry: string;
  gst_number: string;
  is_onboarded: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  loginAsDemo: (demoUserId: string, role?: UserRole) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  updateProfile: (profile: Partial<UserProfile>) => Promise<void>;
  switchRole: (newRole: UserRole) => Promise<void>;
  logout: () => void;
  apiBase: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const apiBase = process.env.NEXT_PUBLIC_API_URL !== undefined ? process.env.NEXT_PUBLIC_API_URL : "";

  useEffect(() => {
    // Restore session from localStorage
    const saved = localStorage.getItem("ghostload_user");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  }, []);

  const loginAsDemo = async (demoUserId: string, forcedRole?: UserRole) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo_user_id: demoUserId, role: forcedRole }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("ghostload_user", JSON.stringify(data.user));
        localStorage.setItem("ghostload_token", data.token);
      }
    } catch (err) {
      console.error("Login failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    // In DEMO_MODE, sign in as default buyer or prompt demo select
    await loginAsDemo("buyer-1", "BUYER");
  };

  const updateProfile = async (profileData: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const res = await fetch(`${apiBase}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user.id,
        },
        body: JSON.stringify(profileData),
      });
      const updated = await res.json();
      setUser(updated);
      localStorage.setItem("ghostload_user", JSON.stringify(updated));
    } catch (err) {
      console.error("Update profile failed:", err);
    }
  };

  const switchRole = async (newRole: UserRole) => {
    if (!user) return;
    await updateProfile({ role: newRole });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("ghostload_user");
    localStorage.removeItem("ghostload_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginAsDemo,
        signInWithGoogle,
        updateProfile,
        switchRole,
        logout,
        apiBase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
