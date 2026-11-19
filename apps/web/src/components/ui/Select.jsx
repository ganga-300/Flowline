import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses } from "./Input";

/**
 * Native select with the shared control style. Pass <option> children or `options`.
 * `id`, `aria-*` and any other props go to the <select> itself, so a <Field> label can point at it.
 */
export function Select({ id, className, options, placeholder, children, ...props }) {
  return (
    <div className="relative">
      <select id={id} className={cn(controlClasses, "h-10 appearance-none pr-9", className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
    </div>
  );
}
