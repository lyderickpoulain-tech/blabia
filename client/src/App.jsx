import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectShell from './components/project/ProjectShell';
import ProjectDashboard from './pages/project/ProjectDashboard';
import ProjectPlan from './pages/project/ProjectPlan';
import ProjectHistory from './pages/project/ProjectHistory';
import ProjectDecisions from './pages/project/ProjectDecisions';
import ProjectActions from './pages/project/ProjectActions';
import ProjectTools from './pages/project/ProjectTools';
import ProjectTeam from './pages/project/ProjectTeam';
import ProjectSettings from './pages/project/ProjectSettings';
import AdminInvitations from './pages/AdminInvitations';
import AdminUsers from './pages/AdminUsers';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import { TourProvider } from './tour/TourContext';

import AgentsPage from './pages/AgentsPage';
import MyTools from './pages/MyTools';
import PlanView from './pages/PlanView';
import StartMeeting from './pages/StartMeeting';
import MeetingRoom from './pages/MeetingRoom';

export default function App() {
  useEffect(() => {
    fetch('/api/ping').catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <TourProvider>
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
          <Route path="outils" element={<ProjectTools />} />
          <Route path="equipe" element={<ProjectTeam />} />
          <Route path="parametres" element={<ProjectSettings />} />
          <Route path="meeting/new" element={<StartMeeting />} />
        </Route>
        <Route path="/projects/:id/plan" element={
          <ProtectedRoute><PlanView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/meeting/:sid" element={
          <ProtectedRoute><MeetingRoom /></ProtectedRoute>
        } />
        <Route path="/agents" element={
          <ProtectedRoute><AgentsPage /></ProtectedRoute>
        } />
        <Route path="/outils" element={
          <ProtectedRoute><MyTools /></ProtectedRoute>
        } />
        <Route path="/profile/environment" element={<Navigate to="/outils" replace />} />
        <Route path="/profile/toolbox" element={<Navigate to="/outils" replace />} />
        <Route path="/admin/invitations" element={
          <ProtectedRoute adminOnly><AdminInvitations /></ProtectedRoute>
        } />
        <Route path="/admin/users" element={
          <ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><ProfilePage /></ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </TourProvider>
    </div>
  );
}
