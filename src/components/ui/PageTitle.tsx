import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface PageTitleProps {
  variant?: "default" | "mono";
  children: ReactNode;
  style?: CSSProperties; // forwarded as-is to <h1>
}

export function PageTitle({ variant, children, style }: PageTitleProps) {
  return (
    <h1
      className={cn(
        "text-xl font-semibold tracking-tight text-content-strong",
        variant === "mono" && "font-mono",
      )}
      style={style}
    >
      {children}
    </h1>
  );
}
