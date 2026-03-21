import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { UserModeProvider } from "./contexts/UserModeContext";
import { UserProfileProvider } from "./contexts/UserProfileContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { ToastProvider } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CurrencyProvider } from "./contexts/CurrencyContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <UserProfileProvider>
      <AuthProvider>
      <SubscriptionProvider>
      <UserModeProvider>
      <ToastProvider>
      <CurrencyProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </CurrencyProvider>
      </ToastProvider>
      </UserModeProvider>
      </SubscriptionProvider>
      </AuthProvider>
      </UserProfileProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
