import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

async function telegramRequest(method: string, body?: Record<string, unknown>) {
  const token = getBotToken();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/${method}`,
    {
      method: body ? "POST" : "GET",
      headers: body
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }
  );

  const data = await response.json();

  return {
    response,
    data,
  };
}

/**
 * GET
 * Tests whether the Telegram bot token works.
 *
 * Open:
 * /api/telegram
 */
export async function GET() {
  try {
    const token = getBotToken();

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error: "TELEGRAM_BOT_TOKEN is not configured",
        },
        { status: 500 }
      );
    }

    const { response, data } = await telegramRequest("getMe");

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("Telegram GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to connect to Telegram",
      },
      { status: 500 }
    );
  }
}

/**
 * POST
 * Receives Telegram webhook updates.
 */
export async function POST(request: NextRequest) {
  try {
    const token = getBotToken();

    if (!token) {
      console.error("TELEGRAM_BOT_TOKEN is missing");

      return NextResponse.json(
        {
          ok: false,
          error: "TELEGRAM_BOT_TOKEN is not configured",
        },
        { status: 500 }
      );
    }

    const update = await request.json();

    console.log("Telegram update received:", {
      updateId: update?.update_id,
      chatId: update?.message?.chat?.id,
      text: update?.message?.text,
    });

    const message = update?.message;

    // Telegram may send updates that do not contain a message.
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();

    if (!chatId) {
      return NextResponse.json({ ok: true });
    }

    let reply = "";

    if (text === "/start" || text.startsWith("/start ")) {
      reply =
        "🎉 Welcome to TapBumber!\n\n" +
        "💰 Tap • Earn • Complete Tasks\n" +
        "👥 Invite Friends\n" +
        "🏆 Track Your Progress\n\n" +
        "Tap the button below to continue.";
    } else if (text === "/help") {
      reply =
        "💡 TapBumber Help\n\n" +
        "Use /start to open TapBumber.\n\n" +
        "More earning features will be available inside the platform.";
    } else {
      reply =
        "👋 Welcome to TapBumber!\n\n" +
        "Use /start to continue.";
    }

    const { response, data } = await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: reply,
    });

    if (!response.ok || !data?.ok) {
      console.error("Telegram sendMessage failed:", data);

      return NextResponse.json(
        {
          ok: false,
          error: "Telegram could not send the message",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error("Telegram webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Telegram webhook failed",
      },
      { status: 500 }
    );
  }
}