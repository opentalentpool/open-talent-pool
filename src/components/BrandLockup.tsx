import { cn } from "@/lib/utils";
import brandIconUrl from "../../favicon.svg";

interface BrandLockupProps {
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
}

export const BrandLockup = ({
  className,
  iconClassName,
  titleClassName,
  subtitle,
  subtitleClassName,
}: BrandLockupProps) => {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[1.15rem] bg-card shadow-sm ring-1 ring-border/70",
          iconClassName,
        )}
      >
        <img src={brandIconUrl} alt="" aria-hidden="true" className="h-full w-full object-contain p-1.5" />
      </div>

      <div className="min-w-0">
        <p className={cn("truncate text-lg font-semibold tracking-tight", titleClassName)} aria-label="OpenTalentPool">
          <span className="text-[hsl(var(--brand-navy))]">Open</span>
          <span className="text-[hsl(var(--brand-teal))]">Talent</span>
          <span className="text-[hsl(var(--brand-blue))]">Pool</span>
        </p>
        {subtitle ? (
          <p className={cn("truncate text-xs uppercase tracking-[0.16em] text-muted-foreground", subtitleClassName)}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
};
