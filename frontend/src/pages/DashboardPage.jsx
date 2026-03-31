import { useAuth } from "../context/AuthContext";

export function DashboardPage() {
  const { signOut, user } = useAuth();
  const role = user?.user_metadata?.role || "admin";
  const organizationName = user?.user_metadata?.organization_name || "Your organization";
  const fullName = user?.user_metadata?.full_name || user?.email;

  async function handleSignOut() {
    await signOut();
  }

  return (
    <>
      <button 
          className="inline-flex h-[52px] items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
          onClick={handleSignOut}
          type="button"
      >  
        Sign out
      </button>
      <div>
        done with auth
      </div>
    </>
  );
}
