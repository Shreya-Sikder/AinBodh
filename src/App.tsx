import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import type { ReactNode } from "react";

import { LanguageProvider } from "./context/LanguageContext";
import { AppProvider, useApp } from "./context/AppContext";

import AppShell from "./components/AppShell";
import Toast from "./components/Toast";
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import UploadPage from "./pages/UploadPage";
import ChatsPage from "./pages/ChatsPage";
import HelplinePage from "./pages/HelplinePage";
import SettingsPage from "./pages/SettingsPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import NotFoundPage from "./pages/NotFoundPage";
import ComparePage from "./pages/ComparePage";

function Protected({ children }: { children: ReactNode }) {
  const { authenticated } = useApp();

  return authenticated ? children : <Navigate to="/login" replace />;
}

/*
 * Global AinBodh layout.
 *
 * Every route passes through this component,
 * so the AinBodh disclaimer appears everywhere
 * without having to manually add it to every page.
 */
function SiteLayout() {
  return (
    <div className="min-h-screen">
      <div>
        <Outlet />
      </div>
      {/* One toast for every page, including login and sign-up. */}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            {/* Everything goes through the universal AinBodh layout */}
            <Route element={<SiteLayout />}>
              {/* Public pages */}
              <Route path="/" element={<HomePage />} />

              <Route
                path="/login"
                element={<AuthPage mode="login" />}
              />

              <Route
                path="/signup"
                element={<AuthPage mode="signup" />}
              />

              <Route
                path="/how-it-works"
                element={<HowItWorksPage />}
              />

              {/* Protected application */}
              <Route
                element={
                  <Protected>
                    <AppShell />
                  </Protected>
                }
              >

                <Route
                  path="/upload"
                  element={<UploadPage />}
                />

                <Route
                  path="/verify"
                  element={<Navigate to="/upload" replace />}
                />

                <Route
                  path="/review"
                  element={<Navigate to="/upload" replace />}
                />

                <Route
                  path="/analyzing"
                  element={<Navigate to="/upload" replace />}
                />

                <Route
                  path="/analysis"
                  element={<Navigate to="/upload" replace />}
                />

                <Route
                  path="/chats"
                  element={<ChatsPage />}
                />

                <Route
                  path="/helpline"
                  element={<HelplinePage />}
                />

                <Route
                  path="/settings"
                  element={<SettingsPage />}
                />

                <Route
                  path="/compare"
                  element={<ComparePage />}
                />

                <Route
                  path="/app"
                  element={
                    <Navigate
                      to="/upload"
                      replace
                    />
                  }
                />
              </Route>

              {/* 404 */}
              <Route
                path="*"
                element={<NotFoundPage />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </LanguageProvider>
  );
}

