import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cloud, Save } from "lucide-react";
import { toast } from "sonner";

export default function BrowserbaseSettingsPanel({ settings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState(settings);

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      if (d.id) {
        return base44.entities.AppSettings.update(d.id, {
          browserbase_project_id: d.browserbase_project_id,
          browserbase_api_key: d.browserbase_api_key,
          browserbase_region: d.browserbase_region,
          browserbase_keep_alive: d.browserbase_keep_alive,
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
      toast.success("Browserbase settings saved");
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
    draft.browserbase_project_id !== settings?.browserbase_project_id ||
    draft.browserbase_api_key !== settings?.browserbase_api_key ||
    draft.browserbase_region !== settings?.browserbase_region ||
    draft.browserbase_keep_alive !== settings?.browserbase_keep_alive ||
    draft.timeout_ms !== settings?.timeout_ms ||
    draft.viewport_width !== settings?.viewport_width ||
    draft.viewport_height !== settings?.viewport_height ||
    draft.capture_video !== settings?.capture_video ||
    draft.recording_retention_days !== settings?.recording_retention_days;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Cloud className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium">Browserbase settings</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Session region, recording options, and timeout configuration.
          </div>
        </div>
        {isDirty && (
          <Button size="sm" className="gap-1.5 h-7" onClick={() => saveMut.mutate(draft)} disabled={saveMut.isPending}>
            <Save className="h-3 w-3" /> {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project ID" help="Overrides env secret BROWSERBASE_PROJECT_ID.">
          <Input
            value={draft.browserbase_project_id || ""}
            onChange={(e) => setDraft({ ...draft, browserbase_project_id: e.target.value })}
            placeholder="prj_..."
            className="font-mono text-xs"
          />
        </Field>

        <Field label="API Key" help="Overrides env secret BROWSERBASE_API_KEY.">
          <Input
            type="password"
            value={draft.browserbase_api_key || ""}
            onChange={(e) => setDraft({ ...draft, browserbase_api_key: e.target.value })}
            placeholder="••••••••••••"
            className="font-mono text-xs"
          />
        </Field>

        <Field label="Session region" help="Where Browserbase spins up browser sessions.">
          <Select
            value={draft.browserbase_region || "us-west-2"}
            onValueChange={(v) => setDraft({ ...draft, browserbase_region: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us-west-2">US West 2 (default)</SelectItem>
              <SelectItem value="us-east-1">US East 1</SelectItem>
              <SelectItem value="eu-central-1">EU Central 1</SelectItem>
              <SelectItem value="ap-southeast-1">AP Southeast 1</SelectItem>
              <SelectItem value="au">Australia (AU) - Max Stealth</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Timeout (ms)" help="Max session duration. Browserbase max: 600000 (10 min).">
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
          label="Keep alive"
          help="Keep session alive after disconnection for debugging. Incurs extra cost."
          checked={!!draft.browserbase_keep_alive}
          onChange={(v) => setDraft({ ...draft, browserbase_keep_alive: v })}
        />
        <Toggle
          label="Capture video"
          help="Record video of login sessions. Stored in private storage."
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