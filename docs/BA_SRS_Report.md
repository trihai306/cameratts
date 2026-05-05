# TTS Camera - Tài liệu Đặc tả Yêu cầu Phần mềm (SRS)
**Phiên bản:** 1.0 (Phân tích v1.0 → Đề xuất v2.0)
**Ngày phân tích:** 2026-03-16
**Người thực hiện:** BA Agent
**Dự án:** Hệ thống quản lý ra vào bằng nhận diện biển số xe (TTS Camera)

---

## MỤC LỤC
1. Tổng quan hệ thống
2. Tính năng hiện có (v1.0)
3. GAP Analysis - Tính năng còn thiếu
4. User Stories cho tính năng bổ sung
5. Roadmap phát triển v2.0
6. Yêu cầu phi chức năng (NFR)
7. Tóm tắt SRS

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Mô tả
TTS Camera là ứng dụng desktop (Electron) quản lý ra vào của xe (nhân viên/khách) tại khuôn viên doanh nghiệp thông qua công nghệ nhận diện biển số xe (LPR - License Plate Recognition).

### 1.2 Tech Stack Hiện tại
| Thành phần | Công nghệ |
|---|---|
| Frontend UI | React 18 + TypeScript |
| Desktop Shell | Electron 33 |
| Database | SQLite (better-sqlite3) |
| AI/LPR Engine | Python FastAPI + FastALPR (YOLO v9-t + fast-plate-ocr) |
| Chart | Recharts |
| Icons | Lucide React |
| Routing | React Router v6 |

### 1.3 Kiến trúc tổng quan
```
[Camera nguồn] → [React UI] → [Electron IPC] → [SQLite DB]
                    ↕
              [LPR Service: FastAPI port 8765]
              [FastALPR: YOLO v9 + OCR model]
```

---

## 2. TÍNH NĂNG HIỆN CÓ (v1.0)

### 2.1 Module Dashboard (Tổng quan)
| # | Tính năng | Mô tả |
|---|---|---|
| F01 | Thống kê tổng xe đã đăng ký | Hiển thị tổng số xe trong hệ thống |
| F02 | Đếm xe đang trong khuôn viên | Số xe hiện đang ở trong (real-time) |
| F03 | Thống kê lượt ra/vào hôm nay | Tổng số lượt check-in/check-out trong ngày |
| F04 | Đếm nhân viên đang có mặt | Dựa trên xe đang trong khuôn viên |
| F05 | Biểu đồ 7 ngày gần nhất | Bar chart so sánh xe vào/ra theo ngày |
| F06 | Danh sách xe đang trong khuôn viên | Bảng hiển thị biển số, chủ xe, phòng ban, giờ vào |
| F07 | Tự động làm mới dữ liệu | Polling 10 giây/lần |

### 2.2 Module Check-in/Check-out (Xe vào/ra)
| # | Tính năng | Mô tả |
|---|---|---|
| F08 | Nhận diện biển số tự động (AI) | Tích hợp LPR service, scan mỗi 2 giây |
| F09 | Camera Webcam máy tính | Hỗ trợ webcam nội tuyến, chọn thiết bị |
| F10 | Camera điện thoại qua IP | Hỗ trợ Android (IP Webcam) qua MJPEG stream |
| F11 | iPhone Continuity Camera | Dùng iPhone làm webcam qua macOS |
| F12 | Hiển thị bounding box biển số | Khung đỏ xung quanh biển số phát hiện được |
| F13 | Nhập biển số thủ công | Fallback khi camera/AI không khả dụng |
| F14 | Tra cứu thông tin xe | Lookup theo biển số → hiển thị chủ xe, phòng ban, loại xe |
| F15 | Xác định trạng thái xe | INSIDE / OUTSIDE dựa trên log gần nhất |
| F16 | Ghi nhận xe vào (CHECK_IN) | Lưu log với timestamp, bảo vệ, ghi chú |
| F17 | Ghi nhận xe ra (CHECK_OUT) | Lưu log với timestamp, bảo vệ, ghi chú |
| F18 | Hiển thị lịch sử gần đây | 10 bản ghi gần nhất dạng bảng |
| F19 | Chỉ báo trạng thái AI (LPR) | Badge Online/Offline/Checking |
| F20 | Bật/tắt quét tự động | Toggle auto-scan mode |
| F21 | Chọn camera device | Dropdown chọn thiết bị camera |
| F22 | Ghi chú khi check-in/out | Nhập ghi chú tùy chọn cho từng lần vào/ra |
| F23 | Tên bảo vệ trực | Gắn tên bảo vệ vào mỗi bản ghi |
| F24 | Confidence score kết quả LPR | Hiển thị % độ tin cậy nhận diện |

