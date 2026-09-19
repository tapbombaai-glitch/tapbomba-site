"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthMode = "signup" | "login" | "reset";

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }

    if (!password) {
      setMessage("Please enter your password.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.session && data.user) {
          setUser(data.user);
          return;
        }

        setMessage(
          "Account created successfully. Check your email if confirmation is required."
        );

        setMode("login");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.user) {
          setUser(data.user);
          setPassword("");
          setConfirmPassword("");
        }

        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/`,
        }
      );

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        "Password reset instructions have been sent to your email."
      );
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    setUser(null);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setMessage("");
    setMode("login");
  }

  if (user) {
    return (
      <main className="min-h-screen bg-[#030712] text-white">
        <section
          className="relative min-h-screen overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(rgba(2,6,23,0.5),rgba(2,6,23,0.92)),url('/tapbumber-bg.png')",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.2),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.12),transparent_35%)]" />

          <div className="relative z-10 mx-auto min-h-screen max-w-md px-5 py-7">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  TAP<span className="text-yellow-400">BUMBER</span>
                </h1>

                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-200">
                  Tap • Earn • Grow
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-slate-200"
              >
                LOGOUT
              </button>
            </header>

            <div className="mt-8">
              <div className="rounded-3xl border border-white/10 bg-black/55 p-6 shadow-2xl backdrop-blur-xl">
                <p className="text-sm text-slate-300">Welcome back 👋</p>

                <h2 className="mt-1 break-all text-xl font-black">
                  {user.email}
                </h2>

                <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                  <p className="text-sm font-bold text-yellow-200">
                    Current Balance
                  </p>

                  <p className="mt-2 text-4xl font-black text-yellow-400">
                    ₦0.00
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Total Earned
                    </p>

                    <p className="mt-2 text-xl font-black">
                      ₦0.00
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">
                      Referral Earnings
                    </p>

                    <p className="mt-2 text-xl font-black">
                      ₦0.00
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-black">
                    Your TapBumber
                  </h3>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
                    >
                      🎮
                      <span className="mt-2 block text-sm font-black">
                        Games
                      </span>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
                    >
                      🎯
                      <span className="mt-2 block text-sm font-black">
                        Activities
                      </span>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
                    >
                      👥
                      <span className="mt-2 block text-sm font-black">
                        Invite
                      </span>
                    </button>

                    <button
                      type="button"
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left"
                    >
                      💸
                      <span className="mt-2 block text-sm font-black">
                        Withdraw
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">
                  <p className="text-sm font-bold text-blue-100">
                    Your account is ready.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Your earnings, activities, referrals and transactions
                    will be connected to this account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
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
                {mode === "signup"
                  ? "Create Your Account"
                  : mode === "login"
                    ? "Welcome Back"
                    : "Reset Password"}
              </h2>

              <p className="mt-2 text-sm text-slate-300">
                {mode === "signup"
                  ? "Join TapBumber and start your journey."
                  : mode === "login"
                    ? "Login to continue to your TapBumber account."
                    : "Enter your email to receive a password reset link."}
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

              {mode !== "reset" && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Password
                  </label>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a TapBumber password"
                      autoComplete={
                        mode === "signup"
                          ? "new-password"
                          : "current-password"
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 pr-20 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-yellow-400"
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Confirm password
                  </label>

                  <input
                    type={showPassword ? "text" : "password"}
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
                    : mode === "login"
                      ? "LOGIN 🔐"
                      : "SEND RESET LINK 📧"}
              </button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-300">
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setMessage("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="font-black text-yellow-400"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <div className="mt-4 text-center text-sm text-slate-300">
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