import { ReactNode, Suspense, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Skeleton } from "@/components/ui/skeleton";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 animate-fade-in">
          <Suspense
            fallback={
              <div className="grid min-h-full place-items-center rounded-3xl border border-dashed border-muted/50 bg-muted/5 p-8 text-sm text-muted-foreground">
                <div className="flex w-full max-w-4xl flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Skeleton className="h-28 rounded-3xl md:col-span-1" />
                    <Skeleton className="h-28 rounded-3xl md:col-span-1" />
                    <Skeleton className="h-28 rounded-3xl md:col-span-1" />
                  </div>
                  <div className="grid gap-4">
                    <Skeleton className="h-14 rounded-3xl" />
                    <Skeleton className="h-56 rounded-3xl" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Loading page content…</p>
                </div>
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
};
