import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ToastProvider } from "./components/ui/Toast";
import AppRouter from "./app/router";
import "./styles/index.css";
import "./styles/readability.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthProvider>
    </MotionConfig>
  </React.StrictMode>,
);
