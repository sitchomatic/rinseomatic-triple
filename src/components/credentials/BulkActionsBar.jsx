import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BulkActionsBar({ selectedCount, onClearSelection, onDelete, onBulkDisable, isLoading }) {
  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-3 flex items-center justify-between animate-slide-up",
      "z-40"
    )}>
      <div className="text-sm font-medium">
        {selectedCount} credential{selectedCount !== 1 ? 's' : ''} selected
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkDisable}
          disabled={isLoading}
          className="gap-1.5"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Disable
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isLoading}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
          className="gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>
    </div>
  );
}