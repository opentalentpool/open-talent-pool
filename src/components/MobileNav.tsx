import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogOut, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { RoleContextSwitcher } from "@/components/RoleContextSwitcher";
import { ThemeModeControl } from "@/components/ThemeModeControl";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AuthUser } from "@/types/auth";

interface MobileNavProps {
  user: AuthUser | null;
  dashboardLabel: string;
  onSignOut: () => Promise<void>;
}

export const MobileNav = ({ user, dashboardLabel, onSignOut }: MobileNavProps) => {
  const [open, setOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (!scrollAreaRef.current) {
        return;
      }

      scrollAreaRef.current.scrollTop = 0;
      scrollAreaRef.current.scrollTo?.({ top: 0 });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full border-border/80 bg-background/85 shadow-sm backdrop-blur-md md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden border-l border-border/80 bg-[hsl(var(--background))] px-5 py-6"
      >
        <SheetHeader className="shrink-0 text-left">
          <SheetTitle className="sr-only">OpenTalentPool</SheetTitle>
          <BrandLockup className="items-start" subtitle="busca aberta, curadoria privada" />
          <SheetDescription className="max-w-xs text-sm leading-6">
            Descoberta técnica aberta, filtros claros e publicação manual com privacidade preservada.
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollAreaRef}
          data-testid="mobile-nav-scroll-area"
          className="mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-1 touch-pan-y [-webkit-overflow-scrolling:touch]"
        >
          <div className="space-y-3">
            <SheetClose asChild>
              <Link to="/buscar" className="nav-drawer-link">
                <Search className="h-4 w-4" />
                Buscar talentos
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Link to="/como-funciona" className="nav-drawer-link">
                Como funciona
              </Link>
            </SheetClose>
            {user ? (
              <SheetClose asChild>
                <Link to="/dashboard" className="nav-drawer-link">
                  {dashboardLabel}
                  <ArrowRight className="ml-auto h-4 w-4" />
                </Link>
              </SheetClose>
            ) : (
              <>
                <SheetClose asChild>
                  <Link to="/entrar" className="nav-drawer-link">
                    Entrar
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/cadastro" className="nav-drawer-link">
                    Cadastrar
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </Link>
                </SheetClose>
              </>
            )}
          </div>

          {user ? <RoleContextSwitcher variant="list" className="mt-8" /> : null}
          <ThemeModeControl variant="list" className="mt-8" />
        </div>

        {user ? (
          <Button
            variant="ghost"
            className="mt-6 w-full shrink-0 justify-start rounded-2xl px-4 text-sm"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
