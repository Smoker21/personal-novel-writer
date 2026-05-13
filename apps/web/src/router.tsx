import { Navigate, createBrowserRouter } from "react-router-dom";
import { ChapterEditorPage } from "./features/editor/ChapterEditorPage.js";
import { HomePage } from "./features/home/HomePage.js";
import { SettingsPage } from "./features/settings/SettingsPage.js";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/editor/:hash", element: <ChapterEditorPage /> },
  { path: "/editor/created", element: <Navigate to="/" replace /> },
]);
