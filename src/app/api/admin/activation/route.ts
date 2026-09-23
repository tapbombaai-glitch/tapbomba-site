import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAIL = "tapbomba.ai@gmail.com";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

/*
 * --------------------------------------------------
 * SERVICE-ROLE CLIENT
 * Used only for secure admin operations.
 * --------------------------------------------------
 */

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/*
 * --------------------------------------------------
 * GET AUTHENTICATED USER
 * --------------------------------------------------
 */

async function getAuthenticatedUser(
  request: NextRequest
) {
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization?.startsWith("Bearer ")
  ) {
    return {
      user: null,
      error: "Missing authorization token.",
    };
  }

  const token = authorization
    .replace("Bearer ", "")
    .trim();

  if (!token) {
    return {
      user: null,
      error: "Missing authorization token.",
    };
  }

  const supabaseUser = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      error: "Invalid or expired session.",
    };
  }

  return {
    user,
    error: null,
  };
}

/*
 * --------------------------------------------------
 * GET ADMIN USER
 * --------------------------------------------------
 */

async function getAdminUser(
  request: NextRequest
) {
  const result =
    await getAuthenticatedUser(request);

  if (!result.user) {
    return result;
  }

  if (
    result.user.email?.toLowerCase() !==
    ADMIN_EMAIL.toLowerCase()
  ) {
    return {
      user: null,
      error: "Admin access denied.",
    };
  }

  return result;
}

/*
 * --------------------------------------------------
 * GET
 * ADMIN LOADS ACTIVATION REQUESTS
 * --------------------------------------------------
 */

