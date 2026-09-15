import { createClient } from "@supabase/supabase-js";

// Accept only the project origin (https://<ref>.supabase.co). Dashboard pages show
// URLs with suffixes like /rest/v1 — if one of those is pasted into the env var,
// supabase-js doubles the path and every request fails with PGRST125
// "Invalid path specified in request URL". Stripping to the origin makes that impossible.
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");

// Trim the key too: a trailing newline pasted into a hosting dashboard is invisible,
// survives REST/Storage (fetch strips header whitespace) but breaks the Realtime
// websocket, which sends the key as a query parameter verbatim.
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!rawKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");

const supabaseUrl = new URL(rawUrl.trim()).origin;
const supabaseAnonKey = rawKey.trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
