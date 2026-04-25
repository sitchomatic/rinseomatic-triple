import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CredentialsStatusPanel() {
  const { data: health } = useQuery({
    queryKey: ["health-check"],
    queryFn: () => base44.functions.invoke("healthCheck", {}),
    staleTime: 60_000,
  });

  const status = health?.data;
  if (!status) return null;

  const providers = [
    { name: "ScrapingBee", key: "scrapingbee", configured: status.credentials?.scrapingbee },
    { name: "Browserbase", key: "browserbase", configured: status.credentials?.browserbase },
    { name: "Browserless", key: "browserless", configured: status.credentials?.browserless },
  ];

  const activeProvider = status.provider || "scrapingbee";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
        <div>
          <div className="text-sm font-medium">Provider credentials status</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Check which cloud browser services have API credentials configured.
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {providers.map((p) => (
          <div
            key={p.key}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
              p.configured
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border bg-background/40"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {p.configured ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div>
                <div className="text-xs font-medium">{p.name}</div>
                {p.key === activeProvider && (
                  <div className="text-[10px] text-primary font-mono uppercase tracking-wide">
                    Active
                  </div>
                )}
              </div>
            </div>
            <div className={cn("text-[10px] font-mono uppercase tracking-wider", p.configured ? "text-emerald-300" : "text-muted-foreground")}>
              {p.configured ? "Ready" : "Not set"}
            </div>
          </div>
        ))}
      </div>

      {!status.credentials[activeProvider] && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-xs text-amber-300">
            <span className="font-medium">⚠ Warning:</span> Active provider {activeProvider} has no credentials. Tests will fail. Set the required env vars in dashboard settings.
          </div>
        </div>
      )}
    </div>
  );
}