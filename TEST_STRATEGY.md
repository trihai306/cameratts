# TEST STRATEGY - TTS Camera System
**Ngày:** 2026-03-16
**Phiên bản:** 1.0
**Người soạn:** Tester Agent

---

## 1. TỔNG QUAN DỰ ÁN

TTS Camera là hệ thống quản lý ra vào bằng nhận diện biển số xe, bao gồm:
- **Frontend:** React 18 + TypeScript (5 pages: Dashboard, CheckInOut, Registry, History, Settings)
- **Desktop shell:** Electron 33 (IPC handlers, SQLite via better-sqlite3)
- **AI/LPR service:** Python FastAPI + FastALPR (YOLO + OCR)
- **Database:** SQLite (3 bảng: vehicles, check_logs, settings)

**Trạng thái hiện tại:** Chưa có bất kỳ test nào.

---

## 2. TEST STRATEGY TỔNG THỂ

### 2.1 Mục tiêu
| Mục tiêu | Chỉ số |
|---|---|
| Code coverage tổng thể | >= 70% |
| Unit test coverage (business logic) | >= 80% |
| Integration test coverage (IPC + DB) | >= 60% |
| E2E test coverage (critical paths) | 100% happy paths |
| LPR accuracy benchmark | >= 85% (biển số chuẩn) |

### 2.2 Phạm vi kiểm thử
- **Trong phạm vi:** IPC handlers, DB queries, React components, LPR service API, Check-in/out logic
- **Ngoài phạm vi:** Camera hardware access, ONNX model training, Electron packaging/distribution

### 2.3 Môi trường kiểm thử
| Môi trường | Mục đích |
|---|---|
| Unit (in-memory SQLite) | Kiểm tra logic đơn lẻ |
| Integration (temp DB file) | Kiểm tra IPC + DB pipeline |
| E2E (Electron app thật) | Kiểm tra luồng người dùng hoàn chỉnh |
| CI (GitHub Actions) | Chạy tự động mỗi PR |

---

## 3. FRAMEWORK ĐỀ XUẤT

### 3.1 Frontend + Electron (TypeScript)
```
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom playwright @playwright/test
```

| Layer | Framework | Lý do chọn |
|---|---|---|
| Unit Tests | **Vitest** | Tích hợp tốt với Vite build, nhanh, ESM native |
| React Components | **React Testing Library** | Testing theo hành vi người dùng, không test implementation |
| E2E | **Playwright** | Hỗ trợ Electron, cross-platform, auto-wait |
| Coverage | **@vitest/coverage-v8** | Tích hợp sẵn với Vitest |

### 3.2 Python LPR Service
```
pip install pytest pytest-asyncio httpx pytest-cov
```

| Layer | Framework | Lý do chọn |
|---|---|---|
| Unit Tests | **pytest** | Standard Python, fixture system mạnh |
| API Tests | **httpx + pytest-asyncio** | Test FastAPI async endpoints |
| Coverage | **pytest-cov** | Báo cáo coverage chuẩn |

### 3.3 Cấu hình Vitest (vitest.config.ts)
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'electron/**'],
      exclude: ['src/__tests__/**', 'node_modules/**'],
      thresholds: { lines: 70, functions: 70, branches: 60 }
    }
  }
})
```

---

## 4. CẤU TRÚC THƯ MỤC TEST

```
tts-camera/
├── src/
│   └── __tests__/
│       ├── setup.ts                    # Global test setup, mock electronAPI
│       ├── unit/
│       │   ├── components/
│       │   │   ├── Registry.test.tsx
│       │   │   ├── CheckInOut.test.tsx
│       │   │   ├── Dashboard.test.tsx
│       │   │   └── Settings.test.tsx
│       │   └── utils/
│       │       └── plateUtils.test.ts  # Format/validate plate number
│       └── integration/
│           └── ipc-db.test.ts          # IPC handlers + SQLite
├── electron/
│   └── __tests__/
│       ├── ipcHandlers.test.ts
│       └── dbQueries.test.ts
├── lpr-service/
│   └── tests/
│       ├── conftest.py
│       ├── test_health.py
│       ├── test_recognize.py
│       └── test_image_decode.py
└── e2e/
    ├── checkin-checkout.spec.ts
    ├── registry-crud.spec.ts
    ├── dashboard.spec.ts
    └── settings.spec.ts
