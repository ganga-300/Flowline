import Link from "next/link";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

const variants = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-card",
  secondary: "bg-subtle text-ink hover:bg-line",
  outline: "bg-surface text-ink border border-line hover:bg-subtle",
  ghost: "text-ink-muted hover:text-ink hover:bg-subtle",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/**
 * Button or link styled as a button.
 * <Button>Save</Button> · <Button href="/zaps/new" variant="primary">Create</Button>
 */
export function Button({
  variant = "primary",
  size = "md",
  href,
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
    variants[variant],
    sizes[size],
    className
  );
  const content = (
    <>
      {loading ? <Spinner className="size-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
}
