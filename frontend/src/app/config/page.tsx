"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface GridTier {
  tier_index: number;
  price_increase_pct: number;
  position_ratio: number;
}

interface TPTier {
  tier_index: number;
  profit_trigger_pct: number;
  close_ratio: number;
}

interface StrategyConfig {
  rsi_threshold: number;
  rsi_period: number;
  kline_interval: string;
  min_market_cap_usd: number;
  min_volume_24h_usd: number;
  min_depth_ratio: number;
  blacklist: string[];
  scan_interval_sec: number;
  max_concurrent_positions: number;
  cooldown_hours: number;
  grid_tiers: GridTier[];
  total_margin_per_target: number;
  leverage: number;
  order_type: string;
  tp_tiers: TPTier[];
  trailing_stop_enabled: boolean;
  trailing_stop_activation: number;
  trailing_stop_callback: number;
  margin_loss_stop_pct: number;
  per_target_loss_stop_pct: number;
  time_stop_hours: number;
  margin_rate_alert: number;
  max_total_margin_pct: number;
  max_daily_loss_pct: number;
  max_consecutive_losses: number;
  consecutive_loss_pause_min: number;
}

const DEFAULT_CONFIG: StrategyConfig = {
  rsi_threshold: 90,
  rsi_period: 14,
  kline_interval: "15m",
  min_market_cap_usd: 50000000,
  min_volume_24h_usd: 10000000,
  min_depth_ratio: 0.02,
  blacklist: [],
  scan_interval_sec: 60,
  max_concurrent_positions: 5,
  cooldown_hours: 24,
  grid_tiers: [
    { tier_index: 1, price_increase_pct: 10, position_ratio: 0.1 },
    { tier_index: 2, price_increase_pct: 30, position_ratio: 0.2 },
    { tier_index: 3, price_increase_pct: 50, position_ratio: 0.3 },
    { tier_index: 4, price_increase_pct: 80, position_ratio: 0.4 },
  ],
  total_margin_per_target: 500,
  leverage: 5,
  order_type: "LIMIT",
  tp_tiers: [
    { tier_index: 1, profit_trigger_pct: 400, close_ratio: 0.5 },
    { tier_index: 2, profit_trigger_pct: 800, close_ratio: 0.5 },
  ],
  trailing_stop_enabled: false,
  trailing_stop_activation: 200,
  trailing_stop_callback: 30,
  margin_loss_stop_pct: 300,
  per_target_loss_stop_pct: 200,
  time_stop_hours: 48,
  margin_rate_alert: 150,
  max_total_margin_pct: 70,
  max_daily_loss_pct: 10,
  max_consecutive_losses: 3,
  consecutive_loss_pause_min: 60,
};

const KLINE_OPTIONS = ["1m", "5m", "15m", "1h", "4h"];

