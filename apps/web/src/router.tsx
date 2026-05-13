import { Navigate, createBrowserRouter } from "react-router-dom";
import { CharactersPage } from "./features/characters/CharactersPage";
import { ChapterEditorPage } from "./features/editor/ChapterEditorPage";
import { HomePage } from "./features/home/HomePage";
import { SettingsPage } from "./features/settings/SettingsPage";

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/editor/:hash", element: <ChapterEditorPage /> },
  { path: "/editor/:hash/characters", element: <CharactersPage /> },
  { path: "/editor/created", element: <Navigate to="/" replace /> },
]);