### 2.3 Module Registry (Danh sách xe đăng ký)
| # | Tính năng | Mô tả |
|---|---|---|
| F25 | Xem danh sách xe đăng ký | Bảng đầy đủ thông tin xe |
| F26 | Thêm xe mới | Form nhập biển số, chủ xe, phòng ban, loại xe, màu, ghi chú |
| F27 | Sửa thông tin xe | Edit modal với dữ liệu điền sẵn |
| F28 | Xóa xe (soft delete) | Đổi status = inactive, không xóa dữ liệu thật |
| F29 | Tìm kiếm xe | Tìm theo biển số hoặc tên chủ xe |
| F30 | Lọc theo phòng ban | Dropdown lọc động từ dữ liệu |
| F31 | Lọc theo loại xe | Dropdown lọc động từ dữ liệu |
| F32 | Loại xe: Xe máy/Ô tô/Xe đạp điện/Khác | Danh mục cố định |

### 2.4 Module History (Lịch sử)
| # | Tính năng | Mô tả |
|---|---|---|
| F33 | Xem toàn bộ lịch sử ra/vào | Giới hạn 500 bản ghi gần nhất |
| F34 | Lọc theo biển số | Tìm kiếm biển số trong lịch sử |
| F35 | Lọc theo hành động | CHECK_IN / CHECK_OUT |
| F36 | Lọc theo ngày từ-đến | Date range picker |
| F37 | Xuất CSV | Export lịch sử ra file CSV (UTF-8 BOM) |

### 2.5 Module Settings (Cài đặt)
| # | Tính năng | Mô tả |
|---|---|---|
| F38 | Cài đặt tên công ty | Lưu vào bảng settings SQLite |
| F39 | Cài đặt tên bảo vệ mặc định | Tên bảo vệ hiển thị trong check-in |
| F40 | Thống kê hệ thống | Tổng xe, tổng lượt ra/vào |
| F41 | Thông tin ứng dụng | Version, nền tảng, database, tác giả |

### 2.6 Hệ thống/Backend
| # | Tính năng | Mô tả |
|---|---|---|
| F42 | LPR Service tự khởi động | Electron spawn Python FastAPI khi app mở |
| F43 | LPR Service tự tắt | Electron kill process khi app đóng |
| F44 | SQLite WAL mode | Hiệu suất đọc/ghi tốt hơn |
| F45 | Camera settings persistence | Lưu source/URL/deviceId vào settings DB |

---

## 3. GAP ANALYSIS - TÍNH NĂNG CÒN THIẾU

### 3.1 Bảo mật & Xác thực (CRITICAL)
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G01 | Không có đăng nhập/xác thực | Bất kỳ ai mở app đều có toàn quyền | HIGH |
| G02 | Không có phân quyền | Admin, bảo vệ, viewer không phân biệt | HIGH |
| G03 | Không có audit log cho admin | Ai sửa/xóa dữ liệu không được ghi lại | HIGH |
| G04 | IPC không validate input | SQL injection tiềm ẩn ở IPC handlers | MEDIUM |

### 3.2 Quản lý Xe & Người dùng
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G05 | Không có ảnh xe/biển số | Không lưu được ảnh xe khi đăng ký | MEDIUM |
| G06 | Không có quản lý nhân viên riêng | Nhân viên chỉ được biết qua xe đăng ký | MEDIUM |
| G07 | Không có xe khách/visitor | Không phân biệt xe nhân viên và xe khách | MEDIUM |
| G08 | Không có hạn sử dụng cho xe | Không thể set ngày hết hạn đăng ký | LOW |
| G09 | Không có nhóm/phân loại xe | Ngoài loại xe, không có nhóm truy cập | LOW |

### 3.3 Vận hành Check-in/Check-out
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G10 | Không lưu ảnh biển số lúc quét | Không có bằng chứng hình ảnh khi nhận diện | HIGH |
| G11 | Không có cổng/gate phân biệt | Không biết xe ra/vào ở cổng nào | MEDIUM |
| G12 | Không có cảnh báo xe lạ | Xe chưa đăng ký vào không có alert | MEDIUM |
| G13 | Không có auto check-out khi hết giờ | Xe quên check-out không được xử lý | LOW |
| G14 | Không hỗ trợ multiple plate/xe | Một nhân viên có thể có nhiều xe | LOW |

