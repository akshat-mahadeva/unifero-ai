// app/api/deep-search/route.ts
import {
  getOrCreateDeepSearchSessionById,
  saveDeepSearchMessagesToSession,
  createAssistantMessage,
  updateAssistantMessageContent,
  updateActiveStreamId,
} from "@/actions/deep-search.actions";

import {
  generateId,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  streamText,
  stepCountIs,
  smoothStream,
} from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { after } from "next/server";
import { DeepSearchUIMessage } from "@/types/deep-search";
import { openai } from "@ai-sdk/openai";
import { getTools } from "@/lib/agent/deep-search";
import { convertToDeepSearchUIMessages } from "@/lib/convertToUIMessage";
import { createProgressManager } from "@/lib/agent/progress-manager";

export async function POST(req: Request) {
  try {
    const { model, sessionId, prompt } = await req.json();

    if (!sessionId || !model || !prompt) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Get or create session first
    await getOrCreateDeepSearchSessionById(sessionId, prompt.slice(0, 50));

    // Save user message first
    await saveDeepSearchMessagesToSession(sessionId, [
      {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ]);

    const assistantMessage = await createAssistantMessage(sessionId, false);
    const assistantMessageId = assistantMessage.id;

    // Re-fetch session to get the latest messages including the one we just saved
    const updatedSession = await getOrCreateDeepSearchSessionById(sessionId);
    
    // Convert messages but exclude the current assistant message's steps/sources
    // (they will be streamed fresh, not loaded from DB)
    const safeMessages = convertToDeepSearchUIMessages(
      updatedSession.messages ?? []
    ).map((msg) => {
      // If this is the current assistant message, strip out steps/sources
      // They will be added fresh during streaming
      if (msg.id === assistantMessageId) {
        return {
          ...msg,
          parts: msg.parts.filter(
            (part) =>
              part.type !== "data-deepSearchReasoningPart" &&
              part.type !== "data-deepSearchSourcePart" &&
              part.type !== "data-deepSearchReportPart"
          ),
        };
      }
      return msg;
    });
    
    const convertedMessages = convertToModelMessages(safeMessages);

    const stream = createUIMessageStream<DeepSearchUIMessage>({
      generateId: () => assistantMessageId,
      originalMessages: safeMessages,
      execute: async ({ writer }) => {
        // Initialize progress manager
        const progressManager = await createProgressManager(
          assistantMessageId,
          sessionId
        );

        const agent = streamText({
          model: openai("gpt-4o-mini"),
          messages: [
            {
              role: "system",
              content: `
You are a research assistant.

WORKFLOW:
1. Call analyzeQueryTool first.
2. If needsDeepSearch=true: Call webSearchTool for each query in parallel, then synthesizeTool, then generateReportTool.
3. If false: Answer directly.

RULES:
- analyzeQueryTool: Always first, once only.
- webSearchTool: Only if deep search needed, call one at a time and do use synthesizeTool to check if further search needed.
- synthesizeTool: After all searches and check if further search needed.
- generateReportTool: Last, for final report for search.
- Be efficient, no unnecessary tools.
- after report generation just summarise within 4 lines no additional information
`,
            },
            ...convertedMessages,
          ],
          tools: getTools(writer, sessionId, assistantMessageId),
          experimental_transform: smoothStream({
            delayInMs: 2,
            chunking: "word",
          }),
          stopWhen: stepCountIs(10),
          onStepFinish: async ({ toolCalls, toolResults }) => {
            for (const toolCall of toolCalls) {
              // Check if this was the analysis tool
              if (toolCall.toolName === "analyzeQueryTool") {
                const result = toolResults.find(
                  (r) => r.toolCallId === toolCall.toolCallId
                );

                if (result?.output) {
                  const analysisResult = result.output as {
                    needsDeepSearch: boolean;
                    searchQueries?: string[];
                  };

                  if (analysisResult.needsDeepSearch) {
                    // Initialize progress tracking
                    const searchCount =
                      analysisResult.searchQueries?.length || 1;
                    await progressManager.initialize(searchCount);
                  } else {
                    // Simple response - mark complete immediately
                    await progressManager.markComplete();
                  }
                }
              }
            }
          },

          onFinish: async ({ text }) => {
            // Save final text content
            if (text) {
              await updateAssistantMessageContent(assistantMessageId, text);
            }

            // Get current state and mark complete if deep search
            const state = await progressManager.getState();
            if (state.isDeepSearch && !state.isComplete) {
              await progressManager.markComplete();
              await progressManager.emitProgress(writer, "Complete", "done");
            }
          },
        });
        // write the start marker (id must be the same across start/delta/end)
        writer.write({
          type: "text-start",
          id: assistantMessageId,
        });

        // stream the text chunks (agent.textStream is async)
        for await (const chunk of agent.textStream) {
          writer.write({
            type: "text-delta", // incremental chunk event
            id: assistantMessageId, // same id as the text-start above
            delta: chunk, // use `delta` (not `text`)
          });
        }

        // write the end marker
        writer.write({
          type: "text-end",
          id: assistantMessageId,
        });

        // writer.merge(agent.toUIMessageStream());
      },

      onFinish: async () => {
        await updateActiveStreamId(sessionId, null);
      },
    });

    return createUIMessageStreamResponse({
      stream,

      async consumeSseStream({ stream }) {
        console.log("Stream: ", stream);
        const streamId = generateId();
        const streamContext = createResumableStreamContext({
          waitUntil: after,
        });

        try {
          await streamContext.createNewResumableStream(streamId, () => stream);
          await updateActiveStreamId(sessionId, streamId);
        } catch (err) {
          console.error("Error creating resumable stream:", err);
          await updateActiveStreamId(sessionId, null);
          throw err;
        }
      },
    });
  } catch (error) {
    console.error("API route error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
