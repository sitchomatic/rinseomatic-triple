import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TerminalPanel({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [isMaximized, setIsMaximized] = useState(false);
  const logsEndRef = useRef(null);
  const originalLog = useRef(null);
  const originalError = useRef(null);
  const originalWarn = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    originalLog.current = console.log;
    originalError.current = console.error;
    originalWarn.current = console.warn;

    const addLog = (level, args) => {
      const message = args.map((arg) => {
        if (typeof arg === "object") return JSON.stringify(arg, null, 2);
        return String(arg);
      }).join(" ");

      setLogs((prev) => [...prev, { level, message, timestamp: new Date().toLocaleTimeString() }].slice(-500));
    };

    console.log = (...args) => {
      addLog("log", args);
      originalLog.current(...args);
    };

    console.error = (...args) => {
      addLog("error", args);
      originalError.current(...args);
    };

    console.warn = (...args) => {
      addLog("warn", args);
      originalWarn.current(...args);
    };

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [resource, config] = args;
      addLog("network", [`→ ${String(resource).slice(0, 100)}`]);
      try {
        const response = await originalFetch(...args);
        const cloned = response.clone();
        addLog("network", [`← ${response.status} ${String(resource).slice(0, 100)}`]);
        return response;
      } catch (e) {
        addLog("error", [`✗ Fetch error: ${e.message}`]);
        throw e;
      }
    };

    return () => {
      console.log = originalLog.current;
      console.error = originalError.current;
      console.warn = originalWarn.current;
      window.fetch = originalFetch;
    };
  }, [isOpen]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs]);

  const handleCopy = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  const handleClear = () => {
    setLogs([]);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 bg-black border-t border-l border-primary/30 font-mono text-xs z-50 flex flex-col",
        isMaximized ? "inset-0 rounded-none" : "w-full md:w-[600px] h-[300px] rounded-tl-lg"
      )}
    >
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-primary font-semibold">Terminal</span>
          <span className="text-muted-foreground ml-2">({logs.length} logs)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "Minimize" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} title="Copy logs">
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClear} title="Clear logs">
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title="Close">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-background/95 p-3 space-y-1 thin-scroll">
        {logs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">Waiting for logs...</div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                "text-xs font-mono",
                log.level === "error" && "text-destructive",
                log.level === "warn" && "text-warning",
                log.level === "network" && "text-info",
                log.level === "log" && "text-foreground"
              )}
            >
              <span className="text-muted-foreground">[{log.timestamp}]</span>{" "}
              <span className="text-primary font-semibold">{log.level}</span> {log.message}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}