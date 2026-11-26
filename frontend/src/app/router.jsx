import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import { Protected } from "../features/auth/AuthProvider";
import AppLayout from "../components/layout/AppLayout";
import {
  LoginPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  AuthCallbackPage,
} from "../features/auth/AuthPages";

const LandingPage = lazy(() => import("../features/landing/LandingPage"));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage"));
const CatalogPage = lazy(() => import("../features/catalog/CatalogPage"));
const BookDetailPage = lazy(() => import("../features/catalog/BookDetailPage"));
const LoansPage = lazy(() => import("../features/loans/LoansPage"));
const ReservationsPage = lazy(
  () => import("../features/reservations/ReservationsPage"),
);
const StudentsPage = lazy(() => import("../features/students/StudentsPage"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage"));
const SettingsPage = lazy(
  () => import("../features/administration/SettingsPage"),
);
const ReferencePage = lazy(
  () => import("../features/administration/ReferencePage"),
);
const ActivityPage = lazy(
  () => import("../features/administration/ActivityPage"),
);
const NotificationsPage = lazy(
  () => import("../features/notifications/NotificationsPage"),
);
const AccountPage = lazy(() => import("../features/account/AccountPage"));
const admin = (element) => <Protected role="LIBRARIAN">{element}</Protected>;
const student = (element) => <Protected role="STUDENT">{element}</Protected>;
function NotFound() {
  return (
    <div className="not-found">
      <span className="eyebrow">A PAGE OUT OF PLACE</span>
      <h1>This chapter isn’t here.</h1>
      <p>Let’s get you back to familiar shelves.</p>
      <Link className="button primary" to="/app">
        Back to your library
      </Link>
    </div>
  );
}
function RouteError() {
  return (
    <div className="not-found">
      <h1>We couldn’t open this page.</h1>
      <p>Please reload and try again.</p>
      <button
        className="button primary"
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  );
}
const router = createBrowserRouter([
  { path: "/", element: <LandingPage />, errorElement: <RouteError /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  {
    path: "/app",
    element: (
      <Protected>
        <AppLayout />
      </Protected>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "catalog", element: <CatalogPage /> },
      { path: "catalog/:id", element: <BookDetailPage /> },
      { path: "loans", element: student(<LoansPage />) },
      { path: "history", element: student(<LoansPage history />) },
      { path: "reservations", element: <ReservationsPage /> },
      { path: "inventory", element: admin(<CatalogPage inventory />) },
      { path: "circulation", element: admin(<LoansPage />) },
      { path: "students", element: admin(<StudentsPage />) },
      { path: "reports", element: admin(<ReportsPage />) },
      { path: "settings", element: admin(<SettingsPage />) },
      { path: "reference-data", element: admin(<ReferencePage />) },
      { path: "activity", element: admin(<ActivityPage />) },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "account", element: <AccountPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
export default function AppRouter() {
  return (
    <Suspense
      fallback={
        <div className="full-loader" role="status">
          <span className="loader" />
          Opening your library…
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
