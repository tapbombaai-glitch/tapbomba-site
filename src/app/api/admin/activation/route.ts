import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAIL = "tapbomba.ai@gmail.com";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function getAdminUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      user: null,
      error: "Missing authorization token.",
    };
  }

  const token = authorization.replace("Bearer ", "").trim();

  if (!token) {
    return {
      user: null,
      error: "Missing authorization token.",
    };
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return {
      user: null,
      error: "Invalid or expired session.",
    };
  }

  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return {
      user: null,
      error: "Admin access denied.",
    };
  }

  return {
    user,
    error: null,
  };
}

/*
 * ---------------------------------------------------------
 * GET — LOAD PENDING ACTIVATION REQUESTS
 * ---------------------------------------------------------
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAdminUser(request);

    if (!user) {
      return NextResponse.json(
        { error: authError || "Admin access denied." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("activation_requests")
      .select(
        "id, user_id, message, status, payment_reference, payment_note, admin_reply, created_at"
      )
      .in("status", ["pending", "submitted", "under_review"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load activation requests error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      requests: data || [],
    });
  } catch (error) {
    console.error("Admin GET error:", error);

    return NextResponse.json(
      { error: "Unable to load activation requests." },
      { status: 500 }
    );
  }
}

/*
 * ---------------------------------------------------------
 * POST — APPROVE ACTIVATION REQUEST
 * ---------------------------------------------------------
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAdminUser(request);

    if (!user) {
      return NextResponse.json(
        { error: authError || "Admin access denied." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const requestId = body?.requestId;

    if (!requestId) {
      return NextResponse.json(
        { error: "Activation request ID is required." },
        { status: 400 }
      );
    }

    /*
     * Get the activation request.
     */
    const {
      data: activationRequest,
      error: requestError,
    } = await supabaseAdmin
      .from("activation_requests")
      .select(
        "id, user_id, message, status, payment_reference, payment_note"
      )
      .eq("id", requestId)
      .single();

    if (requestError || !activationRequest) {
      console.error("Request lookup error:", requestError);

      return NextResponse.json(
        { error: "Activation request not found." },
        { status: 404 }
      );
    }

    /*
     * Prevent approving the same request twice.
     */
    if (activationRequest.status === "approved") {
      return NextResponse.json(
        { error: "This activation request is already approved." },
        { status: 400 }
      );
    }

    /*
     * Detect package from the activation message.
     */
    const packageMatch = activationRequest.message?.match(
      /Activation request for (STANDARD|PREMIUM) package/i
    );

    if (!packageMatch) {
      return NextResponse.json(
        {
          error:
            "Could not determine whether this is a Standard or Premium activation request.",
        },
        { status: 400 }
      );
    }

    const packageName = packageMatch[1].toLowerCase();

    if (packageName !== "standard" && packageName !== "premium") {
      return NextResponse.json(
        { error: "Invalid package." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    /*
     * Activate the user's profile.
     */
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        is_activated: true,
        package: packageName,
        activated_at: now,
        updated_at: now,
      })
      .eq("id", activationRequest.user_id);

    if (profileError) {
      console.error("User profile activation error:", profileError);

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
     * Mark the activation request as approved.
     */
    const { error: updateError } = await supabaseAdmin
      .from("activation_requests")
      .update({
        status: "approved",
        admin_reply: `Activation approved for ${packageName.toUpperCase()} package.`,
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", requestId);

    if (updateError) {
      console.error("Activation request update error:", updateError);

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
      message: "User activated successfully.",
      package: packageName,
    });
  } catch (error) {
    console.error("Admin POST error:", error);

    return NextResponse.json(
      { error: "Unable to process activation." },
      { status: 500 }
    );
  }
}