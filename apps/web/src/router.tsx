import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Home } from './routes/Home';
import { ProjectNew } from './routes/ProjectNew';
import { ProjectDashboard } from './routes/ProjectDashboard';
import { CharacterList } from './routes/CharacterList';
import { CharacterEdit } from './routes/CharacterEdit';
import { ChapterEditor } from './routes/ChapterEditor';
import { StoryStatus } from './routes/StoryStatus';
import { CharacterStatus } from './routes/CharacterStatus';
import { Settings } from './routes/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'projects/new', element: <ProjectNew /> },
      { path: 'p/:slug', element: <ProjectDashboard /> },
      { path: 'p/:slug/characters', element: <CharacterList /> },
      { path: 'p/:slug/characters/:id', element: <CharacterEdit /> },
      { path: 'p/:slug/chapters/:n', element: <ChapterEditor /> },
      { path: 'p/:slug/status/story', element: <StoryStatus /> },
      { path: 'p/:slug/status/characters/:charId', element: <CharacterStatus /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
