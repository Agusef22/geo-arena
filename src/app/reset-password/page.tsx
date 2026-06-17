"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase sends the user here with a session already established
  // (the token is in the URL hash, handled by the Supabase client automatically)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if user is already authenticated (e.g., page refresh)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="pop-bg min-h-dvh text-[#fafaf9] flex items-center justify-center">
        <p className="text-neutral-500 animate-pulse">Loading...</p>
      </main>
    );
  }

  return (
    <main className="pop-bg min-h-dvh text-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="relative z-10 w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-2">
          <span>🔑</span> New password
        </h1>
        <p className="text-neutral-400 text-sm mb-8">
          Choose a new password for your account.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs text-neutral-500 uppercase tracking-wider mb-2"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              autoFocus
              className="input-pop"
            />
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-xs text-neutral-500 uppercase tracking-wider mb-2"
            >
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="input-pop"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            style={{ ["--pop-shadow" as string]: "#047857" }}
            className="pop-press bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-[#06281c] font-extrabold py-3.5 px-6 rounded-2xl cursor-pointer mt-1"
          >
            {loading ? "Saving..." : "Set new password"}
          </button>
        </form>
      </div>
    </main>
  );
}
