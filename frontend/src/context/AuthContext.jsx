import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
} from "react";
import { getEmailRedirectUrl, normalizeEmail } from "../lib/auth";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

// API base URL for direct calls
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  /**
   * Fetch user profile from database
   * This is the single source of truth for role
   */
  const fetchProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, full_name, company_id, job_title")
        .eq("id", authUser.id)
        .maybeSingle();

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
        return null;
      }
      
      return data;
    } catch (err) {
      console.warn("[Auth] Profile fetch exception:", err.message);
      return null;
    }
  }, []);

  /**
   * Setup company for new admin signup
   * Creates company + profile with admin role
   */
  const setupCompanyForNewUser = useCallback(async (authUser) => {
    if (!authUser?.user_metadata?.organization_name) {
      console.log("[Auth] No organization_name in metadata, skipping company setup");
      return false;
    }

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        console.warn("[Auth] No session for company setup");
        return false;
      }

      console.log("[Auth] Setting up company for new admin...");
      
      const response = await fetch(`${API_BASE_URL}/companies/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({
          organizationName: authUser.user_metadata.organization_name,
          country: authUser.user_metadata.country || "India",
          currencyCode: authUser.user_metadata.currency_code || "INR",
          currencySymbol: authUser.user_metadata.currency_symbol || "₹"
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        // User already has a company - this is fine
        if (result.company_id) {
          console.log("[Auth] User already has company:", result.company_id);
          return true;
        }
        console.error("[Auth] Company setup failed:", result.error);
        return false;
      }

      console.log("[Auth] Company created successfully:", result.company?.name);
      return true;
    } catch (err) {
      console.error("[Auth] Company setup exception:", err.message);
      return false;
    }
  }, []);

  /**
   * Resolve user with profile data
   * If profile doesn't exist and user has organization_name, create company first
   */
  async function resolveUser(authUser) {
    if (!authUser) {
      setUser(null);
      return;
    }

    console.log("[Auth] Resolving user:", authUser.email);

    // First, try to fetch existing profile
    let profile = await fetchProfile(authUser);
    
    // If no profile and user has organization_name metadata (new admin signup),
    // call the company setup endpoint to create company + profile
    if (!profile && authUser.user_metadata?.organization_name) {
      console.log("[Auth] No profile found, attempting company setup for new admin...");
      const setupSuccess = await setupCompanyForNewUser(authUser);
      
      if (setupSuccess) {
        // Wait a bit for database to settle, then re-fetch profile
        await new Promise(resolve => setTimeout(resolve, 500));
        profile = await fetchProfile(authUser);
        console.log("[Auth] Profile after setup:", profile);
      }
    }

    console.log("[Auth] Raw DB profile:", profile);
    console.log("[Auth] Role from DB:", profile?.role);

    const resolvedUser = {
      id: authUser.id,
      email: authUser.email,
      role: profile?.role ?? authUser.user_metadata?.role ?? "employee",
      full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
      company_id: profile?.company_id ?? null,
      job_title: profile?.job_title ?? null,
      user_metadata: authUser.user_metadata,
    };

    console.log("[Auth] Final user object:", { role: resolvedUser.role, email: resolvedUser.email });
    setUser(resolvedUser);
  }

  /**
   * Refresh user profile from database
   * Call this after role changes or when role seems stale
   */
  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user) {
      console.log("[Auth] Refreshing profile...");
      await resolveUser(currentSession.user);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const {
          data: { session: activeSession }
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        setSession(activeSession);
        await resolveUser(activeSession?.user ?? null);
      } catch (err) {
        console.error("[Auth] loadSession error:", err);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setIsBootstrapping(false);
      }
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      console.log("[Auth] Auth state changed:", _event);
      try {
        setSession(nextSession);
        await resolveUser(nextSession?.user ?? null);
      } catch (err) {
        console.error("[Auth] Fatal error:", err);
      } finally {
        setIsBootstrapping(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    isBootstrapping,
    refreshProfile, // Expose profile refresh function
    signIn: async ({ email, password }) =>
      supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password
      }),
    signUp: async ({ email, password, fullName, organizationName, country, currencyCode, currencySymbol }) =>
      supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          emailRedirectTo: getEmailRedirectUrl(),
          data: {
            role: "admin",
            full_name: fullName.trim(),
            organization_name: organizationName.trim(),
            country: country || "India",
            currency_code: currencyCode || "INR",
            currency_symbol: currencySymbol || "₹"
          }
        }
      }),
    signOut: async () => supabase.auth.signOut()
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}
