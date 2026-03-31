import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import { getEmailRedirectUrl, normalizeEmail } from "../lib/auth";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  async function resolveUser(authUser) {
    if (!authUser) {
      setUser(null);
      return;
    }

    // Always fetch role from profiles — it is the single source of truth
    try {
      const fetchProfile = supabase
        .from("profiles")
        .select("role, full_name, company_id, job_title")
        .eq("id", authUser.id)
        .maybeSingle();

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timed out after 5s")), 5000)
      );

      const { data, error } = await Promise.race([fetchProfile, timeout]);

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
      }

      console.log("[Auth] Raw DB data:", data);
      console.log("[Auth] Role from DB:", data?.role);

      const resolvedUser = {
        id: authUser.id,
        email: authUser.email,
        role: data?.role ?? "employee",
        full_name: data?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
        company_id: data?.company_id ?? null,
        job_title: data?.job_title ?? null,
        user_metadata: authUser.user_metadata,
      };

      console.log("[Auth] Final user object:", { role: resolvedUser.role, email: resolvedUser.email });
      setUser(resolvedUser);
    } catch (err) {
      console.warn("[Auth] Profile fetch exception:", err.message);
      // Fallback — let user in with basic info, role defaults to employee
      setUser({
        id: authUser.id,
        email: authUser.email,
        role: "employee",
        full_name: authUser.user_metadata?.full_name ?? authUser.email,
        company_id: null,
        job_title: null,
        user_metadata: authUser.user_metadata,
      });
    }
  }

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
