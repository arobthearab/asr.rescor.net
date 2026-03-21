import { Routes, Route } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import { UserProvider } from './contexts/UserContext';
import DashboardPage from './pages/DashboardPage';
import ReviewPage from './pages/ReviewPage';
import AdminUsersPage from './pages/AdminUsersPage';
import QuestionnaireEditorPage from './pages/QuestionnaireEditorPage';

export default function App() {
  return (
    <AuthGuard>
      <UserProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/review/:reviewId" element={<ReviewPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/questionnaire" element={<QuestionnaireEditorPage />} />
        </Routes>
      </UserProvider>
    </AuthGuard>
  );
}
