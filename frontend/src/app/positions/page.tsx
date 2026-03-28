"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Position {
  id: string;
  symbol: string;
  trigger_price: number;
  trigger_rsi: number;
  trigger_time: string;
  status: string;
  leverage: number;
  total_margin: number;
  avg_entry_price: number | null;
  current_qty: number;
  realized_pnl: number;
  close_reason: string | null;
  closed_at: string | null;
  grid_entries: { tier_index: number; target_price: number; status: string; filled_price: number | null }[];
  tp_executions: { tier_index: number; status: string; realized_pnl: number | null }[];
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [filter, setFilter] = useState<string>("ACTIVE");
  const [closeAllConfirm, setCloseAllConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await api.getPositions(filter === "ALL" ? undefined : filter);
      if (res.success) setPositions(res.data as Position[]);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const handleCloseAll = async () => {
    await api.closeAllPositions();
    setCloseAllConfirm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">Positions</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {["ALL", "ACTIVE", "CLOSED"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs ${
                  filter === f
                    ? "bg-[#58a6ff]/20 text-[#58a6ff]"
                    : "text-[#8b949e] hover:text-[#e6edf3]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCloseAllConfirm(true)}
            className="px-3 py-1 bg-[#f85149]/10 text-[#f85149] rounded text-xs hover:bg-[#f85149]/20"
          >
            Close All
          </button>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e]">No positions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => (
            <div key={pos.id} className="bg-[#161b22] rounded-lg border border-[#30363d] p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-[#e6edf3] font-mono font-medium text-lg">{pos.symbol}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    pos.status === "ACTIVE" ? "bg-[#3fb950]/20 text-[#3fb950]" :
                    pos.status === "CLOSED" ? "bg-[#8b949e]/20 text-[#8b949e]" :
                    "bg-[#d29922]/20 text-[#d29922]"
                  }`}>
                    {pos.status}
                  </span>
                </div>
                <div className="text-right text-sm">
                  <p className="text-[#8b949e]">Leverage: {pos.leverage}x</p>
                  <p className="text-[#8b949e]">Margin: {pos.total_margin} U</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm mb-3">
                <div>
                  <p className="text-[#8b949e] text-xs">Trigger Price</p>
                  <p className="text-[#e6edf3] font-mono">{pos.trigger_price.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-[#8b949e] text-xs">Avg Entry</p>
                  <p className="text-[#e6edf3] font-mono">{pos.avg_entry_price?.toFixed(6) || "-"}</p>
                </div>
                <div>
                  <p className="text-[#8b949e] text-xs">RSI at Trigger</p>
                  <p className="text-[#e6edf3] font-mono">{pos.trigger_rsi}</p>
                </div>
                <div>
                  <p className="text-[#8b949e] text-xs">Realized PnL</p>
                  <p className={`font-mono ${pos.realized_pnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                    {pos.realized_pnl >= 0 ? "+" : ""}{pos.realized_pnl.toFixed(2)} U
                  </p>
                </div>
              </div>

              {/* Grid entries */}
              <div className="flex gap-1 mb-2">
                {pos.grid_entries.map((g) => (
                  <div
                    key={g.tier_index}
                    className={`flex-1 h-2 rounded ${
                      g.status === "FILLED" ? "bg-[#58a6ff]" :
                      g.status === "WAITING" ? "bg-[#30363d]" :
                      "bg-[#8b949e]"
                    }`}
                    title={`Tier ${g.tier_index}: ${g.status} @ ${g.target_price}`}
                  />
                ))}
              </div>
              <p className="text-xs text-[#8b949e]">
                Grid: {pos.grid_entries.filter(g => g.status === "FILLED").length}/{pos.grid_entries.length} filled
              </p>

              {pos.status === "ACTIVE" && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => api.closePosition(pos.id)}
                    className="px-3 py-1 bg-[#f85149]/10 text-[#f85149] rounded text-xs hover:bg-[#f85149]/20"
                  >
                    Close Position
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Close All Confirmation */}
      {closeAllConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 max-w-sm">
            <h3 className="text-[#e6edf3] font-medium mb-2">Confirm Close All</h3>
            <p className="text-[#8b949e] text-sm mb-4">
              This will close all active positions at market price. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCloseAllConfirm(false)}
                className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseAll}
                className="px-4 py-2 bg-[#f85149] text-white rounded text-sm"
              >
                Close All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
