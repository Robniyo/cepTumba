import { useEffect, useState } from "react";
import { Quote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchVerseOfTheDay } from "@/data/landingData";

const VerseSection = () => {
  const [verse, setVerse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVerse = async () => {
      try {
        const data = await fetchVerseOfTheDay();
        setVerse(data?.devotion || data);
      } catch (error) {
        console.error("Failed to load verse:", error);
      } finally {
        setLoading(false);
      }
    };

    loadVerse();
  }, []);

  if (loading) {
    return (
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#1E3A8A]/5 to-[#F59E0B]/5 shadow-lg">
            <div className="p-8 sm:p-12 text-center">Loading verse...</div>
          </Card>
        </div>
      </section>
    );
  }

  if (!verse) {
    return null;
  }

  return (
    <section className="py-16 bg-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#1E3A8A]/5 to-[#F59E0B]/5 shadow-lg">
          <div className="p-8 sm:p-12">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[#F59E0B]/20">
              <Quote className="h-6 w-6 text-[#F59E0B]" />
            </div>
            
            <p className="font-serif text-2xl leading-relaxed text-[#0F172A] sm:text-3xl">
              "{verse.verse}"
            </p>
            
            <p className="mt-6 font-display font-semibold text-[#1E3A8A]">
              — {verse.reference}
            </p>
            
            <div className="mt-8 border-t border-gray-200 pt-6">
              <p className="text-sm leading-relaxed text-gray-600 italic">
                {verse.reflection}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default VerseSection;
