"use server";

import prisma from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma";
import { AssistantToolResult } from "@/lib/helpers";
import { UIMessage } from "ai";

// Helper function to get authenticated user ID
async function getUserIdOrThrow() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

// Helper function for error handling
function handleError(fnName: string, err: unknown): never {
  console.error(`${fnName} error:`, err);
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}

// Helper function to sanitize JSON data for PostgreSQL
// Removes null bytes and other problematic characters
function sanitizeJsonForPostgres(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    // Remove null bytes and other control characters except newlines and tabs
    return obj.replace(/\u0000/g, "").replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "");
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeJsonForPostgres(item));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeJsonForPostgres(value);
    }
    return sanitized;
  }

  return obj;
}

// ==================== SESSION ACTIONS ====================

/**
 * Get all sessions for the current user
 */
export async function getSessions() {
  try {
    const userId = await getUserIdOrThrow();
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return sessions;
  } catch (err) {
    handleError("getSessions", err);
  }
}

/**
 * Get a single session by ID
 */
export async function getSessionById(sessionId: string) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();
    const session = await prisma.session.findUnique({
      where: { id: sessionId, userId },
      include: {
        messages: {
          include: {
            toolSnapshots: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!session) {
      throw new Error("Session not found or access denied");
    }

    return session;
  } catch (err) {
    handleError("getSessionById", err);
  }
}

/**
 * Get or create a session by ID
 */
export async function getOrCreateSessionById(
  sessionId: string,
  title?: string
) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    let session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          include: {
            toolSnapshots: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (session) {
      // Verify ownership
      if (session.userId !== userId) {
        throw new Error("Not authorized to access this session");
      }
      return session;
    }

    // Create new session
    session = await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        title: title || "New Chat",
      },
      include: {
        messages: {
          include: {
            toolSnapshots: true,
          },
        },
      },
    });

    return session;
  } catch (err) {
    handleError("getOrCreateSessionById", err);
  }
}

/**
 * Create a new session
 */
export async function createSession(opts: { title?: string } = {}) {
  try {
    const userId = await getUserIdOrThrow();

    const session = await prisma.session.create({
      data: {
        userId,
        title: opts.title || "New Chat",
      },
    });

    return session;
  } catch (err) {
    handleError("createSession", err);
  }
}

/**
 * Update session title
 */
export async function updateSessionTitle(sessionId: string, title: string) {
  try {
    if (!sessionId) throw new Error("sessionId is required");
    if (!title) throw new Error("title is required");

    const userId = await getUserIdOrThrow();

    // Verify ownership
    const existing = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      throw new Error("Session not found");
    }

    if (existing.userId !== userId) {
      throw new Error("Not authorized to update this session");
    }

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { title },
    });

    return session;
  } catch (err) {
    handleError("updateSessionTitle", err);
  }
}

/**
 * Update session metadata
 */
export async function updateSession(
  sessionId: string,
  data: { title?: string }
) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify ownership
    const existing = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      throw new Error("Session not found");
    }

    if (existing.userId !== userId) {
      throw new Error("Not authorized to update this session");
    }

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: data as Prisma.SessionUpdateInput,
    });

    return session;
  } catch (err) {
    handleError("updateSession", err);
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify ownership
    const existing = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!existing) {
      throw new Error("Session not found");
    }

    if (existing.userId !== userId) {
      throw new Error("Not authorized to delete this session");
    }

    await prisma.session.delete({
      where: { id: sessionId },
    });

    return { success: true, id: sessionId };
  } catch (err) {
    handleError("deleteSession", err);
  }
}

/**
 * Delete all sessions for the current user
 */
export async function deleteAllSessions() {
  try {
    const userId = await getUserIdOrThrow();

    const result = await prisma.session.deleteMany({
      where: { userId },
    });

    return { success: true, count: result.count };
  } catch (err) {
    handleError("deleteAllSessions", err);
  }
}

// ==================== MESSAGE ACTIONS ====================

/**
 * Get all messages for a session
 */
export async function getSessionMessages(sessionId: string) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify session ownership
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to access this session");
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      include: {
        toolSnapshots: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return messages;
  } catch (err) {
    handleError("getSessionMessages", err);
  }
}
/**
 * Delete a single message
 */
