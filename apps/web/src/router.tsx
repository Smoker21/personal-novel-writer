import { Navigate, createBrowserRouter } from "react-router-dom";
import { SettingsPage } from "./features/settings/SettingsPage.js";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: "/", element: <Navigate to="/settings" replace /> },
  { path: "/settings", element: <SettingsPage /> },
]);
