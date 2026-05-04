import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Wand2, AlertTriangle, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BLANK = {
  key: "",
  label: "",
  login_url: "",
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

const STEPS = [
  { id: "basics", title: "Site basics" },
  { id: "selectors", title: "Form selectors" },
  { id: "validate", title: "Validate live" },
  { id: "success", title: "Success markers" },
  { id: "review", title: "Review & save" },
];

export default function SiteWizard({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState(BLANK);
  const [validating, setValidating] = React.useState(false);
  const [validation, setValidation] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      setStep(0);
      setDraft(BLANK);
      setValidation(null);
    }
  }, [open]);

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const saveMut = useMutation({
    mutationFn: (d) => base44.entities.Site.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site created");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Couldn't save site"),
  });

  const runValidate = async () => {
    setValidating(true);
    setValidation(null);
    try {
      const res = await base44.functions.invoke("validateSelectors", {
        login_url: draft.login_url,
        username_selector: draft.username_selector,
        password_selector: draft.password_selector,
        submit_selector: draft.submit_selector,
        success_selector: draft.success_selector,
        capture_screenshot: true,
      });
      setValidation(res?.data || res);
    } catch (e) {
      setValidation({ ok: false, error: e?.message || "Validation failed" });
    } finally {
      setValidating(false);
    }
  };

  const canNext = () => {
    if (step === 0) return draft.key && draft.label && draft.login_url;
    if (step === 1) return draft.username_selector && draft.password_selector && draft.submit_selector;
    if (step === 2) {
      const c = validation?.checks;
      return !!c && c.username?.found && c.password?.found && c.submit?.found;
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            New site wizard · Step {step + 1} of {STEPS.length}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex-1 flex items-center gap-1.5">
              <div className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-border"
              )} />
            </div>
          ))}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-4">
          {STEPS[step].title}
        </div>

        <div className="space-y-3 min-h-[280px]">
          {step === 0 && (
            <>
              <p className="text-xs text-muted-foreground">Identify the site and where the runner should start.</p>
              <Field label="Key (slug)" help="Short unique ID (e.g. 'joe')." value={draft.key} onChange={(v) => update({ key: v })} />
              <Field label="Label" help="Friendly display name." value={draft.label} onChange={(v) => update({ label: v })} />
              <Field label="Login URL" help="Full URL the runner navigates to." value={draft.login_url} onChange={(v) => update({ login_url: v })} />
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-xs text-muted-foreground">CSS selectors for the form fields. We'll validate them live in the next step.</p>
              <Field mono label="Username selector" value={draft.username_selector} onChange={(v) => update({ username_selector: v })} />
              <Field mono label="Password selector" value={draft.password_selector} onChange={(v) => update({ password_selector: v })} />
              <Field mono label="Submit selector" value={draft.submit_selector} onChange={(v) => update({ submit_selector: v })} />
            </>
          )}

          {step === 2 && (
            <ValidationStep
              draft={draft}
              validating={validating}
              validation={validation}
              onValidate={runValidate}
            />
          )}

          {step === 3 && (
            <>
              <p className="text-xs text-muted-foreground">How should the runner detect a successful login? Provide one or both signals.</p>
              <Field mono label="Success selector" help="Element only present when logged in." value={draft.success_selector} onChange={(v) => update({ success_selector: v })} />
              <Field mono label="Success URL contains" help="Substring of the post-login URL (e.g. '/dashboard')." value={draft.success_url_contains} onChange={(v) => update({ success_url_contains: v })} />
              <Field mono label="Login URL marker" help="If post-submit URL still contains this, treat as failed." value={draft.login_url_marker} onChange={(v) => update({ login_url_marker: v })} />
              <label className="flex items-start justify-between gap-3 cursor-pointer rounded-md border border-border bg-background/40 px-3 py-2">
                <div>
                  <div className="text-xs">Lenient success detection</div>
                  <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    Count "left login page" as success when no marker exists.
                  </div>
                </div>
                <Switch checked={!!draft.lenient_success} onCheckedChange={(v) => update({ lenient_success: v })} />
              </label>
            </>
          )}

          {step === 4 && (
            <ReviewStep draft={draft} validation={validation} />
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="gap-1.5"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => saveMut.mutate(draft)}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Create site"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ValidationStep({ draft, validating, validation, onValidate }) {
  const checks = validation?.checks;
  const rows = [
    ["username", "Username field", draft.username_selector],
    ["password", "Password field", draft.password_selector],
    ["submit", "Submit button", draft.submit_selector],
    ["success", "Success marker (optional now)", draft.success_selector],
  ];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Loads <span className="font-mono text-foreground">{draft.login_url}</span> in a real headless browser
          and checks each selector. Username, password & submit must be found before continuing.
        </p>
        <Button size="sm" onClick={onValidate} disabled={validating} className="gap-1.5 shrink-0">
          {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          {validating ? "Probing…" : "Run validation"}
        </Button>
      </div>

      {validation?.error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="break-all">{validation.error}</div>
        </div>
      )}

      {checks && (
        <div className="rounded-md border border-border bg-secondary/20 divide-y divide-border/60">
          {rows.map(([k, label, sel]) => {
            const c = checks[k] || {};
            const required = k !== "success";
            const ok = c.found;
            return (
              <div key={k} className="grid grid-cols-[20px_1fr_auto] gap-2 items-center px-3 py-2">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : required ? (
                  <XCircle className="h-4 w-4 text-rose-300" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="text-xs">{label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">{sel || "—"}</div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {ok ? `${c.count} match${c.count === 1 ? "" : "es"}${c.visible ? " · visible" : ""}` : "not found"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {validation?.screenshot && (
        <div className="rounded-md border border-border bg-background overflow-hidden">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-3 py-1.5 border-b border-border">
            Live preview · {validation.finalUrl}
          </div>
          <img src={validation.screenshot} alt="login page preview" className="w-full" />
        </div>
      )}
    </>
  );
}

function ReviewStep({ draft, validation }) {
  const c = validation?.checks;
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">Confirm the configuration before saving.</p>
      <Row label="Key" value={draft.key} />
      <Row label="Label" value={draft.label} />
      <Row label="Login URL" value={draft.login_url} mono />
      <Row label="Username sel" value={draft.username_selector} mono ok={c?.username?.found} />
      <Row label="Password sel" value={draft.password_selector} mono ok={c?.password?.found} />
      <Row label="Submit sel" value={draft.submit_selector} mono ok={c?.submit?.found} />
      <Row label="Success sel" value={draft.success_selector || "—"} mono ok={c?.success?.found} />
      <Row label="Success URL" value={draft.success_url_contains || "—"} mono />
      <Row label="Lenient success" value={draft.lenient_success ? "on" : "off"} />
    </div>
  );
}

function Row({ label, value, mono, ok }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className={cn("truncate text-right", mono && "font-mono text-[11px]")}>
        {ok === true && <CheckCircle2 className="h-3 w-3 text-emerald-300 inline mr-1" />}
        {ok === false && <XCircle className="h-3 w-3 text-rose-300 inline mr-1" />}
        {value}
      </span>
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