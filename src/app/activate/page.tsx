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

type ActivationRequest = {
  id: string;
  user_id: string;
  message: string | null;
  status: string | null;
  admin_reply: string | null;
  payment_reference: string | null;
  payment_note: string | null;
  payment_proof_url: string | null;
  payment_submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string | null;
};

const ACTIVE_STATUSES = [
  "pending",
  "submitted",
  "under_review",
  "payment_details_requested",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ActivatePage() {
  const [packageType, setPackageType] =
    useState<PackageType>("standard");

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [message, setMessage] = useState("");

  const [requestingDetails, setRequestingDetails] =
    useState(false);

  const [submittingPayment, setSubmittingPayment] =
    useState(false);

  const [paymentReference, setPaymentReference] =
    useState("");

  const [paymentNote, setPaymentNote] =
    useState("");

  const [paymentScreenshot, setPaymentScreenshot] =
    useState<File | null>(null);

  const [existingRequest, setExistingRequest] =
    useState<ActivationRequest | null>(null);

  const selectedPackage = PACKAGES[packageType];

  useEffect(() => {
    async function loadUser() {
      setLoading(true);

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          console.error("Unable to load user:", error);

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
          setUserName(profile.full_name);
        }

        if (profile?.is_activated) {
          setMessage(
            `Your account is already activated on the ${
              profile.package
                ? String(profile.package).toUpperCase()
                : "SELECTED"
            } package.`
          );
        }

        await loadExistingRequest(user.id);
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

  async function loadExistingRequest(
    userId: string
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from("activation_requests")
        .select(
          "id, user_id, message, status, admin_reply, payment_reference, payment_note, payment_proof_url, payment_submitted_at, rejection_reason, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(
          "Activation request lookup error:",
          error
        );
        return;
      }

      if (!data) {
        setExistingRequest(null);
        return;
      }

      const request =
        data as ActivationRequest;

      setExistingRequest(request);

      const text =
        request.message || "";

      if (/PREMIUM/i.test(text)) {
        setPackageType("premium");
      } else if (/STANDARD/i.test(text)) {
        setPackageType("standard");
      }

      if (request.payment_reference) {
        setPaymentReference(
          request.payment_reference
        );
      }

      if (request.payment_note) {
        setPaymentNote(
          request.payment_note
        );
      }
    } catch (error) {
      console.error(
        "Load existing request error:",
        error
      );
    }
  }

  function hasActiveRequest() {
    return (
      existingRequest !== null &&
      ACTIVE_STATUSES.includes(
        existingRequest.status || ""
      )
    );
  }

  function paymentHasBeenSubmitted() {
    return (
      existingRequest?.status === "submitted" ||
      existingRequest?.status === "under_review"
    );
  }

  async function requestPaymentDetails() {
    if (requestingDetails) return;

    if (hasActiveRequest()) {
      if (existingRequest?.admin_reply) {
        setMessage(
          "✅ Your payment details are already available below."
        );
      } else {
        setMessage(
          "⏳ Your payment-details request is already pending. Please wait for TapBumber Admin to reply."
        );
      }

      return;
    }

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
        if (
          response.status === 500 ||
          result.error?.toLowerCase().includes(
            "duplicate"
          )
        ) {
          await loadExistingRequest(
            session.user.id
          );

          setMessage(
            "⏳ You already have an active payment-details request. Please wait for the admin to reply."
          );

          return;
        }

        setMessage(
          result.error ||
            "Unable to send your payment-details request."
        );

        return;
      }

      setMessage(
        "✅ Request Sent\n\nYour payment-details request has been sent to TapBumber Admin. Please wait for the admin to reply."
      );

      await loadExistingRequest(
        session.user.id
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

  async function submitPayment() {
    if (submittingPayment) return;

    if (!paymentScreenshot) {
      setMessage(
        "⚠️ Please upload your payment screenshot first."
      );

      return;
    }

    if (
      !paymentScreenshot.type.startsWith(
        "image/"
      )
    ) {
      setMessage(
        "⚠️ Please select an image screenshot."
      );

      return;
    }

    if (
      paymentScreenshot.size >
      MAX_FILE_SIZE
    ) {
      setMessage(
        "⚠️ Your screenshot is too large. Please choose an image under 5MB."
      );

      return;
    }

    if (!existingRequest) {
      setMessage(
        "No activation request was found. Please request payment details first."
      );

      return;
    }

    if (!existingRequest.admin_reply?.trim()) {
      setMessage(
        "⚠️ Please wait until TapBumber Admin sends your current payment details."
      );

      return;
    }

    if (
      existingRequest.status !==
      "payment_details_requested"
    ) {
      setMessage(
        "Your payment has already been submitted for review."
      );

      return;
    }

    setSubmittingPayment(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage(
          "Please login again before submitting your payment."
        );

        return;
      }

      const fileExtension =
        paymentScreenshot.name
          .split(".")
          .pop()
          ?.toLowerCase() || "jpg";

      const filePath =
        `${session.user.id}/${existingRequest.id}-${Date.now()}.${fileExtension}`;

      const {
        error: uploadError,
      } = await supabase.storage
        .from("payment-proofs")
        .upload(
          filePath,
          paymentScreenshot,
          {
            cacheControl: "3600",
            upsert: false,
            contentType:
              paymentScreenshot.type,
          }
        );

      if (uploadError) {
        console.error(
          "Payment screenshot upload error:",
          uploadError
        );

        setMessage(
          "Unable to upload your payment screenshot. Please try again."
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
              "submit_payment_proof",

            requestId:
              existingRequest.id,

            paymentProofUrl:
              filePath,

            paymentReference:
              paymentReference.trim() ||
              null,

            paymentNote:
              paymentNote.trim() ||
              null,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        console.error(
          "Payment proof API error:",
          result
        );

        setMessage(
          result.error ||
            "Your payment proof could not be submitted. Please try again."
        );

        return;
      }

      if (result.request) {
        setExistingRequest(
          result.request as ActivationRequest
        );
      } else {
        await loadExistingRequest(
          session.user.id
        );
      }

      setPaymentScreenshot(null);

      setMessage(
        "✅ PAYMENT PROOF SENT\n\nYour payment screenshot has been sent to TapBumber Admin for verification. Your account will remain inactive until your payment is approved."
      );
    } catch (error) {
      console.error(
        "Payment submission error:",
        error
      );

      setMessage(
        "Unable to submit your payment proof. Please try again."
      );
    } finally {
      setSubmittingPayment(false);
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

  const activeRequest =
    hasActiveRequest();

  const hasPaymentDetails =
    !!existingRequest?.admin_reply?.trim();

  const paymentSubmitted =
    paymentHasBeenSubmitted();

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
                    disabled={activeRequest}
                    className={`rounded-2xl border p-4 text-left transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
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

          {/* EXISTING REQUEST */}

          {activeRequest && existingRequest && (
            <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-400/10 p-4">

              <p className="text-sm font-black text-blue-300">
                {paymentSubmitted
                  ? "🔎 PAYMENT SUBMITTED FOR REVIEW"
                  : hasPaymentDetails
                  ? "💳 PAYMENT DETAILS RECEIVED"
                  : "⏳ PAYMENT DETAILS REQUESTED"}
              </p>

              {!hasPaymentDetails && (
                <p className="mt-2 text-sm leading-5 text-slate-300">
                  Your request has been sent to
                  TapBumber Admin. Please wait for
                  the admin to reply here.
                </p>
              )}

              {hasPaymentDetails && (
                <>
                  <p className="mt-2 text-sm leading-5 text-slate-300">
                    TapBumber Admin has sent your
                    payment details. Review them
                    carefully before making your
                    activation payment.
                  </p>

                  {/* PAYMENT DETAILS */}

                  <div className="mt-4 rounded-xl border border-yellow-400/30 bg-black/50 p-4">
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-yellow-400">
                      Payment Details
                    </p>

                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white">
                      {existingRequest.admin_reply}
                    </p>
                  </div>

                  {/* PAYMENT ALREADY SUBMITTED */}

                  {paymentSubmitted && (
                    <div className="mt-4 rounded-xl border border-green-400/30 bg-green-400/10 p-4">

                      <p className="text-sm font-black text-green-300">
                        ✅ PAYMENT PROOF SUBMITTED
                      </p>

                      <p className="mt-2 text-sm leading-5 text-slate-300">
                        Your payment proof has been
                        received and is waiting for
                        admin verification.
                      </p>

                      {existingRequest.payment_reference && (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Payment Reference
                          </p>

                          <p className="mt-1 break-words text-sm font-bold text-white">
                            {existingRequest.payment_reference}
                          </p>
                        </div>
                      )}

                      {existingRequest.payment_note && (
                        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Payment Note
                          </p>

                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
                            {existingRequest.payment_note}
                          </p>
                        </div>
                      )}

                      <p className="mt-3 text-xs leading-5 text-yellow-200">
                        Your account is still inactive.
                        Activation happens only after
                        TapBumber Admin verifies and
                        approves your payment.
                      </p>
                    </div>
                  )}

                  {/* PAYMENT SUBMISSION FORM */}

                  {!paymentSubmitted && (
                    <div className="mt-4 rounded-xl border border-green-400/30 bg-black/40 p-4">

                      <p className="text-sm font-black text-green-300">
                        💳 PAYMENT COMPLETED?
                      </p>

                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Make your payment using the
                        details above, then upload your
                        payment screenshot below.
                      </p>

                      {/* SCREENSHOT */}

                      <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-400">
                        📸 Payment Screenshot
                      </label>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file =
                            event.target.files?.[0] ||
                            null;

                          if (!file) {
                            setPaymentScreenshot(
                              null
                            );
                            return;
                          }

                          if (
                            !file.type.startsWith(
                              "image/"
                            )
                          ) {
                            setMessage(
                              "⚠️ Please choose an image screenshot."
                            );

                            event.target.value = "";
                            setPaymentScreenshot(
                              null
                            );

                            return;
                          }

                          if (
                            file.size >
                            MAX_FILE_SIZE
                          ) {
                            setMessage(
                              "⚠️ Screenshot must be under 5MB."
                            );

                            event.target.value = "";
                            setPaymentScreenshot(
                              null
                            );

                            return;
                          }

                          setMessage("");
                          setPaymentScreenshot(
                            file
                          );
                        }}
                        className="mt-2 block w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-yellow-400 file:px-3 file:py-2 file:text-xs file:font-black file:text-black"
                      />

                      {paymentScreenshot && (
                        <div className="mt-2 rounded-lg border border-green-400/20 bg-green-400/10 p-3">
                          <p className="text-xs font-bold text-green-300">
                            📸{" "}
                            {paymentScreenshot.name}
                          </p>

                          <p className="mt-1 text-[11px] text-slate-400">
                            Screenshot ready to send.
                          </p>
                        </div>
                      )}

                      {/* OPTIONAL REFERENCE */}

                      <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-400">
                        Payment Reference
                        <span className="ml-1 normal-case text-slate-600">
                          (optional)
                        </span>
                      </label>

                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(event) =>
                          setPaymentReference(
                            event.target.value
                          )
                        }
                        placeholder="Transaction/reference ID"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-yellow-400"
                      />

                      {/* OPTIONAL NOTE */}

                      <label className="mt-4 block text-xs font-black uppercase tracking-wider text-slate-400">
                        Note
                        <span className="ml-1 normal-case text-slate-600">
                          (optional)
                        </span>
                      </label>

                      <textarea
                        value={paymentNote}
                        onChange={(event) =>
                          setPaymentNote(
                            event.target.value
                          )
                        }
                        placeholder="Anything the admin should know?"
                        rows={2}
                        className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-yellow-400"
                      />

                      {/* SEND */}

                      <button
                        type="button"
                        onClick={submitPayment}
                        disabled={
                          submittingPayment ||
                          !paymentScreenshot
                        }
                        className="mt-4 w-full rounded-2xl border border-green-400 bg-green-400/15 px-4 py-3.5 font-black text-green-300 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submittingPayment
                          ? "SENDING PAYMENT PROOF..."
                          : "✅ SEND PAYMENT PROOF"}
                      </button>

                      <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                        Your account will not be activated
                        automatically. Admin must verify
                        and approve your payment.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* REQUEST PAYMENT DETAILS */}

          {!activeRequest && (
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
          )}

          {/* MESSAGE */}

          {message && (
            <div className="mt-5 whitespace-pre-line rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-center text-sm leading-5 text-yellow-200">
              {message}
            </div>
          )}

          {/* IMPORTANT NOTICE */}

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs leading-5 text-slate-400">
              Never send payment to an old or
              unconfirmed account. Always use the
              latest payment details provided by
              TapBumber Admin inside the app.
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}