```

---

## 5. TEST DATA (MOCK VEHICLES & SCENARIOS)

### 5.1 Mock Vehicles
```typescript
// src/__tests__/fixtures/vehicles.ts
export const MOCK_VEHICLES = [
  {
    id: 1,
    plate_number: '30A-12345',
    owner_name: 'Nguyễn Văn An',
    department: 'IT',
    vehicle_type: 'Xe máy',
    color: 'Đen',
    notes: '',
    status: 'active',
    created_at: '2025-01-15T08:00:00'
  },
  {
    id: 2,
    plate_number: '51G-99888',
    owner_name: 'Trần Thị Bích',
    department: 'Kế toán',
    vehicle_type: 'Ô tô',
    color: 'Trắng',
    notes: 'Ban giám đốc',
    status: 'active',
    created_at: '2025-02-20T09:30:00'
  },
  {
    id: 3,
    plate_number: '29B-56789',
    owner_name: 'Lê Minh Cường',
    department: 'HR',
    vehicle_type: 'Xe đạp điện',
    color: 'Đỏ',
    notes: '',
    status: 'active',
    created_at: '2025-03-01T10:00:00'
  }
]

export const MOCK_UNREGISTERED_PLATE = '92C-00001'
export const INVALID_PLATE = 'ABCXYZ!@#'
export const SHORT_PLATE = 'AB'
```

### 5.2 Mock Check Logs
```typescript
export const MOCK_LOGS = [
  { id: 1, plate_number: '30A-12345', action: 'CHECK_IN', timestamp: '2026-03-16T07:30:00', guard_name: 'Bảo vệ', notes: '' },
  { id: 2, plate_number: '51G-99888', action: 'CHECK_IN', timestamp: '2026-03-16T08:00:00', guard_name: 'Bảo vệ', notes: '' },
  { id: 3, plate_number: '30A-12345', action: 'CHECK_OUT', timestamp: '2026-03-16T17:00:00', guard_name: 'Bảo vệ', notes: 'Về sớm' },
]
```

### 5.3 Mock LPR Responses
```typescript
export const LPR_RESPONSE_SUCCESS = {
  success: true,
  plates: [
    { plate: '30A-12345', confidence: 92.5, bbox: [100, 200, 350, 280] }
  ],
  message: 'Detected 1 plate(s)'
}

export const LPR_RESPONSE_MULTI = {
  success: true,
  plates: [
    { plate: '30A-12345', confidence: 85.0, bbox: [50, 100, 300, 180] },
    { plate: '51G-99888', confidence: 72.3, bbox: [400, 100, 650, 180] }
  ],
  message: 'Detected 2 plate(s)'
}

export const LPR_RESPONSE_EMPTY = {
  success: true,
  plates: [],
  message: 'No plates detected'
}

export const LPR_RESPONSE_ERROR = {
  success: false,
  plates: [],
  message: 'LPR service not available'
}
```

### 5.4 Mock Settings
```typescript
export const MOCK_SETTINGS = {
  company_name: 'Công ty TTS',
  guard_name: 'Nguyễn Bảo Vệ',
  camera_source: 'local',
  camera_device_id: 'device-001',
  phone_camera_url: ''
}
```

### 5.5 Test Images cho LPR (Python)
```python
# lpr-service/tests/conftest.py
import base64, io
from PIL import Image
import numpy as np

