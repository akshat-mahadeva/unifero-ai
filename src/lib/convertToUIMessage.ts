import { DeepSearchDBMessage, DeepSearchUIMessage } from "@/types/deep-search";
import { UIMessage } from "ai";

/**
 * Interface for the message structure from the database
 */
interface DatabaseMessage {
  id: string;
  role: string;
  content?: string;
  toolSnapshots?: Array<{
    toolName: string;
    isExecuted: boolean;
    input: unknown;
    output: unknown;
  }>;
}

/**
 * Convert database messages to UIMessage format
 * @param messages Array of database messages
 * @returns Array of UIMessage objects
 */
export const convertToUIMessages = (
  messages: DatabaseMessage[]
): UIMessage[] => {
  return messages.map((m) => ({
    id: m.id,
    role: (["system", "user", "assistant"].includes(m.role)
      ? (m.role as "system" | "user" | "assistant")
      : "user") as "system" | "user" | "assistant",
    parts: [
      ...(m.toolSnapshots ?? []).map((ts) => ({
        type: "tool-" + ts.toolName,
        state: ts.isExecuted ? "output-available" : "output-error",
        input: ts.input,
        output: ts.output,
      })),
      {
        type: "text",
        text: m.content ?? "" + m.toolSnapshots?.toString(),
      },
    ],
  })) as UIMessage[];
};

/**
 * Convert a single database message to UIMessage format
 * @param message Single database message
 * @returns UIMessage object
 */
export const convertSingleToUIMessage = (
  message: DatabaseMessage
): UIMessage => {
  return {
    id: message.id,
    role: (["system", "user", "assistant"].includes(message.role)
      ? (message.role as "system" | "user" | "assistant")
      : "user") as "system" | "user" | "assistant",
    parts: [
      ...(message.toolSnapshots ?? []).map((ts) => ({
        type: "tool-" + ts.toolName,
        state: ts.isExecuted ? "output-available" : "output-error",
        input: ts.input,
        output: ts.output,
      })),
      {
        type: "text",
        text: message.content ?? "" + message.toolSnapshots?.toString(),
      },
    ],
  } as UIMessage;
};

// lib/convertToUIMessage.ts
export const convertToDeepSearchUIMessages = (
  messages: DeepSearchDBMessage[]
): DeepSearchUIMessage[] => {
  return messages.map((m) => {
    // Prisma returns capitalized property names: DeepSearchStep, DeepSearchSource
    const steps = m.DeepSearchStep || m.deepSearchSteps || [];
    const sources = m.DeepSearchSource || m.deepSearchSources || [];
    const deepSearchReport = steps.find(
      (step) => step.type.toLowerCase() === "report"
    );

    // console.log("Deep Search Report: ", deepSearchReport?.output);

    // Check if this message has deep search data (steps or sources)
    const hasDeepSearchData = steps.length > 0 || sources.length > 0;

    const parts = [
      // Add deepSearchDataPart if there's deep search data
      ...(hasDeepSearchData && m.isDeepSearchInitiated
        ? [
            {
              type: "data-deepSearchDataPart" as const,
              data: {
                progress: m.progress ?? 0,
                isDeepSearchInitiated: true,
              },
            },
          ]
        : []),
      // Add report part if there's a report step
      ...(deepSearchReport
        ? [
            {
              type: "data-deepSearchReportPart" as const,
              data: {
                reportText:
                  (deepSearchReport?.output as { report: string })?.report ||
                  "",
              },
            },
          ]
        : []),
      ...steps.map((step) => {
        const stepSources = sources.filter((s) => s.stepId === step.id);

        return {
          type: "data-deepSearchReasoningPart" as const,
          id: step.id,
          data: {
            stepId: step.id,
            reasoningText: step.reasoningText ?? "",
            reasoningType: step.type.toLowerCase() as
              | "analysis"
              | "search"
              | "evaluation"
              | "report",
            // Add search array for search-type steps with sources for this step
            ...(step.type.toLowerCase() === "search" && stepSources.length > 0
              ? {
                  search: stepSources.map((source) => ({
                    title: source.name,
                    url: source.url,
                    favicon: source.favicon || "",
                  })),
                }
              : {}),
          },
        };
      }),
      // Add source parts - deduplicate by URL to avoid showing same source multiple times
      ...Array.from(
        new Map(
          sources.map((source) => [
            source.url, // Use URL as unique key
            {
              type: "data-deepSearchSourcePart" as const,
              id: source.id!,
              data: {
                stepId: source.stepId,
                name: source.name,
                url: source.url,
                content: source.content ?? "",
                favicon: source.favicon ?? "",
                images: source.images,
              },
            },
          ])
        ).values()
      ),
      // Add text content
      {
        type: "text" as const,
        text: m.content ?? "",
      },
    ];

    return {
      id: m.id!,
      role: ["system", "user", "assistant"].includes(m.role)
        ? (m.role as "system" | "user" | "assistant")
        : "user",
      metadata: {
        progress: m.progress ?? 0,
        isDeepSearchInitiated: hasDeepSearchData || m.isDeepSearchInitiated,
      },
      parts,
    };
  }) as DeepSearchUIMessage[];
};
