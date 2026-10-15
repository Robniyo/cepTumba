import { Heart, Users, HelpingHand } from "lucide-react";
import { Card } from "@/components/ui/card";

const AboutSection = () => {
  const values = [
    {
      icon: Heart,
      title: "Spiritual Growth",
      description: "Deepening our faith through prayer, study, and worship together.",
    },
    {
      icon: Users,
      title: "Fellowship",
      description: "Building meaningful relationships and supporting one another.",
    },
    {
      icon: HelpingHand,
      title: "Service",
      description: "Serving our campus community and those in need with love.",
    },
  ];

  return (
    <section id="about" className="py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            About CEP Tumba College
          </h2>
          <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
            CEP Tumba College Association is a community of students dedicated to growing in faith, 
            building meaningful relationships, and serving others through the love of Christ.
          </p>
        </div>

        <div className="mb-12 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-2xl font-bold text-[#0F172A] mb-4">Our Mission</h3>
            <p className="leading-relaxed text-gray-600">
              To empower students to grow spiritually, build authentic community, and serve 
              as witnesses of Christ's love on our campus and beyond.
            </p>
          </div>
          <div>
            <h3 className="font-display text-2xl font-bold text-[#0F172A] mb-4">Our Vision</h3>
            <p className="leading-relaxed text-gray-600">
              To be a vibrant community where every student experiences God's love, develops 
              their faith, and is equipped to make a positive impact in the world.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <Card key={index} className="border-0 bg-gray-50 p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1E3A8A]/10">
                  <Icon className="h-7 w-7 text-[#1E3A8A]" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-[#0F172A]">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {value.description}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
