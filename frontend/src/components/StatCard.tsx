import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: "primary" | "success" | "accent" | "info";
}

const variants = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  accent: "bg-accent/15 text-accent",
  info: "bg-info/10 text-info",
};

export const StatCard = ({ label, value, icon: Icon, trend, variant = "primary" }: Props) => {
  return (
    <Card className="p-5 shadow-elegant border-border/60 transition-base hover:shadow-elevated hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold text-foreground">{value}</div>
          {trend && <div className="mt-1.5 text-xs text-muted-foreground">{trend}</div>}
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", variants[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
};