export default function ConfigPage() {
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [blacklistInput, setBlacklistInput] = useState("");
  const [leverageConfirm, setLeverageConfirm] = useState(false);
  const [pendingLeverage, setPendingLeverage] = useState(5);

  useEffect(() => {
    const load = async () => {
      const res = await api.getConfig();
      if (res.success && res.data) {
        setConfig((res.data as { config: StrategyConfig }).config);
      }
    };
    load();
  }, []);

  const gridTotalRatio = config.grid_tiers.reduce((s, t) => s + t.position_ratio, 0);
  const gridValid = Math.abs(gridTotalRatio - 1.0) < 0.001;

  const gridIncreasing = config.grid_tiers.every(
    (t, i) => i === 0 || t.price_increase_pct > config.grid_tiers[i - 1].price_increase_pct
  );

  const canSave = gridValid && gridIncreasing;

  const updateField = <K extends keyof StrategyConfig>(key: K, value: StrategyConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const res = await api.updateConfig(config);
    if (res.success) {
      setMessage("Configuration saved successfully");
    } else {
      setMessage(`Error: ${res.error}`);
    }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  };

  const addGridTier = () => {
    if (config.grid_tiers.length >= 8) return;
    const last = config.grid_tiers[config.grid_tiers.length - 1];
    updateField("grid_tiers", [
      ...config.grid_tiers,
      {
        tier_index: config.grid_tiers.length + 1,
        price_increase_pct: last.price_increase_pct + 20,
        position_ratio: 0,
      },
    ]);
  };

  const removeGridTier = (idx: number) => {
    if (config.grid_tiers.length <= 2) return;
    const tiers = config.grid_tiers
      .filter((_, i) => i !== idx)
      .map((t, i) => ({ ...t, tier_index: i + 1 }));
    updateField("grid_tiers", tiers);
  };

  const updateGridTier = (idx: number, field: keyof GridTier, value: number) => {
    const tiers = [...config.grid_tiers];
    tiers[idx] = { ...tiers[idx], [field]: value };
    updateField("grid_tiers", tiers);
  };

  const addTPTier = () => {
    if (config.tp_tiers.length >= 5) return;
    const last = config.tp_tiers[config.tp_tiers.length - 1];
    updateField("tp_tiers", [
      ...config.tp_tiers,
      {
        tier_index: config.tp_tiers.length + 1,
        profit_trigger_pct: last.profit_trigger_pct + 400,
        close_ratio: 0.5,
      },
    ]);
  };

  const removeTPTier = (idx: number) => {
    if (config.tp_tiers.length <= 1) return;
    const tiers = config.tp_tiers
      .filter((_, i) => i !== idx)
      .map((t, i) => ({ ...t, tier_index: i + 1 }));
    updateField("tp_tiers", tiers);
  };

  const updateTPTier = (idx: number, field: keyof TPTier, value: number) => {
    const tiers = [...config.tp_tiers];
    tiers[idx] = { ...tiers[idx], [field]: value };
    updateField("tp_tiers", tiers);
  };

  const addBlacklist = () => {
    const sym = blacklistInput.trim().toUpperCase();
    if (sym && !config.blacklist.includes(sym)) {
      updateField("blacklist", [...config.blacklist, sym]);
      setBlacklistInput("");
    }
  };

  const removeBlacklist = (sym: string) => {
    updateField("blacklist", config.blacklist.filter((s) => s !== sym));
  };

  const handleLeverageChange = (val: number) => {
    setPendingLeverage(val);
    setLeverageConfirm(true);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">Strategy Configuration</h1>
        <div className="flex items-center gap-3">
          {message && (
            <span className={`text-sm ${message.includes("Error") ? "text-[#f85149]" : "text-[#3fb950]"}`}>
              {message}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              canSave && !saving
                ? "bg-[#58a6ff] text-white hover:bg-[#58a6ff]/80"
                : "bg-[#21262d] text-[#8b949e] cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Scanner Parameters */}
      <Section title="Scanner Parameters">
        <div className="grid grid-cols-2 gap-4">
          <SliderInput
            label="RSI Threshold"
            value={config.rsi_threshold}
            min={50} max={100}
            onChange={(v) => updateField("rsi_threshold", v)}
          />
          <SliderInput
            label="RSI Period"
            value={config.rsi_period}
            min={5} max={50} step={1}
            onChange={(v) => updateField("rsi_period", v)}
          />
          <div>
            <label className="text-[#8b949e] text-xs block mb-1">K-Line Interval</label>
            <div className="flex gap-1">
              {KLINE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => updateField("kline_interval", opt)}
                  className={`px-3 py-1.5 rounded text-xs ${
                    config.kline_interval === opt
                      ? "bg-[#58a6ff]/20 text-[#58a6ff]"
                      : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <SliderInput
            label="Min Market Cap (USD)"
            value={config.min_market_cap_usd}
            min={1000000} max={1000000000} step={1000000}
            format={(v) => `${(v / 1e6).toFixed(0)}M`}
            onChange={(v) => updateField("min_market_cap_usd", v)}
          />
          <SliderInput
            label="Min 24h Volume (USD)"
            value={config.min_volume_24h_usd}
            min={1000000} max={50000000} step={1000000}
            format={(v) => `${(v / 1e6).toFixed(0)}M`}
            onChange={(v) => updateField("min_volume_24h_usd", v)}
          />
          <SliderInput
            label="Min Depth Ratio"
            value={config.min_depth_ratio}
            min={0.005} max={0.1} step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => updateField("min_depth_ratio", v)}
          />
          <SliderInput
            label="Scan Interval (sec)"
            value={config.scan_interval_sec}
            min={30} max={600} step={10}
            onChange={(v) => updateField("scan_interval_sec", v)}
          />
          <SliderInput
            label="Max Concurrent Positions"
            value={config.max_concurrent_positions}
            min={1} max={20} step={1}
            onChange={(v) => updateField("max_concurrent_positions", v)}
          />
        </div>

        {/* Blacklist */}
        <div className="mt-4">
          <label className="text-[#8b949e] text-xs block mb-1">Blacklist</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {config.blacklist.map((sym) => (
              <span key={sym} className="bg-[#21262d] px-2 py-1 rounded text-xs text-[#e6edf3] flex items-center gap-1">
                {sym}
                <button onClick={() => removeBlacklist(sym)} className="text-[#f85149] hover:text-[#f85149]/80">
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={blacklistInput}
              onChange={(e) => setBlacklistInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBlacklist()}
              placeholder="e.g. BTCUSDT"
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm text-[#e6edf3] w-40"
            />
            <button onClick={addBlacklist} className="text-[#58a6ff] text-sm hover:underline">+ Add</button>
          </div>
        </div>
      </Section>

      {/* Grid Configuration */}
      <Section title="Grid Configuration">
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-[#8b949e] border-b border-[#30363d]">
              <th className="text-left py-2 w-12">#</th>
              <th className="text-left py-2">Price Increase %</th>
              <th className="text-left py-2">Position Ratio %</th>
              <th className="text-right py-2 w-12">Action</th>
            </tr>
          </thead>
          <tbody>
            {config.grid_tiers.map((tier, idx) => (
              <tr key={idx} className="border-b border-[#21262d]">
                <td className="py-2 text-[#8b949e]">{tier.tier_index}</td>
                <td className="py-2">
                  <input
                    type="number"
                    value={tier.price_increase_pct}
                    onChange={(e) => updateGridTier(idx, "price_increase_pct", Number(e.target.value))}
                    className={`bg-[#0d1117] border rounded px-2 py-1 w-24 text-[#e6edf3] text-sm ${
                      idx > 0 && tier.price_increase_pct <= config.grid_tiers[idx - 1].price_increase_pct
                        ? "border-[#f85149]"
                        : "border-[#30363d]"
                    }`}
                  />
                  <span className="ml-1 text-[#8b949e]">%</span>
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    value={(tier.position_ratio * 100).toFixed(0)}
                    onChange={(e) => updateGridTier(idx, "position_ratio", Number(e.target.value) / 100)}
                    className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 w-24 text-[#e6edf3] text-sm"
                  />
                  <span className="ml-1 text-[#8b949e]">%</span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => removeGridTier(idx)}
                    className="text-[#f85149] hover:text-[#f85149]/80 text-xs"
                    disabled={config.grid_tiers.length <= 2}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center">
          <button
            onClick={addGridTier}
            disabled={config.grid_tiers.length >= 8}
            className="text-[#58a6ff] text-sm hover:underline disabled:text-[#8b949e]"
          >
            + Add Tier
          </button>
          <span className={`text-sm ${gridValid ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            Total: {(gridTotalRatio * 100).toFixed(0)}% {gridValid ? "OK" : "(must be 100%)"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <label className="text-[#8b949e] text-xs block mb-1">Margin per Target (USDT)</label>
            <input
              type="number"
              value={config.total_margin_per_target}
              onChange={(e) => updateField("total_margin_per_target", Number(e.target.value))}
              min={50} max={10000}
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm text-[#e6edf3] w-full"
            />
          </div>
          <div>
            <label className="text-[#8b949e] text-xs block mb-1">Leverage</label>
            <input
              type="number"
              value={config.leverage}
              onChange={(e) => handleLeverageChange(Number(e.target.value))}
              min={1} max={20}
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-sm text-[#e6edf3] w-full"
            />
          </div>
          <div>
            <label className="text-[#8b949e] text-xs block mb-1">Order Type</label>
            <div className="flex gap-1">
              {["LIMIT", "MARKET"].map((t) => (
                <button
                  key={t}
                  onClick={() => updateField("order_type", t)}
                  className={`px-3 py-1.5 rounded text-xs ${
                    config.order_type === t
                      ? "bg-[#58a6ff]/20 text-[#58a6ff]"
                      : "bg-[#21262d] text-[#8b949e]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Take Profit / Stop Loss */}
      <Section title="Take Profit / Stop Loss">
        <h3 className="text-sm text-[#e6edf3] mb-2">Take Profit Tiers</h3>
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-[#8b949e] border-b border-[#30363d]">
              <th className="text-left py-2 w-12">#</th>
              <th className="text-left py-2">Profit Trigger %</th>
              <th className="text-left py-2">Close Ratio %</th>
              <th className="text-right py-2 w-12">Action</th>
            </tr>
          </thead>
          <tbody>
            {config.tp_tiers.map((tier, idx) => (
              <tr key={idx} className="border-b border-[#21262d]">
                <td className="py-2 text-[#8b949e]">{tier.tier_index}</td>
                <td className="py-2">
                  <input
                    type="number"
                    value={tier.profit_trigger_pct}
                    onChange={(e) => updateTPTier(idx, "profit_trigger_pct", Number(e.target.value))}
                    className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 w-24 text-[#e6edf3] text-sm"
                  />
                  <span className="ml-1 text-[#8b949e]">%</span>
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    value={(tier.close_ratio * 100).toFixed(0)}
                    onChange={(e) => updateTPTier(idx, "close_ratio", Number(e.target.value) / 100)}
                    className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 w-24 text-[#e6edf3] text-sm"
                  />
                  <span className="ml-1 text-[#8b949e]">%</span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => removeTPTier(idx)}
                    className="text-[#f85149] hover:text-[#f85149]/80 text-xs"
                    disabled={config.tp_tiers.length <= 1}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={addTPTier}
          disabled={config.tp_tiers.length >= 5}
          className="text-[#58a6ff] text-sm hover:underline disabled:text-[#8b949e] mb-4"
        >
          + Add TP Tier
        </button>

        <h3 className="text-sm text-[#e6edf3] mb-2 mt-4">Hard Stop Loss</h3>
        <div className="grid grid-cols-2 gap-4">
          <SliderInput
            label="Margin Loss Stop %"
            value={config.margin_loss_stop_pct}
            min={50} max={500} step={10}
            onChange={(v) => updateField("margin_loss_stop_pct", v)}
          />
          <SliderInput
            label="Per Target Loss Stop %"
            value={config.per_target_loss_stop_pct}
            min={50} max={500} step={10}
            onChange={(v) => updateField("per_target_loss_stop_pct", v)}
          />
          <SliderInput
            label="Time Stop (hours)"
            value={config.time_stop_hours}
            min={1} max={168} step={1}
            onChange={(v) => updateField("time_stop_hours", v)}
          />
          <SliderInput
            label="Margin Rate Alert %"
            value={config.margin_rate_alert}
            min={100} max={300} step={10}
            onChange={(v) => updateField("margin_rate_alert", v)}
          />
        </div>

        <h3 className="text-sm text-[#e6edf3] mb-2 mt-4">Trailing Stop</h3>
        <div className="flex items-center gap-4 mb-3">
          <label className="text-[#8b949e] text-xs">Trailing Stop</label>
          <button
            onClick={() => updateField("trailing_stop_enabled", !config.trailing_stop_enabled)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              config.trailing_stop_enabled ? "bg-[#58a6ff]" : "bg-[#30363d]"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                config.trailing_stop_enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {config.trailing_stop_enabled && (
          <div className="grid grid-cols-2 gap-4">
            <SliderInput
              label="Activation Profit %"
              value={config.trailing_stop_activation}
              min={50} max={500} step={10}
              onChange={(v) => updateField("trailing_stop_activation", v)}
            />
            <SliderInput
              label="Callback %"
              value={config.trailing_stop_callback}
              min={5} max={50} step={5}
              onChange={(v) => updateField("trailing_stop_callback", v)}
            />
          </div>
        )}
      </Section>

      {/* Strategy Templates */}
      <Section title="Strategy Templates">
        <div className="flex gap-2">
          {["Conservative", "Standard", "Aggressive"].map((name) => (
            <button
              key={name}
              className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm hover:text-[#e6edf3] hover:bg-[#30363d]"
            >
              {name}
            </button>
          ))}
          <button className="px-4 py-2 bg-[#58a6ff]/10 text-[#58a6ff] rounded text-sm hover:bg-[#58a6ff]/20">
            Save Current
          </button>
        </div>
      </Section>

      {/* Leverage Confirmation Dialog */}
      {leverageConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 max-w-sm">
            <h3 className="text-[#e6edf3] font-medium mb-2">Confirm Leverage Change</h3>
            <p className="text-[#8b949e] text-sm mb-4">
              Change leverage to {pendingLeverage}x? This affects risk exposure significantly.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setLeverageConfirm(false)}
                className="px-4 py-2 bg-[#21262d] text-[#8b949e] rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateField("leverage", pendingLeverage);
                  setLeverageConfirm(false);
                }}
                className="px-4 py-2 bg-[#d29922] text-white rounded text-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-6">
      <h2 className="text-[#e6edf3] font-medium mb-4">{title}</h2>
      {children}
    </div>
  );
}

function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <label className="text-[#8b949e]">{label}</label>
        <span className="text-[#e6edf3] font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#58a6ff]"
      />
    </div>
  );
}
