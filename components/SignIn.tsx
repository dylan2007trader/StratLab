"use client";

import { useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import SceneBanner from "./SceneBanner";

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43.5c5.5 0 10.3-1.9 13.7-5.1l-6.3-5.2C29.4 34.6 26.9 35.5 24 35.5c-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.3 5.2C40.9 35.9 43.5 30.5 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  async function google() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
  }
  return (
    <main className="max-w-md mx-auto my-10 px-4">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <SceneBanner title="StratLab" subtitle="Build trading bots. Learn the honest way." rounded={false} height="h-32" />
        <div className="p-6 text-center">
          {supabaseConfigured ? (
            <>
              <p className="text-[14px] text-ink">Sign in to save your bots to the cloud, sync across devices, and climb the Summit.</p>
              <button onClick={google} disabled={busy} className="mt-4 w-full border border-line rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2 bg-white hover:bg-soft disabled:opacity-60">
                <GoogleG /> {busy ? "Opening Google…" : "Continue with Google"}
              </button>
              <p className="text-[11px] text-muted mt-3">Paper money only — no real trading, ever.</p>
            </>
          ) : (
            <div className="text-[13px] text-loss">
              Supabase isn&apos;t configured yet. Add <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> to <span className="font-mono">.env.local</span>, then restart the dev server.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
