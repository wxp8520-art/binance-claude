"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ScanResult {
  id: number;
  scan_time: string;
  total_pairs: number;
  passed: number;
  details: { symbol: string; passed: boolean; reject_reason?: string }[];
}

export default function ScannerPage() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [status, setStatus] = useState<{ running: boolean; last_scan: string | null }>({
    running: false,
    last_scan: null,
  });

  useEffect(() => {
    const load = async () => {
      const [resResults, resStatus] = await Promise.all([
        api.getScannerResults(),
        api.getScannerStatus(),
      ]);
      if (resResults.success) setResults(resResults.data as ScanResult[]);
      if (resStatus.success) setStatus(resStatus.data as typeof status);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium text-[#e6edf3]">Scanner Monitor</h1>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${status.running ? "bg-[#3fb950] animate-pulse" : "bg-[#8b949e]"}`} />
          <span className="text-sm text-[#8b949e]">
            {status.running ? "Scanning" : "Idle"}
          </span>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-12 text-center">
          <p className="text-[#8b949e]">No scan results yet. Scanner will start when the strategy engine is running.</p>
        </div>
      ) : (
        results.map((scan) => (
          <div key={scan.id} className="bg-[#161b22] rounded-lg border border-[#30363d] p-4">
            <div className="flex justify-between mb-3">
              <span className="text-sm text-[#e6edf3]">
                {new Date(scan.scan_time).toLocaleString()}
              </span>
              <span className="text-sm text-[#8b949e]">
                {scan.passed}/{scan.total_pairs} passed
              </span>
            </div>
            {scan.details && scan.details.length > 0 && (
              <div className="space-y-1">
                {scan.details
                  .filter((d) => d.passed)
                  .map((d) => (
                    <div key={d.symbol} className="flex justify-between text-sm">
                      <span className="text-[#3fb950] font-mono">{d.symbol}</span>
                      <span className="text-[#8b949e]">Passed</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
