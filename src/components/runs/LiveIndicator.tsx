interface LiveIndicatorProps {
  intervalSeconds?: number;
}

export function LiveIndicator({ intervalSeconds = 5 }: LiveIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm text-content-muted">
      <span className="relative flex size-2" aria-hidden="true">
        <span
          className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: "var(--cos-accent)" }}
        />
        <span
          className="relative inline-flex size-2 rounded-full"
          style={{ backgroundColor: "var(--cos-accent)" }}
        />
      </span>
      Live · auto-refresh ({intervalSeconds}s)
    </span>
  );
}
