import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import ProjectView from './pages/ProjectView';
import AdminInvitations from './pages/AdminInvitations';
import ProtectedRoute from './components/ProtectedRoute';

import NewSession from './pages/NewSession';
import SessionView from './pages/SessionView';
import SummaryView from './pages/SummaryView';

function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-700 mb-2">{title}</h2>
        <p className="text-gray-400 text-sm">Cette page sera disponible prochainement.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/projects/new" element={
          <ProtectedRoute><NewProject /></ProtectedRoute>
        } />
        <Route path="/projects/:id" element={
          <ProtectedRoute><ProjectView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/new" element={
          <ProtectedRoute><NewSession /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/:sid" element={
          <ProtectedRoute><SessionView /></ProtectedRoute>
        } />
        <Route path="/projects/:id/session/:sid/summary" element={
          <ProtectedRoute><SummaryView /></ProtectedRoute>
        } />
        <Route path="/admin/invitations" element={
          <ProtectedRoute adminOnly><AdminInvitations /></ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}
