import React, { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { parseCSV } from "@/lib/csv";

// Lightweight CSV import for the global vault. Expects rows of:
//   username, password [, extra1, extra2, ...]
// First line may be a header (auto-detected and skipped).
export default function CsvImportDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [text, setText] = React.useState("");
  const fileInputRef = useRef(null);

  React.useEffect(() => { if (open) setText(""); }, [open]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setText(event.target.result);
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const preview = React.useMemo(() => {
    const rows = parseCSV(text);
    if (rows.length === 0) return { records: [], skippedHeader: false };
    const first = rows[0].map((c) => (c || "").toLowerCase());
    const hasHeader = first.includes("username") || first.includes("email") || first.includes("password");
    const data = hasHeader ? rows.slice(1) : rows;
    const records = data
      .map((r) => ({
        username: (r[0] || "").trim(),
        password: (r[1] || "").trim(),
        extra_passwords: r.slice(2).map((x) => (x || "").trim()).filter(Boolean),
      }))
      .filter((r) => r.username && r.password);
    return { records, skippedHeader: hasHeader };
  }, [text]);

  const mut = useMutation({
    mutationFn: async (records) => {
      const CHUNK = 50;
      let totalCreated = 0;
      let totalUpdated = 0;
      
      for (let i = 0; i < records.length; i += CHUNK) {
        const batch = records.slice(i, i + CHUNK);
        const usernames = batch.map(r => r.username);
        
        const existing = await base44.entities.Credential.filter({ username: { $in: usernames } }, null, CHUNK);
        const existingMap = new Map(existing.map(c => [c.username.toLowerCase(), c]));
        
        const toCreate = [];
        const toUpdate = [];
        
        for (const rec of batch) {
          const usernameLower = rec.username.toLowerCase();
          if (existingMap.has(usernameLower)) {
             toUpdate.push({ id: existingMap.get(usernameLower).id, data: rec });
          } else {
             toCreate.push(rec);
          }
        }
        
        if (toCreate.length > 0) {
          await base44.entities.Credential.bulkCreate(toCreate);
          totalCreated += toCreate.length;
        }
        
        for (const up of toUpdate) {
          await base44.entities.Credential.update(up.id, up.data);
          totalUpdated++;
        }
      }
      return { created: totalCreated, updated: totalUpdated };
    },
    onSuccess: ({ created, updated }) => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success(`Imported: ${created} created, ${updated} updated`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Import failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-snug">
            Paste rows in the format <span className="font-mono text-foreground">username, password, [extra1, extra2…]</span>. A header row is auto-detected.
          </p>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">CSV content</Label>
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
              />
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs gap-1.5" 
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload CSV File
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder="username,password&#10;alice@example.com,hunter2&#10;bob@example.com,letmein,oldpass1,oldpass2"
            />
          </div>
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
            {preview.records.length > 0
              ? <>Will import <span className="text-foreground">{preview.records.length}</span> credential{preview.records.length === 1 ? "" : "s"}{preview.skippedHeader ? " (header row skipped)" : ""}.</>
              : "No valid rows detected yet."}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate(preview.records)}
            disabled={preview.records.length === 0 || mut.isPending}
          >
            {mut.isPending ? "Importing…" : `Import ${preview.records.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}