export async function GET(
  request: NextRequest
) {
  try {
    const {
      user,
      error: authError,
    } = await getAdminUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            authError ||
            "Admin access denied.",
        },
        { status: 403 }
      );
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("activation_requests")
      .select(
        "id, user_id, message, status, payment_reference, payment_note, payment_proof_url, payment_submitted_at, rejection_reason, admin_reply, created_at, updated_at"
      )
      .in("status", [
        "pending",
        "submitted",
        "under_review",
        "payment_details_requested",
      ])
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
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      requests: data || [],
    });
  } catch (error) {
    console.error(
      "Admin GET error:",
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

/*
 * --------------------------------------------------
 * POST
 * --------------------------------------------------
 */

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const action = body?.action;
    const requestId = body?.requestId;
    const reply = body?.reply;
    const packageType = body?.packageType;
    const rejectionReason =
      body?.rejectionReason;

    /*
     * ==================================================
     * USER ACTION
     * REQUEST PAYMENT DETAILS
     * ==================================================
     */

    if (
      action ===
      "request_payment_details"
    ) {
      const {
        user,
        error: authError,
      } = await getAuthenticatedUser(
        request
      );

      if (!user) {
        return NextResponse.json(
          {
            error:
              authError ||
              "You must be logged in.",
          },
          { status: 401 }
        );
      }

      if (
        packageType !== "standard" &&
        packageType !== "premium"
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid package selected.",
          },
          { status: 400 }
        );
      }

      /*
       * Prevent creating another active request.
       */

      const {
        data: existingRequest,
        error: existingError,
      } = await supabaseAdmin
        .from("activation_requests")
        .select("id, status")
        .eq("user_id", user.id)
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

      if (existingError) {
        console.error(
          "Existing activation request lookup error:",
          existingError
        );
      }

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

      const packageName =
        packageType === "standard"
          ? "STANDARD"
          : "PREMIUM";

      const fee =
        packageType === "standard"
          ? 3000
          : 5000;

      const message =
        `Payment details requested for ${packageName} package. ` +
        `Activation fee: ₦${fee.toLocaleString()}.`;

      const authorization =
        request.headers.get(
          "authorization"
        );

      if (
        !authorization?.startsWith(
          "Bearer "
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Missing authorization token.",
          },
          { status: 401 }
        );
      }

      const token =
        authorization
          .replace("Bearer ", "")
          .trim();

      const supabaseUser =
        createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
            global: {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          }
        );

      const {
        data,
        error,
      } = await supabaseUser
        .from("activation_requests")
        .insert({
          user_id: user.id,
          message,
          status:
            "payment_details_requested",
          payment_reference: null,
          payment_note: null,
          admin_reply: null,
          created_at:
            new Date().toISOString(),
          updated_at:
            new Date().toISOString(),
        })
        .select(
          "id, user_id, message, status, created_at"
        )
        .single();

      if (error) {
        console.error(
          "Payment details request error:",
          error
        );

        return NextResponse.json(
          {
            error:
              error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: data,
        message:
          "Payment-details request sent to TapBumber Admin.",
      });
    }

    /*
     * ==================================================
     * USER ACTION
     * SUBMIT PAYMENT PROOF
     * ==================================================
     */

    if (
      action ===
      "submit_payment_proof"
    ) {
      const {
        user,
        error: authError,
      } = await getAuthenticatedUser(
        request
      );

      if (!user) {
        return NextResponse.json(
          {
            error:
              authError ||
              "You must be logged in.",
          },
          { status: 401 }
        );
      }

      if (!requestId) {
        return NextResponse.json(
          {
            error:
              "Activation request ID is required.",
          },
          { status: 400 }
        );
      }

      const paymentProofUrl =
        body?.paymentProofUrl;

      const paymentReference =
        body?.paymentReference;

      const paymentNote =
        body?.paymentNote;

      if (
        typeof paymentProofUrl !==
          "string" ||
        !paymentProofUrl.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Payment screenshot is required.",
          },
          { status: 400 }
        );
      }

      /*
       * Find the activation request
       * belonging to the logged-in user.
       */

      const {
        data: activationRequest,
        error: requestError,
      } = await supabaseAdmin
        .from("activation_requests")
        .select(
          "id, user_id, status, admin_reply"
        )
        .eq("id", requestId)
        .eq("user_id", user.id)
        .single();

      if (
        requestError ||
        !activationRequest
      ) {
        return NextResponse.json(
          {
            error:
              "Your activation request could not be found.",
          },
          { status: 404 }
        );
      }

      /*
       * User must receive payment details
       * before submitting payment proof.
       */

      if (
        activationRequest.status !==
        "payment_details_requested"
      ) {
        return NextResponse.json(
          {
            error:
              "You can only submit payment proof after receiving payment details from Admin.",
          },
          { status: 400 }
        );
      }

      if (
        !activationRequest.admin_reply?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Please wait for Admin to send the payment details first.",
          },
          { status: 400 }
        );
      }

      const now =
        new Date().toISOString();

      const {
        data,
        error: updateError,
      } = await supabaseAdmin
        .from("activation_requests")
        .update({
          payment_proof_url:
            paymentProofUrl.trim(),

          payment_reference:
            typeof paymentReference ===
            "string"
              ? paymentReference.trim() ||
                null
              : null,

          payment_note:
            typeof paymentNote ===
            "string"
              ? paymentNote.trim() ||
                null
              : null,

          payment_submitted_at:
            now,

          status: "submitted",

          updated_at: now,
        })
        .eq("id", requestId)
        .eq("user_id", user.id)
        .select(
          "id, user_id, status, payment_reference, payment_note, payment_proof_url, payment_submitted_at"
        )
        .single();

      if (updateError) {
        console.error(
          "Payment proof submission error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        request: data,
        message:
          "Payment proof sent to TapBumber Admin successfully.",
      });
    }

    /*
     * ==================================================
     * ALL ACTIONS BELOW THIS POINT ARE ADMIN ACTIONS
     * ==================================================
     */

    const {
      user,
      error: authError,
    } = await getAdminUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            authError ||
            "Admin access denied.",
        },
        { status: 403 }
      );
    }

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
     * ==================================================
     * ADMIN SENDS PAYMENT DETAILS
     * ==================================================
     */

    if (
      action ===
      "reply_payment_details"
    ) {
      if (
        typeof reply !== "string" ||
        !reply.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Please enter the payment details.",
          },
          { status: 400 }
        );
      }

      const {
        data: existingRequest,
        error,
      } = await supabaseAdmin
        .from("activation_requests")
        .select(
          "id, user_id, status"
        )
        .eq("id", requestId)
        .single();

      if (
        error ||
        !existingRequest
      ) {
        return NextResponse.json(
          {
            error:
              "Payment-details request not found.",
          },
          { status: 404 }
        );
      }

      const now =
        new Date().toISOString();

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("activation_requests")
        .update({
          admin_reply:
            reply.trim(),
          status:
            "payment_details_requested",
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq(
          "id",
          requestId
        );

      if (updateError) {
        console.error(
          "Payment details reply error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message:
          "Payment details sent to the user successfully.",
      });
    }

    /*
     * ==================================================
     * LOAD REQUEST FOR APPROVE / REJECT
     * ==================================================
     */

    const {
      data: activationRequest,
      error: requestError,
    } = await supabaseAdmin
      .from("activation_requests")
      .select(
        "id, user_id, message, status, payment_reference, payment_note, payment_proof_url, payment_submitted_at, rejection_reason, admin_reply"
      )
      .eq("id", requestId)
      .single();

    if (
      requestError ||
      !activationRequest
    ) {
      console.error(
        "Request lookup error:",
        requestError
      );

      return NextResponse.json(
        {
          error:
            "Activation request not found.",
        },
        { status: 404 }
      );
    }

    /*
     * ==================================================
     * ADMIN REJECTS PAYMENT
     * ==================================================
     */

    if (
      action ===
      "reject_payment"
    ) {
      if (
        activationRequest.status !==
          "submitted" &&
        activationRequest.status !==
          "under_review"
      ) {
        return NextResponse.json(
          {
            error:
              "Only submitted payment proofs can be rejected.",
          },
          { status: 400 }
        );
      }

      const reason =
        typeof rejectionReason ===
          "string" &&
        rejectionReason.trim()
          ? rejectionReason.trim()
          : "Payment proof could not be verified.";

      const now =
        new Date().toISOString();

      const {
        error: rejectError,
      } = await supabaseAdmin
        .from("activation_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
          admin_reply: reason,
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq(
          "id",
          requestId
        );

      if (rejectError) {
        console.error(
          "Payment rejection error:",
          rejectError
        );

        return NextResponse.json(
          {
            error:
              rejectError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message:
          "Payment proof rejected.",
      });
    }

    /*
     * ==================================================
     * ADMIN APPROVES PAYMENT
     * ==================================================
     */

    if (
      action ===
      "approve_payment"
    ) {
      if (
        activationRequest.status !==
          "submitted" &&
        activationRequest.status !==
          "under_review"
      ) {
        return NextResponse.json(
          {
            error:
              "Only submitted payment proofs can be approved.",
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
              "No payment proof was submitted for this request.",
          },
          { status: 400 }
        );
      }

      /*
       * Determine package from the current
       * payment-details request message.
       */

      const packageMatch =
        activationRequest.message?.match(
          /(?:requested for|request for)\s+(STANDARD|PREMIUM)\s+package/i
        );

      if (!packageMatch) {
        return NextResponse.json(
          {
            error:
              "Could not determine the selected package.",
          },
          { status: 400 }
        );
      }

      const packageName =
        packageMatch[1].toLowerCase();

      if (
        packageName !== "standard" &&
        packageName !== "premium"
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid package.",
          },
          { status: 400 }
        );
      }

      const now =
        new Date().toISOString();

      /*
       * Activate the user's profile.
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
          "User profile activation error:",
          profileError
        );

        return NextResponse.json(
          {
            error:
              "Could not activate the user's profile: " +
              profileError.message,
          },
          { status: 500 }
        );
      }

      /*
       * Mark the activation request approved.
       */

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("activation_requests")
        .update({
          status: "approved",
          admin_reply:
            `Payment approved. ${packageName.toUpperCase()} package activated.`,
          reviewed_by: user.id,
          reviewed_at: now,
          updated_at: now,
        })
        .eq(
          "id",
          requestId
        );

      if (updateError) {
        console.error(
          "Activation request update error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "User was activated, but the activation request could not be updated: " +
              updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message:
          "Payment approved and user activated successfully.",
        package: packageName,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unknown admin action.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "Admin POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to process admin request.",
      },
      { status: 500 }
    );
  }
}