"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "tapbomba.ai@gmail.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [rejectText, setRejectText] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");

  async function loadRequests() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Please log in as the Admin first.");
        setLoading(false);
        return;
      }

      if (
        session.user.email?.toLowerCase() !==
        ADMIN_EMAIL.toLowerCase()
      ) {
        setError("Access denied. Admin account only.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Unable to load admin requests.");
        setLoading(false);
        return;
      }

      setRequests(data?.requests || []);
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the Admin system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadRequests();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function adminAction(
    action: string,
    request: ActivationRequest,
    extra: Record<string, unknown> = {}
  ) {
    setBusyId(request.id);
    setError("");
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError("Admin session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/admin/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          requestId: request.id,
          userId: request.user_id,
          ...extra,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Admin action failed.");
        return;
      }

      setMessage("Action completed successfully.");

      setReplyText((old) => ({
        ...old,
        [request.id]: "",
      }));

      setRejectText((old) => ({
        ...old,
        [request.id]: "",
      }));

      await loadRequests();
    } catch (err) {
      console.error(err);
      setError("Unable to complete the Admin action.");
    } finally {
      setBusyId("");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-3xl mb-3">👑</div>
          <p className="text-yellow-400 font-semibold">
            Loading Admin...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {/* HEADER */}
        <header className="flex items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-yellow-400 text-xs font-bold tracking-widest">
              TAPBUMBER
            </p>

            <h1 className="text-2xl font-bold">
              👑 Admin Dashboard
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              {ADMIN_EMAIL}
            </p>
          </div>

          <button
            onClick={logout}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            Logout
          </button>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-red-300 text-sm font-medium">
              {error}
            </p>

            {error.includes("Access denied") && (
              <button
                onClick={() => (window.location.href = "/")}
                className="mt-3 px-4 py-2 rounded-lg bg-yellow-400 text-black font-bold text-sm"
              >
                Return to Login
              </button>
            )}
          </div>
        )}

        {/* SUCCESS */}
        {message && (
          <div className="mb-5 rounded-xl border border-green-500/40 bg-green-500/10 p-4">
            <p className="text-green-300 text-sm font-medium">
              ✅ {message}
            </p>
          </div>
        )}

        {/* REFRESH */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">
              Activation Requests
            </h2>

            <p className="text-gray-500 text-sm">
              {requests.length} request
              {requests.length === 1 ? "" : "s"}
            </p>
          </div>

          <button
            onClick={loadRequests}
            className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm font-semibold"
          >
            🔄 Refresh
          </button>
        </div>

        {/* EMPTY */}
        {requests.length === 0 && !error && (
          <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8 text-center">
            <div className="text-4xl mb-3">📭</div>

            <h3 className="font-bold text-lg">
              No activation requests
            </h3>

            <p className="text-gray-500 text-sm mt-2">
              New user activation requests will appear here.
            </p>
          </div>
        )}

        {/* REQUESTS */}
        <div className="space-y-5">
          {requests.map((request) => {
            const busy = busyId === request.id;

            return (
              <section
                key={request.id}
                className="rounded-2xl border border-gray-800 bg-gray-950 p-5"
              >
                {/* USER */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-bold text-lg">
                      {request.full_name || "New User"}
                    </h3>

                    <p className="text-gray-400 text-sm break-all">
                      {request.user_email || "Email unavailable"}
                    </p>

                    <p className="text-gray-600 text-xs mt-1 break-all">
                      ID: {request.user_id}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${
                      request.status === "approved"
                        ? "bg-green-500/20 text-green-400"
                        : request.status === "rejected"
                        ? "bg-red-500/20 text-red-400"
                        : request.status === "submitted"
                        ? "bg-yellow-400/20 text-yellow-300"
                        : "bg-blue-500/20 text-blue-300"
                    }`}
                  >
                    {request.status || "pending"}
                  </span>
                </div>

                {/* MESSAGE */}
                {request.message && (
                  <div className="mb-4 rounded-xl bg-gray-900 p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      REQUEST
                    </p>

                    <p className="text-sm text-gray-200">
                      {request.message}
                    </p>
                  </div>
                )}

                {/* PAYMENT INFO */}
                {(request.payment_reference ||
                  request.payment_note) && (
                  <div className="mb-4 rounded-xl border border-gray-800 p-4">
                    <p className="text-xs text-yellow-400 font-bold mb-3">
                      PAYMENT INFORMATION
                    </p>

                    {request.payment_reference && (
                      <div className="mb-2">
                        <p className="text-xs text-gray-500">
                          Reference
                        </p>

                        <p className="text-sm break-all">
                          {request.payment_reference}
                        </p>
                      </div>
                    )}

                    {request.payment_note && (
                      <div>
                        <p className="text-xs text-gray-500">
                          Note
                        </p>

                        <p className="text-sm whitespace-pre-wrap">
                          {request.payment_note}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PAYMENT PROOF */}
                {request.payment_proof_url && (
                  <div className="mb-4">
                    <p className="text-xs text-yellow-400 font-bold mb-2">
                      PAYMENT PROOF
                    </p>

                    <a
                      href={request.payment_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 rounded-lg bg-yellow-400 text-black font-bold text-sm"
                    >
                      🧾 View Payment Proof
                    </a>

                    {request.payment_submitted_at && (
                      <p className="text-xs text-gray-500 mt-2">
                        Submitted:{" "}
                        {new Date(
                          request.payment_submitted_at
                        ).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* ADMIN REPLY */}
                {request.admin_reply && (
                  <div className="mb-4 rounded-xl bg-yellow-400/10 border border-yellow-400/20 p-4">
                    <p className="text-xs text-yellow-400 font-bold mb-1">
                      ADMIN REPLY
                    </p>

                    <p className="text-sm whitespace-pre-wrap">
                      {request.admin_reply}
                    </p>
                  </div>
                )}

                {/* PAYMENT DETAILS */}
                {request.status !== "approved" &&
                  request.status !== "rejected" && (
                    <div className="mb-5">
                      <p className="text-sm font-bold mb-2">
                        Send Payment Details
                      </p>

                      <textarea
                        value={replyText[request.id] || ""}
                        onChange={(e) =>
                          setReplyText((old) => ({
                            ...old,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Enter bank/payment details for this user..."
                        className="w-full min-h-28 rounded-xl bg-black border border-gray-700 px-4 py-3 text-sm outline-none focus:border-yellow-400"
                      />

                      <button
                        disabled={
                          busy ||
                          !replyText[request.id]?.trim()
                        }
                        onClick={() =>
                          adminAction(
                            "reply_payment_details",
                            request,
                            {
                              reply:
                                replyText[
                                  request.id
                                ]?.trim(),
                            }
                          )
                        }
                        className="mt-2 w-full rounded-xl bg-yellow-400 text-black py-3 font-bold disabled:opacity-40"
                      >
                        {busy
                          ? "Processing..."
                          : "Send Payment Details"}
                      </button>
                    </div>
                  )}

                {/* APPROVE / REJECT */}
                {["submitted", "under_review"].includes(
                  request.status || ""
                ) && (
                  <div className="border-t border-gray-800 pt-5">
                    <p className="text-sm font-bold mb-3">
                      Review Payment
                    </p>

                    <button
                      disabled={busy || !request.payment_proof_url}
                      onClick={() =>
                        adminAction(
                          "approve_payment",
                          request
                        )
                      }
                      className="w-full rounded-xl bg-green-600 hover:bg-green-700 py-3 font-bold disabled:opacity-40"
                    >
                      {busy
                        ? "Processing..."
                        : "✅ Approve Payment & Activate"}
                    </button>

                    <textarea
                      value={rejectText[request.id] || ""}
                      onChange={(e) =>
                        setRejectText((old) => ({
                          ...old,
                          [request.id]: e.target.value,
                        }))
                      }
                      placeholder="Reason for rejecting payment..."
                      className="w-full min-h-24 mt-3 rounded-xl bg-black border border-gray-700 px-4 py-3 text-sm outline-none focus:border-red-500"
                    />

                    <button
                      disabled={
                        busy ||
                        !rejectText[request.id]?.trim()
                      }
                      onClick={() =>
                        adminAction(
                          "reject_payment",
                          request,
                          {
                            rejectionReason:
                              rejectText[
                                request.id
                              ]?.trim(),
                          }
                        )
                      }
                      className="w-full mt-2 rounded-xl bg-red-600 hover:bg-red-700 py-3 font-bold disabled:opacity-40"
                    >
                      {busy
                        ? "Processing..."
                        : "❌ Reject Payment"}
                    </button>
                  </div>
                )}

                {/* REJECTION REASON */}
                {request.rejection_reason && (
                  <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                    <p className="text-xs text-red-400 font-bold mb-1">
                      REJECTION REASON
                    </p>

                    <p className="text-sm whitespace-pre-wrap">
                      {request.rejection_reason}
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}