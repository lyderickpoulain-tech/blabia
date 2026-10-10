import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { TourProvider } from './tour/TourContext';
import PageLoader from './components/PageLoader';
import Toaster from './components/Toaster';

// Ancienne vue des tâches (/projects/:id/plan, retirée) → actions entre les réunions
function LegacyPlanRedirect() {
  const { id } = useParams();
  return <Navigate to={`/projects/${id}/actions`} replace />;
}

// Pages chargées à la demande (v5.1) : le premier chargement ne contient plus
// toute l'application, chaque page arrive quand on y va.
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const NewProject       = lazy(() => import('./pages/NewProject'));
const ProjectShell     = lazy(() => import('./components/project/ProjectShell'));
const ProjectDashboard = lazy(() => import('./pages/project/ProjectDashboard'));
const ProjectPlan      = lazy(() => import('./pages/project/ProjectPlan'));
const ProjectHistory   = lazy(() => import('./pages/project/ProjectHistory'));
const ProjectDecisions = lazy(() => import('./pages/project/ProjectDecisions'));
const ProjectActions   = lazy(() => import('./pages/project/ProjectActions'));
const ProjectDocuments = lazy(() => import('./pages/project/ProjectDocuments'));
const ProjectDev = lazy(() => import('./pages/project/ProjectDev'));
const ProjectTools     = lazy(() => import('./pages/project/ProjectTools'));
const ProjectTeam      = lazy(() => import('./pages/project/ProjectTeam'));
const ProjectSettings  = lazy(() => import('./pages/project/ProjectSettings'));
const AdminUsers       = lazy(() => import('./pages/AdminUsers'));
const ProfilePage      = lazy(() => import('./pages/ProfilePage'));
const AgentsPage       = lazy(() => import('./pages/AgentsPage'));
const MyTools          = lazy(() => import('./pages/MyTools'));
const StartMeeting     = lazy(() => import('./pages/StartMeeting'));
const MeetingRoom      = lazy(() => import('./pages/MeetingRoom'));
const PrintSession     = lazy(() => import('./pages/print/PrintPages').then(m => ({ default: m.PrintSession })));
const PrintRegistry    = lazy(() => import('./pages/print/PrintPages').then(m => ({ default: m.PrintRegistry })));

export default function App() {
  useEffect(() => {
    fetch('/api/ping').catch(() => {}); // réveil du serveur : échec sans conséquence, volontairement silencieux
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <TourProvider>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/projects/new" element={
          <ProtectedRoute><NewProject /></ProtectedRoute>
        } />
        <Route path="/projects/:id" element={
          <ProtectedRoute><ProjectShell /></ProtectedRoute>
        }>
          <Route index element={<ProjectDashboard />} />
          <Route path="reunions" element={<ProjectPlan />} />
          <Route path="historique" element={<ProjectHistory />} />
          <Route path="decisions" element={<ProjectDecisions />} />
          <Route path="actions" element={<ProjectActions />} />
          <Route path="documents" element={<ProjectDocuments />} />
          <Route path="developpements" element={<ProjectDev />} />
          <Route path="outils" element={<ProjectTools />} />
          <Route path="equipe" element={<ProjectTeam />} />
          <Route path="parametres" element={<ProjectSettings />} />
          <Route path="meeting/new" element={<StartMeeting />} />
        </Route>
        {/* Ancienne vue des tâches (retirée) : remplacée par les actions entre les réunions */}
        <Route path="/projects/:id/plan" element={<LegacyPlanRedirect />} />
        <Route path="/projects/:id/meeting/:sid" element={
          <ProtectedRoute><MeetingRoom /></ProtectedRoute>
        } />
        <Route path="/projects/:id/imprimer/reunion/:sid" element={
          <ProtectedRoute><PrintSession /></ProtectedRoute>
        } />
        <Route path="/projects/:id/imprimer/registre" element={
          <ProtectedRoute><PrintRegistry /></ProtectedRoute>
        } />
        <Route path="/agents" element={
          <ProtectedRoute><AgentsPage /></ProtectedRoute>
        } />
        <Route path="/outils" element={
          <ProtectedRoute><MyTools /></ProtectedRoute>
        } />
        <Route path="/profile/environment" element={<Navigate to="/outils" replace />} />
        <Route path="/profile/toolbox" element={<Navigate to="/outils" replace />} />
        <Route path="/admin/invitations" element={<Navigate to="/admin/users?onglet=invitations" replace />} />
        <Route path="/admin/users" element={
          <ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
      </TourProvider>
      <Toaster />
    </div>
  );
}
