import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "tapbomba.ai@gmail.com";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function getAuthenticatedUser(request: NextRequest) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      ),
    };
  }

  if (
    user.email?.toLowerCase() !==
    ADMIN_EMAIL.toLowerCase()
  ) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Access denied. Admin account only." },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    response: null,
  };
}

/**
 * GET
 *
 * Loads activation requests and attaches:
 * - user full name
 * - user email
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const { data: requests, error } =
      await supabaseAdmin
        .from("activation_requests")
        .select(
          `
          id,
          user_id,
          message,
          status,
          payment_reference,
          payment_note,
          payment_proof_url,
          payment_submitted_at,
          rejection_reason,
          admin_reply,
          created_at,
          updated_at
        `
        )
        .order("created_at", {
          ascending: false,
        });

    if (error) {
      console.error(
        "Load activation requests error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load activation requests.",
        },
        { status: 500 }
      );
    }

    const requestList = requests || [];

    /*
     * Get the user account details for every
     * activation request.
     */
    const userIds = Array.from(
      new Set(
        requestList
          .map((request) => request.user_id)
          .filter(Boolean)
      )
    );

    const userMap = new Map<
      string,
      {
        full_name: string | null;
        email: string | null;
      }
    >();

    /*
     * Get names from user_profiles.
     */
    if (userIds.length > 0) {
      const {
        data: profiles,
        error: profilesError,
      } = await supabaseAdmin
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profilesError) {
        console.error(
          "Load user profiles error:",
          profilesError
        );
      }

      for (const profile of profiles || []) {
        userMap.set(profile.id, {
          full_name: profile.full_name || null,
          email: profile.email || null,
        });
      }
    }

    /*
     * Get email directly from Supabase Auth as a
     * fallback / source of truth.
     *
     * This means the Admin page can still show
     * the email even if user_profiles.email is empty.
     */
    for (const userId of userIds) {
      if (
        userMap.has(userId) &&
        userMap.get(userId)?.email
      ) {
        continue;
      }

      try {
        const {
          data: authUser,
          error: authError,
        } = await supabaseAdmin.auth.admin.getUserById(
          userId
        );

        if (!authError && authUser?.user) {
          const existing = userMap.get(userId);

          userMap.set(userId, {
            full_name:
              existing?.full_name ||
              authUser.user.user_metadata?.full_name ||
              authUser.user.user_metadata?.name ||
              null,
            email:
              existing?.email ||
              authUser.user.email ||
              null,
          });
        }
      } catch (error) {
        console.error(
          "Auth user lookup error:",
          error
        );
      }
    }

    /*
     * Attach account information to each request.
     */
    const enrichedRequests = requestList.map(
      (request) => {
        const account = userMap.get(request.user_id);

        return {
          ...request,
          user_email: account?.email || null,
          full_name: account?.full_name || null,
        };
      }
    );

    return NextResponse.json({
      requests: enrichedRequests,
    });
  } catch (error) {
    console.error(
      "GET activation requests error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load activation requests.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 *
 * Admin actions:
 * - request_payment_details
 * - reply_payment_details
 * - reject_payment
 * - approve_payment
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json();

    const action = body?.action;
    const requestId = body?.requestId;

    /*
     * --------------------------------------------------
     * REQUEST PAYMENT DETAILS
     * --------------------------------------------------
     */
    if (action === "request_payment_details") {
      const packageType =
        body?.packageType?.toString().toLowerCase();

      const userId =
        body?.userId?.toString().trim();

      if (
        !userId ||
        !["standard", "premium"].includes(
          packageType
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid user or package.",
          },
          { status: 400 }
        );
      }

      /*
       * Prevent duplicate active requests.
       */
      const { data: existingRequest } =
        await supabaseAdmin
          .from("activation_requests")
          .select(
            "id, status, message, admin_reply"
          )
          .eq("user_id", userId)
          .in("status", [
            "pending",
            "submitted",
            "under_review",
            "payment_details_requested",
          ])
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

      if (existingRequest) {
        return NextResponse.json(
          {
            error:
              "You already have an active activation request.",
            request: existingRequest,
          },
          { status: 409 }
        );
      }

      const amount =
        packageType === "premium"
          ? 5000
          : 3000;

      const packageName =
        packageType.toUpperCase();

      const message =
        `Payment details requested for ${packageName} package. Activation fee: ₦${amount.toLocaleString()}.`;

      const { data: newRequest, error } =
        await supabaseAdmin
          .from("activation_requests")
          .insert({
            user_id: userId,
            message,
            status:
              "payment_details_requested",
          })
          .select()
          .single();

      if (error) {
        console.error(
          "Create activation request error:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Unable to create activation request.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: newRequest,
      });
    }

    /*
     * All remaining actions require requestId.
     */
    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "Activation request ID is required.",
        },
        { status: 400 }
      );
    }

    /*
     * --------------------------------------------------
     * GET REQUEST
     * --------------------------------------------------
     */
    const {
      data: activationRequest,
      error: requestError,
    } = await supabaseAdmin
      .from("activation_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !activationRequest) {
      return NextResponse.json(
        {
          error:
            "Activation request not found.",
        },
        { status: 404 }
      );
    }

    /*
     * --------------------------------------------------
     * SEND PAYMENT DETAILS
     * --------------------------------------------------
     */
    if (action === "reply_payment_details") {
      const reply =
        body?.reply?.toString().trim() || "";

      if (!reply) {
        return NextResponse.json(
          {
            error:
              "Payment details cannot be empty.",
          },
          { status: 400 }
        );
      }

      const { data, error } =
        await supabaseAdmin
          .from("activation_requests")
          .update({
            admin_reply: reply,
            status:
              "payment_details_requested",
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestId)
          .select()
          .single();

      if (error) {
        console.error(
          "Send payment details error:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Unable to send payment details.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: data,
      });
    }

    /*
     * --------------------------------------------------
     * REJECT PAYMENT
     * --------------------------------------------------
     */
    if (action === "reject_payment") {
      if (
        ![
          "submitted",
          "under_review",
        ].includes(
          activationRequest.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "This payment is not currently awaiting review.",
          },
          { status: 400 }
        );
      }

      const rejectionReason =
        body?.rejectionReason
          ?.toString()
          .trim() ||
        "Payment proof could not be verified.";

      const now =
        new Date().toISOString();

      const { data, error } =
        await supabaseAdmin
          .from("activation_requests")
          .update({
            status: "rejected",
            rejection_reason:
              rejectionReason,
            admin_reply:
              `Payment rejected. ${rejectionReason}`,
            reviewed_by: auth.user?.id,
            reviewed_at: now,
            updated_at: now,
          })
          .eq("id", requestId)
          .select()
          .single();

      if (error) {
        console.error(
          "Reject payment error:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Unable to reject payment.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: data,
      });
    }

    /*
     * --------------------------------------------------
     * APPROVE PAYMENT
     * --------------------------------------------------
     */
    if (action === "approve_payment") {
      if (
        ![
          "submitted",
          "under_review",
        ].includes(
          activationRequest.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "This payment is not currently awaiting review.",
          },
          { status: 400 }
        );
      }

      if (
        !activationRequest.payment_proof_url
      ) {
        return NextResponse.json(
          {
            error:
              "Payment proof is required before approval.",
          },
          { status: 400 }
        );
      }

      /*
       * Detect package from the original
       * activation request message.
       */
      const packageMatch =
        activationRequest.message?.match(
          /(?:requested for|request for)\s+(STANDARD|PREMIUM)\s+package/i
        );

      const packageName =
        packageMatch?.[1]?.toUpperCase();

      if (
        !packageName ||
        !["STANDARD", "PREMIUM"].includes(
          packageName
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Could not determine the requested package.",
          },
          { status: 400 }
        );
      }

      const now =
        new Date().toISOString();

      /*
       * Activate the user's account.
       */
      const {
        error: profileError,
      } = await supabaseAdmin
        .from("user_profiles")
        .update({
          is_activated: true,
          package: packageName,
          activated_at: now,
          updated_at: now,
        })
        .eq(
          "id",
          activationRequest.user_id
        );

      if (profileError) {
        console.error(
          "Activate user profile error:",
          profileError
        );

        return NextResponse.json(
          {
            error:
              "Payment was not approved because the user account could not be activated.",
          },
          { status: 500 }
        );
      }

      /*
       * Mark activation request approved.
       */
      const {
        data,
        error,
      } = await supabaseAdmin
        .from("activation_requests")
        .update({
          status: "approved",
          admin_reply:
            `Payment approved. ${packageName} package activated.`,
          reviewed_by: auth.user?.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq("id", requestId)
        .select()
        .single();

      if (error) {
        console.error(
          "Approve activation request error:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Account was activated, but the activation request could not be updated.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: data,
      });
    }

    /*
     * --------------------------------------------------
     * UNKNOWN ACTION
     * --------------------------------------------------
     */
    return NextResponse.json(
      {
        error: "Unknown admin action.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "Admin activation API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while processing the request.",
      },
      { status: 500 }
    );
  }
}