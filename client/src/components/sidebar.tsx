import { Bot, BarChart3, MessageSquare, Upload, History, Activity, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type ViewType = "overview" | "endpoints" | "testing" | "files" | "history" | "monitoring";

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const navigationItems = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "endpoints", label: "API Endpoints", icon: Plug },
  { id: "testing", label: "Chat Testing", icon: MessageSquare },
  { id: "files", label: "File Management", icon: Upload },
  { id: "history", label: "Conversation History", icon: History },
  { id: "monitoring", label: "Monitoring", icon: Activity },
] as const;

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  return (
    <div className="w-64 bg-white shadow-lg border-r border-slate-200 flex-shrink-0 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Chatbot API</h1>
            <p className="text-sm text-slate-500">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2 flex-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as ViewType)}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg w-full text-left transition-colors",
                currentView === item.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-green-700 font-medium">API Status: Online</span>
          </div>
          <p className="text-xs text-green-600 mt-1">
            Response time: {stats && typeof stats.avgResponseTime === 'number' ? `${Math.round(stats.avgResponseTime)}ms` : "Loading..."}
          </p>
        </div>
      </div>
    </div>
  );
}
