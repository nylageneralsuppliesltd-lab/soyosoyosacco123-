import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Upload, AlertTriangle, MessageSquare, Activity } from "lucide-react";
import type { ApiLog } from "@shared/schema";

interface ActivityFeedProps {
  expanded?: boolean;
}

export default function ActivityFeed({ expanded = false }: ActivityFeedProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/activity"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const getActivityIcon = (endpoint: string, statusCode: number) => {
    if (statusCode >= 400) {
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    }
    
    if (endpoint.includes("/chat")) {
      return <MessageSquare className="h-4 w-4 text-green-600" />;
    }
    
    if (endpoint.includes("/upload")) {
      return <Upload className="h-4 w-4 text-blue-600" />;
    }
    
    return <Activity className="h-4 w-4 text-green-600" />;
  };

  const getActivityIconBg = (endpoint: string, statusCode: number) => {
    if (statusCode >= 400) {
      return "bg-amber-100";
    }
    
    if (endpoint.includes("/chat")) {
      return "bg-green-100";
    }
    
    if (endpoint.includes("/upload")) {
      return "bg-blue-100";
    }
    
    return "bg-green-100";
  };

  const getActivityDescription = (endpoint: string, method: string, statusCode: number) => {
    if (endpoint.includes("/chat")) {
      return statusCode >= 400 ? "Chat message failed" : "Chat message processed successfully";
    }
    
    if (endpoint.includes("/upload")) {
      return statusCode >= 400 ? "File upload failed" : "File uploaded and processed";
    }
    
    if (endpoint.includes("/stats")) {
      return "API statistics requested";
    }
    
    if (endpoint.includes("/conversations")) {
      return "Conversation data retrieved";
    }
    
    return `${method} ${endpoint}`;
  };

  const getStatusBadge = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-green-100 text-green-800">{statusCode}</Badge>;
    }
    
    if (statusCode >= 400 && statusCode < 500) {
      return <Badge className="bg-amber-100 text-amber-800">{statusCode}</Badge>;
    }
    
    if (statusCode >= 500) {
      return <Badge className="bg-red-100 text-red-800">{statusCode}</Badge>;
    }
    
    return <Badge className="bg-slate-100 text-slate-800">{statusCode}</Badge>;
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return "Just now";
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
          <p className="text-slate-600 text-sm mt-1">Latest API requests and system events</p>
        </div>
        <div className="divide-y divide-slate-200">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-6 flex items-center space-x-4">
              <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4 animate-pulse"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2 animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayedLogs = expanded ? logs : (logs || []).slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
            <p className="text-slate-600 text-sm mt-1">Latest API requests and system events</p>
          </div>
          {!expanded && (
            <Button variant="ghost" size="sm">
              View All →
            </Button>
          )}
        </div>
      </div>
      
      <div className="divide-y divide-slate-200">
        {displayedLogs?.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <Activity className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No activity to display</p>
            <p className="text-sm mt-1">API requests will appear here</p>
          </div>
        ) : (
          displayedLogs?.map((log: ApiLog) => (
            <div key={log.id} className="p-6 flex items-center space-x-4">
              <div className={`w-10 h-10 ${getActivityIconBg(log.endpoint, log.statusCode)} rounded-lg flex items-center justify-center`}>
                {getActivityIcon(log.endpoint, log.statusCode)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {getActivityDescription(log.endpoint, log.method, log.statusCode)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {log.method} {log.endpoint} • Response time: {log.responseTime}ms • {formatTimeAgo(log.timestamp.toString())}
                  {log.errorMessage && ` • Error: ${log.errorMessage}`}
                </p>
              </div>
              {getStatusBadge(log.statusCode)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
