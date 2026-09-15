import { createClient } from "@supabase/supabase-js";

// Accept only the project origin (https://<ref>.supabase.co). Dashboard pages show
// URLs with suffixes like /rest/v1 — if one of those is pasted into the env var,
// supabase-js doubles the path and every request fails with PGRST125
// "Invalid path specified in request URL". Stripping to the origin makes that impossible.
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");

const supabaseUrl = new URL(rawUrl.trim()).origin;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
