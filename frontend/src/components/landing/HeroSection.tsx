import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPublicStats } from "@/data/landingData";

const formatStatValue = (value: number) => {
  return new Intl.NumberFormat("en-US").format(value);
};

const HeroSection = () => {
  const [stats, setStats] = useState({
    membersCount: 0,
    weeklyActivities: 0,
    yearsStrong: 0,
  });

  useEffect(() => {
    let mounted = true;

    const loadStats = async () => {
      try {
        const data = await fetchPublicStats();
        if (!mounted) return;
        setStats(data);
      } catch (error) {
        console.error("Failed to load public stats:", error);
      }
    };

    loadStats();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section id="home" className="relative overflow-hidden bg-gradient-to-br from-[#1E3A8A] via-[#1E40AF] to-[#1E3A8A] py-20 sm:py-24 lg:py-32">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 [background:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:32px_32px]" />
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-[#F59E0B]/20 blur-3xl" />
      <div className="absolute -left-20 bottom-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#F59E0B]/20 px-4 py-1.5 text-sm font-medium text-[#F59E0B]">
              <Sparkles className="h-4 w-4" />
              <span>Welcome to CEP Tumba College</span>
            </div>
            
            <h1 className="mt-6 font-display text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Growing in Faith, Fellowship, and Service
            </h1>
            
            <p className="mt-6 text-lg leading-relaxed text-blue-100 sm:text-xl">
              Join a community of students dedicated to spiritual growth, meaningful relationships, 
              and serving others through the love of Christ.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row lg:justify-start">
              <Button
                size="lg"
                className="bg-[#F59E0B] text-white hover:bg-[#F59E0B]/90 border-0"
                onClick={() => document.getElementById('schedule')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Calendar className="mr-2 h-5 w-5" />
                View Weekly Schedule
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Upcoming Events
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-6 lg:justify-start">
              <div className="text-center lg:text-left">
                <div className="text-3xl font-bold text-white">{formatStatValue(stats.membersCount)}</div>
                <div className="text-sm text-blue-200">Members</div>
              </div>
              <div className="text-center lg:text-left">
                <div className="text-3xl font-bold text-white">{formatStatValue(stats.weeklyActivities)}</div>
                <div className="text-sm text-blue-200">Weekly Activities</div>
              </div>
              <div className="text-center lg:text-left">
                <div className="text-3xl font-bold text-white">{formatStatValue(stats.yearsStrong)}</div>
                <div className="text-sm text-blue-200">Years Strong</div>
              </div>
            </div>
          </div>

          {/* Hero Image/Illustration */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl bg-white/10 backdrop-blur-sm p-8 shadow-2xl">
              <div className="aspect-square rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-[#F59E0B]/30">
                    <span className="text-4xl">🙏</span>
                  </div>
                  <p className="text-lg font-medium text-white">Come as you are</p>
                  <p className="text-sm text-blue-200">Everyone is welcome here</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
