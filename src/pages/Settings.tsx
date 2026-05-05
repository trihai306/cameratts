import { useState, useEffect } from 'react'
import {
    Settings as SettingsIcon,
    Save,
    Building,
    Database,
    Info
} from 'lucide-react'

export default function Settings() {
    const [companyName, setCompanyName] = useState('')
    const [guardName, setGuardName] = useState('')
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
    const [stats, setStats] = useState({ vehicles: 0, logs: 0 })

    useEffect(() => {
        loadSettings()
        loadStats()
    }, [])

    const loadSettings = async () => {
        const settings = await window.electronAPI.settings.getAll()
        setCompanyName(settings.company_name || '')
        setGuardName(settings.guard_name || '')
    }

    const loadStats = async () => {
        const vehicles = await window.electronAPI.vehicles.count()
        const logs = await window.electronAPI.logs.getRecent(9999)
        setStats({ vehicles, logs: logs.length })
    }

    const handleSave = async () => {
        await window.electronAPI.settings.set('company_name', companyName)
        await window.electronAPI.settings.set('guard_name', guardName)
        showToast('✅ Đã lưu cài đặt', 'success')
    }

    const showToast = (message: string, type: string) => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    return (
        <div className="page-wrapper animate-in">
            <div className="page-header">
                <h1 className="page-title">
                    <SettingsIcon />
                    Cài đặt
                </h1>
                <p className="page-description">Thông tin công ty và cấu hình hệ thống</p>
            </div>

            <div className="content-grid-2">
                {/* General Settings */}
                <div className="card">
                    <div className="card-title">
                        <Building />
                        Thông tin chung
                    </div>

                    <div className="input-group" style={{ marginBottom: '14px' }}>
                        <label>Tên công ty</label>
                        <input className="input" placeholder="Công ty ABC" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>

                    <div className="input-group" style={{ marginBottom: '20px' }}>
                        <label>Tên bảo vệ mặc định</label>
                        <input className="input" placeholder="Nguyễn Văn B" value={guardName} onChange={(e) => setGuardName(e.target.value)} />
                    </div>

                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save /> Lưu cài đặt
                    </button>
                </div>

                {/* System info */}
                <div>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div className="card-title">
                            <Database />
                            Thống kê hệ thống
                        </div>
                        <div className="vehicle-info-card">
                            <div className="vehicle-info-row">
                                <span className="label">Xe đã đăng ký</span>
                                <span className="value">{stats.vehicles}</span>
                            </div>
                            <div className="vehicle-info-row">
                                <span className="label">Tổng lượt ra/vào</span>
                                <span className="value">{stats.logs}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-title">
                            <Info />
                            Thông tin ứng dụng
                        </div>
                        <div className="vehicle-info-card">
                            <div className="vehicle-info-row">
                                <span className="label">Phiên bản</span>
                                <span className="value">1.0.0</span>
                            </div>
                            <div className="vehicle-info-row">
                                <span className="label">Nền tảng</span>
                                <span className="value">Electron + React</span>
                            </div>
                            <div className="vehicle-info-row">
                                <span className="label">Database</span>
                                <span className="value">SQLite</span>
                            </div>
                            <div className="vehicle-info-row">
                                <span className="label">Tác giả</span>
                                <span className="value">TTS Camera</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </div>
    )
}
