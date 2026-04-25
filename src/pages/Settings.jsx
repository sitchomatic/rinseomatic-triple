import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import ProviderSelectorPanel from "@/components/settings/ProviderSelectorPanel";
import ProxySettingsPanel from "@/components/settings/ProxySettingsPanel.jsx";
import ExternalProxiesManager from "@/components/settings/ExternalProxiesManager";
import DiagnosticsPanel from "@/components/settings/DiagnosticsPanel";
import SiteSandbox from "@/components/settings/SiteSandbox";
import { Plus, Trash2, Sparkles, Pencil, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = {
  key: "", label: "", login_url: "",
  username_selector: "input[type='email'], input[name='username']",
  password_selector: "input[type='password']",
  submit_selector: "button[type='submit']",
  success_selector: ".ol-alert__content.ol-alert__content--status_success",
  login_url_marker: "/login",
  success_url_contains: "",
  wait_after_submit_ms: 3500,
  enabled: true,
  lenient_success: false,
};

export default function Settings() {
  const qc = useQueryClient();
  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => base44.entities.Site.list("-created_date", 100),
    staleTime: 5 * 60_000,
  });
  const { data: proxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: () => base44.entities.Proxy.list("-created_date", 100),
    staleTime: 60_000,
  });
  const { data: appSettings = [] } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => base44.entities.AppSettings.list("-created_date", 1),
    staleTime: 60_000,
  });

  const [draft, setDraft] = React.useState(BLANK);
  const [confirmDelete, setConfirmDelete] = React.useState(null);
  const [sandboxSite, setSandboxSite] = React.useState(null);

  const saveMut = useMutation({
    mutationFn: async (d) => {
      const existing = d.id
        ? await base44.entities.Site.update(d.id, d)
        : await base44.entities.Site.create(d);
      return existing;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      setDraft(BLANK);
      toast.success("Site saved");
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Site.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sites"] }); toast.success("Site deleted"); },
  });
  const seedMut = useMutation({
    mutationFn: () => base44.functions.invoke("seedSites", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sites"] }); toast.success("Seeded default sites"); },
    onError: (e) => toast.error(e?.response?.data?.error || e.message),
  });

  const editing = !!draft.id;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="03 · config"
        title="Settings"
        description="Sites, proxies, and browser defaults. API tokens are stored server-side as secrets."
        actions={
          <Button
            size="sm" variant="outline" className="gap-2"
            onClick={() => seedMut.mutate()}
            disabled={seedMut.isPending}
            title="Creates the starter sites (Joe, Ignition, PPSR, Double). Existing sites are skipped — safe to re-run any time."
          >
            <Sparkles className="h-3.5 w-3.5" /> {seedMut.isPending ? "Seeding…" : sites.length === 0 ? "Seed default sites" : "Re-seed missing"}
          </Button>
        }
      />

      <div className="space-y-6 mb-8">
        <ProviderSelectorPanel settings={appSettings[0]} />
        <ProxySettingsPanel proxies={proxies} />
        <DiagnosticsPanel />
        <ExternalProxiesManager proxies={proxies} />
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Configured sites · {sites.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Every credential belongs to a site. The runner uses the site's login URL and selectors to submit the form, then checks the success marker to decide if the login worked.
            </div>
          </div>
          {sites.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/40 py-10 text-center text-sm text-muted-foreground">
              No sites yet. Add one on the right, or click "Seed defaults".
            </div>
          )}
          {sites.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border bg-card p-4 transition-colors",
                draft.id === s.id ? "border-primary/60 ring-1 ring-primary/20" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {s.label}
                      <span className="text-muted-foreground font-mono text-xs">· {s.key}</span>
                      {!s.enabled && <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded px-1.5 py-0.5">disabled</span>}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">{s.login_url}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="gap-1.5"
                    onClick={() => setSandboxSite(s)}
                    disabled={!s.login_url}
                    title={s.login_url ? "Run a one-off login attempt with sandbox credentials to verify the selectors work" : "This site has no login URL — selectors can't be tested directly"}>
                    <FlaskConical className="h-3 w-3" /> Test
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5"
                    onClick={() => setDraft(s)}
                    title="Load this site into the form on the right for editing">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                    onClick={() => setConfirmDelete(s)}
                    title="Delete this site (credentials referencing it will remain but become untestable)">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-muted-foreground">
                <div>user: <span className="text-foreground/80 truncate inline-block max-w-full align-bottom">{s.username_selector}</span></div>
                <div>pass: <span className="text-foreground/80 truncate inline-block max-w-full align-bottom">{s.password_selector}</span></div>
                <div>submit: <span className="text-foreground/80 truncate inline-block max-w-full align-bottom">{s.submit_selector}</span></div>
                <div>success: <span className="text-foreground/80 truncate inline-block max-w-full align-bottom">{s.success_selector}</span></div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 h-fit sticky top-6">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">{editing ? "Edit site" : "Add site"}</div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Describe how to log in: the URL, which fields to fill, and how to detect success.
          </p>

          <Field
            label="Key (slug)"
            help="Short unique ID used internally (e.g. 'joe'). Credentials and runs reference this."
            value={draft.key} onChange={(v) => setDraft({ ...draft, key: v })}
          />
          <Field
            label="Label"
            help="Human-friendly name shown in the UI (e.g. 'Joe Fortune')."
            value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })}
          />
          <Field
            label="Login URL"
            help="Full URL the runner navigates to before filling the form."
            value={draft.login_url} onChange={(v) => setDraft({ ...draft, login_url: v })}
          />
          <Field
            label="Username selector" mono
            help="CSS selector for the email/username input."
            value={draft.username_selector} onChange={(v) => setDraft({ ...draft, username_selector: v })}
          />
          <Field
            label="Password selector" mono
            help="CSS selector for the password input."
            value={draft.password_selector} onChange={(v) => setDraft({ ...draft, password_selector: v })}
          />
          <Field
            label="Submit selector" mono
            help="CSS selector for the submit button."
            value={draft.submit_selector} onChange={(v) => setDraft({ ...draft, submit_selector: v })}
          />
          <Field
            label="Success selector" mono
            help="CSS selector that only appears AFTER a successful login (e.g. welcome banner). If visible → credential marked 'working'."
            value={draft.success_selector} onChange={(v) => setDraft({ ...draft, success_selector: v })}
          />
          <Field
            label="Login URL marker" mono
            help="If the post-submit URL STILL contains this substring (e.g. '/login'), the attempt is treated as failed."
            value={draft.login_url_marker} onChange={(v) => setDraft({ ...draft, login_url_marker: v })}
          />
          <Field
            label="Success URL contains" mono
            help="Optional. If the post-submit URL contains this substring (e.g. '/dashboard'), the attempt counts as working even without the success selector."
            value={draft.success_url_contains || ""} onChange={(v) => setDraft({ ...draft, success_url_contains: v })}
          />
          <Field
            label="Wait after submit (ms)" type="number"
            help="How long to wait after clicking submit before checking for success. Increase for slow sites; decrease to speed up testing."
            value={draft.wait_after_submit_ms} onChange={(v) => setDraft({ ...draft, wait_after_submit_ms: Number(v) || 0 })}
          />

          <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/40 px-3 py-2"
            title="Off (default): a credential is only 'working' when the success selector or success URL is matched. On: also count any non-login URL (that wasn't blocked) as working — convenient but causes false positives.">
            <div>
              <div className="text-xs">Lenient success detection</div>
              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                {draft.lenient_success
                  ? "Counts 'left login page' as success even without a success marker."
                  : "Strict — requires success selector or success URL to count as working."}
              </div>
            </div>
            <Switch checked={!!draft.lenient_success} onCheckedChange={(v) => setDraft({ ...draft, lenient_success: v })} />
          </label>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <label className="flex items-center gap-2 cursor-pointer" title="When off, this site is hidden from run pickers and new credentials can't target it.">
              <Switch checked={!!draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
              <div className="text-xs">
                <div>Enabled</div>
                <div className="text-[10px] text-muted-foreground">{draft.enabled ? "Available in run pickers" : "Hidden from run pickers"}</div>
              </div>
            </label>
            <div className="flex gap-2">
              {editing && (
                <Button variant="outline" size="sm" onClick={() => setDraft(BLANK)} title="Discard changes and clear the form">
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => saveMut.mutate(draft)}
                disabled={!draft.key || !draft.label || (!draft.login_url && !draft.skip_primary) || saveMut.isPending}
                title={
                  !draft.key || !draft.label
                    ? "Key and label are required"
                    : (!draft.login_url && !draft.skip_primary)
                      ? "Login URL is required (or enable 'Skip primary' for aggregator sites)"
                      : editing ? "Save changes to this site" : "Create this site"
                }
              >
                {saveMut.isPending ? "Saving…" : editing ? "Save site" : "Add site"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete site?"
        description={confirmDelete ? `${confirmDelete.label} (${confirmDelete.key}) will be permanently removed. Existing credentials and runs referencing this site will remain but will no longer be testable.` : ""}
        confirmLabel="Delete site"
        destructive
        onConfirm={() => { if (confirmDelete) deleteMut.mutate(confirmDelete.id); setConfirmDelete(null); }}
      />

      <SiteSandbox
        open={!!sandboxSite}
        onOpenChange={(v) => !v && setSandboxSite(null)}
        site={sandboxSite}
      />
    </div>
  );
}

function Field({ label, help, value, onChange, mono, type = "text" }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={mono ? "font-mono text-xs" : ""} />
      {help && <p className="text-[10px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}