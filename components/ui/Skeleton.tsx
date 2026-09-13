export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton-shimmer rounded-md ${className}`} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-40" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} className="mt-2 h-3 w-full" />
      ))}
    </div>
  );
}
