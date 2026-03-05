import { Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ReviewPage from './pages/ReviewPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/review/:reviewId" element={<ReviewPage />} />
    </Routes>
  );
}
