import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, KeyRound, Play, Settings as SettingsIcon, Shield, Radio, Clock, TrendingUp, Terminal, Activity, MonitorPlay, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import TerminalPanel from "@/components/Terminal/TerminalPanel";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/credentials", label: "Credentials", icon: KeyRound },
  { to: "/runs", label: "Test runs", icon: Play },
  { to: "/schedule", label: "Schedule", icon: Clock },
  { to: "/analytics", label: "Analytics", icon: TrendingUp },
  { to: "/audit", label: "Audit log", icon: Radio },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/monitor", label: "Live Monitor", icon: MonitorPlay },
  { to: "/diagnostics", label: "Diagnostics", icon: Wrench },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const TITLES = {
  "/": "Dashboard · Credential Tester",
  "/credentials": "Credentials · Credential Tester",
  "/runs": "Test runs · Credential Tester",
  "/schedule": "Schedule · Credential Tester",
  "/analytics": "Analytics · Credential Tester",
  "/audit": "Audit log · Credential Tester",
  "/activity": "Activity · Credential Tester",
  "/monitor": "Live Monitor · Credential Tester",
  "/diagnostics": "Diagnostics · Credential Tester",
  "/settings": "Settings · Credential Tester",
};

export default function Layout() {
  const { pathname } = useLocation();
  const [terminalOpen, setTerminalOpen] = useState(false);

  React.useEffect(() => {
    const base = TITLES[pathname] || (pathname.startsWith("/runs/") ? "Run detail · Credential Tester" : "Credential Tester");
    document.title = base;
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      {/* Desktop sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-card/40 hidden md:flex flex-col">
        <div className="px-5 py-5 border-b border-border flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">TRIIPLE TEST</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">browserless</div>
          </div>
          <ThemeToggle />
        </div>
        <nav className="flex-1 p-2 space-y-1">
           {NAV.map(({ to, label, icon: Icon, end }) => (
             <NavLink
               key={to}
               to={to}
               end={end}
               className={({ isActive }) => cn(
                 "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                 isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
               )}
             >
               <Icon className="h-4 w-4" />
               {label}
             </NavLink>
           ))}
         </nav>
         <div className="border-t border-border p-2">
           <Button
             variant={terminalOpen ? "default" : "outline"}
             size="sm"
             className="w-full justify-start gap-2"
             onClick={() => setTerminalOpen(!terminalOpen)}
           >
             <Terminal className="h-4 w-4" />
             Terminal
           </Button>
         </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-card/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-sm font-semibold flex-1">TRIIPLE TEST</div>
          <ThemeToggle />
        </div>
        <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto thin-scroll">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-w-0">
         <Outlet />
       </main>

      <TerminalPanel isOpen={terminalOpen} onClose={() => setTerminalOpen(false)} />
      </div>
      );
      }