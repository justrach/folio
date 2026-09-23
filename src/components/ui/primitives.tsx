import type { ButtonHTMLAttributes, HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import clsx from "clsx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "quiet";
};

/** One semantic action style for native buttons and navigation links. */
export function UiButton({ asChild = false, variant = "primary", className, children, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={clsx("folio-button", className)} data-variant={variant} {...props}>{children}</Component>;
}

type SurfaceProps = HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "aside" | "div" };
export function UiSurface({ as: Component = "div", className, ...props }: SurfaceProps) {
  return <Component className={clsx("folio-surface", className)} {...props} />;
}

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & { label: string; hint?: string; children: ReactNode };
export function UiField({ label, hint, className, children, ...props }: FieldProps) {
  return <label className={clsx("folio-field", className)} {...props}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "accent" };
export function UiBadge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={clsx("folio-badge", className)} data-tone={tone} {...props} />;
}
