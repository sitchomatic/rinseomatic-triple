import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Key, Plus, Trash2, Play, Upload, Search } from "lucide-react";
import { toast } from "sonner";
import NewRunDialog from "@/components/credentials/NewRunDialog";
import CsvImportDialog from "@/components/credentials/CsvImportDialog";
import AddCredentialDialog from "@/components/credentials/AddCredentialDialog";

export default function Credentials() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = React.useState(() => new Set());
  const [search, setSearch] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [showRun, setShowRun] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data: credentials = [], isLoading } = useQuery({
    queryKey: ["credentials"],
    queryFn: () => base44.entities.Credential.list("-created_date", 5000),
    staleTime: 60_000,
  });

  const filtered = React.useMemo(() => {
    if (!search.trim()) return credentials;
    const q = search.trim().toLowerCase();
    return credentials.filter((c) =>
      (c.username || "").toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q)
    );
  }, [credentials, search]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  };
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Chunked delete for large selections.
  const deleteMut = useMutation({
    mutationFn: async (ids) => {
      const arr = [...ids];
      const CHUNK = 25;
      for (let i = 0; i < arr.length; i += CHUNK) {
        await Promise.all(arr.slice(i, i + CHUNK).map((id) => base44.entities.Credential.delete(id)));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success(`Deleted ${selected.size} credential${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e?.message || "Delete failed"),
  });

  // Bulk disable (tag for tracking, UI can hide them)
  const disableMut = useMutation({
    mutationFn: async (ids) => {
      const arr = [...ids];
      const CHUNK = 25;
      for (let i = 0; i < arr.length; i += CHUNK) {
        await Promise.all(arr.slice(i, i + CHUNK).map((id) => 
          base44.entities.Credential.update(id, { disabled: true })
        ));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credentials"] });
      toast.success(`Disabled ${selected.size} credential${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
    },
  });

  const selectedCount = selected.size;

  return (
    <div className="px-6 md:px-10 py-8 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="vault · global"
        title="Credentials"
        description="Username + password records. Test any selection against any configured site."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <Button
              size="sm" className="gap-2"
              disabled={selectedCount === 0}
              onClick={() => setShowRun(true)}
              title={selectedCount === 0 ? "Select at least one credential" : `Test ${selectedCount} credential${selectedCount === 1 ? "" : "s"}`}
            >
              <Play className="h-3.5 w-3.5" /> Test {selectedCount > 0 ? selectedCount : ""}
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username or notes…"
            className="pl-9 h-9"
          />
        </div>
        {selectedCount > 0 && (
          <>
            <div className="text-xs font-mono text-muted-foreground">{selectedCount} selected</div>
            <Button
              size="sm" variant="outline"
              className="gap-1.5"
              onClick={() => disableMut.mutate([...selected])}
              disabled={disableMut.isPending}
            >
              Disable {selectedCount}
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 border-rose-500/30"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card/40 py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No credentials yet"
          description="Add credentials manually or import a CSV to get started."
          action={
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
                <Upload className="h-3.5 w-3.5" /> Import CSV
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5" /> Add manually
              </Button>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_80px_minmax(0,2fr)] gap-3 px-4 py-2.5 border-b border-border bg-secondary/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground items-center">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
            <div>Username</div>
            <div>Password</div>
            <div>Extras</div>
            <div>Notes</div>
          </div>
          <div className="divide-y divide-border/60 max-h-[640px] overflow-y-auto thin-scroll">
            {filtered.map((c) => (
              <label
                key={c.id}
                className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_80px_minmax(0,2fr)] gap-3 px-4 py-2.5 items-center text-xs font-mono cursor-pointer hover:bg-secondary/20"
              >
                <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                <div className="truncate">{c.username}</div>
                <div className="truncate text-muted-foreground">{"•".repeat(Math.min(8, (c.password || "").length)) || "—"}</div>
                <div className="text-muted-foreground">{(c.extra_passwords?.length || 0) > 0 ? `+${c.extra_passwords.length}` : "—"}</div>
                <div className="truncate text-muted-foreground">{c.notes || "—"}</div>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">No credentials match "{search}".</div>
            )}
          </div>
        </div>
      )}

      <AddCredentialDialog open={showAdd} onOpenChange={setShowAdd} />
      <CsvImportDialog open={showImport} onOpenChange={setShowImport} />
      <NewRunDialog
        open={showRun}
        onOpenChange={setShowRun}
        credentialIds={[...selected]}
        onLaunched={(runId) => { setShowRun(false); setSelected(new Set()); navigate(`/runs/${runId}`); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selectedCount} credential${selectedCount === 1 ? "" : "s"}?`}
        description="This cannot be undone. Past test results referencing these credentials will remain."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteMut.mutate(selected)}
      />
    </div>
  );
}