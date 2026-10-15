import { useEffect, useState } from "react";
import { User, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicLeadership } from "@/data/landingData";

const LeadershipSection = () => {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    const loadLeadership = async () => {
      try {
        const data = await fetchPublicLeadership();
        setLeaders(data);
      } catch (error) {
        console.error("Failed to load leadership:", error);
      } finally {
        setLoading(false);
      }
    };

    loadLeadership();
  }, []);

  if (loading) {
    return (
      <section id="leadership" className="py-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <Skeleton className="mx-auto h-9 w-56" />
            <Skeleton className="mx-auto mt-3 h-5 w-96" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="border-0 bg-white p-5 text-center shadow-sm">
                <Skeleton className="mx-auto h-20 w-20 rounded-full" />
                <Skeleton className="mx-auto mt-4 h-5 w-3/4" />
                <Skeleton className="mx-auto mt-2 h-4 w-1/2" />
                <Skeleton className="mx-auto mt-2 h-4 w-full" />
                <Skeleton className="mx-auto mt-1 h-4 w-5/6" />
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="leadership" className="py-16 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            Our Leadership
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            Meet the dedicated team serving our community
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {leaders.map((leader) => (
            <Card key={leader.id} className="border-0 bg-white p-5 text-center shadow-sm transition-all hover:shadow-md">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#1E3A8A]/10">
                <User className="h-10 w-10 text-[#1E3A8A]" />
              </div>
              
              <h3 className="mt-4 font-display font-bold text-[#0F172A]">
                {leader.fullName}
              </h3>
              
              <p className="mt-1 text-sm font-semibold text-[#F59E0B]">
                {leader.role}
              </p>
              
              <p className="mt-2 text-sm text-gray-600">
                {leader.description}
              </p>
            </Card>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {leaders.length > 5 && (
            <Button
              size="lg"
              variant="outline"
              className="border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A]/10"
              onClick={() => setAllOpen(true)}
            >
              View Full Leadership ({leaders.length})
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
          <Button
            size="lg"
            className="bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90"
            onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <Mail className="mr-2 h-5 w-5" />
            Contact Leadership
          </Button>
        </div>
      </div>

      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-[#0F172A]">Full Leadership Team</DialogTitle>
            <DialogDescription>Get to know everyone serving the fellowship.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {leaders.map((leader) => (
                <div
                  key={leader.id}
                  className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1E3A8A]/10">
                    <User className="h-6 w-6 text-[#1E3A8A]" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-display font-bold text-[#0F172A]">{leader.fullName}</div>
                    <div className="truncate text-xs font-semibold text-[#F59E0B]">{leader.role}</div>
                    {leader.description && (
                      <p className="mt-1 text-xs text-gray-600">{leader.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default LeadershipSection;
