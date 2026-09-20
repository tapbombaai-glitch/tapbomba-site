"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthMode = "signup" | "login" | "reset";
type DashboardTab = "home" | "earn" | "games" | "refer" | "wallet";

export default function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [activeTab, setActiveTab] =
    useState<DashboardTab>("home");

  const [copied, setCopied] = useState(false);

  /*
   * ---------------------------------------------------------
   * AUTHENTICATION
   * ---------------------------------------------------------
   */

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        const { data, error } =
          await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Session error:", error);
          setUser(null);
        } else {
          setUser(data.session?.user ?? null);
        }
      } catch (error) {
        console.error(
          "Unable to load session:",
          error
        );

        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(
          "Supabase auth event:",
          event
        );

        if (!mounted) return;

        setUser(session?.user ?? null);

        if (event === "SIGNED_IN") {
          setActiveTab("home");
          setMessage("");
        }

        if (event === "SIGNED_OUT") {
          setActiveTab("home");
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * AUTH FORM
   * ---------------------------------------------------------
   */

  async function handleAuth(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setMessage("");

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage(
        "Please enter your email address."
      );
      return;
    }

    if (
      authMode !== "reset" &&
      !password
    ) {
      setMessage(
        "Please enter your password."
      );
      return;
    }

    if (
      authMode !== "reset" &&
      password.length < 6
    ) {
      setMessage(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (
      authMode === "signup" &&
      password !== confirmPassword
    ) {
      setMessage(
        "Passwords do not match."
      );
      return;
    }

    setLoading(true);

    try {
      /*
       * -----------------------------------------------------
       * SIGN UP
       * -----------------------------------------------------
       */

      if (authMode === "signup") {
        const {
          data,
          error,
        } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        /*
         * Keep referral code locally for now.
         * Referral database logic will be connected later.
         */

        if (referralCode.trim()) {
          localStorage.setItem(
            "tapbumber_pending_referral",
            referralCode
              .trim()
              .toUpperCase()
          );
        }

        /*
         * If Supabase immediately gives
         * the new user a session, go directly
         * to the dashboard.
         */

        if (data.session?.user) {
          setUser(data.session.user);
          setActiveTab("home");

          setPassword("");
          setConfirmPassword("");
          setReferralCode("");

          setMessage(
            "Account created successfully! 🎉"
          );

          return;
        }

        /*
         * Email confirmation is required.
         */

        setPassword("");
        setConfirmPassword("");
        setAuthMode("login");

        setMessage(
          "Account created successfully. Please confirm your email, then login."
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * LOGIN
       * -----------------------------------------------------
       */

      if (authMode === "login") {
        const {
          data,
          error,
        } =
          await supabase.auth.signInWithPassword(
            {
              email: cleanEmail,
              password,
            }
          );

        if (error) {
          setMessage(error.message);
          return;
        }

        /*
         * Explicitly retrieve the current
         * Supabase session.
         */

        const {
          data: sessionData,
          error: sessionError,
        } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error(
            "Session retrieval error:",
            sessionError
          );

          setMessage(
            "Login succeeded, but we could not load your session. Please try again."
          );

          return;
        }

        const loggedInUser =
          sessionData.session?.user ??
          data.user;

        if (!loggedInUser) {
          setMessage(
            "Login succeeded, but your account session was not found."
          );

          return;
        }

        /*
         * Successful login:
         * immediately show the dashboard.
         */

        setUser(loggedInUser);
        setActiveTab("home");

        setPassword("");
        setConfirmPassword("");

        setMessage(
          "Login successful! 🎉"
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * PASSWORD RESET
       * -----------------------------------------------------
       */

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/`
          : undefined;

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        "Password reset instructions have been sent to your email."
      );
    } catch (error) {
      console.error(
        "Authentication error:",
        error
      );

      setMessage(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  async function logout() {
    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          "Logout error:",
          error
        );

        setMessage(error.message);
        return;
      }

      setUser(null);
      setActiveTab("home");

      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setReferralCode("");

      setCopied(false);
      setAuthMode("login");

      if (typeof window !== "undefined") {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );

      setMessage(
        "Unable to sign out. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * REFERRAL
   * ---------------------------------------------------------
   */

  async function copyReferralLink() {
    if (!user) return;

    const code =
      referralCode.trim() ||
      user.id
        .slice(0, 8)
        .toUpperCase();

    const link =
      `${window.location.origin}/?ref=${code}`;

    try {
      await navigator.clipboard.writeText(
        link
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setMessage(
        "Unable to copy the referral link."
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * HOME
   * ---------------------------------------------------------
   */

  function renderHome() {
    return (
      <>
        <div className="rounded-3xl border border-white/10 bg-black/55 p-5 shadow-2xl backdrop-blur-xl">
          <p className="text-sm text-slate-300">
            Welcome back 👋
          </p>

          <h2 className="mt-1 break-all text-xl font-black">
            {user?.email}
          </h2>

          <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-200">
              Current Balance
            </p>

            <p className="mt-2 text-4xl font-black text-yellow-400">
              ₦0.00
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">
                Today's Earnings
              </p>

              <p className="mt-2 text-xl font-black">
                ₦0.00
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">
                Total Earned
              </p>

              <p className="mt-2 text-xl font-black">
                ₦0.00
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
          <h3 className="text-lg font-black">
            Quick Actions
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                setActiveTab("earn")
              }
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition active:scale-95"
            >
              <span className="text-2xl">
                🎯
              </span>

              <span className="mt-2 block font-black">
                Earn
              </span>

              <span className="mt-1 block text-xs text-slate-400">
                Start earning
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab("games")
              }
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition active:scale-95"
            >
              <span className="text-2xl">
                🎮
              </span>

              <span className="mt-2 block font-black">
                Games
              </span>

              <span className="mt-1 block text-xs text-slate-400">
                Play & participate
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab("refer")
              }
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition active:scale-95"
            >
              <span className="text-2xl">
                👥
              </span>

              <span className="mt-2 block font-black">
                Refer
              </span>

              <span className="mt-1 block text-xs text-slate-400">
                Invite friends
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab("wallet")
              }
              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition active:scale-95"
            >
              <span className="text-2xl">
                💰
              </span>

              <span className="mt-2 block font-black">
                Wallet
              </span>

              <span className="mt-1 block text-xs text-slate-400">
                Balance & withdrawals
              </span>
            </button>
          </div>
        </div>
      </>
    );
  }

  /*
   * ---------------------------------------------------------
   * EARN
   * ---------------------------------------------------------
   */

  function renderEarn() {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
        <p className="text-sm text-yellow-300">
          EARNING
        </p>

        <h2 className="mt-1 text-2xl font-black">
          Earn on TapBumber
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Your earning activities will appear
          here. Each activity can be opened and
          completed from this section.
        </p>

        <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="font-black">
            Daily Activities
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Activities will be connected to
            your account next.
          </p>

          <button
            type="button"
            onClick={() =>
              setMessage(
                "Earning activities are being connected."
              )
            }
            className="mt-4 w-full rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black active:scale-95"
          >
            VIEW ACTIVITIES
          </button>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * GAMES
   * ---------------------------------------------------------
   */

  function renderGames() {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
        <p className="text-sm text-yellow-300">
          GAMES
        </p>

        <h2 className="mt-1 text-2xl font-black">
          TapBumber Games
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Games will be connected and tested
          in the next step.
        </p>

        <div className="mt-5 space-y-3">
          {[
            ["🎯", "Tap Challenge"],
            ["🧠", "Quick Quiz"],
            ["🔢", "Number Challenge"],
          ].map(([icon, name]) => (
            <button
              type="button"
              key={name}
              onClick={() =>
                setMessage(
                  `${name} will open here.`
                )
              }
              className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left active:scale-[0.98]"
            >
              <span className="text-2xl">
                {icon}
              </span>

              <span>
                <span className="block font-black">
                  {name}
                </span>

                <span className="text-xs text-slate-400">
                  Tap to open
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * REFER
   * ---------------------------------------------------------
   */

  function renderRefer() {
    const code =
      user?.id
        .slice(0, 8)
        .toUpperCase() ||
      "TAPUSER";

    const link =
      typeof window !== "undefined"
        ? `${window.location.origin}/?ref=${code}`
        : `?ref=${code}`;

    return (
      <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
        <p className="text-sm text-yellow-300">
          REFERRALS
        </p>

        <h2 className="mt-1 text-2xl font-black">
          Invite & Earn
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Share your referral link with people
          you genuinely want to invite to
          TapBumber.
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-400">
            Your Referral Code
          </p>

          <p className="mt-2 text-xl font-black text-yellow-400">
            {code}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-slate-400">
            Referral Link
          </p>

          <p className="mt-2 break-all text-sm text-slate-200">
            {link}
          </p>
        </div>

        <button
          type="button"
          onClick={copyReferralLink}
          className="mt-4 w-full rounded-2xl bg-yellow-400 px-4 py-4 font-black text-black active:scale-[0.98]"
        >
          {copied
            ? "COPIED ✅"
            : "COPY REFERRAL LINK"}
        </button>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-black">
            Referral Earnings
          </p>

          <p className="mt-1 text-2xl font-black">
            ₦0.00
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * WALLET
   * ---------------------------------------------------------
   */

  function renderWallet() {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-yellow-400/20 bg-black/55 p-5 backdrop-blur-xl">
          <p className="text-sm text-yellow-300">
            WALLET
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Your Balance
          </h2>

          <p className="mt-5 text-4xl font-black text-yellow-400">
            ₦0.00
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
          <h3 className="text-lg font-black">
            Withdraw
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Your withdrawal account and eligibility
            will be connected here.
          </p>

          <button
            type="button"
            onClick={() =>
              setMessage(
                "Withdrawal will be connected next."
              )
            }
            className="mt-4 w-full rounded-2xl bg-yellow-400 px-4 py-4 font-black text-black active:scale-95"
          >
            WITHDRAW
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
          <h3 className="text-lg font-black">
            Transactions
          </h3>

          <p className="mt-2 text-sm text-slate-400">
            No transactions yet.
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * DASHBOARD
   * ---------------------------------------------------------
   */

  function renderDashboard() {
    return (
      <main className="min-h-screen bg-[#030712] text-white">
        <section
          className="relative min-h-screen overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage:
              "linear-gradient(rgba(2,6,23,0.48),rgba(2,6,23,0.93)),url('/tapbumber-bg.png')",
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.10),transparent_35%)]" />

          <div className="relative z-10 mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight">
                  TAP
                  <span className="text-yellow-400">
                    BUMBER
                  </span>
                </h1>

                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-blue-200">
                  Tap • Earn • Grow
                </p>
              </div>

              <button
                type="button"
                onClick={logout}
                disabled={loading}
                className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs font-black transition active:scale-95 disabled:opacity-50"
              >
                {loading
                  ? "..."
                  : "LOGOUT"}
              </button>
            </header>

            <div className="mt-6">
              {activeTab === "home" &&
                renderHome()}

              {activeTab === "earn" &&
                renderEarn()}

              {activeTab === "games" &&
                renderGames()}

              {activeTab === "refer" &&
                renderRefer()}

              {activeTab === "wallet" &&
                renderWallet()}
            </div>

            {message && (
              <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-yellow-400/20 bg-black/95 p-3 text-center text-sm text-yellow-200 shadow-2xl">
                {message}

                <button
                  type="button"
                  onClick={() =>
                    setMessage("")
                  }
                  className="ml-3 font-black text-yellow-400"
                >
                  ✕
                </button>
              </div>
            )}

            <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-white/10 bg-[#030712]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
              <div className="grid grid-cols-5 gap-1">
                {[
                  ["home", "🏠", "Home"],
                  ["earn", "🎯", "Earn"],
                  ["games", "🎮", "Games"],
                  ["refer", "👥", "Refer"],
                  ["wallet", "💰", "Wallet"],
                ].map(
                  ([tab, icon, label]) => (
                    <button
                      type="button"
                      key={tab}
                      onClick={() =>
                        setActiveTab(
                          tab as DashboardTab
                        )
                      }
                      className={`rounded-2xl px-1 py-2 text-center transition active:scale-95 ${
                        activeTab === tab
                          ? "bg-yellow-400 text-black"
                          : "text-slate-400"
                      }`}
                    >
                      <span className="block text-lg">
                        {icon}
                      </span>

                      <span className="mt-1 block text-[10px] font-black">
                        {label}
                      </span>
                    </button>
                  )
                )}
              </div>
            </nav>
          </div>
        </section>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030712] px-5 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-yellow-400" />

          <h1 className="text-2xl font-black">
            TAP
            <span className="text-yellow-400">
              BUMBER
            </span>
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Checking your account...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * IMPORTANT:
   * If a user is logged in, show the dashboard.
   * Otherwise show login/signup/reset.
   * ---------------------------------------------------------
   */

  if (user) {
    return renderDashboard();
  }

  /*
   * ---------------------------------------------------------
   * LOGIN / SIGNUP / RESET
   * ---------------------------------------------------------
   */

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

        <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-6">
          <div className="mb-5 text-center">
            <h1 className="text-3xl font-black tracking-tight">
              TAP
              <span className="text-yellow-400">
                BUMBER
              </span>
            </h1>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-blue-200">
              Tap • Earn • Grow
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/60 p-5 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 text-center">
              <h2 className="text-2xl font-black">
                {authMode === "signup"
                  ? "Create Your Account"
                  : authMode === "login"
                    ? "Welcome Back"
                    : "Reset Password"}
              </h2>

              <p className="mt-2 text-sm text-slate-300">
                {authMode === "signup"
                  ? "Join TapBumber and start your journey."
                  : authMode === "login"
                    ? "Login to continue to your TapBumber account."
                    : "Enter your email to reset your password."}
              </p>
            </div>

            <form
              onSubmit={handleAuth}
              className="space-y-3"
            >
              <div>
                <label className="mb-1.5 block text-sm font-bold">
                  Email address
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder="Enter your email"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400 disabled:opacity-60"
                />
              </div>

              {authMode !== "reset" && (
                <div>
                  <label className="mb-1.5 block text-sm font-bold">
                    Password
                  </label>

                  <div className="relative">
                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value
                        )
                      }
                      placeholder="Enter your password"
                      autoComplete={
                        authMode === "signup"
                          ? "new-password"
                          : "current-password"
                      }
                      disabled={loading}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 pr-20 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400 disabled:opacity-60"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                      disabled={loading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-black text-yellow-400"
                    >
                      {showPassword
                        ? "HIDE"
                        : "SHOW"}
                    </button>
                  </div>
                </div>
              )}

              {authMode === "signup" && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold">
                      Confirm password
                    </label>

                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={
                        confirmPassword
                      }
                      onChange={(e) =>
                        setConfirmPassword(
                          e.target.value
                        )
                      }
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      disabled={loading}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-bold">
                      Referral code
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        Optional
                      </span>
                    </label>

                    <input
                      type="text"
                      value={
                        referralCode
                      }
                      onChange={(e) =>
                        setReferralCode(
                          e.target.value.toUpperCase()
                        )
                      }
                      placeholder="Enter referral code"
                      autoComplete="off"
                      disabled={loading}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-white uppercase outline-none placeholder:text-slate-400 focus:border-yellow-400 disabled:opacity-60"
                    />
                  </div>
                </>
              )}

              {message && (
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-center text-sm leading-5 text-yellow-200">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-4 text-base font-black text-black shadow-[0_0_30px_rgba(250,204,21,0.18)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "PLEASE WAIT..."
                  : authMode === "signup"
                    ? "SIGN UP 🚀"
                    : authMode === "login"
                      ? "LOGIN 🔐"
                      : "SEND RESET LINK 📧"}
              </button>
            </form>

            {authMode === "login" && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("reset");
                    setMessage("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-sm font-black text-yellow-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <div className="mt-4 text-center text-sm text-slate-300">
              {authMode === "signup" ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setMessage("");
                      setPassword("");
                      setConfirmPassword("");
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
                      setAuthMode("signup");
                      setMessage("");
                      setPassword("");
                    }}
                    className="font-black text-yellow-400"
                  >
                    SIGN UP
                  </button>
                </>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] text-slate-500">
            TapBumber • Tap • Earn • Grow
          </p>
        </div>
      </section>
    </main>
  );
}