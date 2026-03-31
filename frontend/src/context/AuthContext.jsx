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
  const [isResolving, setIsResolving] = useState(false); // Prevent concurrent resolves

  /**
   * Fetch user profile from database
   * This is the single source of truth for role
   * Has 3 second timeout to prevent hanging
   */
  const fetchProfile = useCallback(async (authUser) => {
    if (!authUser) return null;
    
    console.log("[Auth] fetchProfile starting for:", authUser.id);
    
    try {
      // Add timeout to prevent hanging - reduced to 3 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Profile fetch timeout")), 3000)
      );
      
      const queryPromise = supabase
        .from("profiles")
        .select("role, full_name, company_id, job_title")
        .eq("id", authUser.id)
        .maybeSingle();
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
        return null;
      }
      
      console.log("[Auth] fetchProfile completed, data:", data);
      return data;
    } catch (err) {
      console.warn("[Auth] Profile fetch exception:", err.message);
      return null;
    }
  }, []);

  /**
   * Setup company for new admin signup
   * Creates company + profile with admin role
   * Has 5 second timeout to prevent hanging
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
      
      // Add timeout to prevent hanging if backend is down - 3 seconds max
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
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
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

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
      if (err.name === 'AbortError') {
        console.warn("[Auth] Company setup timed out (backend may be down)");
      } else {
        console.error("[Auth] Company setup exception:", err.message);
      }
      return false;
    }
  }, []);

  /**
   * Resolve user with profile data
   * If profile doesn't exist and user has organization_name, create company first
   * CRITICAL: This function must NEVER throw - wrap everything in try-catch
   */
  async function resolveUser(authUser) {
    // Prevent concurrent resolves
    if (isResolving) {
      console.log("[Auth] resolveUser already in progress, skipping");
      return;
    }
    
    if (!authUser) {
      setUser(null);
      return;
    }

    setIsResolving(true);
    console.log("[Auth] Resolving user:", authUser.email);

    let profile = null;
    
    try {
      // First, try to fetch existing profile
      profile = await fetchProfile(authUser);
      
      // If no profile and user has organization_name metadata (new admin signup),
      // Skip company setup for now - it causes hangs. User will use metadata role.
      // TODO: Fix company setup flow properly
      if (!profile && authUser.user_metadata?.organization_name) {
        console.log("[Auth] No profile found for new admin, using metadata role (admin)");
        // Company setup will be triggered manually or on next login when profile is fetched successfully
      }

      console.log("[Auth] Raw DB profile:", profile);
      console.log("[Auth] Role from DB:", profile?.role);
    } catch (err) {
      console.error("[Auth] resolveUser error (non-fatal):", err.message);
      // Continue with null profile - fallback to user_metadata
    } finally {
      setIsResolving(false);
    }

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
      console.log("[Auth] loadSession starting...");
      try {
        console.log("[Auth] Calling supabase.auth.getSession()...");
        const {
          data: { session: activeSession }
        } = await supabase.auth.getSession();
        console.log("[Auth] getSession completed, session exists:", !!activeSession);

        if (!isMounted) {
          console.log("[Auth] Component unmounted, aborting");
          return;
        }

        setSession(activeSession);
        console.log("[Auth] About to resolveUser...");
        await resolveUser(activeSession?.user ?? null);
        console.log("[Auth] resolveUser completed");
      } catch (err) {
        console.error("[Auth] loadSession error:", err);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        console.log("[Auth] loadSession finally block, setting isBootstrapping=false");
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
        console.log("[Auth] onAuthStateChange finally, setting isBootstrapping=false");
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
