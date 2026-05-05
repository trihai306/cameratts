# TTS Camera - Hệ thống Quản lý Xe Ra/Vào bằng Nhận diện Biển số

Ứng dụng desktop quản lý xe ra/vào khuôn viên doanh nghiệp, tích hợp AI nhận diện biển số xe Việt Nam (LPR - License Plate Recognition) tự động qua camera.

## Tính năng chính

- **Nhận diện biển số tự động (AI)** - Sử dụng YOLOv9 + PaddleOCR, hỗ trợ tất cả định dạng biển số Việt Nam (cá nhân, thương mại, công vụ, quân đội)
- **Đa nguồn camera** - Webcam máy tính, camera điện thoại qua IP (Android IP Webcam), iPhone Continuity Camera
- **Check-in / Check-out** - Ghi nhận xe vào/ra với thời gian, tên bảo vệ, ghi chú, ảnh chụp biển số
- **Dashboard thống kê** - Tổng xe đăng ký, xe đang trong khuôn viên, lượt ra/vào hôm nay, biểu đồ 7 ngày
- **Quản lý xe đăng ký** - Thêm/sửa/xóa xe, tìm kiếm, lọc theo phòng ban và loại xe
- **Lịch sử tra cứu** - Lọc theo biển số, hành động, khoảng thời gian, xuất CSV
- **Cài đặt hệ thống** - Tên công ty, tên bảo vệ mặc định, thông tin hệ thống

## Kiến trúc

```
┌─────────────────────────────────────────────────┐
│                  Electron Shell                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │  React UI    │◄──►│   Electron Main (IPC)  │  │
│  │  (Renderer)  │    │   + SQLite Database    │  │
│  └──────┬───────┘    └────────────────────────┘  │
│         │                                        │
│         ▼                                        │
│  ┌──────────────────────┐                        │
│  │  LPR Service (Python)│                        │
│  │  FastAPI :8765       │                        │
│  │  YOLOv9 + PaddleOCR  │                        │
│  └──────────────────────┘                        │
└─────────────────────────────────────────────────┘
```

| Thành phần | Công nghệ |
|---|---|
| Frontend UI | React 18 + TypeScript |
| Desktop Shell | Electron 33 |
| Database | SQLite (better-sqlite3, WAL mode) |
| AI/LPR Engine | Python FastAPI + YOLOv9-s + PaddleOCR (Vietnamese) |
| Build Tool | Vite 6 |
| Charts | Recharts |
| Icons | Lucide React |
| Routing | React Router v6 (HashRouter) |

## Cấu trúc thư mục

```
tts-camera/
├── electron/
│   ├── main.ts            # Electron main process, IPC handlers, DB init
│   └── preload.ts         # Context bridge (electronAPI)
├── src/
│   ├── App.tsx            # Router setup
│   ├── main.tsx           # React entry point
│   ├── components/
│   │   ├── Layout.tsx     # Layout wrapper
│   │   └── Sidebar.tsx    # Navigation sidebar
│   └── pages/
│       ├── Dashboard.tsx  # Tổng quan, thống kê, biểu đồ
│       ├── CheckInOut.tsx # Xe vào/ra, camera, LPR
│       ├── Registry.tsx   # Danh sách xe đăng ký
│       ├── History.tsx    # Lịch sử ra/vào
│       └── Settings.tsx   # Cài đặt hệ thống
├── lpr-service/
│   ├── server.py              # FastAPI server, pipeline nhận diện
│   ├── vn_plate_validator.py  # Validate & format biển số VN
│   ├── requirements.txt       # Python dependencies
│   ├── setup.sh               # Script cài đặt tự động
│   └── test_validator.py      # Unit tests cho validator
├── data/
│   ├── tts-camera.db          # SQLite database
│   └── captures/              # Ảnh chụp biển số
├── package.json
├── vite.config.ts
├── tsconfig.json
└── docs/
    └── BA_SRS_Report.md       # Tài liệu đặc tả yêu cầu phần mềm
```

## Yêu cầu hệ thống

- **Node.js** >= 18
- **Python** 3.9 - 3.12 (cho LPR service)
- **macOS** / Windows / Linux
- Camera (webcam hoặc IP camera)

## Cài đặt

### 1. Cài đặt Frontend + Electron

```bash
npm install
```

### 2. Cài đặt LPR Service (Python)

```bash
cd lpr-service
chmod +x setup.sh
./setup.sh
```

Script sẽ tự động:
- Tạo Python virtual environment
- Cài đặt các dependencies (FastAPI, PaddleOCR, YOLOv9, ...)
- Kiểm tra cài đặt

### 3. Chạy ứng dụng

```bash
npm run dev
```

Electron sẽ tự động khởi động LPR service trên port `8765` khi mở ứng dụng.

## Database Schema

