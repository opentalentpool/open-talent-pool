import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionIntroProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export const SectionIntro = ({
  eyebrow,
  title,
  description,
  className,
  eyebrowClassName,
  titleClassName,
  descriptionClassName,
}: SectionIntroProps) => {
  return (
    <div className={cn("max-w-3xl", className)}>
      {eyebrow ? <p className={cn("eyebrow", eyebrowClassName)}>{eyebrow}</p> : null}
      <h2 className={cn("mt-4 text-3xl leading-tight md:text-4xl", titleClassName)}>{title}</h2>
      {description ? (
        <p className={cn("mt-4 max-w-2xl text-base leading-7 text-muted-foreground", descriptionClassName)}>
          {description}
        </p>
      ) : null}
    </div>
  );
};
