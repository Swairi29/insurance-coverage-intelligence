// All routes (docs/frontend-plan.md §4). Pages that later steps build are placeholders.
import { Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/Layout/AppLayout';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';
import BusinessProfile from './pages/BusinessProfile';
import Placeholder from './pages/Placeholder';
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
        <Route index element={<Placeholder title="Dashboard" step={11} />} />
        <Route path="profile" element={<BusinessProfile />} />
        <Route path="policies" element={<Policies />} />
        <Route path="analyses/new" element={<Placeholder title="New analysis" step={9} />} />
        <Route path="analyses" element={<Placeholder title="History" step={11} />} />
        <Route path="analyses/:requestId" element={<Placeholder title="Results" step={10} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
