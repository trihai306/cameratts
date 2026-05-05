import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CheckInOut from './pages/CheckInOut'
import Registry from './pages/Registry'
import History from './pages/History'
import Settings from './pages/Settings'

export default function App() {
    return (
        <HashRouter>
            <Layout>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/checkin" element={<CheckInOut />} />
                    <Route path="/registry" element={<Registry />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </Layout>
        </HashRouter>
    )
}
