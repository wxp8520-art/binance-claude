"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api, createWebSocket } from "@/lib/api";

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
  grid_entries: { tier_index: number; target_price: number; status: string; filled_price: number | null; filled_qty: number | null }[];
  tp_executions: { tier_index: number; status: string; trigger_pnl_pct: number; close_ratio: number; realized_pnl: number | null }[];
}

interface PriceInfo {
  mark_price: number;
  index_price: number;
  funding_rate: number;
}

interface PriceTick {
  position_id: string;
  symbol: string;
  current_price: number;
  avg_entry: number;
  pnl_pct: number;
  unrealized_pnl: number;
}

const STATUS_MAP: Record<string, string> = {
  ACTIVE: "活跃",
  CLOSING: "平仓中",
  CLOSED: "已平仓",
  OPENING: "开仓中",
};

const CLOSE_REASON_MAP: Record<string, string> = {
  MANUAL: "手动平仓",
  TP_COMPLETE: "止盈完成",
  TRAILING_STOP: "追踪止损",
  MARGIN_STOP_LOSS: "保证金止损",
  TARGET_STOP_LOSS: "目标止损",
  TIME_STOP: "超时平仓",
};

function formatPrice(p: number) {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [filter, setFilter] = useState<string>("ACTIVE");

  // Real-time price data from WebSocket
  const [livePrices, setLivePrices] = useState<Record<string, PriceTick>>({});
  const wsRef = useRef<WebSocket | null>(null);

  // Close confirm state
  const [closeTarget, setCloseTarget] = useState<Position | null>(null);
  const [closePrice, setClosePrice] = useState<PriceInfo | null>(null);
  const [closePriceLoading, setClosePriceLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  // Close all confirm
  const [closeAllConfirm, setCloseAllConfirm] = useState(false);
  const [closingAll, setClosingAll] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);

  // Load positions via API
  const loadPositions = useCallback(async () => {
    try {
      const res = await api.getPositions(filter === "ALL" ? undefined : filter);
      if (res.success) setPositions(res.data as Position[]);
    } catch { /* ignore */ }
  }, [filter]);

  useEffect(() => {
    loadPositions();
    const interval = setInterval(loadPositions, 5000);
    return () => clearInterval(interval);
  }, [loadPositions]);

  // WebSocket for real-time price ticks (positions with filled entries)
  useEffect(() => {
    const ws = createWebSocket((msg: unknown) => {
      const event = msg as { type: string; data: PriceTick };
      if (event.type === "price_tick" && event.data) {
        setLivePrices((prev) => ({
          ...prev,
          [event.data.position_id]: event.data,
        }));
      }
    });
    wsRef.current = ws;
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, []);

  // Poll prices for all active positions every 5 seconds
  useEffect(() => {
    const activePositions = positions.filter(
      (p) => p.status === "ACTIVE" || p.status === "OPENING"
    );
    if (activePositions.length === 0) return;

    const symbolsToFetch = [...new Set(activePositions.map((p) => p.symbol))];

    const fetchPrices = async () => {
      for (const symbol of symbolsToFetch) {
        try {
          const res = await api.getSymbolPrice(symbol);
          if (res.success) {
            const data = res.data as PriceInfo;
            setLivePrices((prev) => {
              const updates = { ...prev };
              for (const pos of activePositions.filter((p) => p.symbol === symbol)) {
                const avgEntry = pos.avg_entry_price || pos.trigger_price;
                const qty = pos.current_qty || 0;
                const unrealizedPnl = qty > 0 ? (avgEntry - data.mark_price) * qty : 0;
                const pnlPct = avgEntry > 0 ? ((avgEntry - data.mark_price) / avgEntry) * 100 * pos.leverage : 0;
                updates[pos.id] = {
                  position_id: pos.id,
                  symbol: pos.symbol,
                  current_price: data.mark_price,
                  avg_entry: avgEntry,
                  pnl_pct: Math.round(pnlPct * 100) / 100,
                  unrealized_pnl: Math.round(unrealizedPnl * 10000) / 10000,
                };
              }
              return updates;
            });
          }
        } catch { /* ignore */ }
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [positions]);

  const openCloseDialog = async (pos: Position) => {
    setCloseTarget(pos);
    setClosePrice(null);
    setClosePriceLoading(true);
    try {
      const res = await api.getSymbolPrice(pos.symbol);
      if (res.success) setClosePrice(res.data as PriceInfo);
    } catch { /* ignore */ }
    setClosePriceLoading(false);
  };

  const handleClose = async () => {
    if (!closeTarget) return;
    setClosing(true);
    const res = await api.closePosition(closeTarget.id);
    if (res.success) {
      setToast({ success: true, message: `${closeTarget.symbol} 平仓指令已发送` });
    } else {
      setToast({ success: false, message: res.error || "平仓失败" });
    }
    setCloseTarget(null);
    setClosing(false);
  };

  const handleCloseAll = async () => {
    setClosingAll(true);
    const res = await api.closeAllPositions();
    if (res.success) {
      setToast({ success: true, message: "全部平仓指令已发送" });
    } else {
      setToast({ success: false, message: "操作失败" });
    }
    setCloseAllConfirm(false);
    setClosingAll(false);
  };

  // Calculate unrealized PnL for display
  const calcUnrealizedPnl = (pos: Position, currentPrice?: number) => {
    if (!pos.avg_entry_price || !currentPrice || pos.current_qty <= 0) return null;
    const pnlUsd = (pos.avg_entry_price - currentPrice) * pos.current_qty;
    const pnlPct = ((pos.avg_entry_price - currentPrice) / pos.avg_entry_price) * 100 * pos.leverage;
    return { pnlUsd, pnlPct };
  };

  const activeCount = positions.filter((p) => p.status === "ACTIVE" || p.status === "OPENING").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">持仓管理</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {["ALL", "ACTIVE", "CLOSED"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs ${
                  filter === f ? "bg-[#58a6ff]/20 text-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"
                }`}
              >
                {f === "ALL" ? "全部" : f === "ACTIVE" ? "活跃" : "已平仓"}
              </button>
            ))}
          </div>
          {activeCount > 0 && (
            <button
              onClick={() => setCloseAllConfirm(true)}
              className="px-3 py-1 bg-[#f85149]/10 text-[#f85149] rounded text-xs hover:bg-[#f85149]/20"
            >
              全部平仓 ({activeCount})
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`p-3 rounded-lg border text-sm flex justify-between items-center ${
          toast.success
            ? "bg-[#3fb950]/10 border-[#3fb950]/30 text-[#3fb950]"
            : "bg-[#f85149]/10 border-[#f85149]/30 text-[#f85149]"
        }`}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-[#8b949e] hover:text-[#e6edf3] ml-3">x</button>
        </div>
      )}

      {/* Position list */}
      {positions.length === 0 ? (
        <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e]">暂无持仓记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => {
            const filledCount = pos.grid_entries.filter((g) => g.status === "FILLED").length;
            const totalTiers = pos.grid_entries.length;
            const isClosed = pos.status === "CLOSED";
            const live = livePrices[pos.id];
            const isActive = pos.status === "ACTIVE" || pos.status === "OPENING";

            return (
              <div key={pos.id} className="bg-[#161b22] rounded-lg border border-[#30363d] p-5">
                {/* Top row */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[#e6edf3] font-mono font-medium text-lg">{pos.symbol}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      pos.status === "ACTIVE" ? "bg-[#3fb950]/15 text-[#3fb950]" :
                      pos.status === "CLOSING" ? "bg-[#d29922]/15 text-[#d29922]" :
                      pos.status === "CLOSED" ? "bg-[#8b949e]/15 text-[#8b949e]" :
                      "bg-[#58a6ff]/15 text-[#58a6ff]"
                    }`}>
                      {STATUS_MAP[pos.status] || pos.status}
                    </span>
                    <span className="text-[#d29922] text-xs font-mono">{pos.leverage}x</span>
                  </div>
                  {/* Live PnL in top-right for active positions */}
                  {isActive && live ? (
                    <div className="text-right">
                      <p className={`text-lg font-mono font-medium ${live.unrealized_pnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                        {live.unrealized_pnl >= 0 ? "+" : ""}{live.unrealized_pnl.toFixed(2)} U
                      </p>
                      <p className={`text-xs font-mono ${live.pnl_pct >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                        {live.pnl_pct >= 0 ? "+" : ""}{live.pnl_pct.toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    <div className="text-right text-sm">
                      <p className="text-[#8b949e]">保证金 <span className="text-[#e6edf3] font-mono">{pos.total_margin} U</span></p>
                      {isClosed && pos.close_reason && (
                        <p className="text-[#8b949e] text-xs mt-1">{CLOSE_REASON_MAP[pos.close_reason] || pos.close_reason}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Info grid */}
                <div className={`grid ${isActive ? "grid-cols-5" : "grid-cols-4"} gap-4 text-sm mb-4`}>
                  {isActive && (
                    <div>
                      <p className="text-[#8b949e] text-xs mb-0.5">当前价格</p>
                      {live ? (
                        <p className="text-[#e6edf3] font-mono font-medium">${formatPrice(live.current_price)}</p>
                      ) : (
                        <p className="text-[#8b949e] font-mono text-xs">等待数据...</p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-[#8b949e] text-xs mb-0.5">均价</p>
                    <p className="text-[#e6edf3] font-mono">
                      {(live?.avg_entry || pos.avg_entry_price) ? `$${formatPrice(live?.avg_entry || pos.avg_entry_price!)}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-0.5">持仓量</p>
                    <p className="text-[#e6edf3] font-mono">{pos.current_qty > 0 ? pos.current_qty.toFixed(4) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-0.5">保证金</p>
                    <p className="text-[#e6edf3] font-mono">{pos.total_margin} U</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-0.5">已实现盈亏</p>
                    <p className={`font-mono ${pos.realized_pnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                      {pos.realized_pnl >= 0 ? "+" : ""}{pos.realized_pnl.toFixed(2)} U
                    </p>
                  </div>
                </div>

                {/* Grid progress */}
                <div className="mb-3">
                  <div className="flex gap-1 mb-1.5">
                    {pos.grid_entries.map((g) => (
                      <div
                        key={g.tier_index}
                        className={`flex-1 h-2 rounded-sm ${
                          g.status === "FILLED" ? "bg-[#58a6ff]" :
                          g.status === "WAITING" ? "bg-[#30363d]" :
                          "bg-[#8b949e]/40"
                        }`}
                        title={`T${g.tier_index}: ${g.status} @ $${formatPrice(g.target_price)}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[#8b949e]">
                    网格 {filledCount}/{totalTiers} 已成交
                    {pos.grid_entries.filter((g) => g.status === "FILLED").map((g) => (
                      <span key={g.tier_index} className="ml-2 text-[#58a6ff]">
                        T{g.tier_index}@${g.filled_price ? formatPrice(g.filled_price) : "?"}
                      </span>
                    ))}
                  </p>
                </div>

                {/* TP progress */}
                {pos.tp_executions.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {pos.tp_executions.map((tp) => (
                      <div
                        key={tp.tier_index}
                        className={`text-xs px-2.5 py-1 rounded ${
                          tp.status === "EXECUTED"
                            ? "bg-[#3fb950]/15 text-[#3fb950]"
                            : "bg-[#21262d] text-[#8b949e]"
                        }`}
                      >
                        TP{tp.tier_index}: {tp.trigger_pnl_pct}%
                        {tp.status === "EXECUTED" && tp.realized_pnl !== null && (
                          <span className="ml-1 font-mono">
                            ({tp.realized_pnl >= 0 ? "+" : ""}{tp.realized_pnl.toFixed(2)}U)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action */}
                {(pos.status === "ACTIVE" || pos.status === "OPENING") && (
                  <div className="flex justify-between items-center pt-3 border-t border-[#21262d]">
                    <span className="text-xs text-[#8b949e]">
                      {new Date(pos.trigger_time).toLocaleString()}
                    </span>
                    <button
                      onClick={() => openCloseDialog(pos)}
                      className="px-4 py-1.5 bg-[#f85149]/15 text-[#f85149] rounded-md text-xs font-medium hover:bg-[#f85149]/25 transition-colors"
                    >
                      手动平仓
                    </button>
                  </div>
                )}

                {isClosed && (
                  <div className="pt-3 border-t border-[#21262d] text-xs text-[#8b949e] flex justify-between">
                    <span>开仓: {new Date(pos.trigger_time).toLocaleString()}</span>
                    <span>平仓: {pos.closed_at ? new Date(pos.closed_at).toLocaleString() : "-"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Single Close Confirm Dialog ═══ */}
      {closeTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setCloseTarget(null)}>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-[460px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#e6edf3] font-medium text-lg mb-1">确认平仓</h3>
            <p className="text-[#8b949e] text-sm mb-5">将以市价平掉 {closeTarget.symbol} 的全部仓位</p>

            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-[#8b949e]">交易对</span>
                <span className="text-[#e6edf3] font-mono font-medium">{closeTarget.symbol}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8b949e]">杠杆</span>
                <span className="text-[#d29922] font-mono">{closeTarget.leverage}x</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8b949e]">持仓量</span>
                <span className="text-[#e6edf3] font-mono">{closeTarget.current_qty.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8b949e]">均入价格</span>
                <span className="text-[#e6edf3] font-mono">
                  {closeTarget.avg_entry_price ? `$${formatPrice(closeTarget.avg_entry_price)}` : "-"}
                </span>
              </div>

              {/* Current price section */}
              {closePriceLoading ? (
                <div className="text-center py-2 text-[#8b949e] text-sm">获取价格中...</div>
              ) : closePrice ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8b949e]">当前标记价格</span>
                    <span className="text-[#e6edf3] font-mono">${formatPrice(closePrice.mark_price)}</span>
                  </div>
                  {closeTarget.avg_entry_price && closeTarget.current_qty > 0 && (() => {
                    const pnl = calcUnrealizedPnl(closeTarget, closePrice.mark_price);
                    if (!pnl) return null;
                    return (
                      <>
                        <div className="border-t border-[#30363d] pt-3 flex justify-between text-sm">
                          <span className="text-[#8b949e]">预估盈亏</span>
                          <div className="text-right">
                            <span className={`font-mono font-medium ${pnl.pnlUsd >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                              {pnl.pnlUsd >= 0 ? "+" : ""}{pnl.pnlUsd.toFixed(2)} USDT
                            </span>
                            <span className={`ml-2 text-xs font-mono ${pnl.pnlPct >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                              ({pnl.pnlPct >= 0 ? "+" : ""}{pnl.pnlPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#8b949e]">已实现盈亏</span>
                          <span className={`font-mono ${closeTarget.realized_pnl >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                            {closeTarget.realized_pnl >= 0 ? "+" : ""}{closeTarget.realized_pnl.toFixed(2)} USDT
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : null}
            </div>

            <div className="bg-[#d29922]/10 border border-[#d29922]/30 rounded-lg p-3 mb-4">
              <p className="text-[#d29922] text-xs">市价平仓可能产生滑点，实际成交价可能与当前价格有偏差。</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCloseTarget(null)}
                className="flex-1 py-2.5 rounded-lg border border-[#30363d] text-[#8b949e] text-sm hover:text-[#e6edf3] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 py-2.5 rounded-lg bg-[#f85149] text-white text-sm font-medium hover:bg-[#f85149]/80 disabled:opacity-50 transition-colors"
              >
                {closing ? "平仓中..." : "确认平仓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Close All Confirm Dialog ═══ */}
      {closeAllConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setCloseAllConfirm(false)}>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-6 w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[#f85149] font-medium text-lg mb-2">确认全部平仓</h3>
            <p className="text-[#8b949e] text-sm mb-4">
              将以市价平掉全部 <span className="text-[#e6edf3] font-medium">{activeCount}</span> 个活跃持仓，此操作不可撤销。
            </p>
            <div className="bg-[#f85149]/10 border border-[#f85149]/30 rounded-lg p-3 mb-5">
              <p className="text-[#f85149] text-xs">所有仓位将立即按市价平仓，可能产生滑点损失。</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCloseAllConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#30363d] text-[#8b949e] text-sm hover:text-[#e6edf3] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCloseAll}
                disabled={closingAll}
                className="flex-1 py-2.5 rounded-lg bg-[#f85149] text-white text-sm font-medium hover:bg-[#f85149]/80 disabled:opacity-50 transition-colors"
              >
                {closingAll ? "执行中..." : "确认全部平仓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
