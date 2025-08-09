import { useState } from "react";
import Sidebar from "@/components/sidebar";
import StatsCards from "@/components/stats-cards";
import ApiEndpoints from "@/components/api-endpoints";
import ChatTesting from "@/components/chat-testing";
import FileUpload from "@/components/file-upload";
import ActivityFeed from "@/components/activity-feed";
import { Button } from "@/components/ui/button";
import { RefreshCw, Server } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ViewType = "overview" | "endpoints" | "testing" | "files" | "history" | "monitoring";

export default function Dashboard() {
  const [currentView, setCurrentView] = useState<ViewType>("overview");
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const renderContent = () => {
    switch (currentView) {
      case "overview":
        return (
          <div className="space-y-8">
            <StatsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ApiEndpoints />
              <ChatTesting />
            </div>
            <FileUpload />
            <ActivityFeed />
          </div>
        );
      case "endpoints":
        return <ApiEndpoints expanded={true} />;
      case "testing":
        return <ChatTesting expanded={true} />;
      case "files":
        return <FileUpload expanded={true} />;
      case "history":
        return <ActivityFeed expanded={true} />;
      case "monitoring":
        return <StatsCards expanded={true} />;
      default:
        return <div>View not implemented</div>;
    }
  };

  const getPageTitle = () => {
    switch (currentView) {
      case "overview": return "SOYOSOYO SACCO Assistant Dashboard";
      case "endpoints": return "API Endpoints";
      case "testing": return "SOYOSOYO SACCO Assistant";
      case "files": return "File Management";
      case "history": return "Conversation History";
      case "monitoring": return "System Monitoring";
      default: return "Dashboard";
    }
  };

  const getPageDescription = () => {
    switch (currentView) {
      case "overview": return "Monitor and manage SOYOSOYO SACCO Assistant services";
      case "endpoints": return "API endpoint documentation and testing";
      case "testing": return "Chat with SOYOSOYO SACCO Assistant for member services";
      case "files": return "Upload and process files for analysis";
      case "history": return "View conversation history and activity logs";
      case "monitoring": return "Performance metrics and system monitoring";
      default: return "Dashboard";
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{getPageTitle()}</h2>
              <p className="text-slate-600 mt-1">{getPageDescription()}</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-lg">
                <Server className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600">
                  Server: <span className="font-mono">localhost:5000</span>
                </span>
              </div>
              <Button onClick={handleRefresh} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
