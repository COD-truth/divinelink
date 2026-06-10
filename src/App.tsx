
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useServerSync } from "@/hooks/useServerSync";
const SuperAdmin = lazy(() => import("./pages/SuperAdmin.tsx"));
const SurveyTake = lazy(() => import("./pages/SurveyTake.tsx"));

const App = () => {
  useServerSync();
  return (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Index />} />
        <Route path="/s/:code" element={
          <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Chargement…</div>}>
            <SurveyTake />
          </Suspense>
        } />
        <Route path="/superadmin" element={
          <Suspense fallback={<div className="p-8 text-center">Chargement…</div>}>
            <SuperAdmin />
          </Suspense>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
 </TooltipProvider>
  );
};
export default App;