import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import { ErrorBoundary } from './ui/common'

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Home parses the path itself: "/", "/hub", "/session", "/progress",
            "/settings", "/game/<id>" — unknown paths get redirected there */}
        <Route path="*" element={<Home />} />
      </Routes>
    </ErrorBoundary>
  )
}
