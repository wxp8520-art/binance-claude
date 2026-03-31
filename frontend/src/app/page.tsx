"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";

interface Position {
  id: string;
  symbol: string;
  avg_entry_price: number | null;
  trigger_price: number;
  leverage: number;
  status: string;
  grid_entries: { tier_index: number; status: string }[];
}

interface PnlPoint {
  time: string;
  cumulative_pnl: number;
}

export default function Dashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnlData, setPnlData] = useState<PnlPoint[]>([]);
  const [balance, setBalance] = useState({ total_balance: 0, available_balance: 0 });
  const [pnlPeriod, setPnlPeriod] = useState("7d");

  useEffect(() => {
    const load = async () => {
      try {
        const [posRes, pnlRes, balRes] = await Promise.all([
          api.getPositions("ACTIVE"),
          api.getPnl(pnlPeriod),
          api.getBalance(),
        ]);
        if (posRes.success) setPositions(posRes.data as Position[]);
        if (pnlRes.success) setPnlData(pnlRes.data as PnlPoint[]);
        if (balRes.success) setBalance(balRes.data as typeof balance);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [pnlPeriod]);

  const totalPnl = pnlData.length > 0 ? pnlData[pnlData.length - 1].cumulative_pnl : 0;

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="账户余额" value={`${balance.total_balance.toFixed(2)} U`} />
        <StatCard label="活跃持仓" value={`${positions.length}/5`} />
        <StatCard label="今日盈亏" value="+0.00 U" color="text-[#3fb950]" />
        <StatCard
          label="总盈亏"
          value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} U`}
          color={totalPnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}
        />
      </div>

      {/* 盈亏曲线 */}
      <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[#e6edf3] font-medium">盈亏曲线</h2>
          <div className="flex gap-2">
            {["24h", "7d", "30d", "ALL"].map((p) => (
              <button
                key={p}
                onClick={() => setPnlPeriod(p)}
                className={`px-3 py-1 rounded text-xs ${
                  pnlPeriod === p
                    ? "bg-[#58a6ff]/20 text-[#58a6ff]"
                    : "text-[#8b949e] hover:text-[#e6edf3]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={pnlData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis
              dataKey="time"
              stroke="#8b949e"
              fontSize={12}
              tickFormatter={(v) => new Date(v).toLocaleDateString()}
            />
            <YAxis stroke="#8b949e" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161b22",
                border: "1px solid #30363d",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#8b949e" }}
            />
            <Line
              type="monotone"
              dataKey="cumulative_pnl"
              stroke="#58a6ff"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 活跃持仓表 */}
      <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-6">
        <h2 className="text-[#e6edf3] font-medium mb-4">活跃持仓</h2>
        {positions.length === 0 ? (
          <p className="text-[#8b949e] text-sm">暂无活跃持仓</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#8b949e] border-b border-[#30363d]">
                <th className="text-left py-2">币种</th>
                <th className="text-right py-2">开仓价</th>
                <th className="text-right py-2">现价</th>
                <th className="text-right py-2">盈亏%</th>
                <th className="text-center py-2">网格</th>
                <th className="text-right py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const filledCount = pos.grid_entries.filter(
                  (g) => g.status === "FILLED"
                ).length;
                return (
                  <tr key={pos.id} className="border-b border-[#21262d]">
                    <td className="py-3 text-[#e6edf3] font-mono">{pos.symbol}</td>
                    <td className="py-3 text-right font-mono">
                      {pos.avg_entry_price?.toFixed(4) || "-"}
                    </td>
                    <td className="py-3 text-right font-mono">-</td>
                    <td className="py-3 text-right font-mono text-[#3fb950]">-</td>
                    <td className="py-3 text-center text-[#8b949e]">
                      {filledCount}/{pos.grid_entries.length}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => api.closePosition(pos.id)}
                        className="px-3 py-1 bg-[#f85149]/10 text-[#f85149] rounded text-xs hover:bg-[#f85149]/20"
                      >
                        平仓
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-[#e6edf3]",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-4">
      <p className="text-[#8b949e] text-xs mb-1">{label}</p>
      <p className={`text-xl font-mono font-medium ${color}`}>{value}</p>
    </div>
  );
}
