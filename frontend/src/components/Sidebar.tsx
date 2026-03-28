"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "chart" },
  { href: "/config", label: "Strategy Config", icon: "settings" },
  { href: "/scanner", label: "Scanner", icon: "search" },
  { href: "/positions", label: "Positions", icon: "layers" },
  { href: "/logs", label: "Trade Logs", icon: "list" },
  { href: "/system", label: "System", icon: "cpu" },
];

const icons: Record<string, string> = {
  chart: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 8h14v-2H7v2zm0-4h14v-2H7v2zm0-6v2h14V7H7z",
  settings: "M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z",
  search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  layers: "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z",
  list: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  cpu: "M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z",
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-16 hover:w-48 transition-all duration-200 bg-[#161b22] border-r border-[#30363d] flex flex-col group overflow-hidden">
      <div className="p-4 border-b border-[#30363d]">
        <span className="text-[#58a6ff] font-bold text-lg">SG</span>
        <span className="ml-2 text-[#e6edf3] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Grid Bot
        </span>
      </div>
      <div className="flex-1 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-4 py-3 mx-2 rounded-md transition-colors ${
                isActive
                  ? "bg-[#58a6ff]/10 text-[#58a6ff]"
                  : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d={icons[item.icon]} />
              </svg>
              <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
