const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T;
  error: string | null;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<APIResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

export const api = {
  // Config
  getConfig: () => request("/config"),
  updateConfig: (data: unknown) =>
    request("/config", { method: "PUT", body: JSON.stringify(data) }),
  patchConfig: (data: unknown) =>
    request("/config", { method: "PATCH", body: JSON.stringify(data) }),
  getTemplates: () => request("/config/templates"),
  saveTemplate: (data: unknown) =>
    request("/config/templates", { method: "POST", body: JSON.stringify(data) }),
  loadTemplate: (id: number) =>
    request(`/config/templates/${id}`, { method: "PUT" }),

  // Scanner
  getScannerResults: () => request("/scanner/results"),
  getScannerStatus: () => request("/scanner/status"),
  triggerScanner: (symbol: string) =>
    request(`/scanner/trigger/${symbol}`, { method: "POST" }),

  // Positions
  getPositions: (status?: string) =>
    request(`/positions${status ? `?status=${status}` : ""}`),
  getPosition: (id: string) => request(`/positions/${id}`),
  closePosition: (id: string) =>
    request(`/positions/${id}/close`, { method: "POST" }),
  closeAllPositions: () =>
    request("/positions/close-all", { method: "POST" }),
  updateTP: (id: string, data: unknown) =>
    request(`/positions/${id}/tp`, { method: "PATCH", body: JSON.stringify(data) }),
  updateSL: (id: string, data: unknown) =>
    request(`/positions/${id}/sl`, { method: "PATCH", body: JSON.stringify(data) }),

  // System
  getSystemStatus: () => request("/system/status"),
  pauseSystem: () => request("/system/pause", { method: "POST" }),
  resumeSystem: () => request("/system/resume", { method: "POST" }),
  getMode: () => request("/system/mode"),
  setMode: (mode: string) =>
    request("/system/mode", { method: "PUT", body: JSON.stringify({ mode }) }),

  // Logs
  getTradeLogs: (page = 1) => request(`/logs/trades?page=${page}`),
  getScannerLogs: () => request("/logs/scanner"),
  getSystemLogs: () => request("/logs/system"),

  // Account
  getBalance: () => request("/account/balance"),
  getPnl: (period = "7d") => request(`/account/pnl?period=${period}`),
};

export function createWebSocket(onMessage: (data: unknown) => void) {
  const ws = new WebSocket(`${WS_BASE}/stream`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  ws.onclose = () => {
    // Auto-reconnect after 3 seconds
    setTimeout(() => createWebSocket(onMessage), 3000);
  };
  return ws;
}