export async function deleteMessage(messageId: string) {
  try {
    if (!messageId) throw new Error("messageId is required");

    const userId = await getUserIdOrThrow();

    // Verify message ownership via session
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      include: { session: true },
    });

    if (!existing) {
      throw new Error("Message not found");
    }

    if (existing.session.userId !== userId) {
      throw new Error("Not authorized to delete this message");
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    return { success: true, id: messageId };
  } catch (err) {
    handleError("deleteMessage", err);
  }
}

/**
 * Delete all messages in a session
 */
export async function deleteSessionMessages(sessionId: string) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify session ownership
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to delete messages from this session");
    }

    const result = await prisma.message.deleteMany({
      where: { sessionId },
    });

    return { success: true, count: result.count };
  } catch (err) {
    handleError("deleteSessionMessages", err);
  }
}

/**
 * Save messages with tool snapshots to the database
 * Following AI SDK v5 best practices for message persistence
 */
export async function saveMessagesToSession(
  sessionId: string,
  messages: UIMessage[],
  toolResults?: AssistantToolResult[]
) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify session ownership
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to save messages to this session");
    }

    // Update session's updatedAt
    await prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    let assistantMessageId: string | null = null;

    // Save messages
    for (const message of messages) {
      // Check if message already exists
      const existingMessage = await prisma.message.findUnique({
        where: { id: message.id },
      });

      if (!existingMessage) {
        // Extract text content from message parts
        const textContent = message.parts
          .filter((part) => part.type === "text")
          .map((part) => {
            if (part.type === "text" && "text" in part) {
              return part.text;
            }
            return "";
          })
          .join("\n");

        // Create new message
        const savedMessage = await prisma.message.create({
          data: {
            id: message.id,
            role: message.role,
            content: textContent,
            sessionId,
          },
        });

        // Keep track of the assistant message ID for tool snapshots
        if (message.role === "assistant") {
          assistantMessageId = savedMessage.id;
        }
      } else {
        // If this is an existing assistant message, we can still use it for tool snapshots
        if (existingMessage.role === "assistant") {
          assistantMessageId = existingMessage.id;
        }
      }
    }

    // Save tool snapshots - associate them with the assistant message
    if (assistantMessageId && toolResults && toolResults.length > 0) {
      for (const toolResult of toolResults) {
        try {
          // Check if this tool snapshot already exists
          const existingSnapshot = await prisma.toolSnapshot.findFirst({
            where: {
              messageId: assistantMessageId,
              toolName: toolResult.toolName,
              // Optionally check if input/output are the same to avoid duplicates
            },
          });

          if (!existingSnapshot) {
            // Sanitize input and output to remove null bytes and problematic characters
            const sanitizedInput = sanitizeJsonForPostgres(toolResult.input ?? null);
            const sanitizedOutput = sanitizeJsonForPostgres(toolResult.output ?? null);

            await prisma.toolSnapshot.create({
              data: {
                toolName: toolResult.toolName,
                input: sanitizedInput as Prisma.InputJsonValue,
                output: sanitizedOutput as Prisma.InputJsonValue,
                isExecuted: toolResult.isExecuted ?? true,
                messageId: assistantMessageId,
              },
            });
          }
        } catch (toolError) {
          console.error(
            `Error saving tool snapshot ${toolResult.toolName}:`,
            toolError
          );
          // Continue with other tool results even if one fails
        }
      }
    }

    return { success: true };
  } catch (err) {
    handleError("saveMessagesToSession", err);
  }
}

// ==================== STREAM OPERATIONS ====================

/**
 * Update the active stream ID for a session
 * Used for resumable streams
 */
export async function updateActiveStreamId(
  sessionId: string,
  activeStreamId: string | null
) {
  try {
    if (!sessionId) throw new Error("sessionId is required");

    const userId = await getUserIdOrThrow();

    // Verify session ownership
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.userId !== userId) {
      throw new Error("Not authorized to update this session");
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        activeStreamId,
        updatedAt: new Date(),
      },
    });

    return { success: true };
  } catch (err) {
    handleError("updateActiveStreamId", err);
  }
}