"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type PackageType = "standard" | "premium";

const PACKAGES = {
  standard: {
    name: "STANDARD",
    fee: 3000,
    cycle: 50,
    daily: 600,
  },
  premium: {
    name: "PREMIUM",
    fee: 5000,
    cycle: 120,
    daily: 1440,
  },
};

export default function ActivatePage() {
  const [packageType, setPackageType] =
    useState<PackageType>("standard");

  const [loading, setLoading] =
    useState(true);

  const [userName, setUserName] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [requestingDetails, setRequestingDetails] =
    useState(false);

  const selectedPackage =
    PACKAGES[packageType];

  useEffect(() => {
    async function loadUser() {
      setLoading(true);

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.error(
            "Unable to load user:",
            error
          );

          setMessage(
            "Unable to verify your account. Please login again."
          );

          return;
        }

        if (!user) {
          setMessage(
            "Please login before requesting activation."
          );

          return;
        }

        const metadataName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          "";

        setUserName(metadataName);

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("user_profiles")
          .select(
            "is_activated, package, full_name"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error(
            "Profile lookup error:",
            profileError
          );
        }

        if (profile?.full_name) {
          setUserName(
            profile.full_name
          );
        }

        if (profile?.is_activated) {
          setMessage(
            `Your account is already activated on the ${
              profile.package
                ? String(
                    profile.package
                  ).toUpperCase()
                : "SELECTED"
            } package.`
          );
        }
      } catch (error) {
        console.error(
          "Activation page error:",
          error
        );

        setMessage(
          "Something went wrong. Please try again."
        );
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  async function requestPaymentDetails() {
    if (requestingDetails) return;

    setRequestingDetails(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage(
          "Please login again before requesting payment details."
        );

        return;
      }

      const response = await fetch(
        "/api/admin/activation",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action:
              "request_payment_details",
            packageType,
            userId: session.user.id,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Unable to send your payment-details request."
        );

        return;
      }

      setMessage(
        "✅ Request Sent\n\nYour payment-details request has been sent to TapBumber Admin. Please wait for the admin to reply. You will receive the payment details here in your TapBumber account."
      );
    } catch (error) {
      console.error(
        "Payment details request error:",
        error
      );

      setMessage(
        "Unable to send your request. Please try again."
      );
    } finally {
      setRequestingDetails(false);
    }
  }

  if (loading) {
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

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-6 text-white">
      <div className="mx-auto max-w-md">

        <div className="mb-6 text-center">

          <h1 className="text-3xl font-black">
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

          <p className="text-sm font-black text-yellow-300">
            ACTIVATION
          </p>

          <h2 className="mt-1 text-2xl font-black">
            Choose Your Package
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Select a package and request your
            payment details from TapBumber Admin.
          </p>

          {/* PACKAGE SELECTION */}

          <div className="mt-5 grid grid-cols-2 gap-3">

            {(
              Object.entries(
                PACKAGES
              ) as [
                PackageType,
                (typeof PACKAGES)[PackageType]
              ][]
            ).map(
              ([key, pkg]) => {

                const selected =
                  packageType === key;

                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() =>
                      setPackageType(key)
                    }
                    className={`rounded-2xl border p-4 text-left transition active:scale-95 ${
                      selected
                        ? "border-yellow-400 bg-yellow-400/15"
                        : "border-white/10 bg-white/5"
                    }`}
                  >

                    <p
                      className={`text-xs font-black ${
                        selected
                          ? "text-yellow-400"
                          : "text-slate-400"
                      }`}
                    >
                      {pkg.name}
                    </p>

                    <p className="mt-2 text-2xl font-black">
                      ₦
                      {pkg.fee.toLocaleString()}
                    </p>

                    <p className="mt-2 text-xs text-slate-400">
                      ₦{pkg.cycle} per cycle
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Up to ₦
                      {pkg.daily.toLocaleString()}
                      /day
                    </p>

                  </button>
                );
              }
            )}

          </div>

          {/* SELECTED PACKAGE */}

          <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">

            <div className="flex items-center justify-between">

              <span className="text-sm text-slate-300">
                Selected package
              </span>

              <span className="font-black text-yellow-400">
                {selectedPackage.name}
              </span>

            </div>

            <div className="mt-3 flex items-center justify-between">

              <span className="text-sm text-slate-300">
                Activation fee
              </span>

              <span className="font-black">
                ₦
                {selectedPackage.fee.toLocaleString()}
              </span>

            </div>

          </div>

          {/* REQUEST PAYMENT DETAILS */}

          <div className="mt-5 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">

            <div className="flex items-start gap-3">

              <div className="text-2xl">
                💳
              </div>

              <div>

                <h3 className="font-black text-yellow-300">
                  Need payment details?
                </h3>

                <p className="mt-1 text-sm leading-5 text-slate-300">
                  Request the current payment account
                  details directly from TapBumber Admin
                  before making your activation payment.
                </p>

              </div>

            </div>

            <button
              type="button"
              onClick={
                requestPaymentDetails
              }
              disabled={
                requestingDetails
              }
              className="mt-4 w-full rounded-2xl border border-yellow-400 bg-yellow-400/15 px-4 py-3.5 font-black text-yellow-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requestingDetails
                ? "SENDING REQUEST..."
                : "📩 REQUEST PAYMENT DETAILS"}
            </button>

            <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
              Your request will be sent directly
              to TapBumber Admin inside the app.
            </p>

          </div>

          {/* REQUEST STATUS / ADMIN MESSAGE */}

          {message && (
            <div className="mt-5 whitespace-pre-line rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-center text-sm leading-5 text-yellow-200">
              {message}
            </div>
          )}

          {/* IMPORTANT NOTICE */}

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">

            <p className="text-xs leading-5 text-slate-400">
              After requesting payment details,
              wait for TapBumber Admin to reply
              inside your account. Do not make
              your activation payment until you
              receive the current payment details.
            </p>

          </div>

        </div>
      </div>
    </main>
  );
}