### 3.4 Báo cáo & Thống kê
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G15 | Báo cáo rất hạn chế | Chỉ có 7-day bar chart | HIGH |
| G16 | Không có báo cáo theo phòng ban | Không thống kê được từng dept | HIGH |
| G17 | Không có báo cáo thời gian làm việc | Không tính được giờ vào-ra của nhân viên | MEDIUM |
| G18 | Không có xuất PDF/Excel | Chỉ có CSV thô, không có report template | MEDIUM |
| G19 | Không có thống kê tháng/quý/năm | Chỉ có 7 ngày gần nhất | MEDIUM |

### 3.5 Tích hợp & Mở rộng
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G20 | Không có API REST ra ngoài | Không thể tích hợp với hệ thống HR/CCTV | MEDIUM |
| G21 | Không có thông báo real-time | Không có notification khi xe vào/ra | LOW |
| G22 | Không có backup tự động | Người dùng phải tự backup DB file | MEDIUM |
| G23 | Không có multi-camera | Chỉ hỗ trợ 1 camera tại một thời điểm | MEDIUM |

### 3.6 UX/Accessibility
| GAP | Mô tả vấn đề | Mức độ |
|---|---|---|
| G24 | Không có dark mode | Chỉ có light theme | LOW |
| G25 | Không có phím tắt | Bảo vệ phải dùng chuột, chậm hơn | MEDIUM |
| G26 | Không có pagination | History load 500 bản ghi cùng lúc | MEDIUM |
| G27 | Không có in ấn | Không có tính năng in danh sách/báo cáo | LOW |

---

## 4. USER STORIES CHO TÍNH NĂNG BỔ SUNG

### Epic 1: Bảo mật & Xác thực

**US-01: Đăng nhập hệ thống**
> As a **quản trị viên**, I want **hệ thống yêu cầu đăng nhập bằng tên người dùng và mật khẩu**, so that **chỉ nhân viên được ủy quyền mới có thể truy cập và thao tác dữ liệu**.

*Acceptance Criteria:*
- Màn hình đăng nhập hiển thị khi mở app lần đầu hoặc sau khi đăng xuất
- Hỗ trợ tối thiểu 2 role: Admin và Bảo vệ (Guard)
- Sai mật khẩu 5 lần → khóa tài khoản 15 phút
- Session tự động hết hạn sau 8 giờ

**US-02: Phân quyền theo role**
> As a **quản trị viên**, I want **phân quyền rõ ràng giữa Admin và Bảo vệ**, so that **bảo vệ chỉ thực hiện check-in/out, không sửa được dữ liệu đăng ký xe**.

*Acceptance Criteria:*
- Admin: toàn quyền tất cả module
- Guard: chỉ xem Dashboard, thực hiện Check-in/Out, xem History
- Guard không thấy menu Registry và Settings
- Thao tác của mỗi user được ghi vào audit log

**US-03: Quản lý tài khoản người dùng**
> As a **quản trị viên**, I want **thêm/sửa/xóa tài khoản bảo vệ**, so that **quản lý được người dùng hệ thống theo ca trực**.

*Acceptance Criteria:*
- Form tạo tài khoản: username, fullname, role, password
- Reset password cho user khác
- Deactivate account (không xóa hoàn toàn)

---

### Epic 2: Lưu ảnh bằng chứng

**US-04: Chụp ảnh biển số khi nhận diện**
> As a **bảo vệ**, I want **hệ thống tự động lưu ảnh chụp biển số tại thời điểm check-in/check-out**, so that **có bằng chứng hình ảnh khi cần tra cứu hoặc giải quyết tranh chấp**.

*Acceptance Criteria:*
- Mỗi bản ghi check-in/out có 1 ảnh đính kèm (thumbnail)
- Ảnh được lưu vào thư mục data/images/ theo ngày
- Có thể xem ảnh từ màn hình History
- Ảnh tự động nén xuống ≤ 200KB mỗi file

**US-05: Ảnh xe trong hồ sơ đăng ký**
> As a **quản trị viên**, I want **upload ảnh xe khi đăng ký**, so that **bảo vệ có thể nhận diện xe trực quan ngoài biển số**.

---

### Epic 3: Quản lý Xe Khách / Visitor

