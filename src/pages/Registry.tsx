import { useState, useEffect } from 'react'
import {
    Car,
    Plus,
    Search,
    Edit3,
    Trash2,
    X,
    Save,
    User,
} from 'lucide-react'

interface Vehicle {
    id: number
    plate_number: string
    owner_name: string
    department: string
    vehicle_type: string
    color: string
    notes: string
    status: string
    created_at: string
}

const emptyVehicle = {
    plate_number: '',
    owner_name: '',
    department: '',
    vehicle_type: 'Xe máy',
    color: '',
    notes: '',
}

export default function Registry() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [search, setSearch] = useState('')
    const [filterDept, setFilterDept] = useState('')
    const [filterType, setFilterType] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState(emptyVehicle)
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

    const loadVehicles = async () => {
        const all = await window.electronAPI.vehicles.getAll()
        setVehicles(all)
    }

    useEffect(() => { loadVehicles() }, [])

    const departments = [...new Set(vehicles.map(v => v.department).filter(Boolean))]
    const vehicleTypes = [...new Set(vehicles.map(v => v.vehicle_type).filter(Boolean))]

    const filtered = vehicles.filter(v => {
        const matchSearch = !search ||
            v.plate_number.toLowerCase().includes(search.toLowerCase()) ||
            v.owner_name.toLowerCase().includes(search.toLowerCase())
        const matchDept = !filterDept || v.department === filterDept
        const matchType = !filterType || v.vehicle_type === filterType
        return matchSearch && matchDept && matchType
    })

    const openAddModal = () => {
        setEditId(null)
        setForm(emptyVehicle)
        setShowModal(true)
    }

    const openEditModal = (vehicle: Vehicle) => {
        setEditId(vehicle.id)
        setForm({
            plate_number: vehicle.plate_number,
            owner_name: vehicle.owner_name,
            department: vehicle.department,
            vehicle_type: vehicle.vehicle_type,
            color: vehicle.color,
            notes: vehicle.notes,
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.plate_number.trim()) { showToast('Vui lòng nhập biển số xe', 'error'); return }
        if (!form.owner_name.trim()) { showToast('Vui lòng nhập tên chủ xe', 'error'); return }

        try {
            if (editId) {
                await window.electronAPI.vehicles.update(editId, form)
                showToast('✅ Cập nhật xe thành công', 'success')
            } else {
                await window.electronAPI.vehicles.create(form)
                showToast('✅ Thêm xe mới thành công', 'success')
            }
            setShowModal(false)
            loadVehicles()
        } catch (err: any) {
            const msg = err.message?.includes('UNIQUE') ? 'Biển số xe đã tồn tại' : err.message
            showToast('❌ Lỗi: ' + msg, 'error')
        }
    }

    const handleDelete = async (id: number, plate: string) => {
        if (!confirm(`Xóa xe ${plate} khỏi danh sách?`)) return
        await window.electronAPI.vehicles.delete(id)
        showToast('🗑️ Đã xóa xe ' + plate, 'info')
        loadVehicles()
    }

    const showToast = (message: string, type: string) => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    const formatDate = (ts: string) => {
        const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
        return d.toLocaleDateString('vi-VN')
    }

    return (
        <div className="page-wrapper animate-in">
            <div className="page-header">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="page-title">
                            <Car />
                            Danh sách xe đăng ký
                        </h1>
                        <p className="page-description">Quản lý xe được phép ra vào công ty</p>
                    </div>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        <Plus /> Thêm xe
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="input-group" style={{ flex: 2 }}>
                    <label><Search size={12} /> Tìm kiếm</label>
                    <input className="input" placeholder="Biển số hoặc tên chủ xe..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Phòng ban</label>
                    <select className="input" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                        <option value="">Tất cả</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div className="input-group">
                    <label>Loại xe</label>
                    <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">Tất cả</option>
                        {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {/* Count */}
            <div className="text-sm text-muted" style={{ marginBottom: '10px' }}>
                Hiển thị {filtered.length} / {vehicles.length} xe
            </div>

            {/* Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <Car />
                        <p>Chưa có xe nào được đăng ký</p>
                        <button className="btn btn-primary mt-4" onClick={openAddModal}><Plus /> Thêm xe đầu tiên</button>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Biển số</th>
                                    <th>Chủ xe</th>
                                    <th>Phòng ban</th>
                                    <th>Loại xe</th>
                                    <th>Màu</th>
                                    <th>Ngày đăng ký</th>
                                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((v, i) => (
                                    <tr key={v.id}>
                                        <td className="text-muted">{i + 1}</td>
                                        <td><span className="plate-number">{v.plate_number}</span></td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <User size={14} style={{ color: 'var(--text-muted)' }} />
                                                {v.owner_name}
                                            </div>
                                        </td>
                                        <td>{v.department ? <span className="badge badge-blue">{v.department}</span> : '—'}</td>
                                        <td>{v.vehicle_type}</td>
                                        <td>{v.color || '—'}</td>
                                        <td className="text-muted">{formatDate(v.created_at)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(v)}><Edit3 /></button>
                                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v.id, v.plate_number)}><Trash2 /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">
                            {editId ? <Edit3 /> : <Plus />}
                            {editId ? 'Sửa thông tin xe' : 'Thêm xe mới'}
                        </div>

                        <div className="form-grid">
                            <div className="input-group full-width">
                                <label>Biển số xe *</label>
                                <input className="input" placeholder="30A-12345" value={form.plate_number}
                                    onChange={(e) => setForm({ ...form, plate_number: e.target.value.toUpperCase() })}
                                    style={{ fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }} />
                            </div>
                            <div className="input-group">
                                <label>Tên chủ xe *</label>
                                <input className="input" placeholder="Nguyễn Văn A" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Phòng ban</label>
                                <input className="input" placeholder="IT, Kế toán, HR..." value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Loại xe</label>
                                <select className="input" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                                    <option value="Xe máy">Xe máy</option>
                                    <option value="Ô tô">Ô tô</option>
                                    <option value="Xe đạp điện">Xe đạp điện</option>
                                    <option value="Khác">Khác</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>Màu xe</label>
                                <input className="input" placeholder="Đen, Trắng, Đỏ..." value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                            </div>
                            <div className="input-group full-width">
                                <label>Ghi chú</label>
                                <input className="input" placeholder="Ghi chú thêm (tùy chọn)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}><X /> Hủy</button>
                            <button className="btn btn-primary" onClick={handleSave}><Save /> {editId ? 'Cập nhật' : 'Thêm xe'}</button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </div>
    )
}
