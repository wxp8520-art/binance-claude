"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SystemPage() {
  const [status, setStatus] = useState<{ status: string; mode: string; uptime_seconds: number } | null>(null);
  const [modeConfirm, setModeConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await api.getSystemStatus();
      if (res.success) setStatus(res.data as typeof status);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const togglePause = async () => {
    if (status?.status === "running") {
      await api.pauseSystem();
    } else {
      await api.resumeSystem();
    }
    const res = await api.getSystemStatus();
    if (res.success) setStatus(res.data as typeof status);
  };

  const switchMode = async () => {
    const newMode = status?.mode === "live" ? "testnet" : "live";
    await api.setMode(newMode);
    setModeConfirm(false);
    const res = await api.getSystemStatus();
    if (res.success) setStatus(res.data as typeof status);
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-medium text-[#e6edf3]">System Settings</h1>

      <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[#e6edf3] font-medium">Strategy Engine</p>
            <p className="text-[#8b949e] text-sm">
              Status: {status?.status || "loading"} | Uptime: {status ? formatUptime(status.uptime_seconds) : "-"}
            </p>
          </div>
          <button
            onClick={togglePause}
            className={`px-4 py-2 rounded text-sm font-medium ${
              status?.status === "running"
                ? "bg-[#d29922]/20 text-[#d29922] hover:bg-[#d29922]/30"
                : "bg-[#3fb950]/20 text-[#3fb950] hover:bg-[#3fb950]/30"
            }`}
          >
            {status?.status === "running" ? "Pause" : "Resume"}
          </button>
        </div>

        <div className="border-t border-[#30363d] pt-6 flex justify-between items-center">
          <div>
            <p className="text-[#e6edf3] font-medium">Trading Mode</p>
            <p className="text-[#8b949e] text-sm">
              Current: <span className={status?.mode === "live" ? "text-[#3fb950]" : "text-[#d29922]"}>
                {status?.mode === "live" ? "LIVE" : "TESTNET"}
              </span>
            </p>
          </div>
          <button
            onClick={() => {
              if (status?.mode === "testnet") {
                setModeConfirm(true);
              } else {
                switchMode();
              }
            }}
            className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm hover:text-[#e6edf3]"
          >
            Switch to {status?.mode === "live" ? "Testnet" : "Live"}
          </button>
        </div>
      </div>

      {/* Live Mode Confirmation */}
      {modeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 max-w-sm">
            <h3 className="text-[#f85149] font-medium mb-2">Switch to LIVE Mode</h3>
            <p className="text-[#8b949e] text-sm mb-4">
              You are about to switch to live trading with real funds. Make sure your API keys are correctly configured and you understand the risks.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModeConfirm(false)}
                className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={switchMode}
                className="px-4 py-2 bg-[#f85149] text-white rounded text-sm"
              >
                Confirm Switch to Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
