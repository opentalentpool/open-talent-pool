import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { BrandLockup } from "@/components/BrandLockup";
import { MobileNav } from "@/components/MobileNav";
import { RoleContextSwitcher } from "@/components/RoleContextSwitcher";
import { ThemeModeControl } from "@/components/ThemeModeControl";

const primaryLinks = [
  {
    label: "Buscar talentos",
    to: "/buscar",
    icon: Search,
  },
  {
    label: "Como funciona",
    to: "/como-funciona",
  },
];

const documentLinks = [
  { label: "Início", to: "/" },
  { label: "Buscar talentos", to: "/buscar" },
  { label: "Como funciona", to: "/como-funciona" },
];

interface NavbarProps {
  variant?: "default" | "document";
}

export const Navbar = ({ variant = "default" }: NavbarProps) => {
  const { user, signOut } = useAuth();
  const dashboardLabel = user?.activeRole === "professional" ? "Meu perfil" : "Meu painel";
  const isDocument = variant === "document";

  if (isDocument) {
    return (
      <nav
        data-testid="site-navbar"
        data-variant={variant}
        className="legal-print-hidden border-b border-border/80 bg-background"
      >
        <div className="container py-5 md:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <BrandLockup subtitle="descoberta pública de talentos em tecnologia" />
            </Link>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {documentLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-sm text-foreground underline-offset-4 transition hover:text-primary hover:underline"
                >
                  {link.label}
                </Link>
              ))}

              <ThemeModeControl
                variant="dropdown"
                className="h-9 w-9 rounded-md border-border/70 bg-transparent shadow-none backdrop-blur-none"
              />

              {user ? (
                <>
                  <RoleContextSwitcher variant="dropdown" />
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-foreground underline-offset-4 transition hover:text-primary hover:underline"
                  >
                    {dashboardLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto rounded-none px-0 py-0 text-sm font-normal text-foreground hover:bg-transparent hover:text-primary"
                    onClick={signOut}
                  >
                    Sair
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    to="/entrar"
                    className="text-sm text-foreground underline-offset-4 transition hover:text-primary hover:underline"
                  >
                    Entrar
                  </Link>
                  <Link
                    to="/cadastro"
                    className="text-sm text-foreground underline-offset-4 transition hover:text-primary hover:underline"
                  >
                    Cadastrar
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      data-testid="site-navbar"
      data-variant={variant}
      className={cn("sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-xl")}
    >
      <div className="container">
        <div className="flex min-h-20 items-center justify-between gap-4 py-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandLockup subtitle="descoberta pública de talentos em tecnologia" />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {primaryLinks.map((link) => {
              const Icon = link.icon;

              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className="nav-pill"
                  activeClassName="nav-pill-active"
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  {link.label}
                </NavLink>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ThemeModeControl variant="dropdown" className="hidden md:inline-flex" />
            {user ? (
              <>
                <RoleContextSwitcher variant="dropdown" />
                <Button asChild variant="ghost" size="sm" className="hidden rounded-full px-4 md:inline-flex">
                  <Link to="/dashboard">
                    {dashboardLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="hidden rounded-full px-4 md:inline-flex" onClick={signOut}>
                  Sair
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden rounded-full px-4 md:inline-flex">
                  <Link to="/entrar">Entrar</Link>
                </Button>
                <Button asChild size="sm" className="rounded-full px-4 shadow-sm">
                  <Link to="/cadastro">
                    Cadastrar
                  </Link>
                </Button>
              </>
            )}

            <MobileNav user={user} dashboardLabel={dashboardLabel} onSignOut={signOut} />
          </div>
        </div>
      </div>
    </nav>
  );
};
