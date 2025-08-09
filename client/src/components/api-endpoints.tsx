import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiEndpointsProps {
  expanded?: boolean;
}

const endpoints = [
  {
    method: "POST",
    path: "/api/chat",
    description: "Send a message to the chatbot and receive an AI response",
    methodColor: "bg-green-100 text-green-800",
    requestBody: `{
  "message": "Hello, how can you help me?",
  "conversationId": "uuid-string",
  "includeContext": true
}`,
    response: `{
  "response": "I'd be happy to help! How can I assist you today?",
  "conversationId": "uuid-string",
  "messageId": "uuid-string"
}`
  },
  {
    method: "POST",
    path: "/api/upload",
    description: "Upload and process files (documents, images, text)",
    methodColor: "bg-blue-100 text-blue-800",
    requestBody: `Form Data:
files: File[] (max 10MB each)
conversationId: string (optional)`,
    response: `{
  "message": "Files processed",
  "results": [
    {
      "fileId": "uuid-string",
      "fileName": "document.pdf",
      "extractedText": "...",
      "analysis": "...",
      "processed": true
    }
  ]
}`
  },
  {
    method: "GET",
    path: "/api/conversations/:id",
    description: "Retrieve conversation history and context",
    methodColor: "bg-purple-100 text-purple-800",
    response: `{
  "conversation": {...},
  "messages": [...],
  "files": [...]
}`
  },
  {
    method: "GET",
    path: "/api/stats",
    description: "Get API usage statistics",
    methodColor: "bg-amber-100 text-amber-800",
    response: `{
  "totalMessages": 2847,
  "filesProcessed": 431,
  "avgResponseTime": 247,
  "errorRate": 2.1
}`
  }
];

export default function ApiEndpoints({ expanded = false }: ApiEndpointsProps) {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const toggleEndpoint = (path: string) => {
    setExpandedEndpoint(expandedEndpoint === path ? null : path);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const displayedEndpoints = expanded ? endpoints : endpoints.slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">API Endpoints</h3>
        <p className="text-slate-600 text-sm mt-1">Available REST API endpoints</p>
      </div>
      <div className="p-6 space-y-4">
        {displayedEndpoints.map((endpoint) => (
          <div key={endpoint.path} className="border border-slate-200 rounded-lg">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Badge className={endpoint.methodColor}>
                    {endpoint.method}
                  </Badge>
                  <code className="text-sm font-mono text-slate-900">{endpoint.path}</code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleEndpoint(endpoint.path)}
                >
                  {expandedEndpoint === endpoint.path ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-slate-600 mt-2">{endpoint.description}</p>
              
              {expandedEndpoint === endpoint.path && (
                <div className="mt-4 space-y-4">
                  {endpoint.requestBody && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-700 text-sm">Request Body:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(endpoint.requestBody!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                        <code>{endpoint.requestBody}</code>
                      </pre>
                    </div>
                  )}
                  
                  {endpoint.response && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-700 text-sm">Response:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(endpoint.response!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                        <code>{endpoint.response}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {!expanded && (
          <Button
            variant="outline"
            className="w-full border-2 border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-600"
          >
            View All Endpoints
          </Button>
        )}
      </div>
    </div>
  );
}