**US-06: Đăng ký xe khách nhanh**
> As a **bảo vệ**, I want **đăng ký xe khách tạm thời (visitor) ngay tại màn hình check-in**, so that **xe khách được ghi nhận đầy đủ mà không cần vào module Registry**.

*Acceptance Criteria:*
- Button "Xe khách" trên màn hình Check-in
- Form nhanh: biển số, tên khách, gặp ai, mục đích, số điện thoại
- Visitor badge hiển thị khác với xe nội bộ
- Visitor tự động check-out sau 24h nếu chưa ra

**US-07: Phân biệt xe nội bộ và xe khách trong báo cáo**
> As a **quản trị viên**, I want **báo cáo phân biệt xe nhân viên và xe khách**, so that **nắm được lưu lượng khách đến công ty theo ngày/tuần/tháng**.

---

### Epic 4: Cảnh báo & Thông báo

**US-08: Cảnh báo xe không đăng ký**
> As a **bảo vệ**, I want **nhận cảnh báo âm thanh và thị giác ngay khi phát hiện xe không đăng ký**, so that **kịp thời chặn xe lạ vào khuôn viên**.

*Acceptance Criteria:*
- Phát âm thanh cảnh báo khi biển số chưa đăng ký
- UI hiển thị màu đỏ nổi bật thay vì màu vàng thông thường
- Bảo vệ có thể xác nhận "Cho phép vào" hoặc "Từ chối" kèm lý do

**US-09: Cảnh báo xe ở trong quá lâu**
> As a **quản trị viên**, I want **nhận thông báo khi xe đã ở trong khuôn viên quá số giờ quy định**, so that **phát hiện xe bị bỏ quên hoặc tình huống bất thường**.

*Acceptance Criteria:*
- Cấu hình ngưỡng thời gian tối đa (mặc định 12 giờ)
- Dashboard hiển thị danh sách xe quá hạn với badge "Quá giờ"
- Option gửi email notification (v2.1)

---

### Epic 5: Báo cáo nâng cao

**US-10: Báo cáo theo phòng ban**
> As a **quản trị viên**, I want **xem thống kê ra/vào theo từng phòng ban**, so that **theo dõi được tình hình có mặt của từng bộ phận**.

*Acceptance Criteria:*
- Chart hiển thị số xe theo phòng ban
- Filter ngày và loại action
- Export ra CSV theo phòng ban

**US-11: Báo cáo thời gian làm việc**
> As a **quản trị viên**, I want **tính toán và xem thời gian làm việc của nhân viên dựa trên check-in/out**, so that **hỗ trợ bộ phận HR chấm công sơ bộ**.

*Acceptance Criteria:*
- Tính giờ vào - giờ ra = thời gian trong khuôn viên
- Report theo nhân viên, theo ngày, theo tháng
- Xuất Excel/CSV với format HR-friendly
- Ghi chú: Đây là dữ liệu tham khảo, không thay thế phần mềm chấm công chính thức

**US-12: Dashboard báo cáo tháng**
> As a **quản trị viên**, I want **xem biểu đồ và thống kê theo tháng và quý**, so that **có cái nhìn tổng thể về xu hướng ra vào của nhân viên**.

*Acceptance Criteria:*
- Toggle Weekly/Monthly/Quarterly view trên Dashboard
- Line chart xu hướng theo tháng
- So sánh tháng này vs tháng trước

---

### Epic 6: Vận hành & Hạ tầng

**US-13: Backup dữ liệu tự động**
> As a **quản trị viên**, I want **hệ thống tự động backup database mỗi ngày**, so that **không mất dữ liệu khi máy chủ gặp sự cố**.

*Acceptance Criteria:*
- Backup tự động vào 00:00 mỗi ngày
- Lưu tối đa 30 bản backup gần nhất, xóa bản cũ hơn
- Cho phép chọn thư mục backup (local hoặc network drive)
- Nút "Backup ngay" và "Restore" trong Settings

**US-14: Hỗ trợ nhiều cổng (Gate)**
> As a **quản trị viên**, I want **cấu hình nhiều cổng ra/vào (cổng chính, cổng phụ, cổng xe tải)**, so that **theo dõi được xe ra vào ở từng vị trí cụ thể**.

*Acceptance Criteria:*
- Mỗi instance app gắn với 1 gate_id
- Báo cáo filter được theo cổng
- Dashboard tổng hợp từ tất cả cổng (future: cloud sync)

