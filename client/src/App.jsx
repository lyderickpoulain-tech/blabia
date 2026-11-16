import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './contexts/AuthContext';
import { TourProvider } from './tour/TourContext';
import PageLoader from './components/PageLoader';
import Toaster from './components/Toaster';

// Ancienne vue des tâches (/projects/:id/plan, retirée) → actions entre les réunions
// v6 phase 4 : une page en mode avancé, une autre sinon (par défaut, retour à « Mon projet ») ;
// rien n'est supprimé, les pages v5.1 restent derrière le mode avancé
function AdvancedOr({ advanced, simple = <Navigate to=".." relative="path" replace /> }) {
  const { user } = useAuth();
  return user?.advancedMode ? advanced : simple;
}

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
const ProjectHome      = lazy(() => import('./pages/project/ProjectHome'));      // v6 : « Mon projet »
const ProjectAssistant = lazy(() => import('./pages/project/ProjectAssistant')); // v5.1 : bras droit
const ProjectInbox     = lazy(() => import('./pages/project/ProjectInbox'));     // v5.1 : « À trancher »
const ProjectPlan      = lazy(() => import('./pages/project/ProjectPlan'));
const ProjectMeetings  = lazy(() => import('./pages/project/ProjectMeetings')); // v6 : réunions sans le mode avancé
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
const MeetingRoute     = lazy(() => import('./pages/MeetingRoute')); // v6 : salle de revue ou salle v5.1
const PrintSession     = lazy(() => import('./pages/print/PrintPages').then(m => ({ default: m.PrintSession })));
const PrintRegistry    = lazy(() => import('./pages/print/PrintPages').then(m => ({ default: m.PrintRegistry })));
const PrintWork        = lazy(() => import('./pages/print/PrintPages').then(m => ({ default: m.PrintWork }))); // v6 : le dossier en PDF

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
          <Route index element={<ProjectHome />} />
          <Route path="tableau-de-bord" element={<AdvancedOr advanced={<ProjectDashboard />} />} />
          <Route path="bras-droit" element={<ProjectAssistant />} />
          <Route path="a-trancher" element={<AdvancedOr advanced={<ProjectInbox />} />} />
          <Route path="reunions" element={<AdvancedOr advanced={<ProjectPlan />} simple={<ProjectMeetings />} />} />
          <Route path="historique" element={<AdvancedOr advanced={<ProjectHistory />} simple={<ProjectMeetings />} />} />
          <Route path="decisions" element={<AdvancedOr advanced={<ProjectDecisions />} />} />
          <Route path="actions" element={<AdvancedOr advanced={<ProjectActions />} />} />
          <Route path="documents" element={<ProjectDocuments />} />
          <Route path="developpements" element={<AdvancedOr advanced={<ProjectDev />} />} />
          <Route path="outils" element={<AdvancedOr advanced={<ProjectTools />} />} />
          <Route path="equipe" element={<AdvancedOr advanced={<ProjectTeam />} />} />
          <Route path="parametres" element={<ProjectSettings />} />
          <Route path="meeting/new" element={<StartMeeting />} />
        </Route>
        {/* Ancienne vue des tâches (retirée) : remplacée par les actions entre les réunions */}
        <Route path="/projects/:id/plan" element={<LegacyPlanRedirect />} />
        <Route path="/projects/:id/meeting/:sid" element={
          <ProtectedRoute><MeetingRoute /></ProtectedRoute>
        } />
        <Route path="/projects/:id/imprimer/reunion/:sid" element={
          <ProtectedRoute><PrintSession /></ProtectedRoute>
        } />
        <Route path="/projects/:id/imprimer/projet" element={
          <ProtectedRoute><PrintWork /></ProtectedRoute>
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
