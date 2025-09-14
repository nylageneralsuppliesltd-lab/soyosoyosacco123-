import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Bot, User } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatRequest, ChatResponse } from "@shared/schema";

interface ChatTestingProps {
  expanded?: boolean;
}

interface TestMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

export default function ChatTesting({ expanded = false }: ChatTestingProps) {
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [model, setModel] = useState("gpt-4o");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [testMessages, setTestMessages] = useState<TestMessage[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const chatMutation = useMutation({
    mutationFn: async (request: ChatRequest): Promise<ChatResponse> => {
      const res = await apiRequest("POST", "/api/chat", request);
      return res.json();
    },
    onSuccess: (response) => {
      // Add assistant message
      setTestMessages(prev => [...prev, {
        id: response.messageId,
        content: response.response,
        role: "assistant",
        timestamp: new Date()
      }]);
      setConversationId(response.conversationId);
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim()) return;

    // Add user message immediately
    const userMessage: TestMessage = {
      id: `user-${Date.now()}`,
      content: message,
      role: "user",
      timestamp: new Date()
    };
    setTestMessages(prev => [...prev, userMessage]);

    // Send to API
    chatMutation.mutate({
      message,
      conversationId: conversationId || undefined,
      includeContext,
    });

    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setTestMessages([]);
    setConversationId(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">SOYOSOYO SACCO Assistant</h3>
            <p className="text-slate-600 text-sm mt-1">Chat with your AI assistant for SACCO services</p>
          </div>
          {testMessages.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearChat}>
              Clear Chat
            </Button>
          )}
        </div>
      </div>
      
      <div className={`flex flex-col ${expanded ? "h-[600px]" : "h-96"}`}>
        {/* Messages */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50">
          {testMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <Bot className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p>Hello! I'm SOYOSOYO SACCO Assistant. How can I help you today?</p>
              </div>
            </div>
          ) : (
            testMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex items-start space-x-2 max-w-xs lg:max-w-md ${
                  msg.role === "user" ? "flex-row-reverse space-x-reverse" : ""
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user" 
                      ? "bg-blue-600" 
                      : "bg-white border border-slate-200"
                  }`}>
                    {msg.role === "user" ? (
                      <User className="h-4 w-4 text-white" />
                    ) : (
                      <Bot className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                  <div className={`px-4 py-2 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-slate-200"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            strong: ({ children }) => <strong className="font-bold text-green-700">{children}</strong>,
                            p: ({ children }) => <p className="mb-2">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                            h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-2 max-w-xs">
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-slate-600" />
                </div>
                <div className="bg-white border border-slate-200 px-4 py-2 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Input */}
        <div className="p-6 border-t border-slate-200">
          <div className="flex space-x-3">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a test message..."
              disabled={chatMutation.isPending}
              className="flex-1"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={!message.trim() || chatMutation.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center mt-3 space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="context"
                checked={includeContext}
                onCheckedChange={(checked) => setIncludeContext(checked === true)}
              />
              <label htmlFor="context" className="text-sm text-slate-600">
                Include context
              </label>
            </div>
            
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-3.5">GPT-3.5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
