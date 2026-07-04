"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** True once the Supabase keys are present in the environment. */
export const supabaseConfigured = Boolean(url && anon);

/** Browser Supabase client. Null until configured (keeps the app from crashing
 *  before you've pasted your keys). */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
