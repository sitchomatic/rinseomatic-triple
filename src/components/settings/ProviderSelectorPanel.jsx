import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Zap, Save } from "lucide-react";
import { toast } from "sonner";

const PROVIDERS = [
  {
    value: "scrapingbee",
    label: "ScrapingBee",
    description: "Stateless, pay-per-request. Premium proxy tier (25 credits/request). Production-proven.",
  },
  {
    value: "browserbase",
    label: "Browserbase",
    description: "Managed sessions, session recording, remote debugging. Region-based routing.",
  },
  {
    value: "browserless",
    label: "Browserless",
    description: "WebSocket-based CDP, stealth proxy, automatic WebM recording.",
  },
];

export default function ProviderSelectorPanel({ settings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(settings);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      if (d.id) {
        return base44.entities.AppSettings.update(d.id, { provider: d.provider });
      }
      return base44.entities.AppSettings.create({ ...d, singleton_key: "global" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Provider changed");
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const provider = draft?.provider || "scrapingbee";
  const info = PROVIDERS.find((p) => p.value === provider);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Zap className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Browser automation provider</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Choose which cloud browser service to use for login testing. Affects cost, speed, and features.
          </div>
        </div>
        {draft?.provider !== settings?.provider && (
          <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
            <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">Provider</Label>
        <Select value={provider} onValueChange={(v) => setDraft({ ...draft, provider: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {info && <p className="text-[10px] text-muted-foreground leading-snug mt-1">{info.description}</p>}
      </div>
    </div>
  );
}