**US-15: Phím tắt cho bảo vệ**
> As a **bảo vệ**, I want **thực hiện check-in/out bằng phím tắt bàn phím**, so that **xử lý nhanh hơn, đặc biệt khi nhiều xe đến cùng lúc**.

*Acceptance Criteria:*
- Enter: Thực hiện action phù hợp (vào nếu đang ở ngoài, ra nếu đang ở trong)
- Ctrl+Space: Toggle auto-scan
- Escape: Clear form
- F1: Mở help shortcut reference

---

### Epic 7: UX Improvements

**US-16: Phân trang cho lịch sử**
> As a **người dùng**, I want **lịch sử hiển thị dạng phân trang (pagination)**, so that **trang lịch sử không bị chậm khi có nhiều dữ liệu**.

*Acceptance Criteria:*
- 50 bản ghi/trang (cấu hình được)
- Navigation: First/Prev/Next/Last
- Hiển thị "Trang X / Y"

**US-17: Dark mode**
> As a **bảo vệ**, I want **giao diện dark mode**, so that **giảm mỏi mắt khi làm việc ban đêm hoặc trong phòng tối**.

---

## 5. ROADMAP PHÁT TRIỂN v2.0

### Sprint 1 (2 tuần) - Bảo mật nền tảng
**Ưu tiên: CRITICAL**
- [ ] US-01: Login screen + session management
- [ ] US-02: Phân quyền Admin/Guard
- [ ] US-03: Quản lý tài khoản người dùng
- [ ] G04: Validate + sanitize IPC inputs
- KPI: 100% màn hình yêu cầu xác thực trước khi truy cập

### Sprint 2 (2 tuần) - Nghiệp vụ cốt lõi
**Ưu tiên: HIGH**
- [ ] US-04: Chụp & lưu ảnh biển số khi check-in/out
- [ ] US-06: Đăng ký xe khách nhanh
- [ ] US-08: Cảnh báo xe không đăng ký
- [ ] US-15: Phím tắt cho bảo vệ
- KPI: Giảm thời gian xử lý 1 xe từ ~10s xuống ~5s

### Sprint 3 (2 tuần) - Báo cáo & Phân tích
**Ưu tiên: HIGH**
- [ ] US-10: Báo cáo theo phòng ban
- [ ] US-11: Báo cáo thời gian làm việc
- [ ] US-12: Dashboard tháng/quý
- [ ] US-16: Phân trang lịch sử
- KPI: Xuất được báo cáo đủ 5 loại (ngày/tuần/tháng/dept/nhân viên)

### Sprint 4 (2 tuần) - Hạ tầng & Vận hành
**Ưu tiên: MEDIUM**
- [ ] US-13: Backup tự động
- [ ] US-05: Ảnh xe trong hồ sơ đăng ký
- [ ] US-09: Cảnh báo xe ở trong quá lâu
- [ ] G26: Pagination
- KPI: 0 mất dữ liệu sau khi triển khai backup

### Sprint 5 (2 tuần) - Mở rộng
**Ưu tiên: LOW/FUTURE**
- [ ] US-14: Multi-gate support
- [ ] US-07: Báo cáo xe khách vs nội bộ
- [ ] US-17: Dark mode
- [ ] G23: Multi-camera support

---

## 6. YÊU CẦU PHI CHỨC NĂNG (NFR)

### 6.1 Hiệu suất (Performance)
| NFR-P01 | Thời gian nhận diện biển số | < 1 giây/frame sau khi model load |
|---|---|---|
| NFR-P02 | Khởi động LPR service | < 30 giây (bao gồm load model) |
| NFR-P03 | Tải danh sách xe | < 500ms cho 10,000 xe |
| NFR-P04 | Tải lịch sử | < 1 giây cho 50,000 bản ghi (với pagination) |
| NFR-P05 | Độ trễ check-in/out UI | < 200ms sau khi click |
| NFR-P06 | Tải Dashboard | < 2 giây (bao gồm chart render) |

### 6.2 Độ tin cậy (Reliability)
| NFR-R01 | Uptime app | 99.5% trong giờ làm việc |
|---|---|---|
| NFR-R02 | LPR service crash recovery | Tự khởi động lại trong vòng 10 giây |
| NFR-R03 | Không mất bản ghi check-in/out | 0% data loss (SQLite WAL đảm bảo) |
| NFR-R04 | Fallback khi LPR offline | Nhập thủ công vẫn hoạt động 100% |

