"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type AuthMode = "signup" | "login" | "reset";
type DashboardTab =
  | "home"
  | "earn"
  | "games"
  | "refer"
  | "wallet";

type Activity = {
  id: string;
  icon: string;
  title: string;
  description: string;
  reward: string;
};

type EarnStatus =
  | "earning"
  | "claim"
  | "expired"
  | "complete"
  | "inactive";

type EarnState = {
  isActivated: boolean;
  package: string | null;
  amount: number;
  dailyMaximum: number;
  completedCycles: number;
  maxCycles: number;
  cycleIndex: number;
  cycleStartMs: number | null;
  cycleEndMs: number | null;
  claimDeadlineMs: number | null;
  nowMs: number;
  status: EarnStatus;
  canClaim: boolean;
  balance: number;
  totalEarned: number;
};

export default function Home() {
  const [authMode, setAuthMode] =
    useState<AuthMode>("login");

  const [user, setUser] =
    useState<User | null>(null);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [referralCode, setReferralCode] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [activeTab, setActiveTab] =
    useState<DashboardTab>("home");

  const [copied, setCopied] =
    useState(false);

  const [showActivities, setShowActivities] =
    useState(false);

  const [earnState, setEarnState] =
    useState<EarnState | null>(null);

  const [earnLoading, setEarnLoading] =
    useState(false);

  const [claimLoading, setClaimLoading] =
    useState(false);

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
          console.error(
            "Session error:",
            error
          );

          setUser(null);
        } else {
          setUser(
            data.session?.user ?? null
          );
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

        setUser(
          session?.user ?? null
        );

        if (event === "SIGNED_IN") {
          setActiveTab("home");
          setMessage("");
        }

        if (event === "SIGNED_OUT") {
          setActiveTab("home");
          setShowActivities(false);
          setEarnState(null);
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
   * DAILY TAP - LOAD SERVER STATE
   * ---------------------------------------------------------
   */

  async function loadEarnState() {
    if (!user) return;

    setEarnLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setEarnState(null);
        return;
      }

      const response = await fetch(
        "/api/earn/claim",
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        console.error(
          "Earn state error:",
          result
        );

        setMessage(
          result.error ||
            "Unable to load Daily Tap."
        );

        return;
      }

      setEarnState(result);
    } catch (error) {
      console.error(
        "Load earn state error:",
        error
      );

      setMessage(
        "Unable to load Daily Tap right now."
      );
    } finally {
      setEarnLoading(false);
    }
  }

  /*
   * Load Daily Tap whenever user enters Earn.
   */

  useEffect(() => {
    if (!user) {
      setEarnState(null);
      return;
    }

    if (activeTab === "earn") {
      loadEarnState();
    }
  }, [user, activeTab]);

  /*
   * ---------------------------------------------------------
   * LIVE COUNTDOWN
   * ---------------------------------------------------------
   *
   * This only updates the visible clock.
   * The server remains the source of truth.
   */

  useEffect(() => {
    if (
      !earnState ||
      !user ||
      activeTab !== "earn"
    ) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setEarnState((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            nowMs: Date.now(),
          };
        });
      }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    user,
    activeTab,
    earnState?.status,
    earnState?.cycleEndMs,
    earnState?.claimDeadlineMs,
  ]);

  /*
   * ---------------------------------------------------------
   * AUTOMATIC CYCLE BOUNDARY REFRESH
   * ---------------------------------------------------------
   *
   * Instead of calling the server every second, we schedule
   * one refresh when the current important boundary arrives.
   *
   * EARNING:
   *     2 hours -> refresh -> CLAIM
   *
   * CLAIM:
   *     20 minutes -> refresh -> next server state
   */

  useEffect(() => {
    if (
      !earnState ||
      !user ||
      activeTab !== "earn"
    ) {
      return;
    }

    let targetTime: number | null = null;

    if (
      earnState.status === "earning" &&
      earnState.cycleEndMs
    ) {
      targetTime =
        earnState.cycleEndMs;
    }

    if (
      earnState.status === "claim" &&
      earnState.claimDeadlineMs
    ) {
      targetTime =
        earnState.claimDeadlineMs;
    }

    if (!targetTime) {
      return;
    }

    const now = Date.now();

    const delay = Math.max(
      100,
      targetTime - now + 100
    );

    const timer =
      window.setTimeout(() => {
        loadEarnState();
      }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    user,
    activeTab,
    earnState?.status,
    earnState?.cycleEndMs,
    earnState?.claimDeadlineMs,
  ]);

  /*
   * ---------------------------------------------------------
   * DAILY TAP - CLAIM
   * ---------------------------------------------------------
   */

  async function claimDailyTap() {
    if (!user || claimLoading) {
      return;
    }

    setClaimLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage(
          "Your session has expired. Please log in again."
        );

        return;
      }

      const response = await fetch(
        "/api/earn/claim",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Unable to claim this cycle."
        );

        await loadEarnState();

        return;
      }

      setMessage(
        `₦${Number(
          result.amount || 0
        ).toLocaleString()} claimed successfully! 🎉`
      );

      await loadEarnState();
    } catch (error) {
      console.error(
        "Claim Daily Tap error:",
        error
      );

      setMessage(
        "Something went wrong while claiming."
      );
    } finally {
      setClaimLoading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * TIMER FORMAT
   * ---------------------------------------------------------
   */

  function formatCountdown(
    milliseconds: number
  ) {
    const safe =
      Math.max(
        0,
        milliseconds
      );

    const totalSeconds =
      Math.floor(
        safe / 1000
      );

    const hours =
      Math.floor(
        totalSeconds / 3600
      );

    const minutes =
      Math.floor(
        (totalSeconds % 3600) /
          60
      );

    const seconds =
      totalSeconds % 60;

    return [
      String(hours).padStart(
        2,
        "0"
      ),
      String(minutes).padStart(
        2,
        "0"
      ),
      String(seconds).padStart(
        2,
        "0"
      ),
    ].join(":");
  }

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
        } =
          await supabase.auth.signUp({
            email: cleanEmail,
            password,
          });

        if (error) {
          setMessage(
            error.message
          );

          return;
        }

        if (
          referralCode.trim()
        ) {
          localStorage.setItem(
            "tapbumber_pending_referral",
            referralCode
              .trim()
              .toUpperCase()
          );
        }

        if (data.session?.user) {
          setUser(
            data.session.user
          );

          setActiveTab("home");

          setPassword("");
          setConfirmPassword("");
          setReferralCode("");

          setMessage(
            "Account created successfully! 🎉"
          );

          return;
        }

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
          setMessage(
            error.message
          );

          return;
        }

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

        setUser(
          loggedInUser
        );

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
        typeof window !==
        "undefined"
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
        setMessage(
          error.message
        );

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
    if (loading) {
      return;
    }

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

        setMessage(
          error.message
        );

        return;
      }

      setUser(null);
      setEarnState(null);
      setActiveTab("home");
      setShowActivities(false);

      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setReferralCode("");

      setCopied(false);
      setAuthMode("login");

      if (
        typeof window !==
        "undefined"
      ) {
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
    if (!user) {
      return;
    }

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
    const balance =
      earnState?.balance ?? 0;

    const totalEarned =
      earnState?.totalEarned ?? 0;

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
              ₦
              {balance.toLocaleString(
                "en-NG",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
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
                ₦
                {totalEarned.toLocaleString(
                  "en-NG",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
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
   * DAILY TAP
   * ---------------------------------------------------------
   */

  function renderDailyTapCard() {
    if (earnLoading) {
      return (
        <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <p className="text-center text-sm font-bold text-yellow-200">
            Checking your earning cycle...
          </p>
        </div>
      );
    }

    if (!earnState) {
      return (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
          <p className="text-center text-sm text-red-200">
            Unable to load your earning cycle.
          </p>

          <button
            type="button"
            onClick={loadEarnState}
            className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 text-xs font-black text-black"
          >
            TRY AGAIN
          </button>
        </div>
      );
    }

    if (
      !earnState.isActivated ||
      earnState.status === "inactive"
    ) {
      return (
        <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4">
          <p className="font-black text-orange-200">
            Account activation required
          </p>

          <p className="mt-1 text-xs leading-5 text-orange-100/70">
            Activate your TapBumber account before starting Daily Tap.
          </p>
        </div>
      );
    }

    if (
      earnState.status ===
      "complete"
    ) {
      return (
        <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 p-5">
          <p className="text-center text-2xl">
            🎉
          </p>

          <p className="mt-2 text-center font-black text-green-300">
            All 12 cycles completed!
          </p>

          <p className="mt-1 text-center text-xs text-green-100/70">
            Come back after the next 5 PM WAT earning period.
          </p>
        </div>
      );
    }

    const now =
      earnState.nowMs;

    const cycleEnd =
      earnState.cycleEndMs ??
      now;

    const claimDeadline =
      earnState.claimDeadlineMs ??
      now;

    const remainingToEnd =
      Math.max(
        0,
        cycleEnd - now
      );

    const remainingClaim =
      Math.max(
        0,
        claimDeadline - now
      );

    if (
      earnState.status ===
      "earning"
    ) {
      const cycleDuration =
        2 *
        60 *
        60 *
        1000;

      const progress =
        Math.max(
          0,
          Math.min(
            100,
            100 -
              (remainingToEnd /
                cycleDuration) *
                100
          )
        );

      return (
        <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-5">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-blue-200">
              CYCLE{" "}
              {earnState.cycleIndex}{" "}
              OF{" "}
              {earnState.maxCycles}
            </p>

            <p className="mt-3 text-xs text-slate-400">
              Earning in progress
            </p>

            <p className="mt-2 font-mono text-4xl font-black text-white">
              {formatCountdown(
                remainingToEnd
              )}
            </p>

            <p className="mt-2 text-xs text-slate-400">
              Time remaining until you can claim
            </p>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-blue-400 transition-all"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="mt-4 rounded-xl bg-black/30 p-3 text-center">
            <p className="text-xs text-slate-400">
              Your reward
            </p>

            <p className="mt-1 text-xl font-black text-yellow-400">
              ₦
              {earnState.amount.toLocaleString()}
            </p>
          </div>
        </div>
      );
    }

    if (
      earnState.status ===
      "claim"
    ) {
      return (
        <div className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-5">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-yellow-300">
              CYCLE{" "}
              {earnState.cycleIndex}{" "}
              READY
            </p>

            <p className="mt-2 text-3xl font-black text-yellow-400">
              ₦
              {earnState.amount.toLocaleString()}
            </p>

            <p className="mt-2 text-xs text-slate-300">
              Claim window remaining
            </p>

            <p className="mt-1 font-mono text-3xl font-black text-white">
              {formatCountdown(
                remainingClaim
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={
              claimDailyTap
            }
            disabled={
              claimLoading ||
              !earnState.canClaim
            }
            className="mt-5 w-full rounded-2xl bg-yellow-400 px-4 py-4 font-black text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {claimLoading
              ? "CLAIMING..."
              : `CLAIM ₦${earnState.amount}`}
          </button>

          <p className="mt-3 text-center text-[11px] text-slate-400">
            You have 20 minutes to claim this cycle.
          </p>
        </div>
      );
    }

    if (
      earnState.status ===
      "expired"
    ) {
      return (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
          <p className="text-center text-2xl">
            ⏰
          </p>

          <p className="mt-2 text-center font-black text-red-300">
            Claim window expired
          </p>

          <p className="mt-2 text-center text-xs leading-5 text-red-100/70">
            The 20-minute claim window for this cycle has passed.
          </p>

          <button
            type="button"
            onClick={
              loadEarnState
            }
            className="mt-4 w-full rounded-xl border border-red-400/20 bg-black/30 px-4 py-3 text-xs font-black text-red-200"
          >
            REFRESH CYCLE
          </button>
        </div>
      );
    }

    return null;
  }

  /*
   * ---------------------------------------------------------
   * EARN
   * ---------------------------------------------------------
   */

  function renderEarn() {
    const activities: Activity[] =
      [
        {
          id: "daily-tap",
          icon: "👆",
          title: "Daily Tap",
          description:
            "Complete your 2-hour earning cycle and claim your reward.",
          reward:
            earnState?.amount
              ? `₦${earnState.amount}`
              : "ACTIVITY",
        },
        {
          id: "daily-check",
          icon: "✅",
          title: "Daily Check-In",
          description:
            "Check in once each day.",
          reward: "DAILY",
        },
        {
          id: "community",
          icon: "💬",
          title: "Community Activity",
          description:
            "Visit the TapBumber community.",
          reward: "COMMUNITY",
        },
      ];

    function getTodayKey() {
      const now =
        new Date();

      const year =
        now.getFullYear();

      const month =
        String(
          now.getMonth() + 1
        ).padStart(
          2,
          "0"
        );

      const day =
        String(
          now.getDate()
        ).padStart(
          2,
          "0"
        );

      return `${year}-${month}-${day}`;
    }

    function hasCheckedInToday() {
      if (!user) {
        return false;
      }

      const saved =
        localStorage.getItem(
          `tapbumber_daily_checkin_${user.id}`
        );

      return (
        saved ===
        getTodayKey()
      );
    }

    function completeDailyCheckIn() {
      if (!user) {
        return;
      }

      const today =
        getTodayKey();

      const saved =
        localStorage.getItem(
          `tapbumber_daily_checkin_${user.id}`
        );

      if (saved === today) {
        setMessage(
          "You have already checked in today. Come back tomorrow! ✅"
        );

        return;
      }

      localStorage.setItem(
        `tapbumber_daily_checkin_${user.id}`,
        today
      );

      setMessage(
        "Daily Check-In completed successfully! ✅"
      );
    }

    function openActivity(
      activity: Activity
    ) {
      if (
        activity.id ===
        "community"
      ) {
        window.open(
          "https://chat.whatsapp.com/FU2IG0W8kt3CKRrOAFql0d",
          "_blank",
          "noopener,noreferrer"
        );

        return;
      }

      if (
        activity.id ===
        "daily-tap"
      ) {
        setMessage("");

        return;
      }

      if (
        activity.id ===
        "daily-check"
      ) {
        completeDailyCheckIn();

        return;
      }
    }

    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
          <p className="text-sm text-yellow-300">
            EARNING
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Earn on TapBumber
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Complete available activities and participate in TapBumber to earn.
          </p>

          <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black">
                  Daily Activities
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Available activities for today
                </p>
              </div>

              <span className="rounded-xl bg-yellow-400 px-3 py-1 text-xs font-black text-black">
                {
                  activities.length
                }
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowActivities(
                  !showActivities
                )
              }
              className="mt-4 w-full rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black active:scale-95"
            >
              {showActivities
                ? "HIDE ACTIVITIES"
                : "VIEW ACTIVITIES"}
            </button>
          </div>
        </div>

        {showActivities && (
          <div className="space-y-3">
            {activities.map(
              (activity) => {
                const checkedIn =
                  activity.id ===
                    "daily-check" &&
                  hasCheckedInToday();

                return (
                  <div
                    key={
                      activity.id
                    }
                    className="rounded-3xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-yellow-400/10 text-2xl">
                        {
                          activity.icon
                        }
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-black">
                              {
                                activity.title
                              }
                            </h3>

                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {
                                activity.description
                              }
                            </p>
                          </div>

                          <span className="shrink-0 text-xs font-black text-yellow-400">
                            {checkedIn
                              ? "DONE"
                              : activity.reward}
                          </span>
                        </div>

                        {activity.id ===
                        "daily-tap" ? (
                          <>
                            {
                              renderDailyTapCard()
                            }

                            <button
                              type="button"
                              onClick={
                                loadEarnState
                              }
                              className="mt-3 text-xs font-bold text-slate-500 underline"
                            >
                              REFRESH CYCLE
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              openActivity(
                                activity
                              )
                            }
                            disabled={
                              checkedIn
                            }
                            className="mt-3 rounded-xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {checkedIn
                              ? "CHECKED IN ✅"
                              : "OPEN ACTIVITY"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
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
          Games will be connected and tested in the next step.
        </p>

        <div className="mt-5 space-y-3">
          {[
            [
              "🎯",
              "Tap Challenge",
            ],
            [
              "🧠",
              "Quick Quiz",
            ],
            [
              "🔢",
              "Number Challenge",
            ],
          ].map(
            ([icon, name]) => (
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
            )
          )}
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
      typeof window !==
      "undefined"
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
          Share your referral link with people you genuinely want to invite to TapBumber.
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
          onClick={
            copyReferralLink
          }
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
    const balance =
      earnState?.balance ?? 0;

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
            ₦
            {balance.toLocaleString(
              "en-NG",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/55 p-5 backdrop-blur-xl">
          <h3 className="text-lg font-black">
            Withdraw
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Your withdrawal account and eligibility will be connected here.
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
              {activeTab ===
                "home" &&
                renderHome()}

              {activeTab ===
                "earn" &&
                renderEarn()}

              {activeTab ===
                "games" &&
                renderGames()}

              {activeTab ===
                "refer" &&
                renderRefer()}

              {activeTab ===
                "wallet" &&
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
                  [
                    "home",
                    "🏠",
                    "Home",
                  ],
                  [
                    "earn",
                    "🎯",
                    "Earn",
                  ],
                  [
                    "games",
                    "🎮",
                    "Games",
                  ],
                  [
                    "refer",
                    "👥",
                    "Refer",
                  ],
                  [
                    "wallet",
                    "💰",
                    "Wallet",
                  ],
                ].map(
                  ([
                    tab,
                    icon,
                    label,
                  ]) => (
                    <button
                      type="button"
                      key={tab}
                      onClick={() =>
                        setActiveTab(
                          tab as DashboardTab
                        )
                      }
                      className={`rounded-2xl px-1 py-2 text-center transition active:scale-95 ${
                        activeTab ===
                        tab
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

  if (
    loading &&
    !user
  ) {
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
                {authMode ===
                "signup"
                  ? "Create Your Account"
                  : authMode ===
                      "login"
                    ? "Welcome Back"
                    : "Reset Password"}
              </h2>

              <p className="mt-2 text-sm text-slate-300">
                {authMode ===
                "signup"
                  ? "Join TapBumber and start your journey."
                  : authMode ===
                      "login"
                    ? "Login to continue to your TapBumber account."
                    : "Enter your email to reset your password."}
              </p>
            </div>

            <form
              onSubmit={
                handleAuth
              }
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

              {authMode !==
                "reset" && (
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
                      value={
                        password
                      }
                      onChange={(e) =>
                        setPassword(
                          e.target
                            .value
                        )
                      }
                      placeholder="Enter your password"
                      autoComplete={
                        authMode ===
                        "signup"
                          ? "new-password"
                          : "current-password"
                      }
                      disabled={
                        loading
                      }
                      className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 pr-20 text-white outline-none placeholder:text-slate-400 focus:border-yellow-400 disabled:opacity-60"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                      disabled={
                        loading
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-black text-yellow-400"
                    >
                      {showPassword
                        ? "HIDE"
                        : "SHOW"}
                    </button>
                  </div>
                </div>
              )}

              {authMode ===
                "signup" && (
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
                          e.target
                            .value
                        )
                      }
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      disabled={
                        loading
                      }
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
                      disabled={
                        loading
                      }
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
                disabled={
                  loading
                }
                className="w-full rounded-2xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-4 text-base font-black text-black shadow-[0_0_30px_rgba(250,204,21,0.18)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "PLEASE WAIT..."
                  : authMode ===
                      "signup"
                    ? "SIGN UP 🚀"
                    : authMode ===
                        "login"
                      ? "LOGIN 🔐"
                      : "SEND RESET LINK 📧"}
              </button>
            </form>

            {authMode ===
              "login" && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(
                      "reset"
                    );
                    setMessage(
                      ""
                    );
                    setPassword(
                      ""
                    );
                    setConfirmPassword(
                      ""
                    );
                  }}
                  className="text-sm font-black text-yellow-400"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <div className="mt-4 text-center text-sm text-slate-300">
              {authMode ===
              "signup" ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(
                        "login"
                      );
                      setMessage(
                        ""
                      );
                      setPassword(
                        ""
                      );
                      setConfirmPassword(
                        ""
                      );
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
                      setAuthMode(
                        "signup"
                      );
                      setMessage(
                        ""
                      );
                      setPassword(
                        ""
                      );
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