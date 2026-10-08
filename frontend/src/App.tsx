// All routes (docs/frontend-plan.md §4).
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/Layout/AppLayout';
import AnalysisWorkspace from './pages/AnalysisWorkspace';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import ResponsibleAI from './pages/ResponsibleAI';
import NotFound from './pages/NotFound';
import BusinessProfile from './pages/BusinessProfile';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import NewAnalysis from './pages/NewAnalysis';
import ResultsPage from './pages/Results/ResultsPage';
import Policies from './pages/Policies';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ScenarioAnalysis from './pages/ScenarioAnalysis';
import Businesses from './pages/Businesses';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/responsible-ai" element={<ResponsibleAI />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="businesses" element={<Businesses />} />
        <Route path="businesses/new" element={<BusinessProfile />} />
        <Route path="businesses/:profileId" element={<BusinessProfile />} />
        {/* Profiles are saved to the account now: the old single-profile page is the list. */}
        <Route path="profile" element={<Navigate to="/app/businesses" replace />} />
        <Route path="policies" element={<Policies />} />
        <Route path="analyses/new" element={<NewAnalysis />} />
        <Route path="analyses/new/profile" element={<NewAnalysis profileFlow />} />
        <Route path="analyses/new/scenario" element={<ScenarioAnalysis />} />
        <Route
          path="scenario-analysis"
          element={<Navigate to="/app/analyses/new/scenario" replace />}
        />
        <Route path="analyses" element={<History />} />
        {/* One history page: the old /app/history link still works. */}
        <Route path="history" element={<Navigate to="/app/analyses" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="analyses/:requestId" element={<ResultsPage />} />
        <Route path="analyses/:requestId/progress" element={<AnalysisWorkspace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
