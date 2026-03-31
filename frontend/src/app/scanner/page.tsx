"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface WatchlistItem {
  symbol: string;
  price: number;
  change_pct: number;
  volume_24h: number;
  high_24h: number;
  low_24h: number;
}

interface ScanDetail {
  symbol: string;
  passed: boolean;
  reject_reason?: string;
  price?: number;
  rsi?: number;
  change_pct?: number;
  volume_24h?: number;
}

interface ScanResult {
  id: number;
  scan_time: string;
  total_pairs: number;
  passed: number;
  details: ScanDetail[];
}

interface GridTierPreview {
  tier: number;
  price_increase_pct: number;
  target_price: number;
  margin: number;
  notional: number;
  qty: number;
  ratio_pct: number;
}

interface TPTierPreview {
  tier: number;
  trigger_pct: number;
  close_ratio_pct: number;
}

interface OrderPreview {
  symbol: string;
  mark_price: number;
  index_price: number;
  funding_rate: number;
  leverage: number;
  total_margin: number;
  total_notional: number;
  order_type: string;
  grid_tiers: GridTierPreview[];
  tp_tiers: TPTierPreview[];
}

function formatPrice(p: number) {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return `${(v / 1e3).toFixed(0)}K`;
}

export default function ScannerPage() {
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [status, setStatus] = useState<{ running: boolean; last_scan: string | null }>({
    running: false, last_scan: null,
  });
  const [activeTab, setActiveTab] = useState<"signals" | "watchlist">("signals");
  const [search, setSearch] = useState("");

  // Order dialog state
  const [orderSymbol, setOrderSymbol] = useState<string | null>(null);
  const [orderPreview, setOrderPreview] = useState<OrderPreview | null>(null);
  const [orderLeverage, setOrderLeverage] = useState(20);
  const [orderMargin, setOrderMargin] = useState(500);
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Result toast
  const [toast, setToast] = useState<{ success: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [resResults, resStatus] = await Promise.all([
        api.getScannerResults(),
        api.getScannerStatus(),
      ]);
      if (resResults.success) setScanResults(resResults.data as ScanResult[]);
      if (resStatus.success) setStatus(resStatus.data as typeof status);
    } catch { /* ignore */ }
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await api.getWatchlist();
      if (res.success) setWatchlist(res.data as WatchlistItem[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    loadWatchlist();
    const interval = setInterval(() => {
      load();
      if (activeTab === "watchlist") loadWatchlist();
    }, 5000);
    return () => clearInterval(interval);
  }, [load, loadWatchlist, activeTab]);

  // Open order dialog and load preview
  const openOrderDialog = async (symbol: string) => {
    setOrderSymbol(symbol);
    setOrderPreview(null);
    setPreviewLoading(true);
    try {
      const res = await api.previewOrder(symbol, { leverage: orderLeverage, margin: orderMargin, order_type: orderType });
      if (res.success) {
        const data = res.data as OrderPreview;
        setOrderPreview(data);
        setOrderLeverage(data.leverage);
        setOrderMargin(data.total_margin);
        setOrderType(data.order_type as "LIMIT" | "MARKET");
      }
    } catch { /* ignore */ }
    setPreviewLoading(false);
  };

  // Refresh preview when params change
  const refreshPreview = async () => {
    if (!orderSymbol) return;
    setPreviewLoading(true);
    try {
      const res = await api.previewOrder(orderSymbol, { leverage: orderLeverage, margin: orderMargin, order_type: orderType });
      if (res.success) setOrderPreview(res.data as OrderPreview);
    } catch { /* ignore */ }
    setPreviewLoading(false);
  };

  // Submit order
  const handleSubmitOrder = async () => {
    if (!orderSymbol) return;
    setSubmitting(true);
    try {
      const res = await api.triggerOpen(orderSymbol, { leverage: orderLeverage, margin: orderMargin, order_type: orderType });
      if (res.success) {
        setToast({ success: true, message: `${orderSymbol} 建仓成功，杠杆 ${orderLeverage}x，保证金 ${orderMargin}U` });
        setOrderSymbol(null);
        load();
      } else {
        setToast({ success: false, message: res.error || "建仓失败" });
      }
    } catch {
      setToast({ success: false, message: "网络错误" });
    }
    setSubmitting(false);
  };

  const latestScan = scanResults[0];
  const passedSignals = latestScan?.details?.filter((d) => d.passed) || [];
  const filteredWatchlist = watchlist.filter((item) =>
    item.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">标的监控</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.running ? "bg-[#3fb950] animate-pulse" : "bg-[#8b949e]"}`} />
            <span className="text-sm text-[#8b949e]">
              {status.running ? "扫描中" : "空闲"}
            </span>
          </div>
          {status.last_scan && (
            <span className="text-xs text-[#8b949e]">
              上次: {new Date(status.last_scan).toLocaleTimeString()}
            </span>
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

      {/* Tabs */}
      <div className="flex gap-1 bg-[#161b22] rounded-lg p-1 border border-[#30363d] w-fit">
        <button
          onClick={() => setActiveTab("signals")}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${
            activeTab === "signals" ? "bg-[#58a6ff]/15 text-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          扫描信号 {passedSignals.length > 0 && `(${passedSignals.length})`}
        </button>
        <button
          onClick={() => { setActiveTab("watchlist"); loadWatchlist(); }}
          className={`px-4 py-2 rounded-md text-sm transition-colors ${
            activeTab === "watchlist" ? "bg-[#58a6ff]/15 text-[#58a6ff]" : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          全部标的
        </button>
      </div>

      {/* ── Signals Tab ── */}
      {activeTab === "signals" && (
        <div className="space-y-4">
          {passedSignals.length === 0 ? (
            <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-12 text-center">
              <p className="text-[#8b949e]">暂无符合条件的做空信号</p>
              <p className="text-[#8b949e] text-xs mt-2">策略引擎运行后将自动扫描符合条件的标的</p>
            </div>
          ) : (
            <div className="bg-[#161b22] rounded-lg border border-[#30363d] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#8b949e] border-b border-[#30363d] text-xs">
                    <th className="text-left py-3 px-4">币种</th>
                    <th className="text-right py-3 px-4">价格</th>
                    <th className="text-right py-3 px-4">RSI</th>
                    <th className="text-right py-3 px-4">24h涨跌</th>
                    <th className="text-right py-3 px-4">24h成交额</th>
                    <th className="text-center py-3 px-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {passedSignals.map((s) => (
                    <tr key={s.symbol} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                      <td className="py-3 px-4 text-[#e6edf3] font-mono font-medium">{s.symbol}</td>
                      <td className="py-3 px-4 text-right font-mono text-[#e6edf3]">
                        {s.price ? `$${formatPrice(s.price)}` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-mono ${(s.rsi || 0) >= 80 ? "text-[#f85149]" : (s.rsi || 0) >= 70 ? "text-[#d29922]" : "text-[#8b949e]"}`}>
                          {s.rsi ?? "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-mono ${(s.change_pct || 0) > 0 ? "text-[#f85149]" : "text-[#3fb950]"}`}>
                          {s.change_pct !== undefined ? `${s.change_pct > 0 ? "+" : ""}${s.change_pct}%` : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#8b949e]">
                        {s.volume_24h ? formatVolume(s.volume_24h) : "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => openOrderDialog(s.symbol)}
                          className="px-4 py-1.5 bg-[#f85149]/15 text-[#f85149] rounded-md text-xs font-medium hover:bg-[#f85149]/25 transition-colors"
                        >
                          一键做空
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Scan history */}
          {scanResults.length > 0 && (
            <div>
              <h2 className="text-sm text-[#8b949e] mb-3">扫描历史</h2>
              <div className="space-y-2">
                {scanResults.slice(0, 5).map((scan) => (
                  <div key={scan.id} className="bg-[#161b22] rounded-lg border border-[#30363d] px-4 py-3 flex justify-between items-center">
                    <span className="text-sm text-[#8b949e]">{new Date(scan.scan_time).toLocaleString()}</span>
                    <span className="text-sm">
                      <span className="text-[#3fb950]">{scan.passed}</span>
                      <span className="text-[#8b949e]">/{scan.total_pairs} 通过</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Watchlist Tab ── */}
      {activeTab === "watchlist" && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="搜索币种..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-sm text-[#e6edf3] placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
          />
          <div className="bg-[#161b22] rounded-lg border border-[#30363d] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#8b949e] border-b border-[#30363d] text-xs">
                  <th className="text-left py-3 px-4">币种</th>
                  <th className="text-right py-3 px-4">价格</th>
                  <th className="text-right py-3 px-4">24h涨跌</th>
                  <th className="text-right py-3 px-4">24h成交额</th>
                  <th className="text-right py-3 px-4">24h最高</th>
                  <th className="text-right py-3 px-4">24h最低</th>
                  <th className="text-center py-3 px-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredWatchlist.map((item) => (
                  <tr key={item.symbol} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                    <td className="py-3 px-4 text-[#e6edf3] font-mono font-medium">{item.symbol}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#e6edf3]">${formatPrice(item.price)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-mono ${item.change_pct > 0 ? "text-[#f85149]" : "text-[#3fb950]"}`}>
                        {item.change_pct > 0 ? "+" : ""}{item.change_pct}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#8b949e]">{formatVolume(item.volume_24h)}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#8b949e]">${formatPrice(item.high_24h)}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#8b949e]">${formatPrice(item.low_24h)}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openOrderDialog(item.symbol)}
                        className="px-4 py-1.5 bg-[#f85149]/15 text-[#f85149] rounded-md text-xs font-medium hover:bg-[#f85149]/25 transition-colors"
                      >
                        做空
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredWatchlist.length === 0 && (
              <div className="p-8 text-center text-[#8b949e] text-sm">
                {search ? "未找到匹配的币种" : "加载中..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ Order Dialog ══════ */}
      {orderSymbol && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setOrderSymbol(null)}>
          <div className="bg-[#0d1117] border border-[#30363d] rounded-xl w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-[#30363d] flex justify-between items-center">
              <div>
                <h3 className="text-[#e6edf3] font-medium text-lg">开仓 — {orderSymbol}</h3>
                <span className="text-[#f85149] text-xs font-medium">做空 SHORT</span>
              </div>
              <button onClick={() => setOrderSymbol(null)} className="text-[#8b949e] hover:text-[#e6edf3] text-xl leading-none">&times;</button>
            </div>

            {/* Price info */}
            <div className="p-5 border-b border-[#30363d]">
              {orderPreview ? (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[#8b949e] text-xs mb-1">标记价格</p>
                    <p className="text-[#e6edf3] font-mono text-lg">${formatPrice(orderPreview.mark_price)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-1">指数价格</p>
                    <p className="text-[#e6edf3] font-mono">${formatPrice(orderPreview.index_price)}</p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-1">资金费率</p>
                    <p className={`font-mono ${orderPreview.funding_rate > 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                      {(orderPreview.funding_rate * 100).toFixed(4)}%
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[#8b949e] text-sm text-center py-2">加载行情中...</p>
              )}
            </div>

            {/* Order params */}
            <div className="p-5 border-b border-[#30363d] space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {/* Leverage */}
                <div>
                  <label className="text-[#8b949e] text-xs block mb-1.5">杠杆倍数</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={orderLeverage}
                      onChange={(e) => setOrderLeverage(Math.min(125, Math.max(1, Number(e.target.value) || 1)))}
                      onBlur={refreshPreview}
                      min={1}
                      max={125}
                      className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] font-mono w-full focus:outline-none focus:border-[#58a6ff]"
                    />
                    <span className="text-[#8b949e] text-sm">x</span>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {[5, 10, 20, 50].map((v) => (
                      <button
                        key={v}
                        onClick={() => { setOrderLeverage(v); setTimeout(refreshPreview, 0); }}
                        className={`px-2 py-0.5 rounded text-xs ${
                          orderLeverage === v ? "bg-[#58a6ff]/20 text-[#58a6ff]" : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                        }`}
                      >
                        {v}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margin */}
                <div>
                  <label className="text-[#8b949e] text-xs block mb-1.5">保证金 (USDT)</label>
                  <input
                    type="number"
                    value={orderMargin}
                    onChange={(e) => setOrderMargin(Math.max(10, Number(e.target.value) || 10))}
                    onBlur={refreshPreview}
                    min={10}
                    className="bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] font-mono w-full focus:outline-none focus:border-[#58a6ff]"
                  />
                  <div className="flex gap-1 mt-1.5">
                    {[100, 300, 500, 1000].map((v) => (
                      <button
                        key={v}
                        onClick={() => { setOrderMargin(v); setTimeout(refreshPreview, 0); }}
                        className={`px-2 py-0.5 rounded text-xs ${
                          orderMargin === v ? "bg-[#58a6ff]/20 text-[#58a6ff]" : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Order type */}
                <div>
                  <label className="text-[#8b949e] text-xs block mb-1.5">订单类型</label>
                  <div className="flex gap-1">
                    {(["LIMIT", "MARKET"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setOrderType(t); setTimeout(refreshPreview, 0); }}
                        className={`flex-1 py-2 rounded-md text-sm ${
                          orderType === t ? "bg-[#58a6ff]/20 text-[#58a6ff]" : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                        }`}
                      >
                        {t === "LIMIT" ? "限价" : "市价"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notional display */}
              {orderPreview && (
                <div className="bg-[#161b22] rounded-lg p-3 flex justify-between items-center">
                  <span className="text-[#8b949e] text-sm">总名义价值</span>
                  <span className="text-[#e6edf3] font-mono font-medium">
                    ${orderPreview.total_notional.toLocaleString()} USDT
                  </span>
                </div>
              )}
            </div>

            {/* Grid preview */}
            {orderPreview && (
              <div className="p-5 border-b border-[#30363d]">
                <h4 className="text-[#8b949e] text-xs mb-3 font-medium uppercase tracking-wide">网格档位预览</h4>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#8b949e] border-b border-[#21262d]">
                      <th className="text-left py-2">档位</th>
                      <th className="text-right py-2">涨幅</th>
                      <th className="text-right py-2">目标价格</th>
                      <th className="text-right py-2">保证金</th>
                      <th className="text-right py-2">名义价值</th>
                      <th className="text-right py-2">数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderPreview.grid_tiers.map((g) => (
                      <tr key={g.tier} className="border-b border-[#21262d]/50">
                        <td className="py-2 text-[#e6edf3]">T{g.tier}</td>
                        <td className="py-2 text-right text-[#f85149] font-mono">+{g.price_increase_pct}%</td>
                        <td className="py-2 text-right text-[#e6edf3] font-mono">${formatPrice(g.target_price)}</td>
                        <td className="py-2 text-right text-[#8b949e] font-mono">{g.margin.toFixed(1)} U</td>
                        <td className="py-2 text-right text-[#8b949e] font-mono">{g.notional.toFixed(1)} U</td>
                        <td className="py-2 text-right text-[#e6edf3] font-mono">{g.qty.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* TP preview */}
                <h4 className="text-[#8b949e] text-xs mt-4 mb-2 font-medium uppercase tracking-wide">止盈计划</h4>
                <div className="flex gap-3">
                  {orderPreview.tp_tiers.map((tp) => (
                    <div key={tp.tier} className="bg-[#161b22] rounded px-3 py-2 text-xs">
                      <span className="text-[#3fb950] font-mono">TP{tp.tier}: </span>
                      <span className="text-[#e6edf3]">盈利 {tp.trigger_pct}% 时平 {tp.close_ratio_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state */}
            {previewLoading && !orderPreview && (
              <div className="p-8 text-center text-[#8b949e] text-sm">加载预览中...</div>
            )}

            {/* Warning & buttons */}
            <div className="p-5">
              <div className="bg-[#d29922]/10 border border-[#d29922]/30 rounded-lg p-3 mb-4">
                <p className="text-[#d29922] text-xs">
                  确认后将按上述网格参数在 {orderSymbol} 开立做空仓位。
                  {orderLeverage >= 20 && " 高杠杆交易风险极大，请确认风险承受能力。"}
                  自动止盈止损将按策略配置执行。
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setOrderSymbol(null)}
                  className="flex-1 py-2.5 rounded-lg border border-[#30363d] text-[#8b949e] text-sm hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={!orderPreview || submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#f85149] text-white text-sm font-medium hover:bg-[#f85149]/80 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "建仓中..." : `确认做空 ${orderLeverage}x`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
