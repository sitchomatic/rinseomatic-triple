import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Wifi, Save } from "lucide-react";
import { toast } from "sonner";

export default function BrowserlessSettingsPanel({ settings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(settings);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      if (d.id) {
        return base44.entities.AppSettings.update(d.id, {
          browserless_endpoint: d.browserless_endpoint,
          browserless_stealth_proxy: d.browserless_stealth_proxy,
          browserless_headful: d.browserless_headful,
          timeout_ms: d.timeout_ms,
          viewport_width: d.viewport_width,
          viewport_height: d.viewport_height,
          capture_video: d.capture_video,
          recording_retention_days: d.recording_retention_days,
        });
      }
      return base44.entities.AppSettings.create({ ...d, singleton_key: "global" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Browserless settings saved");
    },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-xs text-muted-foreground">Loading settings…</div>
      </div>
    );
  }

  const isDirty =
    draft.browserless_endpoint !== settings?.browserless_endpoint ||
    draft.browserless_stealth_proxy !== settings?.browserless_stealth_proxy ||
    draft.browserless_headful !== settings?.browserless_headful ||
    draft.timeout_ms !== settings?.timeout_ms ||
    draft.viewport_width !== settings?.viewport_width ||
    draft.viewport_height !== settings?.viewport_height ||
    draft.capture_video !== settings?.capture_video ||
    draft.recording_retention_days !== settings?.recording_retention_days;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Wifi className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Browserless settings</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Endpoint, proxy mode, recording, and timeout configuration.
          </div>
        </div>
        {isDirty && (
          <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
            <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Endpoint" help="Browserless endpoint host (e.g. chrome.browserless.io).">
          <Input
            value={draft.browserless_endpoint || "chrome.browserless.io"}
            onChange={(e) => setDraft({ ...draft, browserless_endpoint: e.target.value })}
            placeholder="chrome.browserless.io"
            className="font-mono text-xs"
          />
        </Field>

        <Field label="Timeout (ms)" help="Max session duration.">
          <Input
            type="number"
            value={draft.timeout_ms ?? 60000}
            onChange={(e) => setDraft({ ...draft, timeout_ms: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Viewport width">
          <Input
            type="number"
            value={draft.viewport_width ?? 1920}
            onChange={(e) => setDraft({ ...draft, viewport_width: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Viewport height">
          <Input
            type="number"
            value={draft.viewport_height ?? 1080}
            onChange={(e) => setDraft({ ...draft, viewport_height: Number(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Recording retention (days)" help="How long to keep session recordings.">
          <Input
            type="number"
            value={draft.recording_retention_days ?? 30}
            onChange={(e) => setDraft({ ...draft, recording_retention_days: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="space-y-2 pt-2 border-t border-border/60">
        <Toggle
          label="Stealth proxy"
          help="Enable stealth proxy mode to bypass detection. Improves success rate on protected sites."
          checked={draft.browserless_stealth_proxy !== false}
          onChange={(v) => setDraft({ ...draft, browserless_stealth_proxy: v })}
        />
        <Toggle
          label="Headful mode (Live Debugging)"
          help="Turn off headless mode so you can visually watch the browser execute steps in your Browserless live-view dashboard."
          checked={draft.browserless_headful === true}
          onChange={(v) => setDraft({ ...draft, browserless_headful: v })}
        />
        <Toggle
          label="Capture video"
          help="Record WebM video of login sessions. Stored in private storage."
          checked={draft.capture_video !== false}
          onChange={(v) => setDraft({ ...draft, capture_video: v })}
        />
      </div>
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs">{label}</div>
        {help && <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{help}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}