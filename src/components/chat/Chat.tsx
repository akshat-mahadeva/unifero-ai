"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Fragment, useEffect, useRef, useState } from "react";
import { UIMessage, useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { CopyIcon } from "lucide-react";
import { Action, Actions } from "@/components/ai-elements/actions";
import { models } from "@/lib/models";
import Image from "next/image";
import {
  WebSearchToolUIPart,
  WebSearchUIRenderer,
} from "./parts/WebsearchPart";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import ChatHeader from "./ChatHeader";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { useQueryClient } from "@tanstack/react-query";
import { sessionKeys } from "@/hooks/use-sessions-query";
import { usePathname } from "next/navigation";
import { getRandomSuggestions } from "@/lib/get-suggestions";
import { LoaderOne } from "../ui/loaders";
import { ChatSDKError } from "@/lib/errors";

const Chat = ({
  sessionId,
  initialMessages = [],
  sessionTitle,
}: {
  sessionId: string;
  initialMessages?: UIMessage[];
  sessionTitle?: string;
}) => {
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(models[0].value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const queryClient = useQueryClient();
  const pathname = usePathname();

  // Ref used to scroll the conversation to the bottom
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    try {
      bottomRef.current?.scrollIntoView({ behavior });
    } catch (err) {
      // ignore scrolling errors in environments that don't support it
      console.debug(err);
    }
  };

  // Dynamically determine if we're on the home page
  const isHomePage = pathname === "/" || pathname === "/web-search";

  // Initialize suggestions only on client side to avoid hydration mismatch
  useEffect(() => {
    if (isHomePage && initialMessages.length === 0) {
      setSuggestions(getRandomSuggestions(5));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [isHomePage, initialMessages.length]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: (request) => {
        // Get the prompt from the message being sent
        const lastMessage = request.messages[request.messages.length - 1];
        const prompt =
          lastMessage?.parts?.[0]?.type === "text"
            ? lastMessage.parts[0].text
            : "";

        const requestBody = {
          prompt: prompt,
          sessionId: sessionId,
          model: model,
        };
        return {
          body: requestBody,
        };
      },
    }),
    messages: initialMessages,
    onData: () => {
      if (
        window.location.pathname === "/" ||
        window.location.pathname === "/web-search"
      ) {
        window.history.replaceState({}, "", `/chat/${sessionId}`);
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: sessionKeys.detail(sessionId),
          });
        }, 100);
      }
      window.dispatchEvent(new CustomEvent("chat-history-updated"));
    },
    onFinish: () => {
      if (
        window.location.pathname === "/" ||
        window.location.pathname === "/web-search"
      ) {
        window.history.replaceState({}, "", `/chat/${sessionId}`);
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: sessionKeys.detail(sessionId),
          });
        }, 100);
      }
      window.dispatchEvent(new CustomEvent("chat-history-updated"));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast.error(error.message);
      } else {
        toast.error("An unexpected error occurred. Please try again.");
      }
    },
  });

  // Auto-scroll when messages change or when status updates (e.g., new message submitted)
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, status]);

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage({
      text: message.text || "Sent with attachments",
      files: message.files,
    });
    setInput("");
    // Hide suggestions after user sends a message
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({
      text: suggestion,
      files: [],
    });
    setInput("");
    // Hide suggestions after user selects a suggestion
    setShowSuggestions(false);
  };

  return (
    <div className=" relative w-full flex flex-col flex-1 overflow-hidden">
      <ChatHeader
        isHomePage={isHomePage}
        sessionId={sessionId}
        sessionTitle={sessionTitle}
      />
      <div className="flex flex-col flex-1 overflow-hidden max-w-4xl w-full mx-auto p-4">
        <Conversation className="flex-1 w-full">
          <ConversationContent className="w-full">
            {messages.length === 0 && isHomePage ? (
              <ConversationEmptyState
                className="my-auto"
                icon={
                  <Image
                    src={"/unifero.png"}
                    alt="Unifero Logo"
                    width={160}
                    height={160}
                    className=" mb-2"
                  />
                }
                title={
                  <TextGenerateEffect
                    words={"What's brewing in your mind today?"}
                    className="text-2xl"
                  />
                }
                description=""
              />
            ) : (
              messages.map((message) => (
                <div key={message.id}>
                  <Fragment>
                    <Message
                      from={message.role}
                      className="flex items-center gap-2 w-full"
                    >
                      <MessageContent>
                        {message.parts.map((part, i) => {
                          switch (part.type) {
                            case "tool-webSearchTool":
                              const webSearchPart = part as WebSearchToolUIPart;

                              return (
                                <WebSearchUIRenderer
                                  key={`${message.id}-${i}`}
                                  part={webSearchPart}
                                />
                              );
                            case "text":
                              return (
                                <Fragment key={`${message.id}-${i}`}>
                                  <Response>{part.text}</Response>

                                  {message.role === "assistant" &&
                                    i === messages.length - 1 && (
                                      <Actions className="mt-2">
                                        <Action
                                          onClick={() =>
                                            navigator.clipboard.writeText(
                                              part.text
                                            )
                                          }
                                          label="Copy"
                                        >
                                          <CopyIcon className="size-3" />
                                        </Action>
                                      </Actions>
                                    )}
                                </Fragment>
                              );
                            default:
                              return null;
                          }
                        })}
                      </MessageContent>
                    </Message>
                  </Fragment>
                </div>
              ))
            )}
            {status === "submitted" && (
              <div className="flex items-center text-sm gap-2">
                <LoaderOne />
              </div>
            )}
            <div ref={bottomRef} />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {isHomePage &&
          messages.length === 0 &&
          showSuggestions &&
          suggestions.length > 0 && (
            <div className="mb-4">
              <Suggestions>
                {suggestions.map((suggestion, index) => (
                  <Suggestion
                    key={`${suggestion}-${index}`}
                    suggestion={suggestion}
                    onClick={handleSuggestionClick}
                    className="whitespace-nowrap bg-transparent border text-xs"
                  />
                ))}
              </Suggestions>
            </div>
          )}

        <PromptInput
          onSubmit={handleSubmit}
          className="mt-4 p-1 rounded-sm border  shadow-none "
          globalDrop
          multiple
        >
          <PromptInputBody>
            <PromptInputTextarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
            />
          </PromptInputBody>
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem
                      key={model.value}
                      value={model.value}
                    >
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!input && !status} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default Chat;
