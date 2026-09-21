import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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

const CYCLE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const CLAIM_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const MAX_CYCLES = 12;

function getEarningPeriodStart(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);

  const periodDate = new Date(
    Date.UTC(year, month - 1, day, 16, 0, 0, 0)
  );

  if (hour < 17) {
    periodDate.setUTCDate(periodDate.getUTCDate() - 1);
  }

  return periodDate.getTime();
}

function getPackageDetails(packageName: string) {
  if (packageName === "standard") {
    return {
      amount: 50,
      dailyMaximum: 600,
    };
  }

  if (packageName === "premium") {
    return {
      amount: 120,
      dailyMaximum: 1440,
    };
  }

  return null;
}

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Missing authorization token." },
        { status: 401 }
      ),
    };
  }

  const token = authorization.replace("Bearer ", "").trim();

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      ),
    };
  }

  return {
    user,
    error: null,
  };
}

async function getProfile(userId: string) {
  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("user_profiles")
      .select(
        "id, is_activated, package, balance, total_earned"
      )
      .eq("id", userId)
      .single();

  return {
    profile,
    profileError,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { user, error: authResponse } =
      await authenticate(request);

    if (authResponse || !user) {
      return authResponse;
    }

    const { profile, profileError } =
      await getProfile(user.id);

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found." },
        { status: 404 }
      );
    }

    const balance = Number(profile.balance || 0);
    const totalEarned = Number(
      profile.total_earned || 0
    );

    if (!profile.is_activated) {
      return NextResponse.json({
        success: true,
        status: "inactive",
        package: null,
        amount: 0,
        dailyMaximum: 0,
        balance,
        totalEarned,
        completedCycles: 0,
        maxCycles: MAX_CYCLES,
        cycleIndex: 0,
        periodStart: null,
        cycleStartMs: null,
        cycleEndMs: null,
        claimDeadlineMs: null,
        nowMs: Date.now(),
        canClaim: false,
      });
    }

    const packageName = String(
      profile.package || ""
    ).toLowerCase();

    const packageDetails =
      getPackageDetails(packageName);

    if (!packageDetails) {
      return NextResponse.json(
        {
          error:
            "Your account does not have a valid TapBumber package.",
        },
        { status: 400 }
      );
    }

    const now = Date.now();

    const periodStart =
      getEarningPeriodStart(new Date(now));

    const { data: claims, error: claimsError } =
      await supabaseAdmin
        .from("cycle_claims")
        .select(
          "id, cycle_index, amount, claimed_at_ms"
        )
        .eq("user_id", user.id)
        .eq(
          "daily_period_start_ms",
          periodStart
        )
        .order("cycle_index", {
          ascending: true,
        });

    if (claimsError) {
      console.error(
        "Cycle claims GET error:",
        claimsError
      );

      return NextResponse.json(
        {
          error:
            "Unable to check your earning cycles.",
        },
        { status: 500 }
      );
    }

    const existingClaims = claims || [];

    const completedCycles =
      existingClaims.length;

    if (completedCycles >= MAX_CYCLES) {
      return NextResponse.json({
        success: true,
        status: "complete",
        package: packageName,
        amount: packageDetails.amount,
        dailyMaximum:
          packageDetails.dailyMaximum,
        balance,
        totalEarned,
        completedCycles: MAX_CYCLES,
        maxCycles: MAX_CYCLES,
        cycleIndex: MAX_CYCLES,
        periodStart,
        cycleStartMs: null,
        cycleEndMs: null,
        claimDeadlineMs: null,
        nowMs: now,
        canClaim: false,
      });
    }

    const nextCycleIndex =
      completedCycles + 1;

    let cycleStartMs = periodStart;

    if (existingClaims.length > 0) {
      const lastClaim =
        existingClaims[
          existingClaims.length - 1
        ];

      cycleStartMs =
        Number(lastClaim.claimed_at_ms) +
        CYCLE_DURATION_MS;
    }

    const cycleEndMs =
      cycleStartMs + CYCLE_DURATION_MS;

    const claimDeadlineMs =
      cycleEndMs + CLAIM_WINDOW_MS;

    let status:
      | "earning"
      | "claim"
      | "expired";

    let canClaim = false;

    if (now < cycleEndMs) {
      status = "earning";
    } else if (now <= claimDeadlineMs) {
      status = "claim";
      canClaim = true;
    } else {
      status = "expired";
    }

    return NextResponse.json({
      success: true,
      status,
      package: packageName,
      amount: packageDetails.amount,
      dailyMaximum:
        packageDetails.dailyMaximum,
      balance,
      totalEarned,
      completedCycles,
      maxCycles: MAX_CYCLES,
      cycleIndex: nextCycleIndex,
      periodStart,
      cycleStartMs,
      cycleEndMs,
      claimDeadlineMs,
      nowMs: now,
      canClaim,
    });
  } catch (error) {
    console.error(
      "Daily Tap GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load Daily Tap right now.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authResponse } =
      await authenticate(request);

    if (authResponse || !user) {
      return authResponse;
    }

    const { profile, profileError } =
      await getProfile(user.id);

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found." },
        { status: 404 }
      );
    }

    if (!profile.is_activated) {
      return NextResponse.json(
        {
          error:
            "Your account is not activated yet.",
        },
        { status: 403 }
      );
    }

    const packageName = String(
      profile.package || ""
    ).toLowerCase();

    const packageDetails =
      getPackageDetails(packageName);

    if (!packageDetails) {
      return NextResponse.json(
        {
          error:
            "Your account does not have a valid TapBumber package.",
        },
        { status: 400 }
      );
    }

    const now = Date.now();

    const periodStart =
      getEarningPeriodStart(new Date(now));

    const { data: claims, error: claimsError } =
      await supabaseAdmin
        .from("cycle_claims")
        .select(
          "id, cycle_index, amount, claimed_at_ms"
        )
        .eq("user_id", user.id)
        .eq(
          "daily_period_start_ms",
          periodStart
        )
        .order("cycle_index", {
          ascending: true,
        });

    if (claimsError) {
      console.error(
        "Cycle claims lookup error:",
        claimsError
      );

      return NextResponse.json(
        {
          error:
            "Unable to check your earning cycles.",
        },
        { status: 500 }
      );
    }

    const existingClaims = claims || [];

    if (existingClaims.length >= MAX_CYCLES) {
      return NextResponse.json(
        {
          error:
            "You have completed all 12 cycles for this earning period.",
          completedCycles: MAX_CYCLES,
          maxCycles: MAX_CYCLES,
        },
        { status: 400 }
      );
    }

    const nextCycleIndex =
      existingClaims.length + 1;

    let cycleStartMs = periodStart;

    if (existingClaims.length > 0) {
      const lastClaim =
        existingClaims[
          existingClaims.length - 1
        ];

      cycleStartMs =
        Number(lastClaim.claimed_at_ms) +
        CYCLE_DURATION_MS;
    }

    const cycleEndMs =
      cycleStartMs + CYCLE_DURATION_MS;

    const claimDeadlineMs =
      cycleEndMs + CLAIM_WINDOW_MS;

    if (now < cycleEndMs) {
      const remainingMs =
        cycleEndMs - now;

      return NextResponse.json(
        {
          error:
            "Your current 2-hour earning cycle is still running.",
          cycleIndex: nextCycleIndex,
          cycleStartMs,
          cycleEndMs,
          claimDeadlineMs,
          remainingMs,
          canClaim: false,
        },
        { status: 400 }
      );
    }

    if (now > claimDeadlineMs) {
      return NextResponse.json(
        {
          error:
            "The 20-minute claim window for this cycle has expired.",
          cycleIndex: nextCycleIndex,
          cycleStartMs,
          cycleEndMs,
          claimDeadlineMs,
          canClaim: false,
        },
        { status: 400 }
      );
    }

    const amount = packageDetails.amount;
    const dailyMaximum =
      packageDetails.dailyMaximum;

    const currentBalance =
      Number(profile.balance || 0);

    const currentTotalEarned =
      Number(profile.total_earned || 0);

    const claimedToday = existingClaims.reduce(
      (total, claim) =>
        total + Number(claim.amount || 0),
      0
    );

    if (
      claimedToday + amount >
      dailyMaximum
    ) {
      return NextResponse.json(
        {
          error:
            "This claim would exceed your daily earning limit.",
        },
        { status: 400 }
      );
    }

    const { error: insertError } =
      await supabaseAdmin
        .from("cycle_claims")
        .insert({
          user_id: user.id,
          daily_period_start_ms: periodStart,
          cycle_index: nextCycleIndex,
          amount,
          claimed_at: new Date(
            now
          ).toISOString(),
          claimed_at_ms: now,
        });

    if (insertError) {
      console.error(
        "Cycle claim insert error:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            "Unable to save this cycle claim.",
        },
        { status: 500 }
      );
    }

    const newBalance =
      currentBalance + amount;

    const newTotalEarned =
      currentTotalEarned + amount;

    const { error: balanceError } =
      await supabaseAdmin
        .from("user_profiles")
        .update({
          balance: newBalance,
          total_earned: newTotalEarned,
          updated_at: new Date(
            now
          ).toISOString(),
        })
        .eq("id", user.id);

    if (balanceError) {
      console.error(
        "Balance update error:",
        balanceError
      );

      return NextResponse.json(
        {
          error:
            "The claim was saved, but the wallet could not be updated.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `₦${amount} has been added to your balance.`,
      amount,
      balance: newBalance,
      totalEarned: newTotalEarned,
      cycleIndex: nextCycleIndex,
      completedCycles: nextCycleIndex,
      maxCycles: MAX_CYCLES,
      dailyMaximum,
      periodStart,
      claimedAtMs: now,
      nextCycleStartMs:
        now + CYCLE_DURATION_MS,
      nextCycleEndMs:
        now +
        CYCLE_DURATION_MS +
        CYCLE_DURATION_MS,
    });
  } catch (error) {
    console.error(
      "Daily Tap claim error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to process Daily Tap right now.",
      },
      { status: 500 }
    );
  }
}