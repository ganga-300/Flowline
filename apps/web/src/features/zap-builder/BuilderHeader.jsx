"use client";

import { useState } from "react";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Top bar: back, editable Zap name, whether there are unsaved changes, and Publish / Save
 * changes. onLeave: Back and Cancel (asks first when there are unsaved changes).
 */
export function BuilderHeader({ zapName, onRename, isEditing, isDirty, isPublishing, onPublish, onLeave }) {
  const [editingName, setEditingName] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onLeave} aria-label="Back to Zaps" className="rounded-control p-2 text-ink-muted hover:bg-subtle hover:text-ink cursor-pointer">
          <ArrowLeft className="size-4" />
        </button>
        <div className="h-5 w-px bg-line" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              aria-label="Zap name"
              value={zapName}
              onChange={(e) => onRename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditingName(false)}
              className="h-9 w-full max-w-sm rounded-control border border-primary bg-surface px-2.5 text-base font-semibold text-ink outline-none ring-2 ring-primary/20"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group flex min-w-0 items-center gap-2 rounded-control px-2.5 py-1.5 hover:bg-subtle cursor-pointer"
              title="Rename"
            >
              <span className="truncate text-base font-semibold text-ink">{zapName || "Untitled Zap"}</span>
              <Pencil className="size-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <Badge tone={isEditing ? "neutral" : "primary"} className="hidden shrink-0 sm:inline-flex">{isEditing ? "Editing" : "Draft"}</Badge>
          <span
            aria-live="polite"
            className={cn("hidden shrink-0 items-center gap-1.5 text-xs md:inline-flex", isDirty ? "text-warning" : "text-ink-faint")}
          >
            {isDirty ? (
              <><span className="size-1.5 rounded-full bg-warning" />Unsaved changes</>
            ) : (
              isEditing && <><Check className="size-3.5" />All changes saved</>
            )}
          </span>
        </div>

        <Button variant="ghost" onClick={onLeave} className="hidden sm:inline-flex">Cancel</Button>
        <Button onClick={onPublish} loading={isPublishing}>{isEditing ? "Save changes" : "Publish"}</Button>
      </div>
    </header>
  );
}
