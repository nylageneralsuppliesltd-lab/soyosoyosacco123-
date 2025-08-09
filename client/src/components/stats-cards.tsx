import { MessageSquare, FileUp, Clock, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface StatsCardsProps {
  expanded?: boolean;
}

export default function StatsCards({ expanded = false }: StatsCardsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  const statsData = [
    {
      title: "Total Messages",
      value: (stats && typeof stats.totalMessages === 'number') ? stats.totalMessages : 0,
      change: "+12.5%",
      changeType: "positive" as const,
      icon: MessageSquare,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Files Processed",
      value: (stats && typeof stats.filesProcessed === 'number') ? stats.filesProcessed : 0,
      change: "+8.2%",
      changeType: "positive" as const,
      icon: FileUp,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      title: "Avg Response Time",
      value: (stats && typeof stats.avgResponseTime === 'number') ? `${Math.round(stats.avgResponseTime)}ms` : "0ms",
      change: "-5.3%",
      changeType: "positive" as const,
      icon: Clock,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      title: "Error Rate",
      value: (stats && typeof stats.errorRate === 'number') ? `${stats.errorRate.toFixed(1)}%` : "0.0%",
      change: "+0.8%",
      changeType: "negative" as const,
      icon: AlertTriangle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="animate-pulse">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
                <div className="ml-4 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-20"></div>
                  <div className="h-6 bg-slate-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.title} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center">
              <div className={`w-10 h-10 ${stat.iconBg} rounded-lg flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${stat.iconColor}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm text-slate-600">{stat.title}</p>
                <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className={`font-medium ${
                stat.changeType === "positive" ? "text-green-600" : "text-red-600"
              }`}>
                {stat.change}
              </span>
              <span className="text-slate-500 ml-1">from last week</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
