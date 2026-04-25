import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROXY_OPTIONS = [
  { value: "default", label: "Use global setting" },
  { value: "classic", label: "ScrapingBee classic" },
  { value: "premium", label: "ScrapingBee premium" },
  { value: "stealth", label: "ScrapingBee stealth" },
  { value: "external", label: "External proxy" },
  { value: "none", label: "No proxy" },
];

export default function RunAdvancedSettings({ proxyMode, setProxyMode, countryCode, setCountryCode, externalProxyId, setExternalProxyId, proxies = [] }) {
  const supportsCountry = proxyMode === "premium" || proxyMode === "stealth" || proxyMode === "default";
  const enabledProxies = proxies.filter((p) => p.enabled !== false && p.protocol !== "wireguard");

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
      <div>
        <div className="text-xs font-medium">Run network override</div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Optional — leave default to use Settings. Override only when this run needs a different proxy route.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Proxy mode">
          <Select value={proxyMode} onValueChange={setProxyMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROXY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Country code" help={supportsCountry ? "ISO-2, e.g. au, us, gb." : "Ignored by this proxy mode."}>
          <Input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toLowerCase())}
            disabled={!supportsCountry}
            placeholder="au"
            className="font-mono text-xs"
          />
        </Field>
      </div>

      {proxyMode === "external" && (
        <Field label="External proxy" help="HTTP/HTTPS/SOCKS5 proxies from Settings. WireGuard entries are excluded.">
          <Select value={externalProxyId} onValueChange={setExternalProxyId}>
            <SelectTrigger><SelectValue placeholder="Select proxy…" /></SelectTrigger>
            <SelectContent>
              {enabledProxies.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label || `${p.host}:${p.port}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground leading-snug">{help}</p>}
    </div>
  );
}