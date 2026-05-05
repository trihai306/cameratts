import { useState, useEffect } from 'react'
import {
    History as HistoryIcon,
    Search,
    Filter,
    LogIn,
    LogOut,
    Calendar,
    Download
} from 'lucide-react'

export default function History() {
    const [logs, setLogs] = useState<any[]>([])
    const [filters, setFilters] = useState({
        plate: '',
        action: '',
        dateFrom: '',
        dateTo: '',
    })
    const [loading, setLoading] = useState(false)

    const loadLogs = async () => {
        setLoading(true)
        const data = await window.electronAPI.logs.getAll(filters)
        setLogs(data)
        setLoading(false)
    }

    useEffect(() => { loadLogs() }, [])

    const handleFilter = () => { loadLogs() }

    const handleReset = () => {
        setFilters({ plate: '', action: '', dateFrom: '', dateTo: '' })
        setTimeout(loadLogs, 50)
    }

    const formatDateTime = (ts: string) => {
        const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
        return d.toLocaleString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
    }

    const exportCSV = () => {
        if (logs.length === 0) return
        const headers = ['STT', 'Biển số', 'Hành động', 'Thời gian', 'Bảo vệ', 'Ghi chú']
        const rows = logs.map((log, i) => [
            i + 1, log.plate_number,
            log.action === 'CHECK_IN' ? 'Vào' : 'Ra',
            formatDateTime(log.timestamp), log.guard_name, log.notes
        ])
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `lich-su-xe_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="page-wrapper animate-in">
            <div className="page-header">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="page-title">
                            <HistoryIcon />
                            Lịch sử ra / vào
                        </h1>
                        <p className="page-description">Tra cứu lịch sử xe ra vào khuôn viên</p>
                    </div>
                    <button className="btn btn-ghost" onClick={exportCSV} disabled={logs.length === 0}>
                        <Download /> Xuất CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="input-group" style={{ flex: 2 }}>
                    <label><Search size={12} /> Biển số xe</label>
                    <input className="input" placeholder="Nhập biển số..." value={filters.plate}
                        onChange={(e) => setFilters({ ...filters, plate: e.target.value })} />
                </div>
                <div className="input-group">
                    <label>Hành động</label>
                    <select className="input" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
                        <option value="">Tất cả</option>
                        <option value="CHECK_IN">Vào</option>
                        <option value="CHECK_OUT">Ra</option>
                    </select>
                </div>
                <div className="input-group">
                    <label><Calendar size={12} /> Từ ngày</label>
                    <input type="date" className="input" value={filters.dateFrom}
                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
                </div>
                <div className="input-group">
                    <label>Đến ngày</label>
                    <input type="date" className="input" value={filters.dateTo}
                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
                </div>
                <div className="input-group" style={{ justifyContent: 'flex-end' }}>
                    <label>&nbsp;</label>
                    <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={handleFilter}><Filter size={14} /> Lọc</button>
                        <button className="btn btn-ghost btn-sm" onClick={handleReset}>Xóa lọc</button>
                    </div>
                </div>
            </div>

            {/* Count */}
            <div className="text-sm text-muted" style={{ marginBottom: '10px' }}>
                {loading ? 'Đang tải...' : `Hiển thị ${logs.length} bản ghi`}
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {logs.length === 0 ? (
                    <div className="empty-state">
                        <HistoryIcon />
                        <p>Không tìm thấy bản ghi nào</p>
                    </div>
                ) : (
                    <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Biển số xe</th>
                                    <th>Hành động</th>
                                    <th>Thời gian</th>
                                    <th>Bảo vệ</th>
                                    <th>Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, i) => (
                                    <tr key={log.id}>
                                        <td className="text-muted">{i + 1}</td>
                                        <td><span className="plate-number">{log.plate_number}</span></td>
                                        <td>
                                            {log.action === 'CHECK_IN' ? (
                                                <span className="badge badge-green"><LogIn size={12} /> Vào</span>
                                            ) : (
                                                <span className="badge badge-red"><LogOut size={12} /> Ra</span>
                                            )}
                                        </td>
                                        <td className="text-sm">{formatDateTime(log.timestamp)}</td>
                                        <td className="text-muted">{log.guard_name || '—'}</td>
                                        <td className="text-muted truncate" style={{ maxWidth: '200px' }}>{log.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
