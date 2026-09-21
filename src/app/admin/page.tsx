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
  admin_reply: string | null;
  created_at: string | null;
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

  async function approveRequest(request: ActivationRequest) {
    const packageName = detectPackage(request);

    if (packageName === "UNKNOWN") {
      setMessage(
        "Could not detect the requested package. Do not approve this request manually."
      );
      return;
    }

    const confirmed = window.confirm(
      `Approve this user?\n\nPackage: ${packageName}\n\nThis will activate the user's account.`
    );

    if (!confirmed) return;

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
          requestId: request.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Approval failed.");
        return;
      }

      setMessage("Activation approved successfully. ✅");

      await loadRequests();
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong while approving.");
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

        {message && (
          <div className="mb-5 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4 text-sm text-yellow-300">
            {message}
          </div>
        )}

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

              return (
                <div
                  key={request.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">
                      {packageName} PACKAGE
                    </h2>

                    <span className="rounded-full bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-400">
                      {request.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <p>
                      <span className="text-gray-400">
                        User ID:
                      </span>{" "}
                      <span className="break-all text-gray-200">
                        {request.user_id}
                      </span>
                    </p>

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
                        {request.created_at
                          ? new Date(
                              request.created_at
                            ).toLocaleString()
                          : "Unknown"}
                      </span>
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl bg-black/40 p-3 text-sm text-gray-300">
                    {request.message ||
                      "No message provided."}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      approveRequest(request)
                    }
                    disabled={
                      processingId === request.id
                    }
                    className="mt-5 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processingId === request.id
                      ? "APPROVING..."
                      : `APPROVE ${packageName}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}