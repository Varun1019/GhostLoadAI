"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/ui/Button";
import { Badge } from "@/ui/Badge";
import Link from "next/link";

interface Message {
  role: "user" | "model";
  content: string;
  time?: string;
}

const QUICK_PROMPTS = [
  "How does GhostLoad solve emergency disruptions?",
  "Explain how seller Trust Scores are calculated",
  "What is the 24-hour capacity reservation hold?",
  "How do two-factor delivery & quality ratings work?",
];

export default function ChatPage() {
  const { user, apiBase } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content:
        "Hello! I am GhostLoad AI Copilot, powered by Google Gemini. I can assist with supplier capacity discovery, emergency recovery plans, trust scores, and parts procurement. What would you like to explore?",
      time: "Just now",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState("Google Gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demo-User": user?.id || "buyer-1",
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      if (data.provider) setActiveProvider(data.provider);

      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: data.reply || "I encountered an issue processing your request.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: "Network error communicating with AI server. Operating in offline mode.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto py-6 px-4 sm:px-6 w-full flex flex-col h-[calc(100vh-5rem)]">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#111111]">AI Procurement Copilot</h1>
            <Badge variant="blue">● {activeProvider}</Badge>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time supply chain guidance powered by Google Gemini.
          </p>
        </div>

        <Link
          href="/marketplace"
          className="text-xs text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
        >
          ← Back to marketplace
        </Link>
      </div>

      {/* Quick Prompt Chips */}
      <div className="py-3 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none border-b border-gray-100">
        <span className="text-gray-400 font-medium whitespace-nowrap">Suggested:</span>
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            disabled={loading}
            className="px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 whitespace-nowrap text-xs transition cursor-pointer"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.map((m, idx) => {
          const isUser = m.role === "user";
          return (
            <div
              key={idx}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold text-gray-500">
                  {isUser ? user?.name || "You" : "GhostLoad AI Copilot"}
                </span>
                {m.time && <span className="text-[10px] text-gray-400">{m.time}</span>}
              </div>

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-lg p-3.5 text-sm leading-relaxed ${
                  isUser
                    ? "bg-blue-50 border border-blue-200 text-gray-900"
                    : "bg-white border border-gray-200 text-gray-900 shadow-none"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-gray-500">GhostLoad AI Copilot</span>
              <span className="text-[10px] text-gray-400">Analyzing...</span>
            </div>
            <div className="p-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-500 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>Querying Google Gemini engine...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="pt-3 border-t border-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about spare supplier capacity, lead times, recovery algorithms..."
            className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-700"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? "Sending..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