def create_blank_image_b64(width=640, height=480):
    """Tạo ảnh trắng giả lập để test decode, không test AI inference."""
    img = Image.fromarray(np.zeros((height, width, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    return base64.b64encode(buf.getvalue()).decode()

SAMPLE_IMAGE_B64 = create_blank_image_b64()
SAMPLE_IMAGE_DATA_URI = f"data:image/jpeg;base64,{SAMPLE_IMAGE_B64}"
```

---

## 6. TEST CASES CHI TIẾT

### 6.1 CHECK-IN / CHECK-OUT FLOW

#### Unit Tests (CheckInOut component)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| CHK-U01 | Hiển thị trạng thái LPR online | lprStatus = 'online' | Badge "AI: Sẵn sàng" hiển thị | High |
| CHK-U02 | Hiển thị trạng thái LPR offline | lprStatus = 'offline' | Badge "AI: Offline" hiển thị | High |
| CHK-U03 | Nhập biển số thủ công hợp lệ | plate = "30A-12345" | Tự động uppercase, gọi searchPlate | High |
| CHK-U04 | Lọc ký tự không hợp lệ | input = "30a!@#12345" | Chỉ giữ "30A12345" | Medium |
| CHK-U05 | Biển số < 3 ký tự không tìm kiếm | plate = "3A" | vehicleInfo = null, không gọi API | Medium |
| CHK-U06 | Xe đã đăng ký hiển thị thông tin | getByPlate returns vehicle | Badge "Đã đăng ký" + thông tin chủ xe | High |
| CHK-U07 | Xe chưa đăng ký hiển thị cảnh báo | getByPlate returns null | Badge "Chưa đăng ký" | High |
| CHK-U08 | Nút VÀO disabled khi xe đang trong | status = 'INSIDE' | Nút VÀO disabled | High |
| CHK-U09 | Nút RA disabled khi xe ở ngoài | status = 'OUTSIDE' | Nút RA disabled | High |
| CHK-U10 | Check-in thành công | handleAction('CHECK_IN') | Toast "Xe 30A-12345 đã vào", reset form | High |
| CHK-U11 | Check-out thành công | handleAction('CHECK_OUT') | Toast "Xe 30A-12345 đã ra", reset form | High |
| CHK-U12 | Check-in thất bại hiển thị lỗi | API throws error | Toast "Lỗi: ..." | High |
| CHK-U13 | Enter key trigger action | keyDown Enter | Gọi handleAction tương ứng trạng thái | Medium |
| CHK-U14 | Toast tự ẩn sau 3 giây | showToast called | Toast biến mất sau 3000ms | Low |
| CHK-U15 | Reset form sau check-in | handleAction thành công | plate='', vehicleInfo=null, notes='' | High |
| CHK-U16 | Auto-scan bật khi camera + LPR sẵn sàng | cameraActive=true, lprStatus='online' | autoScan = true | Medium |
| CHK-U17 | Nhiều kết quả LPR chọn confidence cao nhất | plates=[{conf:85},{conf:92}] | Chọn plate có confidence 92 | High |
| CHK-U18 | Switch camera source local -> phone | handleSwitchSource('phone') | settings.set gọi với 'phone' | Medium |
| CHK-U19 | Phone URL bỏ trống hiển thị lỗi | phoneUrl = '' | Toast cảnh báo | Medium |
| CHK-U20 | URL phone tự thêm http:// | url = '192.168.1.100:8080' | streamUrl = 'http://192.168.1.100:8080/video' | Medium |

#### IPC Handler Tests (Electron main process)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| CHK-I01 | db:logs:checkIn tạo log mới | plate, guard, notes | Row INSERT vào check_logs | High |
| CHK-I02 | db:logs:checkOut tạo log ra | plate, guard, notes | Row INSERT action='CHECK_OUT' | High |
| CHK-I03 | db:logs:getStatus xe chưa có log | plate mới | return 'OUTSIDE' | High |
| CHK-I04 | db:logs:getStatus sau CHECK_IN | plate sau check-in | return 'INSIDE' | High |
| CHK-I05 | db:logs:getStatus sau CHECK_OUT | plate sau check-out | return 'OUTSIDE' | High |
| CHK-I06 | db:logs:getRecent đúng số lượng | limit=5 | Trả về tối đa 5 bản ghi mới nhất | Medium |
| CHK-I07 | db:logs:insideCount đếm đúng | 3 xe trong, 1 xe ra | insideCount = 3 | High |
| CHK-I08 | db:logs:todayCount chỉ đếm hôm nay | logs hôm qua + hôm nay | Chỉ đếm logs hôm nay | Medium |

---

### 6.2 VEHICLE REGISTRY CRUD

#### Unit Tests (Registry component)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| REG-U01 | Hiển thị danh sách xe | vehicles = MOCK_VEHICLES | Render 3 hàng trong bảng | High |
| REG-U02 | Tìm kiếm theo biển số | search = "30A" | Chỉ hiển thị xe "30A-12345" | High |
| REG-U03 | Tìm kiếm theo tên chủ xe | search = "Bích" | Chỉ hiển thị xe của "Trần Thị Bích" | High |
| REG-U04 | Lọc theo phòng ban | filterDept = "IT" | Chỉ hiển thị xe phòng IT | Medium |
| REG-U05 | Lọc theo loại xe | filterType = "Ô tô" | Chỉ hiển thị ô tô | Medium |
| REG-U06 | Lọc kết hợp search + dept | search="An", dept="IT" | Đúng xe AN phòng IT | Medium |
| REG-U07 | Mở modal thêm xe mới | click "Thêm xe" | Modal hiển thị, form rỗng | High |
| REG-U08 | Mở modal sửa xe | click Edit button | Modal hiển thị, form điền sẵn | High |
| REG-U09 | Validation biển số bắt buộc | submit form, plate rỗng | Toast "Vui lòng nhập biển số xe" | High |
| REG-U10 | Validation tên chủ xe bắt buộc | submit form, owner rỗng | Toast "Vui lòng nhập tên chủ xe" | High |
| REG-U11 | Thêm xe thành công | form hợp lệ, click Thêm | API create gọi, toast thành công, reload | High |
| REG-U12 | Sửa xe thành công | form hợp lệ, click Cập nhật | API update gọi với id đúng | High |
| REG-U13 | Xử lý lỗi UNIQUE (biển số trùng) | create trả về lỗi UNIQUE | Toast "Biển số xe đã tồn tại" | High |
| REG-U14 | Xóa xe hiển thị confirm | click Trash | window.confirm được gọi | High |
| REG-U15 | Xóa xe sau confirm | confirm = true | API delete gọi, toast xóa | High |
| REG-U16 | Hủy xóa xe | confirm = false | API delete KHÔNG gọi | Medium |
| REG-U17 | Biển số tự động uppercase | nhập "30a-12345" | plate_number = "30A-12345" | Medium |
| REG-U18 | Empty state khi không có xe | vehicles = [] | Hiển thị "Chưa có xe nào" + nút thêm | Medium |
| REG-U19 | Đóng modal click overlay | click outside modal | Modal ẩn | Low |
| REG-U20 | Counter hiển thị đúng | filter còn 2/3 | "Hiển thị 2 / 3 xe" | Low |

#### IPC Handler Tests (Electron main process)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| REG-I01 | db:vehicles:getAll chỉ lấy active | có xe inactive | Không trả về xe inactive | High |
| REG-I02 | db:vehicles:create thành công | vehicle object hợp lệ | Lastid > 0, row trong DB | High |
| REG-I03 | db:vehicles:create trùng plate | plate đã tồn tại | Throw UNIQUE constraint error | High |
| REG-I04 | db:vehicles:update đúng id | id=1, data mới | Row id=1 được cập nhật | High |
| REG-I05 | db:vehicles:delete soft delete | id=1 | status='inactive', không xóa row | High |
| REG-I06 | db:vehicles:getByPlate tìm đúng | plate='30A-12345' | Trả về vehicle object | High |
| REG-I07 | db:vehicles:getByPlate không tìm thấy | plate không tồn tại | Trả về null/undefined | High |
| REG-I08 | db:vehicles:search LIKE query | query='30A' | Trả về xe khớp pattern | Medium |
| REG-I09 | db:vehicles:count đúng | 3 xe active, 1 inactive | count = 3 | Medium |

---

### 6.3 LPR RECOGNITION ACCURACY

#### Python API Tests (pytest)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| LPR-P01 | GET /health trả về status ok | GET /health | {"status":"ok","model_loaded":...} | High |
| LPR-P02 | POST /recognize với ảnh base64 hợp lệ | SAMPLE_IMAGE_B64 | response.success = true | High |
| LPR-P03 | POST /recognize với data URI prefix | data:image/jpeg;base64,... | Xử lý đúng, không lỗi | High |
| LPR-P04 | POST /recognize không có biển số | ảnh trắng | plates = [], success = true | High |
| LPR-P05 | POST /recognize base64 không hợp lệ | "invalid_base64!!!" | success = false, message lỗi | High |
| LPR-P06 | POST /recognize với crop_region | crop {x,y,w,h} hợp lệ | Xử lý ảnh đã crop | Medium |
| LPR-P07 | Decode base64 với prefix | "data:image/jpeg;base64,ABC" | Strip prefix, decode thành công | High |
| LPR-P08 | Decode base64 không có prefix | base64 thuần | Decode thành công | High |
| LPR-P09 | OCR cleanup: 'O' -> '0' | plate text có chữ 'O' | Được thay thành '0' | High |
| LPR-P10 | OCR cleanup: 'I' -> '1' | plate text có chữ 'I' | Được thay thành '1' | High |
| LPR-P11 | Auto-insert dash biển số 8 chữ số | "30A12345" | "30A-12345" | High |
| LPR-P12 | Confidence scale 0-1 -> 0-100 | conf = 0.92 | returned confidence = 92.0 | Medium |
| LPR-P13 | Confidence đã là 0-100 không scale | conf = 85.5 | returned confidence = 85.5 | Medium |
| LPR-P14 | Bbox coordinates đúng format | det.bounding_box có x1,y1,x2,y2 | bbox = [int(x1),int(y1),int(x2),int(y2)] | Medium |
| LPR-P15 | CORS headers trong response | bất kỳ request | Access-Control-Allow-Origin: * | Low |

#### LPR Integration Tests (thực tế)

| ID | Test Case | Điều kiện | Expected | Priority |
|---|---|---|---|---|
| LPR-A01 | Biển số rõ nét, ánh sáng tốt | Ảnh chuẩn VN plate | confidence >= 85% | High |
| LPR-A02 | Biển số bị nghiêng nhẹ (<15 độ) | Ảnh nghiêng | confidence >= 70% | Medium |
| LPR-A03 | Nhiều xe trong khung hình | 2 xe | Phát hiện đúng 2 biển | Medium |
| LPR-A04 | Ảnh mờ, thiếu sáng | Điều kiện tối | confidence < 50% hoặc không phát hiện | Low |

---

### 6.4 DASHBOARD STATISTICS

#### Unit Tests (Dashboard component)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| DSH-U01 | Hiển thị tổng xe đăng ký | totalVehicles = 10 | Stat card hiển thị "10" | High |
| DSH-U02 | Hiển thị xe đang trong | insideCount = 3 | Stat card hiển thị "3" | High |
| DSH-U03 | Hiển thị lượt ra/vào hôm nay | todayCount = 25 | Stat card hiển thị "25" | High |
| DSH-U04 | Hiển thị nhân viên có mặt | insideVehicles.length = 5 | Stat card hiển thị "5" | High |
| DSH-U05 | Biểu đồ 7 ngày render đúng | weeklyStats data | BarChart có đúng 7 cột ngày | High |
| DSH-U06 | Map action CHECK_IN -> 'Xe vào' | row.action='CHECK_IN' | dayMap[day]['Xe vào'] tăng | High |
| DSH-U07 | Map action CHECK_OUT -> 'Xe ra' | row.action='CHECK_OUT' | dayMap[day]['Xe ra'] tăng | High |
| DSH-U08 | Ngày không có data mặc định 0 | ngày không có log | count = 0, không bị undefined | High |
| DSH-U09 | Empty state xe trong khuôn viên | insideVehicles = [] | Hiển thị "Chưa có xe nào" | Medium |
| DSH-U10 | Bảng xe trong hiển thị đúng cột | insideVehicles có data | Hiển thị biển số, chủ xe, phòng ban, giờ vào | High |
| DSH-U11 | Format giờ đúng format vi-VN | timestamp = '2026-03-16T07:30:00' | "07:30" | Medium |
| DSH-U12 | Auto-refresh mỗi 10 giây | loadData được gọi | setInterval 10000ms | Low |
| DSH-U13 | Cleanup interval khi unmount | component unmount | clearInterval được gọi | Medium |

---

### 6.5 SETTINGS MANAGEMENT

#### Unit Tests (Settings component)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| SET-U01 | Load settings khi mount | settings.getAll() | Form điền đúng company_name, guard_name | High |
| SET-U02 | Lưu settings thành công | click "Lưu cài đặt" | settings.set gọi 2 lần với đúng values | High |
| SET-U03 | Toast thành công sau lưu | handleSave | Toast "Đã lưu cài đặt" | Medium |
| SET-U04 | Hiển thị thống kê hệ thống | vehicles=5, logs=100 | Hiển thị đúng số liệu | Medium |
| SET-U05 | Phiên bản ứng dụng hiển thị | component render | "1.0.0" trong system info | Low |
| SET-U06 | Platform info hiển thị | component render | "Electron + React" | Low |
| SET-U07 | Thay đổi company name | nhập tên mới | State cập nhật theo input | Medium |
| SET-U08 | Thay đổi guard name | nhập tên mới | State cập nhật theo input | Medium |

#### IPC Handler Tests (Settings)

| ID | Test Case | Input | Expected | Priority |
|---|---|---|---|---|
| SET-I01 | db:settings:get key tồn tại | key='company_name' | Trả về value đúng | High |
| SET-I02 | db:settings:get key không tồn tại | key='nonexistent' | Trả về '' | High |
| SET-I03 | db:settings:set tạo mới | key mới, value | Row INSERT vào settings | High |
| SET-I04 | db:settings:set cập nhật | key đã có, value mới | INSERT OR REPLACE, value cập nhật | High |
| SET-I05 | db:settings:getAll trả về object | all settings | Object {key: value, ...} | Medium |
| SET-I06 | Default settings khởi tạo đúng | DB mới init | company_name='Công ty TTS', guard_name='Bảo vệ' | High |

---

## 7. E2E TEST CASES (Playwright)

### 7.1 Critical User Journeys

| ID | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|
| E2E-01 | Check-in xe đã đăng ký | 1. Mở app → 2. Nhập biển "30A-12345" → 3. Verify thông tin xe → 4. Click VÀO | Log tạo, recent logs cập nhật | Critical |
| E2E-02 | Check-out xe đang trong | 1. Check-in trước → 2. Nhập biển số → 3. Verify "Đang ở trong" → 4. Click RA | Log tạo, trạng thái về OUTSIDE | Critical |
| E2E-03 | Check-in xe chưa đăng ký | 1. Nhập biển không có trong DB → 2. Verify badge "Chưa đăng ký" → 3. Click VÀO | Vẫn cho vào, log tạo | High |
| E2E-04 | Thêm xe mới và check-in | 1. Vào Registry → 2. Thêm xe "90K-11111" → 3. Vào CheckInOut → 4. Check-in | Xe mới vào được check-in | High |
| E2E-05 | CRUD Registry đầy đủ | 1. Thêm xe → 2. Verify xe trong danh sách → 3. Sửa thông tin → 4. Xóa xe | Tất cả thao tác thành công | High |
| E2E-06 | Dashboard cập nhật sau check-in | 1. Note insideCount → 2. Check-in xe mới → 3. Vào Dashboard | insideCount tăng 1 | High |
| E2E-07 | Lưu và tải lại settings | 1. Vào Settings → 2. Đổi tên công ty → 3. Lưu → 4. Reload app | Tên công ty giữ nguyên | Medium |
| E2E-08 | Tìm kiếm xe trong Registry | 1. Thêm 3 xe → 2. Search theo biển → 3. Verify kết quả | Chỉ hiển thị xe khớp | Medium |
| E2E-09 | Prevent double check-in | 1. Check-in xe → 2. Nhập lại biển đó → 3. Verify nút VÀO disabled | Không cho check-in 2 lần | Critical |
| E2E-10 | Biển số trùng không thêm được | 1. Thêm xe "30A-12345" → 2. Thêm lại "30A-12345" | Toast "Biển số xe đã tồn tại" | High |

---

## 8. MOCK SETUP (electronAPI)

```typescript
// src/__tests__/setup.ts
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { MOCK_VEHICLES, MOCK_LOGS, MOCK_SETTINGS } from './fixtures'

// Mock window.electronAPI
const mockElectronAPI = {
  vehicles: {
    getAll: vi.fn().mockResolvedValue(MOCK_VEHICLES),
    search: vi.fn().mockResolvedValue(MOCK_VEHICLES),
    getByPlate: vi.fn().mockResolvedValue(MOCK_VEHICLES[0]),
    create: vi.fn().mockResolvedValue({ lastInsertRowid: 4 }),
    update: vi.fn().mockResolvedValue({ changes: 1 }),
    delete: vi.fn().mockResolvedValue({ changes: 1 }),
    count: vi.fn().mockResolvedValue(3),
  },
  logs: {
    checkIn: vi.fn().mockResolvedValue({ lastInsertRowid: 10 }),
    checkOut: vi.fn().mockResolvedValue({ lastInsertRowid: 11 }),
    getStatus: vi.fn().mockResolvedValue('OUTSIDE'),
    getRecent: vi.fn().mockResolvedValue(MOCK_LOGS),
    getAll: vi.fn().mockResolvedValue(MOCK_LOGS),
    todayCount: vi.fn().mockResolvedValue(15),
    insideCount: vi.fn().mockResolvedValue(2),
    insideVehicles: vi.fn().mockResolvedValue([MOCK_VEHICLES[0]]),
    weeklyStats: vi.fn().mockResolvedValue([]),
  },
  settings: {
    get: vi.fn().mockImplementation((key: string) =>
      Promise.resolve(MOCK_SETTINGS[key as keyof typeof MOCK_SETTINGS] || '')),
    set: vi.fn().mockResolvedValue({}),
    getAll: vi.fn().mockResolvedValue(MOCK_SETTINGS),
  },
  lpr: {
    recognize: vi.fn().mockResolvedValue({ success: true, plates: [], message: 'No plates' }),
    health: vi.fn().mockResolvedValue({ status: 'ok', model_loaded: true }),
  }
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})
```

---

## 9. PYTHON CONFTEST

```python
# lpr-service/tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import MagicMock, patch

@pytest.fixture
async def client():
    """HTTP client cho FastAPI app."""
    import server  # reset alpr = None
    server.alpr = None
    from server import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.fixture
def mock_alpr():
    """Mock ALPR model để tránh load AI model thật trong tests."""
    mock = MagicMock()
    mock.predict.return_value = []
    return mock

@pytest.fixture
def mock_alpr_with_plate():
    """Mock ALPR trả về 1 biển số."""
    mock = MagicMock()
    det = MagicMock()
    det.bounding_box.x1 = 100; det.bounding_box.y1 = 200
    det.bounding_box.x2 = 350; det.bounding_box.y2 = 280
    det.confidence = 0.92
    ocr = MagicMock()
    ocr.text = "30A12345"
    ocr.confidence = 0.92
    result = MagicMock()
    result.detection = det
    result.ocr = ocr
    mock.predict.return_value = [result]
    return mock
```

---

## 10. AUTOMATION PLAN & CI/CD

### 10.1 Cấu trúc chạy test theo môi trường

```
CI Pipeline (GitHub Actions):
├── Bước 1: Install dependencies (npm ci + pip install)
├── Bước 2: Unit Tests (Vitest) → ~30s
├── Bước 3: Python Tests (pytest) → ~20s
├── Bước 4: Coverage Report → Upload artifact
└── Bước 5: E2E Tests (Playwright + Electron) → ~3-5 phút

Local development:
├── npm run test:unit      → Vitest watch mode
├── npm run test:cov       → Coverage report
├── pytest lpr-service/tests/ -v
└── npm run test:e2e       → Playwright headed mode
```

### 10.2 NPM Scripts cần thêm vào package.json
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:cov": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### 10.3 Coverage Targets theo module

| Module | Target Lines | Target Functions | Target Branches |
|---|---|---|---|
| `electron/main.ts` (IPC handlers) | 75% | 80% | 65% |
| `src/pages/CheckInOut.tsx` | 70% | 75% | 60% |
| `src/pages/Registry.tsx` | 80% | 85% | 70% |
| `src/pages/Dashboard.tsx` | 75% | 80% | 65% |
| `src/pages/Settings.tsx` | 85% | 90% | 75% |
| `lpr-service/server.py` | 80% | 85% | 70% |

### 10.4 Test Execution Priority (triển khai theo giai đoạn)

**Giai đoạn 1 (Sprint 1) - Foundation:**
- Setup Vitest + mock electronAPI
- Unit tests cho Registry CRUD (REG-U01 đến REG-U20)
- IPC handler tests cho vehicles DB (REG-I01 đến REG-I09)
- Python tests cho /health và /recognize endpoints (LPR-P01 đến LPR-P08)

**Giai đoạn 2 (Sprint 2) - Core Logic:**
- Unit tests cho CheckInOut (CHK-U01 đến CHK-U20)
- IPC handler tests cho check_logs (CHK-I01 đến CHK-I08)
- Python tests cho OCR cleanup logic (LPR-P09 đến LPR-P15)
- Dashboard unit tests (DSH-U01 đến DSH-U13)

**Giai đoạn 3 (Sprint 3) - E2E & Polish:**
- E2E tests với Playwright (E2E-01 đến E2E-10)
- Settings tests (SET-U01 đến SET-U08, SET-I01 đến SET-I06)
- LPR accuracy benchmarks (LPR-A01 đến LPR-A04)
- CI/CD integration

---

## 11. RỦI RO VÀ BIỆN PHÁP GIẢM THIỂU

| Rủi ro | Mức độ | Biện pháp |
|---|---|---|
| electronAPI không có trong test env | High | Mock toàn bộ window.electronAPI trong setup.ts |
| AI model load chậm (10-30s) làm test timeout | High | Mock ALPR trong unit tests; chỉ test thật trong E2E riêng |
| Camera hardware không có trong CI | High | Mock MediaDevices API trong jsdom |
| SQLite WAL mode conflict | Medium | Dùng in-memory DB (:memory:) cho unit tests |
| E2E Electron khó debug | Medium | Playwright có trace viewer; dùng --headed locally |
| Biển số VN có nhiều format khác nhau | Medium | Tạo fixture đa dạng (xe máy, ô tô, tỉnh thành khác nhau) |
| Flaky E2E do async timing | Low | Sử dụng Playwright built-in auto-wait, avoid fixed sleeps |

---

## 12. SAMPLE TEST CODE

### 12.1 Vitest - Registry Unit Test
```typescript
// src/__tests__/unit/components/Registry.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Registry from '../../../pages/Registry'
import { MOCK_VEHICLES } from '../../fixtures/vehicles'

describe('Registry - Vehicle List', () => {
  beforeEach(() => {
    window.electronAPI.vehicles.getAll = vi.fn().mockResolvedValue(MOCK_VEHICLES)
  })

  it('hiển thị danh sách xe sau khi load', async () => {
    render(<Registry />)
    await screen.findByText('30A-12345')
    expect(screen.getByText('51G-99888')).toBeInTheDocument()
    expect(screen.getByText('29B-56789')).toBeInTheDocument()
  })

  it('tìm kiếm theo biển số lọc đúng kết quả', async () => {
    render(<Registry />)
    await screen.findByText('30A-12345')
    await userEvent.type(screen.getByPlaceholderText(/biển số hoặc tên/i), '30A')
    expect(screen.getByText('30A-12345')).toBeInTheDocument()
    expect(screen.queryByText('51G-99888')).not.toBeInTheDocument()
  })

  it('validation: biển số bắt buộc khi thêm xe', async () => {
    render(<Registry />)
    await screen.findByText('30A-12345')
    await userEvent.click(screen.getByText('Thêm xe'))
    await userEvent.click(screen.getByText('Thêm xe', { selector: 'button.btn-primary' }))
    await screen.findByText('Vui lòng nhập biển số xe')
  })
})
```

### 12.2 pytest - LPR Service Test
```python
# lpr-service/tests/test_health.py
import pytest

@pytest.mark.asyncio
async def test_health_endpoint_returns_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "model_loaded" in data
    assert "service" in data

@pytest.mark.asyncio
async def test_recognize_with_invalid_base64(client):
    response = await client.post("/recognize", json={"image": "invalid!!!base64"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == False

# lpr-service/tests/test_image_decode.py
from server import decode_base64_image
import base64, io
from PIL import Image
import numpy as np

def test_decode_base64_without_prefix():
    img = Image.fromarray(np.zeros((100, 100, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, 'JPEG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    result = decode_base64_image(b64)
    assert result.shape == (100, 100, 3)

def test_decode_base64_with_data_uri_prefix():
    img = Image.fromarray(np.zeros((100, 100, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, 'JPEG')
    b64 = base64.b64encode(buf.getvalue()).decode()
    data_uri = f"data:image/jpeg;base64,{b64}"
    result = decode_base64_image(data_uri)
    assert result.shape == (100, 100, 3)
```

### 12.3 IPC Handler Test (với in-memory SQLite)
```typescript
// electron/__tests__/dbQueries.test.ts
import Database from 'better-sqlite3'

describe('Check Logs IPC Handlers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE check_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plate_number TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT DEFAULT '',
        guard_name TEXT DEFAULT ''
      )
    `)
  })

  afterEach(() => db.close())

  it('getStatus trả về OUTSIDE khi chưa có log', () => {
    const last = db.prepare('SELECT * FROM check_logs WHERE plate_number = ? ORDER BY timestamp DESC LIMIT 1').get('30A-12345')
    expect(last).toBeUndefined()
    // Handler logic: if (!last) return 'OUTSIDE'
    const status = !last ? 'OUTSIDE' : (last as any).action === 'CHECK_IN' ? 'INSIDE' : 'OUTSIDE'
    expect(status).toBe('OUTSIDE')
  })

  it('getStatus trả về INSIDE sau check-in', () => {
    db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes) VALUES (?, ?, ?, ?)').run('30A-12345', 'CHECK_IN', 'Guard', '')
    const last = db.prepare('SELECT * FROM check_logs WHERE plate_number = ? ORDER BY timestamp DESC LIMIT 1').get('30A-12345') as any
    expect(last.action).toBe('CHECK_IN')
    const status = last.action === 'CHECK_IN' ? 'INSIDE' : 'OUTSIDE'
    expect(status).toBe('INSIDE')
  })

  it('insideCount đếm đúng số xe hiện trong', () => {
    db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes) VALUES (?, ?, ?, ?)').run('30A-12345', 'CHECK_IN', 'G', '')
    db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes) VALUES (?, ?, ?, ?)').run('51G-99888', 'CHECK_IN', 'G', '')
    db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes) VALUES (?, ?, ?, ?)').run('30A-12345', 'CHECK_OUT', 'G', '')

    const rows = db.prepare(`
      SELECT plate_number FROM check_logs
      WHERE id IN (SELECT MAX(id) FROM check_logs GROUP BY plate_number)
      AND action = 'CHECK_IN'
    `).all()
    expect(rows.length).toBe(1) // Chỉ 51G-99888 đang trong
  })
})
```

---

*Tài liệu này được thiết kế để triển khai từng bước, bắt đầu từ unit tests và tiến đến E2E. Tổng cộng: 84 test cases được định nghĩa, phủ 6 module chính của hệ thống TTS Camera.*
