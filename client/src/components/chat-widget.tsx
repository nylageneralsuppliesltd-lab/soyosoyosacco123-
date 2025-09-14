import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, X, Minimize2, Camera } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [isImageMode, setIsImageMode] = useState(false);
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

  const imageMutation = useMutation({
    mutationFn: async ({ prompt, conversationId }: { prompt: string; conversationId?: string }) => {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, conversationId })
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate image");
      }
      
      return response.json() as Promise<{ imageUrl: string; prompt: string; success: boolean }>;
    },
    onSuccess: (data, variables) => {
      setMessages(prev => [...prev, 
        {
          id: Date.now().toString(),
          content: `🎨 Generate image: ${variables.prompt}`,
          role: "user",
          timestamp: new Date()
        },
        {
          id: (Date.now() + 1).toString(),
          content: `🖼️ **Generated Image** 📸\n\n![Generated image](${data.imageUrl})\n\n*Prompt: ${data.prompt}*`,
          role: "assistant", 
          timestamp: new Date()
        }
      ]);
      setInputMessage("");
      setIsImageMode(false);
    }
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;
    
    if (isImageMode) {
      imageMutation.mutate({
        prompt: inputMessage,
        conversationId: conversationId || undefined
      });
    } else {
      chatMutation.mutate({
        message: inputMessage,
        conversationId: conversationId || undefined
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // SOYOSOYO SACCO Logo SVG (Compact version for badge)
  const SaccoLogo = () => (
    <svg width="16" height="16" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="95" fill="#7dd3c0"/>
      <circle cx="100" cy="100" r="75" fill="#1e7b85"/>
      <path d="M100 40 L100 40 C120 45, 130 55, 130 75 L130 125 C130 145, 120 155, 100 160 C80 155, 70 145, 70 125 L70 75 C70 55, 80 45, 100 40 Z" fill="white"/>
      <text x="100" y="85" textAnchor="middle" fill="#1e7b85" fontSize="16" fontWeight="bold" fontFamily="Arial, sans-serif">SACCO</text>
      <g transform="translate(130, 70)">
        <circle cx="0" cy="0" r="12" fill="#1e7b85"/>
        <path d="M-6 -2 L6 -2 L6 2 L-6 2 Z" fill="white"/>
        <path d="M-2 -6 L2 -6 L2 6 L-2 6 Z" fill="white"/>
      </g>
    </svg>
  );

  // Chat Button with avatar - fixed position that follows scroll
  if (!isOpen) {
    return (
      <div className="fixed top-1/2 right-4 transform -translate-y-1/2 z-50">
        <div className="relative group">
          <Button
            onClick={() => setIsOpen(true)}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 shadow-lg hover:shadow-xl transition-all duration-300 p-0 border-2 border-white overflow-hidden"
            size="lg"
          >
            <img 
              src="/attached_assets/Screenshot 2025-06-02 085323_1754841331497.png"
              alt="SOYOSOYO SACCO Assistant"
              className="w-full h-full object-cover rounded-full"
            />
          </Button>
          
          {/* Hover tooltip */}
          <div className="absolute right-20 top-1/2 transform -translate-y-1/2 bg-black text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            Chat with SOYOSOYO SACCO Assistant
            <div className="absolute right-0 top-1/2 transform translate-x-1 -translate-y-1/2 w-0 h-0 border-l-4 border-l-black border-t-2 border-t-transparent border-b-2 border-b-transparent"></div>
          </div>
          
          {/* Logo badge */}
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
            <SaccoLogo />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-1/2 right-4 transform -translate-y-1/2 z-50">
      <Card className={`w-96 h-[500px] shadow-2xl border-green-500/20 transition-all duration-300 ${isMinimized ? "h-16" : "h-[500px]"}`}>
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
              <ScrollArea className="h-80 p-4">
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
                          {message.role === "assistant" ? (
                            <div className="markdown-content">
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
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            message.content
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(chatMutation.isPending || imageMutation.isPending) && (
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
                          {imageMutation.isPending && (
                            <p className="mt-2 text-xs text-gray-600">🎨 Generating image...</p>
                          )}
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
                <div className="flex-1">
                  <Input
                    placeholder={isImageMode ? "Describe the image you want to generate..." : "Ask about loans, savings, membership..."}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={chatMutation.isPending || imageMutation.isPending}
                    className="w-full"
                  />
                  {isImageMode && (
                    <p className="text-xs text-gray-500 mt-1">🎨 Image mode - Click camera again to switch back to chat</p>
                  )}
                </div>
                <Button
                  onClick={() => setIsImageMode(!isImageMode)}
                  variant={isImageMode ? "default" : "outline"}
                  size="sm"
                  className={isImageMode ? "bg-purple-500 hover:bg-purple-600" : ""}
                >
                  <Camera className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || chatMutation.isPending || imageMutation.isPending}
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