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
        <Route path="/projects/:id/meeting/new" element={
          <ProtectedRoute><StartMeeting /></ProtectedRoute>
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
    </div>
  );
}
