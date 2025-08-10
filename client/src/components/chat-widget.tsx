import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, X, Minimize2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface ChatResponse {
  response: string;
  conversationId: string;
  messageId: string;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content: "Hello! I'm the SOYOSOYO SACCO Assistant. I can help you with information about our services, loans, savings products, and membership requirements. How can I assist you today?",
      role: "assistant",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async ({ message, conversationId }: { message: string; conversationId?: string }) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId, includeContext: true })
      });
      
      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      
      return response.json() as Promise<ChatResponse>;
    },
    onSuccess: (data, variables) => {
      setConversationId(data.conversationId);
      setMessages(prev => [...prev, 
        {
          id: Date.now().toString(),
          content: variables.message,
          role: "user",
          timestamp: new Date()
        },
        {
          id: data.messageId,
          content: data.response,
          role: "assistant",
          timestamp: new Date()
        }
      ]);
      setInputMessage("");
    }
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    
    chatMutation.mutate({
      message: inputMessage,
      conversationId: conversationId || undefined
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // SOYOSOYO SACCO Logo SVG
  const SaccoLogo = () => (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="16" fill="#22c55e"/>
      <path d="M8 12h16v8H8z" fill="white" fillOpacity="0.9"/>
      <circle cx="12" cy="16" r="2" fill="#22c55e"/>
      <circle cx="20" cy="16" r="2" fill="#22c55e"/>
      <path d="M10 20h12v2H10z" fill="white" fillOpacity="0.8"/>
      <text x="16" y="11" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">SACCO</text>
    </svg>
  );

  // Chat Button with floating animation
  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg hover:shadow-xl transition-all duration-300 animate-pulse"
          size="lg"
        >
          <div className="flex flex-col items-center">
            <SaccoLogo />
            <MessageCircle className="w-6 h-6 text-white mt-1" />
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Card className={`w-80 h-96 shadow-2xl border-green-500/20 transition-all duration-300 ${isMinimized ? "h-16" : "h-96"}`}>
        <CardHeader className="flex flex-row items-center justify-between p-4 bg-green-500 text-white rounded-t-lg">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src="" />
              <AvatarFallback className="bg-white text-green-600 text-xs font-bold">
                <SaccoLogo />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-sm">SOYOSOYO SACCO</h3>
              <p className="text-xs opacity-90">Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-white hover:bg-green-600 w-8 h-8 p-0"
            >
              <Minimize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-green-600 w-8 h-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        {!isMinimized && (
          <>
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-64 p-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex items-start gap-2 max-w-[75%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <Avatar className="w-6 h-6 flex-shrink-0">
                          {message.role === "assistant" ? (
                            <AvatarFallback className="bg-green-100 text-green-600">
                              <SaccoLogo />
                            </AvatarFallback>
                          ) : (
                            <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                              U
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div
                          className={`rounded-lg p-3 text-sm ${
                            message.role === "user"
                              ? "bg-blue-500 text-white ml-2"
                              : "bg-gray-100 text-gray-800 mr-2"
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-2 max-w-[75%]">
                        <Avatar className="w-6 h-6">
                          <AvatarFallback className="bg-green-100 text-green-600">
                            <SaccoLogo />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-gray-100 rounded-lg p-3 text-sm mr-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>
            </CardContent>
            
            <CardFooter className="p-4">
              <div className="flex w-full gap-2">
                <Input
                  placeholder="Ask about loans, savings, membership..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={chatMutation.isPending}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || chatMutation.isPending}
                  className="bg-green-500 hover:bg-green-600"
                  size="sm"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}