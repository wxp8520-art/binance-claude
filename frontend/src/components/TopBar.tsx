"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface SystemStatus {
  status: string;
  mode: string;
  uptime_seconds: number;
}

interface Balance {
  total_balance: number;
  available_balance: number;
}

const statusColors: Record<string, string> = {
  running: "bg-[#3fb950]",
  paused: "bg-[#d29922]",
  error: "bg-[#f85149]",
};

export default function TopBar() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      const [statusRes, balanceRes] = await Promise.all([
        api.getSystemStatus(),
        api.getBalance(),
      ]);
      if (statusRes.success) setSystemStatus(statusRes.data as SystemStatus);
      if (balanceRes.success) setBalance(balanceRes.data as Balance);
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              statusColors[systemStatus?.status || "error"] || statusColors.error
            } animate-pulse`}
          />
          <span className="text-sm text-[#8b949e] capitalize">
            {systemStatus?.status || "loading"}
          </span>
        </div>

        {/* Mode badge */}
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            systemStatus?.mode === "live"
              ? "bg-[#3fb950]/20 text-[#3fb950]"
              : "bg-[#d29922]/20 text-[#d29922]"
          }`}
        >
          {systemStatus?.mode === "live" ? "LIVE" : "TESTNET"}
        </span>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-[#8b949e]">Balance: </span>
          <span className="text-[#e6edf3] font-mono">
            {balance?.total_balance?.toFixed(2) || "0.00"} U
          </span>
        </div>
        <div>
          <span className="text-[#8b949e]">Today PnL: </span>
          <span className="text-[#3fb950] font-mono">+0.00 U</span>
        </div>
      </div>
    </header>
  );
}