### 6.3 Bảo mật (Security)
| NFR-S01 | Xác thực | Yêu cầu đăng nhập, session JWT/token |
|---|---|---|
| NFR-S02 | Mật khẩu | Hash bcrypt, không lưu plaintext |
| NFR-S03 | IPC security | contextIsolation=true, validate tất cả input |
| NFR-S04 | Audit log | Ghi lại mọi action thay đổi dữ liệu (ai, khi nào, gì) |
| NFR-S05 | SQL Injection | Sử dụng prepared statements (đã có, cần kiểm tra kỹ) |
| NFR-S06 | LPR service | Chỉ lắng nghe 127.0.0.1 (đã có), không expose ra ngoài |

### 6.4 Khả năng mở rộng (Scalability)
| NFR-SC01 | Số xe đăng ký | Hỗ trợ ≥ 10,000 xe không giảm hiệu suất |
|---|---|---|
| NFR-SC02 | Số bản ghi log | Hỗ trợ ≥ 1,000,000 bản ghi (với index) |
| NFR-SC03 | Số user đồng thời | 1 máy - 1 người (kiến trúc desktop hiện tại) |
| NFR-SC04 | Lưu trữ ảnh | Partition/archive ảnh theo tháng |

### 6.5 Khả năng sử dụng (Usability)
| NFR-U01 | Đào tạo bảo vệ mới | ≤ 30 phút để sử dụng thành thạo |
|---|---|---|
| NFR-U02 | Ngôn ngữ | Tiếng Việt 100% |
| NFR-U03 | Responsive | Hoạt động tốt ở 1280x720 trở lên |
| NFR-U04 | Thông báo lỗi | Tiếng Việt, dễ hiểu, có hướng dẫn xử lý |
| NFR-U05 | Thao tác không cần chuột | Bảo vệ có thể check-in/out chỉ bằng bàn phím |

### 6.6 Khả năng bảo trì (Maintainability)
| NFR-M01 | Codebase | TypeScript strict mode, không dùng `any` |
|---|---|---|
| NFR-M02 | Test coverage | ≥ 80% cho business logic |
| NFR-M03 | Database migration | Có script migration version từng bước |
| NFR-M04 | Logs | Structured logging với level (INFO/WARN/ERROR) |

---

## 7. TÓM TẮT SRS

### 7.1 Điểm mạnh của v1.0
1. **Kiến trúc hợp lý**: Tách biệt rõ UI (React), shell (Electron), AI (Python FastAPI)
2. **LPR tích hợp tốt**: FastALPR với YOLO v9, auto-scan, bounding box overlay
3. **Đa nguồn camera**: Webcam, điện thoại qua IP, iPhone Continuity Camera
4. **UX sạch**: Giao diện trực quan, thông tin đầy đủ trên một màn hình
5. **Soft delete**: Xóa xe không mất data, có thể phục hồi
6. **SQLite WAL**: Hiệu suất tốt cho desktop app

### 7.2 Rủi ro nghiêm trọng cần xử lý ngay
1. **CRITICAL - Không có xác thực**: Toàn bộ hệ thống không có login, bất kỳ ai mở app đều có toàn quyền
2. **HIGH - Không lưu ảnh bằng chứng**: Không có hình ảnh gắn với từng lần check-in/out
3. **HIGH - Báo cáo hạn chế**: Không đủ báo cáo cho quản lý cấp trên
4. **HIGH - Không có cảnh báo xe lạ**: Bảo vệ phải tự nhận biết xe chưa đăng ký

### 7.3 Phạm vi v2.0
| Hạng mục | Số User Story | Ước tính Sprint |
|---|---|---|
| Bảo mật & Auth | 3 US | Sprint 1 |
| Nghiệp vụ vận hành | 4 US | Sprint 2 |
| Báo cáo nâng cao | 3 US | Sprint 3 |
| Hạ tầng & UX | 4 US | Sprint 4 |
| **Tổng** | **14 US** | **8 tuần** |

### 7.4 Metrics thành công v2.0
- 100% màn hình có xác thực
- Thời gian check-in trung bình < 5 giây
- Có ảnh bằng chứng cho 100% lần check-in/out
- 5 loại báo cáo có thể xuất
- 0 sự cố mất dữ liệu nhờ backup tự động

---

*Tài liệu này được tạo tự động bởi BA Agent dựa trên phân tích source code thực tế.*
*Ngày tạo: 2026-03-16*
