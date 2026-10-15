import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/context/RoleContext";
import { AuthProvider } from "@/context/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireRoles } from "@/components/auth/RequireRoles";
import { AppSection, SECTION_ROLES } from "@/lib/roles";
import AppInstallPrompt from "@/components/pwa/AppInstallPrompt";
import Landing from "./pages/Landing.tsx";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import NotFound from "./pages/NotFound.tsx";

const Members = lazy(() => import("./pages/Members.tsx"));
const Announcements = lazy(() => import("./pages/Announcements.tsx"));
const Contacts = lazy(() => import("./pages/Contacts.tsx"));
const Events = lazy(() => import("./pages/Events.tsx"));
const EventDetail = lazy(() => import("./pages/EventDetail.tsx"));
const Finance = lazy(() => import("./pages/Finance.tsx"));
const Receipt = lazy(() => import("./pages/Receipt.tsx"));
const Devotion = lazy(() => import("./pages/Devotion.tsx"));
const Welfare = lazy(() => import("./pages/Welfare.tsx"));
const Minutes = lazy(() => import("./pages/Minutes.tsx"));
const Requests = lazy(() => import("./pages/Requests.tsx"));
const SavingsRequests = lazy(() => import("./pages/SavingsRequests.tsx"));
const PrayerCenter = lazy(() => import("./pages/PrayerCenter.tsx"));
const Leadership = lazy(() => import("./pages/Leadership.tsx"));
const Alumni = lazy(() => import("./pages/Alumni.tsx"));
const Families = lazy(() => import("./pages/Families.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Messaging = lazy(() => import("./pages/Messaging.tsx"));

const queryClient = new QueryClient();

const wrap = (el: React.ReactNode) => (
  <RequireAuth>
    <AppLayout>{el}</AppLayout>
  </RequireAuth>
);

const wrapWithAccess = (section: AppSection, el: React.ReactNode) =>
  wrap(
    <RequireRoles roles={SECTION_ROLES[section]}>
      {el}
    </RequireRoles>,
  );

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RoleProvider>
        <TooltipProvider>
          <AppInstallPrompt />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={wrapWithAccess("dashboard", <Index />)} />
              <Route path="/profile" element={wrap(<Profile />)} />
              <Route path="/members" element={wrapWithAccess("members", <Members />)} />
              <Route path="/announcements" element={wrapWithAccess("announcements", <Announcements />)} />
              <Route path="/contacts" element={wrapWithAccess("contacts", <Contacts />)} />
              <Route path="/events" element={wrapWithAccess("events", <Events />)} />
              <Route path="/events/:id" element={wrapWithAccess("events", <EventDetail />)} />
              <Route path="/devotion" element={wrapWithAccess("devotion", <Devotion />)} />
              <Route path="/prayer-center" element={wrapWithAccess("prayer_center", <PrayerCenter />)} />
              <Route path="/finance" element={wrapWithAccess("finance", <Finance />)} />
              <Route path="/finance/receipts/:id" element={wrapWithAccess("finance", <Receipt />)} />
              <Route path="/welfare" element={wrapWithAccess("welfare", <Welfare />)} />
              <Route path="/requests" element={wrapWithAccess("requests", <Requests />)} />
              <Route path="/savings-requests" element={wrapWithAccess("finance", <SavingsRequests />)} />
              <Route path="/minutes" element={wrapWithAccess("minutes", <Minutes />)} />
              <Route path="/leadership" element={wrapWithAccess("leadership", <Leadership />)} />
              <Route path="/alumni" element={wrapWithAccess("alumni", <Alumni />)} />
              <Route path="/families" element={wrapWithAccess("families", <Families />)} />
              <Route path="/messages" element={wrapWithAccess("messaging", <Messaging />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </RoleProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
