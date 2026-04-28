import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AppThemeProvider } from "@/components/AppThemeProvider";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { CookieConsentProvider } from "./hooks/useCookieConsent";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Search from "./pages/Search";
import HowItWorks from "./pages/HowItWorks";
import Dashboard from "./pages/Dashboard";
import PublicProfile from "./pages/PublicProfile";
import { LegalDocumentPage } from "./pages/LegalDocumentPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CookieConsentProvider>
      <AppThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <CookieConsentBanner />
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/entrar" element={<Auth />} />
                <Route path="/cadastro" element={<Auth />} />
                <Route path="/buscar" element={<Search />} />
                <Route path="/profissionais/:slug" element={<PublicProfile />} />
                <Route path="/como-funciona" element={<HowItWorks />} />
                <Route path="/privacidade" element={<LegalDocumentPage documentKey="privacyPolicy" />} />
                <Route path="/termos" element={<LegalDocumentPage documentKey="termsOfUse" />} />
                <Route path="/cookies" element={<LegalDocumentPage documentKey="cookiesPolicy" />} />
                <Route path="/uso-inclusivo" element={<LegalDocumentPage documentKey="inclusiveUsePolicy" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </AppThemeProvider>
    </CookieConsentProvider>
  </QueryClientProvider>
);

export default App;
