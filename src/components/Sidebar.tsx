import { NavLink } from 'react-router-dom'
import {
    LayoutDashboard,
    ScanLine,
    Car,
    History,
    Settings
} from 'lucide-react'

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Tổng quan' },
    { to: '/checkin', icon: ScanLine, label: 'Xe vào / ra' },
    { to: '/registry', icon: Car, label: 'Danh sách xe' },
    { to: '/history', icon: History, label: 'Lịch sử' },
    { to: '/settings', icon: Settings, label: 'Cài đặt' },
]

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-brand">
                    <div className="sidebar-logo">🚗</div>
                    <div>
                        <div className="sidebar-title">TTS Camera</div>
                        <div className="sidebar-subtitle">Quản lý biển số</div>
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            `sidebar-nav-item ${isActive ? 'active' : ''}`
                        }
                    >
                        <item.icon />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-footer-text">TTS Camera v1.0</div>
            </div>
        </aside>
    )
}
