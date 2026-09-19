"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Please enter your email and password.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage(
          "Account created successfully. Check your email if confirmation is required."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage("Login successful. Your dashboard will be connected next.");
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030712] text-white">
      <section
        className="relative min-h-screen overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2,6,23,0.48),rgba(2,6,23,0.9)),url('/tapbumber-bg.png')",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.2),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.12),transparent_35%)]" />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-black tracking-tight">
              TAP<span className="text-yellow-400">BUMBER</span>
            </h1>

            <p className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-blue-200">
              Tap • Earn • Grow
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/55 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-black">
                {mode === "signup" ? "Create Your Account" : "Welcome Back"}
              </h2>

              <p className="mt-2 text-sm text-slate-300">
                {mode === "signup"
                  ? "Join TapBumber and start your journey."
                  : "Login to continue to your TapBumber account."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  Email address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400"
                />
              </div>

              {mode === "signup" && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Confirm password
                  </label>

                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400"
                  />
                </div>
              )}

              {message && (
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-center text-sm text-yellow-200">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-6 py-4 text-lg font-black text-black shadow-[0_0_35px_rgba(250,204,21,0.2)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "PLEASE WAIT..."
                  : mode === "signup"
                    ? "SIGN UP 🚀"
                    : "LOGIN 🔐"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-slate-300">
              {mode === "signup" ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setMessage("");
                    }}
                    className="font-black text-yellow-400"
                  >
                    LOGIN
                  </button>
                </>
              ) : (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setMessage("");
                    }}
                    className="font-black text-yellow-400"
                  >
                    SIGN UP
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            TapBumber • Earn from eligible activities and track your progress.
          </p>
        </div>
      </section>
    </main>
  );
}