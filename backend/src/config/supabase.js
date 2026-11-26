import { createClient } from "@supabase/supabase-js";
import { env, isConfigured } from "./env.js";

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
export const serviceClient = isConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
  : null;
export const authClient = isConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, options)
  : null;
export const userClient = (token) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
