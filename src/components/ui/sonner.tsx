import { useAppTheme } from "@/components/AppThemeProvider";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "light" } = useAppTheme();

  return (
    <Sonner
      position="top-center"
      expand
      richColors
      offset={24}
      theme={theme as ToasterProps["theme"]}
      className="toaster group z-[220]"
      toastOptions={{
        classNames: {
          toast:
            "group toast z-[220] group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
