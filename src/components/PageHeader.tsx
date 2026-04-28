import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
  titleClassName,
  descriptionClassName,
}: PageHeaderProps) => {
  return (
    <section className={cn("grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end", className)}>
      <div className="max-w-3xl">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className={cn("mt-4 text-4xl leading-[0.98] md:text-5xl", titleClassName)}>{title}</h1>
        {description ? (
          <p className={cn("mt-4 max-w-2xl text-lg leading-8 text-muted-foreground", descriptionClassName)}>
            {description}
          </p>
        ) : null}
        {actions ? <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div> : null}
      </div>

      {aside ? <div className="surface-panel p-6 md:p-7">{aside}</div> : null}
    </section>
  );
};
