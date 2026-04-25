import React, { useState, useMemo } from "react";
import StatusPill from "@/components/shared/StatusPill";
import { formatMs } from "@/lib/sites";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import RecordingViewer from "@/components/runs/RecordingViewer";

// Pull the "[Class] " tag out of error messages saved by the worker (D1).
// Returns { label, message } where label may be null.
function splitErrorTag(msg) {
  if (!msg) return { label: null, message: null };
  const m = msg.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (m) return { label: m[1], message: m[2] };
  return { label: null, message: msg };
}

const ERROR_TONE = {
  "Selector missing": "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "No login URL":     "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "Login URL 404":    "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "Credential gone":  "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "Captcha":          "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "IP blocked":       "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "Proxy error":      "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "Rate limited":     "text-sky-300 border-sky-500/30 bg-sky-500/10",
  "Timeout":          "text-sky-300 border-sky-500/30 bg-sky-500/10",
  "Network":          "text-sky-300 border-sky-500/30 bg-sky-500/10",
  "Browserless 5xx":  "text-sky-300 border-sky-500/30 bg-sky-500/10",
};

export default function ResultsTable({ results }) {
  const [viewRecording, setViewRecording] = useState(null);

  // L12 fix: pre-parse error tags ONCE per result list, not on every render.
  // Worst case (5k results, 10 streaming updates/sec) goes from 50k regex
  // executions per second to 5k once.
  const decorated = useMemo(() => {
    if (!results) return [];
    return results.map((r) => {
      const { label, message } = splitErrorTag(r.error_message);
      return { row: r, label, message, tone: label ? ERROR_TONE[label] : null };
    });
  }, [results]);

  if (decorated.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 py-14 text-center text-sm text-muted-foreground">
        No results yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[minmax(0,2fr)_110px_100px_minmax(0,3fr)_80px_40px] gap-3 px-4 py-2.5 border-b border-border bg-secondary/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <div>Username</div>
        <div>Status</div>
        <div>Attempts</div>
        <div>Detail</div>
        <div>Elapsed</div>
        <div />
      </div>
      <div className="divide-y divide-border/60 max-h-[540px] overflow-y-auto thin-scroll">
        {decorated.map(({ row: r, label, message, tone }, i) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(0,2fr)_110px_100px_minmax(0,3fr)_80px_40px] gap-3 px-4 py-2.5 items-center text-xs font-mono animate-row-in"
            style={{ animationDelay: `${Math.min(i * 8, 200)}ms` }}
          >
            <div className="truncate">{r.username}</div>
            <div><StatusPill status={r.status} /></div>
            <div className="text-muted-foreground">{r.attempts || 0}</div>
            <div className="truncate text-muted-foreground flex items-center gap-2 min-w-0">
              {label && (
                <span className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone || "text-muted-foreground border-border bg-secondary/40"}`}>
                  {label}
                </span>
              )}
              <span className="truncate">
                {message || r.final_url || (r.success_marker_found ? "success marker ✓" : "—")}
              </span>
            </div>
            <div className="text-muted-foreground">{formatMs(r.elapsed_ms)}</div>
            <div>
              {(r.recording_url || (Array.isArray(r.screenshots) && r.screenshots.length > 0)) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                  onClick={() => setViewRecording(r)}
                  title="View recording/screenshots"
                >
                  <Play className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <RecordingViewer
        testResult={viewRecording}
        open={!!viewRecording}
        onOpenChange={(v) => !v && setViewRecording(null)}
      />
    </div>
  );
}