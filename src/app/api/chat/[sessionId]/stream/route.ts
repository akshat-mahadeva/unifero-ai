// app/api/chat/[sessionId]/stream/route.ts
import { getSessionById } from "@/actions/chat.actions";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

// GET - Resume existing stream
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    console.log(
      `GET /api/chat/${sessionId}/stream - Attempting to resume stream`
    );

    // Load session data
    const session = await getSessionById(sessionId);
    console.log(`Session loaded:`, {
      sessionId,
      activeStreamId: session.activeStreamId,
      hasMessages: !!session.messages?.length,
    });

    // No active stream to resume
    if (!session.activeStreamId) {
      console.log(`No active stream for session ${sessionId} - returning 204`);
      return new Response(null, { status: 204 });
    }

    console.log(
      `Resuming stream ${session.activeStreamId} for session ${sessionId}`
    );

    // Create resumable stream context
    const streamContext = createResumableStreamContext({
      waitUntil: after,
    });

    // Resume the existing stream from Redis with proper error handling
    try {
      const resumedStream = await streamContext.resumeExistingStream(
        session.activeStreamId
      );

      return new Response(resumedStream, {
        headers: UI_MESSAGE_STREAM_HEADERS,
      });
    } catch (streamError) {
      // Stream not found or expired in Redis
      console.error(
        `Failed to resume stream ${session.activeStreamId}:`,
        streamError
      );

      // Return 204 to indicate no stream available
      // Client will handle this gracefully
      return new Response(null, { status: 204 });
    }
  } catch (error) {
    console.error("Error in resume endpoint:", error);
    const message =
      error instanceof Error ? error.message : "Failed to resume stream";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

