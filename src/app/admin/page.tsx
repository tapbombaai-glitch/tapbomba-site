"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ActivationRequest = {
  id: string;
  user_id: string;
  message: string | null;
  status: string | null;
  payment_reference: string | null;
  payment_note: string | null;
  payment_proof_url: string | null;
  payment_submitted_at: string | null;
  rejection_reason: string | null;
  admin_reply: string | null;
  created_at: string | null;
  updated_at?: string | null;
  user_email?: string | null;
  full_name?: string | null;
};

const ADMIN_EMAIL = "tapbomba.ai@gmail.com";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
  const [message, setMessage] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [paymentDetails, setPaymentDetails] = useState<
    Record<string, string>
  >({});

  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});

  const [proofUrls, setProofUrls] = useState<
    Record<string, string>
  >({});

  const [loadingProofId, setLoadingProofId] = useState<string | null>(
    null
  );

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAdmin(false);
        setMessage("Please log in first.");
        return;
      }

      if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        setAdmin(false);
        setMessage("Access denied. Admin account only.");
        return;
      }

      setAdmin(true);
      await loadRequests();
    } catch (error) {
      console.error(error);
      setMessage("Unable to load admin panel.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Admin session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Admin request error:", result);

        setMessage(
          result.error || "Unable to load activation requests."
        );

        return;
      }

      setRequests(result.requests || []);
    } catch (error) {
      console.error("Load requests error:", error);
      setMessage("Unable to load activation requests.");
    }
  }

  function detectPackage(request: ActivationRequest) {
    const text = request.message || "";

    if (/STANDARD/i.test(text)) {
      return "STANDARD";
    }

    if (/PREMIUM/i.test(text)) {
      return "PREMIUM";
    }

    return "UNKNOWN";
  }

  function updatePaymentDetails(
    requestId: string,
    value: string
  ) {
    setPaymentDetails((current) => ({
      ...current,
      [requestId]: value,
    }));
  }

  function updateRejectionReason(
    requestId: string,
    value: string
  ) {
    setRejectionReasons((current) => ({
      ...current,
      [requestId]: value,
    }));
  }

  async function sendPaymentDetails(
    request: ActivationRequest
  ) {
    const reply =
      paymentDetails[request.id]?.trim() || "";

    if (!reply) {
      setMessage(
        "Please enter the payment account details before sending."
      );
      return;
    }

    setProcessingId(request.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Admin session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "reply_payment_details",
          requestId: request.id,
          reply,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error || "Unable to send payment details."
        );
        return;
      }

      setMessage(
        "Payment details sent to the user successfully. ✅"
      );

      setPaymentDetails((current) => ({
        ...current,
        [request.id]: "",
      }));

      await loadRequests();
    } catch (error) {
      console.error(error);

      setMessage(
        "Something went wrong while sending payment details."
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function openPaymentProof(
    request: ActivationRequest
  ) {
    if (!request.payment_proof_url) {
      setMessage("No payment screenshot was uploaded.");
      return;
    }

    setLoadingProofId(request.id);
    setMessage("");

    try {
      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(request.payment_proof_url, 300);

      if (error || !data?.signedUrl) {
        console.error("Payment proof error:", error);

        setMessage(
          "Unable to open the payment screenshot. Check the private storage policy."
        );

        return;
      }

      setProofUrls((current) => ({
        ...current,
        [request.id]: data.signedUrl,
      }));
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to open the payment screenshot."
      );
    } finally {
      setLoadingProofId(null);
    }
  }

  async function approvePayment(
    request: ActivationRequest
  ) {
    if (!request.payment_proof_url) {
      setMessage(
        "This payment has no screenshot proof. Do not approve it."
      );
      return;
    }

    const packageName = detectPackage(request);

    if (packageName === "UNKNOWN") {
      setMessage(
        "Could not detect the requested package. Do not approve this request."
      );
      return;
    }

    const confirmed = window.confirm(
      `Approve this payment?\n\nPackage: ${packageName}\n\nThis will activate the user's TapBumber account.`
    );

    if (!confirmed) {
      return;
    }

    setProcessingId(request.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Admin session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "approve_payment",
          requestId: request.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error || "Payment approval failed."
        );
        return;
      }

      setMessage(
        "Payment approved. User account activated successfully. ✅"
      );

      await loadRequests();
    } catch (error) {
      console.error(error);

      setMessage(
        "Something went wrong while approving the payment."
      );
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectPayment(
    request: ActivationRequest
  ) {
    const reason =
      rejectionReasons[request.id]?.trim() || "";

    const confirmed = window.confirm(
      "Reject this payment proof?\n\nThe user's account will NOT be activated."
    );

    if (!confirmed) {
      return;
    }

    setProcessingId(request.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Admin session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "reject_payment",
          requestId: request.id,
          rejectionReason:
            reason || "Payment proof could not be verified.",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error || "Payment rejection failed."
        );
        return;
      }

      setMessage(
        "Payment rejected. The user account remains inactive."
      );

      setRejectionReasons((current) => ({
        ...current,
        [request.id]: "",
      }));

      await loadRequests();
    } catch (error) {
      console.error(error);

      setMessage(
        "Something went wrong while rejecting the payment."
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-center text-gray-300">
            Loading admin panel...
          </p>
        </div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-center">
            <h1 className="text-2xl font-bold text-red-400">
              Access Denied
            </h1>

            <p className="mt-3 text-gray-300">
              {message || "Admin account only."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">

        {/* HEADER */}
        <div className="mb-6">
          <p className="text-sm font-bold tracking-widest text-yellow-400">
            TAPBUMBER ADMIN
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Activation Requests
          </h1>

          <p className="mt-2 text-sm text-gray-400">
            Review payment requests and activate approved users.
          </p>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-300">
            {message}
          </div>
        )}

        {/* REQUESTS */}
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="text-gray-300">
              No pending activation requests.
            </p>
          </div>
        ) : (
          <div className="space-y-4">

            {requests.map((request) => {
              const packageName = detectPackage(request);

              const isPaymentDetailsRequest =
                request.status ===
                "payment_details_requested";

              const isSubmitted =
                request.status === "submitted" ||
                request.status === "under_review";

              const isProcessing =
                processingId === request.id;

              return (
                <div
                  key={request.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >

                  {/* REQUEST HEADER */}
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">
                      {packageName} PACKAGE
                    </h2>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        request.status === "submitted"
                          ? "bg-green-400/10 text-green-400"
                          : request.status ===
                              "approved"
                            ? "bg-blue-400/10 text-blue-400"
                            : request.status ===
                                "rejected"
                              ? "bg-red-400/10 text-red-400"
                              : "bg-yellow-400/10 text-yellow-400"
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>

                  {/* USER INFORMATION */}
                  <div className="mt-4 space-y-2 text-sm">

                    <p>
                      <span className="text-gray-400">
                        User ID:
                      </span>{" "}
                      <span className="break-all text-gray-200">
                        {request.user_id}
                      </span>
                    </p>

                    {request.user_email && (
                      <p>
                        <span className="text-gray-400">
                          Email:
                        </span>{" "}
                        <span className="text-white">
                          {request.user_email}
                        </span>
                      </p>
                    )}

                    {request.full_name && (
                      <p>
                        <span className="text-gray-400">
                          Name:
                        </span>{" "}
                        <span className="text-white">
                          {request.full_name}
                        </span>
                      </p>
                    )}

                    <p>
                      <span className="text-gray-400">
                        Payment Reference:
                      </span>{" "}
                      <span className="text-white">
                        {request.payment_reference ||
                          "Not provided"}
                      </span>
                    </p>

                    {request.payment_note && (
                      <p>
                        <span className="text-gray-400">
                          Payment Note:
                        </span>{" "}
                        <span className="text-white">
                          {request.payment_note}
                        </span>
                      </p>
                    )}

                    <p>
                      <span className="text-gray-400">
                        Submitted:
                      </span>{" "}
                      <span className="text-white">
                        {request.payment_submitted_at
                          ? new Date(
                              request.payment_submitted_at
                            ).toLocaleString()
                          : request.created_at
                            ? new Date(
                                request.created_at
                              ).toLocaleString()
                            : "Unknown"}
                      </span>
                    </p>
                  </div>

                  {/* ORIGINAL MESSAGE */}
                  <div className="mt-4 rounded-xl bg-black/40 p-3 text-sm text-gray-300">
                    {request.message ||
                      "No message provided."}
                  </div>

                  {/* PAYMENT DETAILS REQUEST */}
                  {isPaymentDetailsRequest && (
                    <div className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-4">

                      <p className="text-sm font-bold text-yellow-400">
                        💳 SEND PAYMENT DETAILS
                      </p>

                      <p className="mt-2 text-sm text-gray-400">
                        Enter the current payment account details
                        the user should use for this activation.
                      </p>

                      {request.admin_reply && (
                        <div className="mt-3 rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-sm text-green-300">

                          <p className="font-bold">
                            Previously sent:
                          </p>

                          <p className="mt-1 whitespace-pre-wrap">
                            {request.admin_reply}
                          </p>

                        </div>
                      )}

                      <textarea
                        value={
                          paymentDetails[request.id] || ""
                        }
                        onChange={(event) =>
                          updatePaymentDetails(
                            request.id,
                            event.target.value
                          )
                        }
                        placeholder={
                          "Example:\nBank: XXX Bank\nAccount Name: TapBumber\nAccount Number: XXXXXXXX\n\nSend only the current payment details."
                        }
                        rows={6}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-yellow-400"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          sendPaymentDetails(request)
                        }
                        disabled={isProcessing}
                        className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing
                          ? "SENDING..."
                          : "SEND PAYMENT DETAILS"}
                      </button>

                    </div>
                  )}

                  {/* PAYMENT SUBMITTED */}
                  {isSubmitted && (
                    <div className="mt-5 space-y-4">

                      {/* PAYMENT PROOF */}
                      <div className="rounded-2xl border border-green-400/20 bg-green-400/5 p-4">

                        <p className="text-sm font-bold text-green-400">
                          📸 PAYMENT PROOF
                        </p>

                        {request.payment_proof_url ? (
                          <>
                            <p className="mt-2 text-sm text-gray-400">
                              The user has uploaded a payment
                              screenshot.
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                openPaymentProof(request)
                              }
                              disabled={
                                loadingProofId ===
                                request.id
                              }
                              className="mt-3 w-full rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 font-bold text-green-300 disabled:opacity-50"
                            >
                              {loadingProofId ===
                              request.id
                                ? "OPENING..."
                                : proofUrls[
                                      request.id
                                    ]
                                  ? "REFRESH PAYMENT SCREENSHOT"
                                  : "VIEW PAYMENT SCREENSHOT"}
                            </button>

                            {proofUrls[
                              request.id
                            ] && (
                              <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">

                                <img
                                  src={
                                    proofUrls[
                                      request.id
                                    ]
                                  }
                                  alt="Payment proof"
                                  className="max-h-[600px] w-full object-contain"
                                />

                              </div>
                            )}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-red-300">
                            No payment screenshot found.
                          </p>
                        )}

                      </div>

                      {/* REJECTION REASON */}
                      <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4">

                        <p className="text-sm font-bold text-red-400">
                          ❌ REJECTION REASON
                        </p>

                        <p className="mt-2 text-sm text-gray-400">
                          Optional. Add a reason if the payment
                          cannot be verified.
                        </p>

                        <textarea
                          value={
                            rejectionReasons[
                              request.id
                            ] || ""
                          }
                          onChange={(event) =>
                            updateRejectionReason(
                              request.id,
                              event.target.value
                            )
                          }
                          placeholder="Example: Payment screenshot could not be verified."
                          rows={3}
                          className="mt-3 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-400"
                        />

                      </div>

                      {/* APPROVE */}
                      <button
                        type="button"
                        onClick={() =>
                          approvePayment(request)
                        }
                        disabled={
                          isProcessing ||
                          !request.payment_proof_url
                        }
                        className="w-full rounded-xl bg-green-500 px-4 py-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing
                          ? "PROCESSING..."
                          : "✅ APPROVE PAYMENT"}
                      </button>

                      {/* REJECT */}
                      <button
                        type="button"
                        onClick={() =>
                          rejectPayment(request)
                        }
                        disabled={isProcessing}
                        className="w-full rounded-xl border border-red-500 bg-red-500/10 px-4 py-4 font-bold text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessing
                          ? "PROCESSING..."
                          : "❌ REJECT PAYMENT"}
                      </button>

                    </div>
                  )}

                  {/* APPROVED */}
                  {request.status === "approved" && (
                    <div className="mt-5 rounded-xl border border-green-400/20 bg-green-400/5 p-4 text-center">
                      <p className="font-bold text-green-400">
                        ✅ PAYMENT APPROVED
                      </p>

                      <p className="mt-1 text-sm text-gray-400">
                        This user's account has been activated.
                      </p>
                    </div>
                  )}

                  {/* REJECTED */}
                  {request.status === "rejected" && (
                    <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 p-4">

                      <p className="font-bold text-red-400">
                        ❌ PAYMENT REJECTED
                      </p>

                      {request.rejection_reason && (
                        <p className="mt-2 text-sm text-gray-300">
                          Reason:{" "}
                          {request.rejection_reason}
                        </p>
                      )}

                    </div>
                  )}

                </div>
              );
            })}

          </div>
        )}
      </div>
    </main>
  );
}