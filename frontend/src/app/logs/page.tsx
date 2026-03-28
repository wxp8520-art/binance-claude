"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TradeLog {
  id: string;
  symbol: string;
  trigger_price: number;
  avg_entry_price: number | null;
  leverage: number;
  realized_pnl: number;
  close_reason: string;
  trigger_time: string;
  closed_at: string | null;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      const res = await api.getTradeLogs(page);
      if (res.success) setLogs(res.data as TradeLog[]);
    };
    load();
  }, [page]);

  const handleExport = () => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/logs/export`,
      "_blank"
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">Trade Logs</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm hover:text-[#e6edf3]"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-[#161b22] rounded-lg border border-[#30363d] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#8b949e] border-b border-[#30363d]">
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-right px-4 py-3">Entry</th>
              <th className="text-right px-4 py-3">Leverage</th>
              <th className="text-right px-4 py-3">PnL</th>
              <th className="text-center px-4 py-3">Reason</th>
              <th className="text-right px-4 py-3">Closed At</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#8b949e]">
                  No trade records yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-[#21262d] hover:bg-[#161b22]/50">
                  <td className="px-4 py-3 font-mono text-[#e6edf3]">{log.symbol}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {log.avg_entry_price?.toFixed(6) || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">{log.leverage}x</td>
                  <td className={`px-4 py-3 text-right font-mono ${
                    log.realized_pnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                  }`}>
                    {log.realized_pnl >= 0 ? "+" : ""}{log.realized_pnl.toFixed(2)} U
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] text-xs">
                      {log.close_reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#8b949e]">
                    {log.closed_at ? new Date(log.closed_at).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex justify-between items-center px-4 py-3 border-t border-[#30363d]">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="text-sm text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-[#8b949e]">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={logs.length < 50}
            className="text-sm text-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
