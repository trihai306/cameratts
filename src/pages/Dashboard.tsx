import { useState, useEffect } from 'react'
import {
    Car,
    LogIn,
    Activity,
    Users,
    Clock,
    TrendingUp,
    LayoutDashboard
} from 'lucide-react'
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalVehicles: 0,
        insideCount: 0,
        todayCount: 0,
    })
    const [insideVehicles, setInsideVehicles] = useState<any[]>([])
    const [weeklyData, setWeeklyData] = useState<any[]>([])

    const loadData = async () => {
        const api = window.electronAPI
        const [totalVehicles, insideCount, todayCount, inside, weekly] = await Promise.all([
            api.vehicles.count(),
            api.logs.insideCount(),
            api.logs.todayCount(),
            api.logs.insideVehicles(),
            api.logs.weeklyStats(),
        ])

        setStats({ totalVehicles, insideCount, todayCount })
        setInsideVehicles(inside)

        // Process weekly chart data
        const dayMap: Record<string, { day: string; 'Xe vào': number; 'Xe ra': number }> = {}
        const days: string[] = []
        for (let i = 6; i >= 0; i--) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            const key = d.toISOString().split('T')[0]
            const label = `${d.getDate()}/${d.getMonth() + 1}`
            dayMap[key] = { day: label, 'Xe vào': 0, 'Xe ra': 0 }
            days.push(key)
        }

        weekly.forEach((row: any) => {
            if (dayMap[row.day]) {
                if (row.action === 'CHECK_IN') dayMap[row.day]['Xe vào'] = row.count
                else dayMap[row.day]['Xe ra'] = row.count
            }
        })

        setWeeklyData(days.map(d => dayMap[d]))
    }

    useEffect(() => {
        loadData()

        // Realtime: listen for check-log events → update immediately
        const unsubscribe = window.electronAPI.onCheckLogUpdated?.(() => {
            loadData()
        })

        // Fallback: poll every 30s (instead of 10s) as safety net
        const interval = setInterval(loadData, 30000)

        return () => {
            clearInterval(interval)
            unsubscribe?.()
        }
    }, [])

    const formatTime = (ts: string) => {
        const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="page-wrapper animate-in">
            <div className="page-header">
                <h1 className="page-title">
                    <LayoutDashboard />
                    Tổng quan
                </h1>
                <p className="page-description">Thống kê tình hình xe ra / vào hôm nay</p>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card blue">
                    <div className="stat-card-header">
                        <div className="stat-card-icon blue"><Car size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats.totalVehicles}</div>
                    <div className="stat-card-label">Xe đã đăng ký</div>
                </div>

                <div className="stat-card green">
                    <div className="stat-card-header">
                        <div className="stat-card-icon green"><LogIn size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats.insideCount}</div>
                    <div className="stat-card-label">Xe đang trong khuôn viên</div>
                </div>

                <div className="stat-card amber">
                    <div className="stat-card-header">
                        <div className="stat-card-icon amber"><Activity size={20} /></div>
                    </div>
                    <div className="stat-card-value">{stats.todayCount}</div>
                    <div className="stat-card-label">Lượt ra / vào hôm nay</div>
                </div>

                <div className="stat-card purple">
                    <div className="stat-card-header">
                        <div className="stat-card-icon purple"><Users size={20} /></div>
                    </div>
                    <div className="stat-card-value">{insideVehicles.length}</div>
                    <div className="stat-card-label">Nhân viên đang có mặt</div>
                </div>
            </div>

            {/* Two column layout */}
            <div className="content-grid-2">
                {/* Weekly Chart */}
                <div className="card">
                    <div className="card-title">
                        <TrendingUp />
                        Thống kê 7 ngày gần nhất
                    </div>
                    <div className="chart-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyData} barGap={4} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        fontSize: '13px',
                                        color: '#0f172a',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                                <Bar dataKey="Xe vào" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Xe ra" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Inside vehicles */}
                <div className="card">
                    <div className="card-title">
                        <Clock />
                        Xe đang trong khuôn viên
                    </div>
                    {insideVehicles.length === 0 ? (
                        <div className="empty-state">
                            <Car />
                            <p>Chưa có xe nào trong khuôn viên</p>
                        </div>
                    ) : (
                        <div className="table-wrapper" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Biển số</th>
                                        <th>Chủ xe</th>
                                        <th>Phòng ban</th>
                                        <th>Giờ vào</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {insideVehicles.map((v: any, i: number) => (
                                        <tr key={i}>
                                            <td><span className="plate-number">{v.plate_number}</span></td>
                                            <td>{v.owner_name || '—'}</td>
                                            <td>{v.department ? <span className="badge badge-blue">{v.department}</span> : '—'}</td>
                                            <td className="text-muted">{formatTime(v.timestamp)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
