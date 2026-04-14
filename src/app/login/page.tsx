"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      setLoading(false);

      if (error) {
        setError(error.message);
        return;
      }

      setResetSent(true);
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setLoading(false);

      if (error) {
        setError(error.message);
        return;
      }

      // Check if user needs to confirm email or is auto-confirmed
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Auto-confirmed, check for profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        router.replace(profile ? "/" : "/profile/setup");
      } else {
        // Needs email confirmation
        setError(
          "Check your email for a confirmation link, then come back and sign in."
        );
      }
      return;
    }

    // Login
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Check if profile exists
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      router.replace(profile ? "/" : "/profile/setup");
    }
  }

  return (
    <main className="min-h-dvh bg-[#0a0a0a] text-[#fafaf9] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors text-sm mb-8"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2">
          {mode === "login"
            ? "Sign in"
            : mode === "signup"
            ? "Create account"
            : "Reset password"}
        </h1>
        <p className="text-neutral-500 text-sm mb-8">
          {mode === "login"
            ? "Enter your email and password to continue."
            : mode === "signup"
            ? "Choose a password to create your account."
            : "We'll send you a link to reset your password."}
        </p>

        {mode === "forgot" && resetSent ? (
          <div className="bg-emerald-950/50 border border-emerald-900/50 rounded-xl p-6 text-center">
            <p className="text-emerald-400 font-medium mb-1">Check your email</p>
            <p className="text-neutral-400 text-sm">
              We sent a reset link to{" "}
              <span className="text-white font-medium">{email}</span>
            </p>
            <button
              onClick={() => {
                setMode("login");
                setResetSent(false);
                setError(null);
              }}
              className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              Back to sign in
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs text-neutral-500 uppercase tracking-wider mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-colors"
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="password"
                  className="block text-xs text-neutral-500 uppercase tracking-wider"
                >
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                    }}
                    className="text-xs text-neutral-500 hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Min 6 characters" : ""}
                required
                minLength={6}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-colors"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || (mode !== "forgot" && !password)}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 active:scale-[0.98] text-[#0a0a0a] font-semibold py-3 px-6 rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {loading
              ? mode === "forgot"
                ? "Sending..."
                : mode === "login"
                ? "Signing in..."
                : "Creating account..."
              : mode === "forgot"
              ? "Send reset link"
              : mode === "login"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>
        )}

        {!resetSent && (
          <p className="text-neutral-500 text-sm text-center mt-6">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setResetSent(false);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}

        <p className="text-neutral-600 text-xs text-center mt-6">
          By signing in you agree to play fair and not cheat.
        </p>
      </div>
    </main>
  );
}
