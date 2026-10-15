import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  subtitle: string;
  description: string;
}

export const ComingSoon = ({ title, subtitle, description }: Props) => (
  <div className="space-y-6">
    <PageHeader title={title} subtitle={subtitle} />
    <Card className="p-10 shadow-elegant text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Construction className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display text-xl font-bold">Coming in the next stage</h3>
      <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">{description}</p>
    </Card>
  </div>
);
