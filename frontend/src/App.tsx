// All routes (docs/frontend-plan.md §4).
import { Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/Layout/AppLayout';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';
import BusinessProfile from './pages/BusinessProfile';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import NewAnalysis from './pages/NewAnalysis';
import ResultsPage from './pages/Results/ResultsPage';
import Policies from './pages/Policies';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
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
        <Route path="profile" element={<BusinessProfile />} />
        <Route path="policies" element={<Policies />} />
        <Route path="analyses/new" element={<NewAnalysis />} />
        <Route path="analyses" element={<History />} />
        <Route path="analyses/:requestId" element={<ResultsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
