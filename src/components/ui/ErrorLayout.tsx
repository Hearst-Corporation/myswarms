import type { ReactNode } from "react";

interface ErrorLayoutProps {
  title: string;
  message?: string;
  children?: ReactNode;
}

export function ErrorLayout({ title, message, children }: ErrorLayoutProps) {
  return (
    <section role="alert" className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-content-strong">{title}</h1>
      {message ? <p className="mt-2 text-sm text-content-muted">{message}</p> : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
