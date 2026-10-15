import { useEffect } from "react";
import PublicNavbar from "@/components/landing/PublicNavbar";
import HeroSection from "@/components/landing/HeroSection";
import QuickHighlights from "@/components/landing/QuickHighlights";
import VerseSection from "@/components/landing/VerseSection";
import EventsSection from "@/components/landing/EventsSection";
import ScheduleSection from "@/components/landing/ScheduleSection";
import AnnouncementsSection from "@/components/landing/AnnouncementsSection";
import AboutSection from "@/components/landing/AboutSection";
import LeadershipSection from "@/components/landing/LeadershipSection";
import CTASection from "@/components/landing/CTASection";
import ContactSection from "@/components/landing/ContactSection";
import PublicFooter from "@/components/landing/PublicFooter";

const Landing = () => {
  useEffect(() => {
    // Add scroll margin only to landing page sections (skip hero)
    const sections = document.querySelectorAll("section:not(#home)");
    sections.forEach((section) => {
      (section as HTMLElement).style.scrollMarginTop = "80px";
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PublicNavbar />
      <main>
        <HeroSection />
        <QuickHighlights />
        <VerseSection />
        <EventsSection />
        <ScheduleSection />
        <AnnouncementsSection />
        <AboutSection />
        <LeadershipSection />
        <CTASection />
        <ContactSection />
      </main>
      <PublicFooter />
    </div>
  );
};

export default Landing;
