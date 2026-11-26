import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { api, setAccessToken } from "../../lib/api";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(data.session);
        if (error) setError(error);
        if (!data.session) setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, current) => {
      setAccessToken(current?.access_token ?? null);
      setSession(current);
      if (!current) {
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAccessToken(session.access_token);
    api("/me", { signal: controller.signal })
      .then((profile) => {
        if (!controller.signal.aborted) setUser(profile);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error);
          setUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session?.access_token]);
  async function refreshProfile() {
    const profile = await api("/me");
    setUser(profile);
    setError(null);
    return profile;
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setAccessToken(null);
    setSession(null);
    setUser(null);
    setError(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, session, loading, error, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Protected({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="full-loader" role="status">
        <span className="loader" /> Opening your library…
      </div>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) return <Navigate to="/app" replace />;
  return children;
}