### Bảng `vehicles` - Xe đăng ký
| Cột | Kiểu | Mô tả |
|---|---|---|
| id | INTEGER PK | Auto increment |
| plate_number | TEXT UNIQUE | Biển số xe |
| owner_name | TEXT | Tên chủ xe |
| department | TEXT | Phòng ban |
| vehicle_type | TEXT | Loại xe (Xe máy/Ô tô/Xe đạp điện/Khác) |
| color | TEXT | Màu xe |
| notes | TEXT | Ghi chú |
| status | TEXT | active / inactive (soft delete) |
| created_at | DATETIME | Ngày tạo |

### Bảng `check_logs` - Lịch sử ra/vào
| Cột | Kiểu | Mô tả |
|---|---|---|
| id | INTEGER PK | Auto increment |
| plate_number | TEXT | Biển số xe |
| action | TEXT | CHECK_IN / CHECK_OUT |
| timestamp | DATETIME | Thời gian |
| notes | TEXT | Ghi chú |
| guard_name | TEXT | Tên bảo vệ |
| image_path | TEXT | Đường dẫn ảnh chụp |

### Bảng `settings` - Cài đặt
| Cột | Kiểu | Mô tả |
|---|---|---|
| key | TEXT PK | Tên cài đặt |
| value | TEXT | Giá trị |

## LPR Service API

LPR service chạy trên `http://127.0.0.1:8765` (chỉ localhost).

### `GET /health`
Kiểm tra trạng thái service.

```json
{
  "status": "ok",
  "version": "2.0",
  "model_loaded": true,
  "detector_loaded": true,
  "ocr_loaded": true
}
```

### `POST /recognize`
Nhận diện biển số từ ảnh base64.

**Request:**
```json
{
  "image": "data:image/jpeg;base64,...",
  "crop_region": { "x": 0, "y": 0, "w": 640, "h": 480 }
}
```

**Response:**
```json
{
  "success": true,
  "plates": [
    {
      "plate": "29A-123.45",
      "raw_ocr": "29A12345",
      "confidence": 95.2,
      "ocr_confidence": 88.5,
      "validation_score": 1.0,
      "bbox": [100, 200, 300, 250],
      "province": "Hà Nội",
      "plate_type": "personal"
    }
  ],
  "processing_time_ms": 245.3
}
```

### `WebSocket /ws/recognize`
Nhận diện real-time qua WebSocket. Client gửi binary JPEG frame, server trả JSON result.

### `POST /ocr-direct`
OCR trực tiếp trên ảnh biển số đã crop (không qua bước detection).

## Pipeline nhận diện

1. **Capture** - Chụp frame từ camera (640px)
2. **Detection** - YOLOv9-s phát hiện vùng biển số trong ảnh
3. **Crop & Preprocess** - Cắt vùng biển số, CLAHE contrast, resize, sharpen
4. **OCR** - PaddleOCR v5 (Vietnamese) đọc ký tự
5. **Validation** - Kiểm tra định dạng biển số VN (63 mã tỉnh, series, số)
6. **Post-process** - Sửa lỗi OCR phổ biến (O↔0, I↔1, S↔5, ...), format chuẩn

## Electron IPC API

Frontend giao tiếp với main process qua `window.electronAPI`:

```typescript
// Quản lý xe
electronAPI.vehicles.getAll()
electronAPI.vehicles.search(query)
electronAPI.vehicles.getByPlate(plate)
electronAPI.vehicles.create(vehicle)
electronAPI.vehicles.update(id, vehicle)
electronAPI.vehicles.delete(id)

// Check-in/out
electronAPI.logs.checkIn(plate, guardName, notes, imagePath)
electronAPI.logs.checkOut(plate, guardName, notes, imagePath)
electronAPI.logs.getStatus(plate)        // → 'INSIDE' | 'OUTSIDE'
electronAPI.logs.getRecent(limit)
electronAPI.logs.getAll(filters)
electronAPI.logs.insideVehicles()
electronAPI.logs.weeklyStats()

// Cài đặt
electronAPI.settings.get(key)
electronAPI.settings.set(key, value)
electronAPI.settings.getAll()

// LPR
electronAPI.lpr.recognize(imageBase64)
electronAPI.lpr.health()

// Chụp ảnh
electronAPI.capture.save(imageBase64, plate)

// Realtime event
electronAPI.onCheckLogUpdated(callback)  // push từ main process
```

## Build

```bash
# Build frontend
npm run build

# Output: dist/ (frontend) + dist-electron/ (electron)
```

## Tài liệu tham khảo

- [Đặc tả yêu cầu phần mềm (SRS)](docs/BA_SRS_Report.md) - Phân tích tính năng v1.0, GAP analysis, User Stories cho v2.0

## License

Private - Internal use only.
# cameratts
