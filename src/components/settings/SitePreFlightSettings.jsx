import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plane } from "lucide-react";

// Lets the operator configure neutral "warm-up" URLs the runner should
// visit (and dwell on) before navigating to the login page. Mimics organic
// browsing — the runner picks one at random per attempt, scrolls a little,
// then continues to /login.
export default function SitePreFlightSettings({ draft, setDraft }) {
  const text = (draft.pre_flight_paths || []).join("\n");
  const setPaths = (raw) => {
    const list = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    setDraft({ ...draft, pre_flight_paths: list });
  };

  return (
    <div className="rounded-md border border-border bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Plane className="h-3.5 w-3.5 text-primary" />
        <div className="text-xs font-medium">Pre-flight navigation</div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug -mt-1">
        Optional. Before opening the login page, visit one of these neutral URLs
        (FAQ, blog, /about, homepage) and dwell for a randomised duration. Reduces
        instant-login flagging by anti-bot systems.
      </p>

      <div className="grid gap-1">
        <Label className="text-xs">Neutral URLs (one per line)</Label>
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setPaths(e.target.value)}
          placeholder={"https://example.com/faq\nhttps://example.com/blog"}
          className="font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground leading-snug">
          Leave empty to skip pre-flight. One URL is picked at random per attempt.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">Min dwell (ms)</Label>
          <Input
            type="number"
            value={draft.pre_flight_min_ms ?? 3500}
            onChange={(e) => setDraft({ ...draft, pre_flight_min_ms: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Max dwell (ms)</Label>
          <Input
            type="number"
            value={draft.pre_flight_max_ms ?? 8000}
            onChange={(e) => setDraft({ ...draft, pre_flight_max_ms: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}