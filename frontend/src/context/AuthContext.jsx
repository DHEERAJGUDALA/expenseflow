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

// CRITICAL: This is the "Default Company" UUID from database migration
// Profiles with this company_id are NOT properly set up yet
const DEFAULT_COMPANY_UUID = '00000000-0000-0000-0000-000000000001';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  /**
   * Fetch user profile from BACKEND API (not direct Supabase)
   * This bypasses RLS issues since backend uses service role key
   */
  const fetchProfileFromAPI = useCallback(async (accessToken) => {
    if (!accessToken) return null;
    
    console.log("[Auth] fetchProfileFromAPI starting...");
    
    try {
      const response = await fetch(`${API_BASE_URL}/employees/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn("[Auth] Profile API error:", response.status, errorData.error);
        return null;
      }

      const data = await response.json();
      console.log("[Auth] Profile from API:", data.employee);
      return data.employee;
    } catch (err) {
      console.warn("[Auth] Profile API exception:", err.message);
      return null;
    }
  }, []);

  /**
   * Setup company for new admin signup
   * Creates company + profile with admin role
   * MUST complete before user can do anything
   */
  const setupCompanyForNewUser = useCallback(async (accessToken, authUser) => {
    if (!authUser?.user_metadata?.organization_name) {
      console.log("[Auth] No organization_name in metadata, skipping company setup");
      return false;
    }

    try {
      console.log("[Auth] Calling POST /api/companies/setup with:", {
        organizationName: authUser.user_metadata.organization_name,
        country: authUser.user_metadata.country,
        currencyCode: authUser.user_metadata.currency_code
      });
      
      const response = await fetch(`${API_BASE_URL}/companies/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          organizationName: authUser.user_metadata.organization_name,
          country: authUser.user_metadata.country || "India",
          currencyCode: authUser.user_metadata.currency_code || "INR",
          currencySymbol: authUser.user_metadata.currency_symbol || "₹"
        })
      });

      const result = await response.json();
      console.log("[Auth] Company setup response:", response.status, result);
      
      if (!response.ok) {
        // User already has a REAL company (not the default) - this is fine
        if (result.company_id && result.company_id !== DEFAULT_COMPANY_UUID) {
          console.log("[Auth] User already has REAL company:", result.company_id);
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
   * Resolve user with profile data from backend API
   * If profile doesn't exist and user has organization_name, create company first
   */
  async function resolveUser(authUser, accessToken) {
    if (!authUser || !accessToken) {
      setUser(null);
      return;
    }

    console.log("[Auth] Resolving user:", authUser.email);

    let profile = null;
    
    try {
      // First, try to fetch existing profile from backend API
      profile = await fetchProfileFromAPI(accessToken);
      
      console.log("[Auth] Profile from API:", profile);
      
      // Check if user needs company setup:
      // 1. No profile exists, OR
      // 2. Profile exists but has the default placeholder company_id
      const needsCompanySetup = !profile || 
                                 !profile.company_id || 
                                 profile.company_id === DEFAULT_COMPANY_UUID;
      
      const hasOrganizationName = authUser.user_metadata?.organization_name;
      
      console.log("[Auth] Needs company setup:", needsCompanySetup, "Has org name:", hasOrganizationName);
      
      // If user needs company setup and has organization_name metadata (new admin signup),
      // create company and profile SYNCHRONOUSLY - user must wait for this
      if (needsCompanySetup && hasOrganizationName) {
        console.log("[Auth] Setting up company for new admin...");
        const companyCreated = await setupCompanyForNewUser(accessToken, authUser);
        
        if (companyCreated) {
          console.log("[Auth] Company created, fetching profile again...");
          // Small delay to let DB propagate
          await new Promise(resolve => setTimeout(resolve, 500));
          profile = await fetchProfileFromAPI(accessToken);
          console.log("[Auth] Profile after company setup:", profile);
        }
      }

      console.log("[Auth] Final profile:", profile);
    } catch (err) {
      console.error("[Auth] resolveUser error:", err.message);
    }

    // Build user object - profile data takes priority over metadata
    const resolvedUser = {
      id: authUser.id,
      email: authUser.email,
      role: profile?.role ?? authUser.user_metadata?.role ?? "employee",
      full_name: profile?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
      company_id: profile?.company_id ?? null,
      job_title: profile?.job_title ?? null,
      user_metadata: authUser.user_metadata,
    };

    console.log("[Auth] Resolved user:", { 
      email: resolvedUser.email, 
      role: resolvedUser.role, 
      company_id: resolvedUser.company_id 
    });
    setUser(resolvedUser);
  }

  /**
   * Refresh user profile from backend API
   * Call this after role changes or when data seems stale
   */
  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user && currentSession?.access_token) {
      console.log("[Auth] Refreshing profile...");
      await resolveUser(currentSession.user, currentSession.access_token);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      console.log("[Auth] loadSession starting...");
      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        console.log("[Auth] getSession completed, session exists:", !!activeSession);

        if (!isMounted) {
          console.log("[Auth] Component unmounted, aborting");
          return;
        }

        setSession(activeSession);
        
        if (activeSession?.user && activeSession?.access_token) {
          await resolveUser(activeSession.user, activeSession.access_token);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("[Auth] loadSession error:", err);
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        console.log("[Auth] loadSession completed, setting isBootstrapping=false");
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
        if (nextSession?.user && nextSession?.access_token) {
          await resolveUser(nextSession.user, nextSession.access_token);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("[Auth] onAuthStateChange error:", err);
      } finally {
        console.log("[Auth] onAuthStateChange completed, setting isBootstrapping=false");
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
    refreshProfile,
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
