import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle, Send, X, Minimize2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface EmbedChatProps {
  apiBaseUrl?: string;
}

export function EmbedChat({ apiBaseUrl = "" }: EmbedChatProps) {
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
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message, 
          conversationId: conversationId || undefined, 
          includeContext: true 
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      
      const data = await response.json();
      setConversationId(data.conversationId);
      
      setMessages(prev => [...prev, 
        {
          id: Date.now().toString(),
          content: message,
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
      
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, 
        {
          id: Date.now().toString(),
          content: message,
          role: "user",
          timestamp: new Date()
        },
        {
          id: "error-" + Date.now(),
          content: "I'm sorry, I'm having trouble connecting right now. Please try again or visit soyosoyosacco.com for assistance.",
          role: "assistant",
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
      setInputMessage("");
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || isLoading) return;
    sendMessage(inputMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // SOYOSOYO SACCO Logo SVG Component
  const SaccoLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="16" fill="#22c55e"/>
      <path d="M8 12h16v8H8z" fill="white" fillOpacity="0.9"/>
      <circle cx="12" cy="16" r="2" fill="#22c55e"/>
      <circle cx="20" cy="16" r="2" fill="#22c55e"/>
      <path d="M10 20h12v2H10z" fill="white" fillOpacity="0.8"/>
      <text x="16" y="11" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">SACCO</text>
    </svg>
  );

  // Chat Button with floating animation - Light Green Fill
  if (!isOpen) {
    return (
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1000 }}>
        <Button
          onClick={() => setIsOpen(true)}
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            backgroundColor: "#22c55e",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            animation: "pulse 2s infinite"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#16a34a";
            e.currentTarget.style.boxShadow = "0 15px 35px rgba(0,0,0,0.3)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#22c55e";
            e.currentTarget.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <SaccoLogo className="w-8 h-8" />
            <MessageCircle style={{ width: "20px", height: "20px", color: "white" }} />
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1000 }}>
      <Card 
        style={{
          width: "350px",
          height: isMinimized ? "64px" : "450px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
          border: "1px solid #22c55e33",
          borderRadius: "12px",
          transition: "all 0.3s ease",
          overflow: "hidden"
        }}
      >
        <CardHeader 
          style={{
            padding: "16px",
            backgroundColor: "#22c55e",
            color: "white",
            borderRadius: "12px 12px 0 0",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Avatar style={{ width: "32px", height: "32px" }}>
              <AvatarFallback style={{ backgroundColor: "white", color: "#22c55e" }}>
                <SaccoLogo className="w-6 h-6" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 style={{ fontWeight: "600", fontSize: "14px", margin: 0 }}>SOYOSOYO SACCO</h3>
              <p style={{ fontSize: "12px", opacity: 0.9, margin: 0 }}>Assistant</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              onClick={() => setIsMinimized(!isMinimized)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px"
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#16a34a"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Minimize2 style={{ width: "16px", height: "16px" }} />
            </Button>
            <Button
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                cursor: "pointer",
                padding: "4px",
                borderRadius: "4px"
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#16a34a"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <X style={{ width: "16px", height: "16px" }} />
            </Button>
          </div>
        </CardHeader>
        
        {!isMinimized && (
          <>
            <CardContent style={{ padding: 0, flex: 1 }}>
              <ScrollArea style={{ height: "320px", padding: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        display: "flex",
                        justifyContent: message.role === "user" ? "flex-end" : "flex-start"
                      }}
                    >
                      <div 
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          maxWidth: "75%",
                          flexDirection: message.role === "user" ? "row-reverse" : "row"
                        }}
                      >
                        <Avatar style={{ width: "24px", height: "24px", flexShrink: 0 }}>
                          {message.role === "assistant" ? (
                            <AvatarFallback style={{ backgroundColor: "#22c55e1a", color: "#22c55e" }}>
                              <SaccoLogo className="w-4 h-4" />
                            </AvatarFallback>
                          ) : (
                            <AvatarFallback style={{ backgroundColor: "#3b82f61a", color: "#3b82f6", fontSize: "10px" }}>
                              U
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div
                          style={{
                            borderRadius: "12px",
                            padding: "12px",
                            fontSize: "14px",
                            lineHeight: "1.4",
                            backgroundColor: message.role === "user" ? "#3b82f6" : "#f3f4f6",
                            color: message.role === "user" ? "white" : "#374151",
                            margin: message.role === "user" ? "0 0 0 8px" : "0 8px 0 0"
                          }}
                        >
                          {message.role === "assistant" ? (
                            <ReactMarkdown 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p style={{ margin: "0 0 8px 0" }}>{children}</p>,
                                strong: ({ children }) => <strong style={{ fontWeight: "bold", color: "#16a34a" }}>{children}</strong>,
                                table: ({ children }) => <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1d5db", margin: "8px 0", fontSize: "12px" }}>{children}</table>,
                                th: ({ children }) => <th style={{ border: "1px solid #d1d5db", padding: "4px 8px", backgroundColor: "#f9fafb", fontWeight: "600", textAlign: "left" }}>{children}</th>,
                                td: ({ children }) => <td style={{ border: "1px solid #d1d5db", padding: "4px 8px" }}>{children}</td>,
                                ul: ({ children }) => <ul style={{ listStyleType: "disc", paddingLeft: "16px", margin: "0 0 8px 0" }}>{children}</ul>,
                                li: ({ children }) => <li style={{ marginBottom: "4px" }}>{children}</li>
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          ) : (
                            message.content
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", maxWidth: "75%" }}>
                        <Avatar style={{ width: "24px", height: "24px" }}>
                          <AvatarFallback style={{ backgroundColor: "#22c55e1a", color: "#22c55e" }}>
                            <SaccoLogo className="w-4 h-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div 
                          style={{
                            backgroundColor: "#f3f4f6",
                            borderRadius: "12px",
                            padding: "12px",
                            margin: "0 8px 0 0"
                          }}
                        >
                          <div style={{ display: "flex", gap: "4px" }}>
                            {[0, 0.1, 0.2].map((delay, i) => (
                              <div
                                key={i}
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  backgroundColor: "#22c55e",
                                  borderRadius: "50%",
                                  animation: `bounce 1.4s ease-in-out ${delay}s infinite both`
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>
            </CardContent>
            
            <CardFooter style={{ padding: "16px" }}>
              <div style={{ display: "flex", width: "100%", gap: "8px" }}>
                <Input
                  placeholder="Ask about loans, savings, membership..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                  style={{ flex: 1 }}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  style={{
                    backgroundColor: "#22c55e",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    cursor: inputMessage.trim() && !isLoading ? "pointer" : "not-allowed",
                    opacity: inputMessage.trim() && !isLoading ? 1 : 0.5
                  }}
                  onMouseOver={(e) => {
                    if (inputMessage.trim() && !isLoading) {
                      e.currentTarget.style.backgroundColor = "#16a34a";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (inputMessage.trim() && !isLoading) {
                      e.currentTarget.style.backgroundColor = "#22c55e";
                    }
                  }}
                >
                  <Send style={{ width: "16px", height: "16px" }} />
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>
      
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes bounce {
          0%, 80%, 100% { 
            transform: scale(0);
            opacity: 0.5;
          } 
          40% { 
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}