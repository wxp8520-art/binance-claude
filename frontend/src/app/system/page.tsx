"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SystemPage() {
  const [status, setStatus] = useState<{ status: string; mode: string; uptime_seconds: number } | null>(null);
  const [modeConfirm, setModeConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getSystemStatus();
        if (res.success) setStatus(res.data as typeof status);
      } catch { /* ignore */ }
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
    return `${h}小时 ${m}分钟`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-medium text-[#e6edf3]">系统设置</h1>

      <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[#e6edf3] font-medium">策略引擎</p>
            <p className="text-[#8b949e] text-sm">
              状态: {status?.status === "running" ? "运行中" : status?.status === "paused" ? "已暂停" : status?.status || "加载中"} | 运行时间: {status ? formatUptime(status.uptime_seconds) : "-"}
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
            {status?.status === "running" ? "暂停" : "恢复"}
          </button>
        </div>

        <div className="border-t border-[#30363d] pt-6 flex justify-between items-center">
          <div>
            <p className="text-[#e6edf3] font-medium">交易模式</p>
            <p className="text-[#8b949e] text-sm">
              当前: <span className={status?.mode === "live" ? "text-[#3fb950]" : "text-[#d29922]"}>
                {status?.mode === "live" ? "实盘" : "模拟盘"}
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
            切换至{status?.mode === "live" ? "模拟盘" : "实盘"}
          </button>
        </div>
      </div>

      {/* 实盘模式确认 */}
      {modeConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 max-w-sm">
            <h3 className="text-[#f85149] font-medium mb-2">切换至实盘模式</h3>
            <p className="text-[#8b949e] text-sm mb-4">
              即将切换到实盘交易，将使用真实资金。请确认API密钥已正确配置，并充分了解相关风险。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModeConfirm(false)}
                className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm"
              >
                取消
              </button>
              <button
                onClick={switchMode}
                className="px-4 py-2 bg-[#f85149] text-white rounded text-sm"
              >
                确认切换实盘
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
