import { Skeleton } from '#/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      {/* Stats skeleton */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-[var(--surface)] p-4">
            <div className="mb-1 flex items-center justify-between">
              <Skeleton className="h-7 w-10" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </section>

      {/* Tabs skeleton */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Platform filter skeleton */}
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      {/* Job rows skeleton */}
      <section className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="island-shell flex w-full flex-col gap-2 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16 rounded-md" />
                <Skeleton className="h-4 w-12 rounded-md" />
              </div>
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

export default DashboardSkeleton
