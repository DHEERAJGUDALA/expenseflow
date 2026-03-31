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

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      const {
        data: { session: activeSession }
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(activeSession);
      setUser(activeSession?.user ?? null);
      setIsBootstrapping(false);
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsBootstrapping(false);
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
    signUp: async ({ email, password, fullName, organizationName }) =>
      supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          emailRedirectTo: getEmailRedirectUrl(),
          data: {
            role: "admin",
            full_name: fullName.trim(),
            organization_name: organizationName.trim()
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
