import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectView from './pages/ProjectView';
import AdminInvitations from './pages/AdminInvitations';
import AdminUsers from './pages/AdminUsers';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';

import NewSessionLegacy from './pages/NewSessionLegacy';
import SessionView from './pages/SessionView';
import SummaryView from './pages/SummaryView';
import AgentsPage from './pages/AgentsPage';
import EnvironmentPage from './pages/EnvironmentPage';
import MyToolbox from './pages/MyToolbox';
import PlanView from './pages/PlanView';
import StartMeeting from './pages/StartMeeting';
import MeetingRoom from './pages/MeetingRoom';

export default function App() {
  useEffect(() => {
    fetch('/api/ping').catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
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
          <ProtectedRoute><ProjectView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/plan" element={
          <ProtectedRoute><PlanView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/new" element={
          <ProtectedRoute><NewSessionLegacy /></ProtectedRoute>
        } />
        <Route path="/projects/:id/meeting/new" element={
          <ProtectedRoute><StartMeeting /></ProtectedRoute>
        } />
        <Route path="/projects/:id/meeting/:sid" element={
          <ProtectedRoute><MeetingRoom /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/:sid" element={
          <ProtectedRoute><SessionView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/:sid/summary" element={
          <ProtectedRoute><SummaryView /></ProtectedRoute>
        } />
        <Route path="/agents" element={
          <ProtectedRoute><AgentsPage /></ProtectedRoute>
        } />
        <Route path="/profile/environment" element={
          <ProtectedRoute><EnvironmentPage /></ProtectedRoute>
        } />
        <Route path="/profile/toolbox" element={
          <ProtectedRoute><MyToolbox /></ProtectedRoute>
        } />
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
    </div>
  );
}
