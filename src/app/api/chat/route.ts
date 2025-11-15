import {
  getOrCreateSessionById,
  saveMessagesToSession,
} from "@/actions/chat.actions";
import { AssistantToolResult, collectToolResult } from "@/lib/helpers";
import { tools } from "@/lib/tools";
import { openai } from "@ai-sdk/openai";
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  convertToModelMessages,
  UIMessage,
  ToolResultPart,
} from "ai";

type StreamStep = {
  toolResults?: unknown[];
  toolCalls?: unknown[];
};

export async function POST(req: Request) {
  try {
    const { model, sessionId, prompt } = await req.json();

    const assistantToolResults: AssistantToolResult[] = [];

    // Validate required fields
    if (!sessionId) {
      return new Response("sessionId is required", { status: 400 });
    }

    if (!model) {
      return new Response("model is required", { status: 400 });
    }

    if (!prompt) {
      return new Response("prompt is required", { status: 400 });
    }

    // Get or create session with messages
    const currentSession = await getOrCreateSessionById(
      sessionId,
      prompt.slice(0, 20)
    );

    // Convert stored messages to CoreMessage format
    const safeMessages: UIMessage[] = (currentSession.messages ?? [])
      .slice(-10)
      .map((m, idx) => ({
        id: m.id ?? `msg-${idx}`,
        role: (["system", "user", "assistant"].includes(m.role)
          ? (m.role as "system" | "user" | "assistant")
          : "user") as "system" | "user" | "assistant",
        parts: [
          {
            type: "text",
            text: m.content ?? "" + m.toolSnapshots.toString(),
          },
        ],
      })) as UIMessage[];

    // Compute converted messages once and log a compact preview so logs stay small.
    const convertedMessages = convertToModelMessages(safeMessages);

    const stream = createUIMessageStream({
      async execute({ writer }) {
        const result = streamText({
          system: `You are Unifero, a web search-powered AI assistant specialized in finding and delivering current, accurate information from the internet. Your primary strength is real-time web search - use it frequently to provide the most up-to-date and comprehensive answers.

## PRIMARY DIRECTIVE: SEARCH FIRST
You are designed to be a search-focused assistant. When in doubt, search. Your web search capability is your superpower - use it liberally to provide users with the freshest, most accurate information available.

## MANDATORY Web Search Scenarios:
- ANY factual question that could benefit from current data
- Recent events, news, trends (anything 2023+)
- Product information, prices, reviews, comparisons
- Company updates, stock prices, business news
- Sports scores, schedules, player stats, team news
- Weather, traffic, local information
- Website content, documentation, tutorials
- Technology updates, software releases, tech news
- Celebrity news, entertainment updates
- Political developments, election results
- Scientific discoveries, research findings
- Market data, cryptocurrency prices
- Travel information, hotel/restaurant reviews
- Health information, medical news (with disclaimers)
- Educational content, course information
- User asks for "latest", "current", "recent", "new", "updated" info

## OPTIONAL Web Search Scenarios (search when helpful):
- Historical facts (to verify accuracy)
- General knowledge questions (to provide richer context)
- Definitions or explanations (to supplement with examples)
- How-to guides (to find current best practices)
- Creative inspiration (to gather trending ideas)

## CONVERSATION-ONLY Scenarios (no search needed):
- Personal advice or opinion requests
- Creative writing or brainstorming
- Mathematical calculations
- Code debugging (unless looking for documentation)
- Philosophical discussions
- Hypothetical scenarios

## Response Strategy:
1. **Search First**: For most factual queries, immediately use web search
2. **Multiple Queries**: Don't hesitate to search multiple times for complex topics
3. **Rich Context**: Use search results to provide comprehensive, well-sourced answers
4. **Source Attribution**: Always cite sources with "[Title](URL)" format
5. **Fresh Perspective**: Combine multiple sources for balanced, current viewpoints

## Quality Standards:
- **Accuracy**: Cross-reference multiple sources when possible
- **Recency**: Prioritize the most recent information available
- **Comprehensiveness**: Provide detailed answers with proper context
- **Transparency**: Clearly indicate when information comes from web search vs. training
- **Reliability**: Use reputable sources and note any conflicts or uncertainties

Remember: You're not just an AI assistant - you're a real-time information gateway. Users come to you specifically for current, accurate, well-researched answers. Make every search count and deliver value through fresh, comprehensive information.`,
          model: openai(model),
          messages: [...convertedMessages, { role: "user", content: prompt }],
          tools: tools, // Only provide tools if web search is enabled
          stopWhen: stepCountIs(2),
          onStepFinish: async (step: StreamStep) => {
            const toolResults = step?.toolResults ?? [];
            const toolCalls = step?.toolCalls ?? [];
            if (!toolResults.length) return;

            for (const tr of toolResults) {
              try {
                collectToolResult(
                  tr as ToolResultPart,
                  toolCalls,
                  assistantToolResults
                );
              } catch (e: unknown) {
                console.error("Error collecting tool result:", e);
              }
            }
          },
        });

        writer.merge(result.toUIMessageStream({ sendReasoning: true }));
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Stream error:", error);
        return `Error: ${message}`;
      },
      onFinish: async ({ messages }) => {
        // Check if user message is already included
        const hasUserMessage = messages.some((m) => m.role === "user");

        let allMessages = messages;

        // If user message is not included, add it
        if (!hasUserMessage) {
          const userMessage: UIMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            parts: [
              {
                type: "text",
                text: prompt,
              },
            ],
          };
          allMessages = [userMessage, ...messages];
        }

        try {
          await saveMessagesToSession(
            sessionId,
            allMessages,
            assistantToolResults.length > 0 ? assistantToolResults : undefined
          );
        } catch (error) {
          console.error("Error saving messages to database:", error);
        }
      },
    });

    return createUIMessageStreamResponse({
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      stream,
    });
  } catch (error) {
    console.error("❌ API route error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
