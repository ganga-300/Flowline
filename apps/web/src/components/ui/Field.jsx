"use client";

import { Children, cloneElement, isValidElement, useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Label + control + hint/error, consistently spaced.
 * Without `htmlFor`, a single child control gets a generated id so the label is tied to it,
 * and the hint or error is linked with aria-describedby.
 */
export function Field({ label, htmlFor, hint, error, required, className, children }) {
  const autoId = useId();
  const messageId = `${autoId}-message`;
  const message = error || hint;

  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const controlId = htmlFor ?? only?.props.id ?? autoId;

  let control = children;
  if (only) {
    const extra = {};
    if (!htmlFor && !only.props.id) extra.id = autoId;
    // cn() just joins truthy strings, which is also how id lists are written.
    if (message) extra["aria-describedby"] = cn(only.props["aria-describedby"], messageId);
    if (Object.keys(extra).length > 0) control = cloneElement(only, extra);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={only || htmlFor ? controlId : undefined} className="block text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={messageId} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
