import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

const CTASection = () => {
  return (
    <section className="py-16 bg-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#1E3A8A] to-[#1E40AF] shadow-lg">
          <div className="p-8 sm:p-12 text-center">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Join Our Fellowship
            </h2>
            <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
              Be part of our weekly programs and spiritual growth. Experience a community 
              that supports you in your faith journey.
            </p>
            
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="bg-[#F59E0B] text-white hover:bg-[#F59E0B]/90 border-0"
              >
                <Link to="/login">
                  Join Us
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Mail className="mr-2 h-5 w-5" />
                Contact Leadership
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default CTASection;
