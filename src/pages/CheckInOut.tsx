import { useState, useEffect, useRef, useCallback } from 'react'
import {
    Camera,
    CameraOff,
    ScanLine,
    LogIn,
    LogOut,
    CheckCircle2,
    AlertTriangle,
    Clock,
    User,
    Building,
    Car,
    RefreshCw,
    Zap,
    CircleDot,
    Wifi,
    WifiOff,
    Smartphone,
    Monitor,
    Settings2,
} from 'lucide-react'

type CameraSource = 'local' | 'phone'

export default function CheckInOut() {
    const videoRef = useRef<HTMLVideoElement>(null)
    const phoneImgRef = useRef<HTMLImageElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const [plate, setPlate] = useState('')
    const [vehicleInfo, setVehicleInfo] = useState<any>(null)
    const [vehicleStatus, setVehicleStatus] = useState<string>('')
    const [isRegistered, setIsRegistered] = useState(false)
    const [recentLogs, setRecentLogs] = useState<any[]>([])
    const [guardName, setGuardName] = useState('')
    const [notes, setNotes] = useState('')
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
    const [loading, setLoading] = useState(false)

    // Camera state
    const [cameraActive, setCameraActive] = useState(false)
    const [cameraSource, setCameraSource] = useState<CameraSource>('local')
    const [phoneUrl, setPhoneUrl] = useState('')
    const [showCameraSettings, setShowCameraSettings] = useState(false)
    const [phoneConnected, setPhoneConnected] = useState(false)

    // Camera device selection (Webcam / iPhone Continuity Camera)
    const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

    const [scanning, setScanning] = useState(false)
    const [scanResults, setScanResults] = useState<{ plate: string; confidence: number; bbox?: number[] }[]>([])
    const [autoScan, setAutoScan] = useState(false)
    const autoScanTimer = useRef<ReturnType<typeof setInterval> | null>(null)
    const isProcessingRef = useRef(false)  // Debounce: prevent concurrent requests
    const captureAndRecognizeRef = useRef<() => void>(() => {})  // Fix stale closure

    // Captured image for evidence
    const [capturedImage, setCapturedImage] = useState<string>('')
    const [capturedImagePath, setCapturedImagePath] = useState<string>('')

    // Gate mode: auto check-in or check-out when plate detected
    type GateMode = 'manual' | 'entry' | 'exit'
    const [gateMode, setGateMode] = useState<GateMode>('manual')
    const recentPlatesRef = useRef<Map<string, number>>(new Map())  // plate -> timestamp, cooldown to avoid duplicate

    // LPR service state
    const [lprStatus, setLprStatus] = useState<'checking' | 'online' | 'offline'>('checking')

    // ============ WEBSOCKET + REALTIME ============
    const wsRef = useRef<WebSocket | null>(null)
    const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prevFrameData = useRef<Uint8ClampedArray | null>(null)  // Motion detection
    const idleCountRef = useRef(0)  // Adaptive interval: count consecutive idle frames
    const scanIntervalRef = useRef(1500)  // Current adaptive scan interval (ms)

    // Load saved camera settings on mount
    useEffect(() => {
        loadRecentLogs()
        loadGuardName()
        checkLprHealth()
        loadCameraSettings()
        enumerateCameraDevices()
        connectWebSocket()
        const healthInterval = setInterval(checkLprHealth, 5000)

        // Listen for realtime check-log events from main process
        const unsubscribe = window.electronAPI.onCheckLogUpdated?.(() => {
            loadRecentLogs()
        })

        return () => {
            stopCamera()
            disconnectWebSocket()
            clearInterval(healthInterval)
            unsubscribe?.()
        }
    }, [])

    // Auto-start camera after settings are loaded
    useEffect(() => {
        if (cameraSource === 'local') {
            startLocalCamera()
        } else if (cameraSource === 'phone') {
            // Check if iPhone Continuity Camera is available - use it directly
            const iphoneDevice = cameraDevices.find(d =>
                d.label.toLowerCase().includes('iphone')
            )
            if (iphoneDevice) {
                setSelectedDeviceId(iphoneDevice.deviceId)
                setCameraSource('local')
                startLocalCamera(iphoneDevice.deviceId)
            } else if (phoneUrl) {
                startPhoneCamera()
            }
        }
    }, [cameraSource, cameraDevices])

    // Auto-enable scanning when camera + LPR are both ready
    useEffect(() => {
        if (cameraActive && lprStatus === 'online' && !autoScan) {
            setAutoScan(true)
        }
    }, [cameraActive, lprStatus])

    const checkLprHealth = async () => {
        try {
            const result = await window.electronAPI.lpr.health()
            setLprStatus(result.status === 'ok' ? 'online' : 'offline')
        } catch {
            setLprStatus('offline')
        }
    }

    // ============ WEBSOCKET CONNECTION ============
    const connectWebSocket = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return

        try {
            const ws = new WebSocket('ws://127.0.0.1:8765/ws/recognize')
            ws.binaryType = 'arraybuffer'

            ws.onopen = () => {
                console.log('[WS] Connected to LPR service')
                // Clear reconnect timer
                if (wsReconnectTimer.current) {
                    clearTimeout(wsReconnectTimer.current)
                    wsReconnectTimer.current = null
                }
            }

            ws.onmessage = (event) => {
                try {
                    const result = JSON.parse(event.data)
                    handleRecognitionResult(result)
                } catch (err) {
                    console.error('[WS] Parse error:', err)
                }
            }

            ws.onclose = () => {
                console.log('[WS] Disconnected, will reconnect...')
                wsRef.current = null
                scheduleReconnect()
            }

            ws.onerror = () => {
                // onclose will fire after this
            }

            wsRef.current = ws
        } catch {
            scheduleReconnect()
        }
    }

    const disconnectWebSocket = () => {
        if (wsReconnectTimer.current) {
            clearTimeout(wsReconnectTimer.current)
            wsReconnectTimer.current = null
        }
        if (wsRef.current) {
            wsRef.current.onclose = null  // Prevent reconnect on intentional close
            wsRef.current.close()
            wsRef.current = null
        }
    }

    const scheduleReconnect = () => {
        if (wsReconnectTimer.current) return
        wsReconnectTimer.current = setTimeout(() => {
            wsReconnectTimer.current = null
            connectWebSocket()
        }, 3000)
    }

    // ============ MOTION DETECTION ============
    const detectMotion = (canvas: HTMLCanvasElement): boolean => {
        const ctx = canvas.getContext('2d')
        if (!ctx) return true

        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

        if (!prevFrameData.current || prevFrameData.current.length !== currentData.length) {
            prevFrameData.current = new Uint8ClampedArray(currentData)
            return true  // First frame → assume motion
        }

        let diffCount = 0
        const prev = prevFrameData.current
        const step = 16  // Sample every 16th pixel for speed (~1ms)
        const threshold = 40  // Per-pixel RGB diff threshold
        const totalSamples = Math.floor(currentData.length / (step * 4))

        for (let i = 0; i < currentData.length; i += step * 4) {
            const diff = Math.abs(prev[i] - currentData[i]) +
                         Math.abs(prev[i + 1] - currentData[i + 1]) +
                         Math.abs(prev[i + 2] - currentData[i + 2])
            if (diff > threshold) diffCount++
        }

        // Update previous frame
        prevFrameData.current = new Uint8ClampedArray(currentData)

        const motionRatio = diffCount / totalSamples
        return motionRatio > 0.02  // 2% of sampled pixels changed = motion
    }

    const loadGuardName = async () => {
        const name = await window.electronAPI.settings.get('guard_name')
        setGuardName(name || 'Bảo vệ')
    }

    const loadRecentLogs = async () => {
        const logs = await window.electronAPI.logs.getRecent(10)
        setRecentLogs(logs)
    }

    const loadCameraSettings = async () => {
        try {
            const source = await window.electronAPI.settings.get('camera_source')
            const url = await window.electronAPI.settings.get('phone_camera_url')
            const deviceId = await window.electronAPI.settings.get('camera_device_id')
            if (source === 'phone' || source === 'local') {
                setCameraSource(source as CameraSource)
            }
            if (url) setPhoneUrl(url)
            if (deviceId) setSelectedDeviceId(deviceId)
            const mode = await window.electronAPI.settings.get('gate_mode')
            if (mode === 'entry' || mode === 'exit' || mode === 'manual') {
                setGateMode(mode as GateMode)
            }
        } catch { /* use defaults */ }
    }

    const saveCameraSettings = async () => {
        await window.electronAPI.settings.set('camera_source', cameraSource)
        await window.electronAPI.settings.set('phone_camera_url', phoneUrl)
        await window.electronAPI.settings.set('camera_device_id', selectedDeviceId)
    }

    // ============ ENUMERATE CAMERA DEVICES ============
    const enumerateCameraDevices = async () => {
        try {
            // Need to request permission first to get device labels
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
            tempStream.getTracks().forEach(t => t.stop())

            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices.filter(d => d.kind === 'videoinput')
            setCameraDevices(videoDevices)

            // Auto-select saved device or first available
            const savedId = await window.electronAPI.settings.get('camera_device_id')
            if (savedId && videoDevices.find(d => d.deviceId === savedId)) {
                setSelectedDeviceId(savedId)
            } else if (videoDevices.length > 0) {
                setSelectedDeviceId(videoDevices[0].deviceId)
            }
        } catch (err) {
            console.error('Cannot enumerate camera devices:', err)
        }
    }

    // ============ LOCAL WEBCAM ============
    const startLocalCamera = async (deviceId?: string) => {
        stopCamera()
        const useDeviceId = deviceId || selectedDeviceId
        try {
            const constraints: MediaStreamConstraints = {
                video: useDeviceId
                    ? { deviceId: { exact: useDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                    : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' }
            }
            const stream = await navigator.mediaDevices.getUserMedia(constraints)
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play()
            }
            setCameraActive(true)
        } catch (err) {
            showToast('❌ Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.', 'error')
        }
    }

    // ============ PHONE CAMERA (IP Webcam) ============
    const startPhoneCamera = () => {
        stopCamera()
        if (!phoneUrl.trim()) {
            showToast('⚠️ Vui lòng nhập IP camera từ điện thoại', 'error')
            setShowCameraSettings(true)
            return
        }

        // Normalize URL: ensure it ends with /video for MJPEG stream
        let streamUrl = phoneUrl.trim()
        if (!streamUrl.startsWith('http')) {
            streamUrl = `http://${streamUrl}`
        }

        // For IP Webcam app: http://<ip>:8080/video gives MJPEG stream
        // Snapshot: http://<ip>:8080/shot.jpg
        const mjpegUrl = streamUrl.includes('/video') || streamUrl.includes('/shot')
            ? streamUrl
            : streamUrl.endsWith('/')
                ? `${streamUrl}video`
                : `${streamUrl}/video`

        if (phoneImgRef.current) {
            phoneImgRef.current.src = mjpegUrl
        }
        setCameraActive(true)
        setPhoneConnected(true)
    }

    const stopCamera = () => {
        // Stop local webcam
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
        // Stop phone camera
        if (phoneImgRef.current) {
            phoneImgRef.current.src = ''
        }
        setPhoneConnected(false)
        setCameraActive(false)
        setAutoScan(false)
    }

    // ============ CAPTURE FRAME FROM CAMERA ============
    const captureFrame = async (canvas: HTMLCanvasElement): Promise<boolean> => {
        const ctx = canvas.getContext('2d')
        if (!ctx) return false

        if (cameraSource === 'local') {
            if (!videoRef.current || !videoRef.current.videoWidth) return false
            const scale = Math.min(1, 640 / videoRef.current.videoWidth)
            canvas.width = Math.round(videoRef.current.videoWidth * scale)
            canvas.height = Math.round(videoRef.current.videoHeight * scale)
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
        } else {
            if (!phoneImgRef.current) return false
            let snapshotUrl = phoneUrl.trim()
            if (!snapshotUrl.startsWith('http')) snapshotUrl = `http://${snapshotUrl}`
            if (!snapshotUrl.includes('/shot')) {
                snapshotUrl = snapshotUrl.replace(/\/video.*$/, '')
                snapshotUrl = snapshotUrl.endsWith('/') ? `${snapshotUrl}shot.jpg` : `${snapshotUrl}/shot.jpg`
            }
            try {
                const response = await fetch(snapshotUrl)
                const blob = await response.blob()
                const img = new Image()
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve()
                    img.onerror = reject
                    img.src = URL.createObjectURL(blob)
                })
                canvas.width = img.naturalWidth
                canvas.height = img.naturalHeight
                ctx.drawImage(img, 0, 0)
                URL.revokeObjectURL(img.src)
            } catch {
                if (phoneImgRef.current.naturalWidth) {
                    canvas.width = phoneImgRef.current.naturalWidth
                    canvas.height = phoneImgRef.current.naturalHeight
                    ctx.drawImage(phoneImgRef.current, 0, 0)
                } else {
                    return false
                }
            }
        }
        return true
    }

    // ============ HANDLE RECOGNITION RESULT (from WebSocket or HTTP fallback) ============
    const handleRecognitionResultRef = useRef<(result: any) => void>(() => {})

    const handleRecognitionResult = (result: any) => {
        handleRecognitionResultRef.current(result)
    }

    useEffect(() => {
        handleRecognitionResultRef.current = async (result: any) => {
            setScanning(false)
            isProcessingRef.current = false

            if (!result.success || !result.plates?.length) {
                setScanResults([])
                // No plate found → increase idle count, slow down
                idleCountRef.current++
                if (idleCountRef.current > 5) {
                    scanIntervalRef.current = 3000  // Slow scan when idle
                }
                return
            }

            // Plate found → reset idle, speed up
            idleCountRef.current = 0
            scanIntervalRef.current = 800  // Fast scan when active

            const best = result.plates[0]

            // Skip if same plate already detected
            if (best.plate === plate && capturedImage) return

            setScanResults(result.plates)
            setPlate(best.plate)
            searchPlate(best.plate)

            // Capture evidence image (still use base64 for saving to disk)
            const imageBase64 = canvasRef.current?.toDataURL('image/jpeg', 0.92) || ''
            setCapturedImage(imageBase64)
            try {
                const saveResult = await window.electronAPI.capture.save(imageBase64, best.plate)
                if (saveResult.success && saveResult.path) {
                    setCapturedImagePath(saveResult.path)
                }
            } catch { /* capture is optional */ }

            // Auto gate mode
            if (gateMode === 'entry' || gateMode === 'exit') {
                const now = Date.now()
                const lastProcessed = recentPlatesRef.current.get(best.plate)
                if (lastProcessed && now - lastProcessed < 30000) return

                try {
                    const currentStatus = await window.electronAPI.logs.getStatus(best.plate)

                    if (gateMode === 'entry' && currentStatus === 'INSIDE') {
                        showToast(`⚠️ ${best.plate} đã ở bên trong`, 'error')
                        recentPlatesRef.current.set(best.plate, now)
                    } else if (gateMode === 'exit' && currentStatus !== 'INSIDE') {
                        showToast(`⚠️ ${best.plate} chưa vào, không thể ra`, 'error')
                        recentPlatesRef.current.set(best.plate, now)
                    } else {
                        let imgPath = ''
                        try {
                            const saveResult = await window.electronAPI.capture.save(imageBase64, best.plate)
                            if (saveResult.success && saveResult.path) imgPath = saveResult.path
                        } catch { /* optional */ }

                        if (gateMode === 'entry') {
                            await window.electronAPI.logs.checkIn(best.plate, guardName, '', imgPath)
                        } else {
                            await window.electronAPI.logs.checkOut(best.plate, guardName, '', imgPath)
                        }

                        recentPlatesRef.current.set(best.plate, now)
                        showToast(
                            `${gateMode === 'entry' ? '✅ VÀO' : '🚪 RA'}: ${best.plate}`,
                            'success'
                        )
                        loadRecentLogs()
                    }

                    setTimeout(() => {
                        setPlate('')
                        setScanResults([])
                        setCapturedImage('')
                        setCapturedImagePath('')
                        setAutoScan(true)
                    }, 3000)
                } catch (err: any) {
                    showToast('❌ Lỗi: ' + (err.message || 'Unknown'), 'error')
                    setAutoScan(true)
                }
            } else {
                showToast(`🎯 Phát hiện: ${best.plate} (${best.confidence}%)`, 'success')
            }

            setAutoScan(false)
        }
    }, [plate, capturedImage, gateMode, guardName])

    // ============ CAPTURE & SEND (WebSocket primary, HTTP fallback) ============
    const captureAndRecognize = useCallback(async () => {
        if (!canvasRef.current) return
        if (lprStatus !== 'online') return
        if (isProcessingRef.current) return

        const canvas = canvasRef.current
        const captured = await captureFrame(canvas)
        if (!captured) return

        // Motion detection: skip if no movement detected
        const hasMotion = detectMotion(canvas)
        if (!hasMotion) {
            idleCountRef.current++
            if (idleCountRef.current > 5) {
                scanIntervalRef.current = 3000  // Slow down when idle
            }
            return
        }

        // Reset idle on motion
        idleCountRef.current = 0
        if (scanIntervalRef.current > 1500) {
            scanIntervalRef.current = 800  // Speed up on motion
        }

        isProcessingRef.current = true
        setScanning(true)

        // Try WebSocket (binary, low latency)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            canvas.toBlob((blob) => {
                if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
                    blob.arrayBuffer().then(buffer => {
                        wsRef.current!.send(buffer)
                    })
                } else {
                    isProcessingRef.current = false
                    setScanning(false)
                }
            }, 'image/jpeg', 0.85)
            return  // Result handled in ws.onmessage → handleRecognitionResult
        }

        // Fallback: HTTP via Electron IPC
        try {
            const imageBase64 = canvas.toDataURL('image/jpeg', 0.92)
            const result = await window.electronAPI.lpr.recognize(imageBase64)
            handleRecognitionResult(result)
        } catch (err) {
            console.error('LPR error:', err)
            isProcessingRef.current = false
            setScanning(false)
        }
    }, [lprStatus, cameraSource, phoneUrl])

    // Keep ref in sync with latest captureAndRecognize (fix stale closure)
    useEffect(() => {
        captureAndRecognizeRef.current = captureAndRecognize
    }, [captureAndRecognize])

    // Adaptive auto-scan loop: uses setTimeout chain instead of fixed setInterval
    // Interval adapts based on motion detection and recognition results
    useEffect(() => {
        if (!autoScan || !cameraActive || lprStatus !== 'online') {
            if (autoScanTimer.current) {
                clearTimeout(autoScanTimer.current)
                autoScanTimer.current = null
            }
            return
        }

        const scheduleNextScan = () => {
            autoScanTimer.current = setTimeout(() => {
                captureAndRecognizeRef.current()
                // Schedule next scan with current adaptive interval
                if (autoScan) scheduleNextScan()
            }, scanIntervalRef.current)
        }

        // Start first scan immediately
        captureAndRecognizeRef.current()
        scheduleNextScan()

        return () => {
            if (autoScanTimer.current) {
                clearTimeout(autoScanTimer.current)
                autoScanTimer.current = null
            }
        }
    }, [autoScan, cameraActive, lprStatus])

    // ============ VEHICLE LOOKUP ============
    const searchPlate = async (value: string) => {
        const formatted = value.toUpperCase().replace(/[^A-Z0-9\-\.]/g, '')
        setPlate(formatted)

        if (formatted.length < 3) {
            setVehicleInfo(null)
            setIsRegistered(false)
            setVehicleStatus('')
            return
        }

        const vehicle = await window.electronAPI.vehicles.getByPlate(formatted)
        const status = await window.electronAPI.logs.getStatus(formatted)

        if (vehicle) {
            setVehicleInfo(vehicle)
            setIsRegistered(true)
        } else {
            setVehicleInfo(null)
            setIsRegistered(false)
        }
        setVehicleStatus(status)
    }

    // ============ ACTIONS ============
    const handleAction = async (action: 'CHECK_IN' | 'CHECK_OUT') => {
        if (!plate.trim()) return
        setLoading(true)

        try {
            if (action === 'CHECK_IN') {
                await window.electronAPI.logs.checkIn(plate, guardName, notes, capturedImagePath)
                showToast(`✅ Xe ${plate} đã vào`, 'success')
            } else {
                await window.electronAPI.logs.checkOut(plate, guardName, notes, capturedImagePath)
                showToast(`✅ Xe ${plate} đã ra`, 'success')
            }

            setPlate('')
            setVehicleInfo(null)
            setIsRegistered(false)
            setVehicleStatus('')
            setNotes('')
            setScanResults([])
            setCapturedImage('')
            setCapturedImagePath('')
            loadRecentLogs()

            // Resume auto-scan for next vehicle
            if (cameraActive && lprStatus === 'online') {
                setAutoScan(true)
            }
        } catch (err: any) {
            showToast('❌ Lỗi: ' + (err.message || 'Unknown'), 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleSwitchSource = async (source: CameraSource) => {
        stopCamera()
        setCameraSource(source)
        await window.electronAPI.settings.set('camera_source', source)
    }

    const handleConnectPhone = async () => {
        await saveCameraSettings()
        setShowCameraSettings(false)
        startPhoneCamera()
    }

    const showToast = (message: string, type: string) => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    const formatTime = (ts: string) => {
        const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
        return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    const formatDate = (ts: string) => {
        const d = new Date(ts + (ts.includes('Z') || ts.includes('+') ? '' : 'Z'))
        return d.toLocaleDateString('vi-VN')
    }

    // Bbox coordinates are relative to the canvas (640px scaled image sent to LPR),
    // NOT the original video dimensions. Use canvas size for correct overlay.
    const getVideoWidth = () => canvasRef.current?.width || 640
    const getVideoHeight = () => canvasRef.current?.height || 360

    return (
        <div className="page-wrapper animate-in">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">
                        <ScanLine />
                        Xe vào / ra
                    </h1>
                    <p className="page-description">Nhận diện biển số xe tự động qua AI (YOLO + PaddleOCR)</p>
                </div>
                {/* LPR status indicator */}
                <div className={`lpr-status ${lprStatus}`}>
                    {lprStatus === 'online' ? <Wifi size={14} /> : lprStatus === 'checking' ? <RefreshCw size={14} className="spin-icon" /> : <WifiOff size={14} />}
                    <span>AI: {lprStatus === 'online' ? 'Sẵn sàng' : lprStatus === 'checking' ? 'Đang khởi động...' : 'Offline'}</span>
                </div>
            </div>

            <div className="checkin-layout-3col">
                {/* ======= LEFT: Camera ======= */}
                <div className="checkin-panel camera-panel">
                    <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Camera size={14} /> Camera nhận diện
                        </span>
                        {/* Camera source toggle */}
                        <div className="camera-source-toggle">
                            <button
                                className={`source-btn ${cameraSource === 'local' ? 'active' : ''}`}
                                onClick={() => handleSwitchSource('local')}
                                title="Webcam máy tính"
                            >
                                <Monitor size={13} /> Webcam
                            </button>
                            <button
                                className={`source-btn ${cameraSource === 'phone' ? 'active' : ''}`}
                                onClick={() => {
                                    // Check if iPhone Continuity Camera is available in device list
                                    const iphoneDevice = cameraDevices.find(d =>
                                        d.label.toLowerCase().includes('iphone')
                                    )
                                    if (iphoneDevice) {
                                        // iPhone Continuity Camera works via getUserMedia, no IP needed
                                        setSelectedDeviceId(iphoneDevice.deviceId)
                                        setCameraSource('local')
                                        window.electronAPI.settings.set('camera_device_id', iphoneDevice.deviceId)
                                        window.electronAPI.settings.set('camera_source', 'local')
                                        startLocalCamera(iphoneDevice.deviceId)
                                        setShowCameraSettings(false)
                                    } else if (phoneUrl) {
                                        handleSwitchSource('phone')
                                    } else {
                                        setCameraSource('phone')
                                        setShowCameraSettings(true)
                                    }
                                }}
                                title="Camera điện thoại (iPhone / IP Webcam)"
                            >
                                <Smartphone size={13} /> Điện thoại
                            </button>
                            <button
                                className="source-btn"
                                onClick={() => setShowCameraSettings(!showCameraSettings)}
                                title="Cài đặt camera"
                            >
                                <Settings2 size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Camera settings panel */}
                    {showCameraSettings && (
                        <div className="phone-settings-panel">
                            {/* Device selector for Webcam mode */}
                            {cameraDevices.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                    <div className="phone-settings-header">
                                        <Camera size={16} />
                                        <span>Chọn thiết bị Camera</span>
                                    </div>
                                    <select
                                        className="input"
                                        value={selectedDeviceId}
                                        onChange={async (e) => {
                                            setSelectedDeviceId(e.target.value)
                                            await window.electronAPI.settings.set('camera_device_id', e.target.value)
                                            // Always use getUserMedia when selecting a device (including iPhone Continuity Camera)
                                            setCameraSource('local')
                                            await window.electronAPI.settings.set('camera_source', 'local')
                                            startLocalCamera(e.target.value)
                                        }}
                                        style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
                                    >
                                        {cameraDevices.map((device, i) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Camera ${i + 1}`}
                                                {device.label.toLowerCase().includes('iphone') ? ' 📱' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: '10.5px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                                        💡 <strong>iPhone Continuity Camera:</strong> Mở iPhone, giữ gần Mac → iPhone tự xuất hiện trong danh sách.
                                        Yêu cầu <strong>macOS Ventura+</strong> và cùng Apple ID.
                                    </p>
                                </div>
                            )}

                            {/* Divider */}
                            {cameraDevices.length > 0 && (
                                <div style={{ borderTop: '1px solid rgba(79,70,229,0.1)', margin: '8px 0' }} />
                            )}

                            {/* Phone IP Camera */}
                            <div className="phone-settings-header">
                                <Smartphone size={16} />
                                <span>Kết nối qua IP (Android/iOS)</span>
                            </div>
                            <p className="phone-settings-desc">
                                📱 Cài app <strong>IP Webcam</strong> (Android) hoặc <strong>EpocCam</strong> (iOS) trên điện thoại.
                                Mở app → Start Server → nhập IP hiển thị vào đây.
                            </p>
                            <div className="phone-url-input-group">
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="VD: 192.168.1.100:8080"
                                    value={phoneUrl}
                                    onChange={(e) => setPhoneUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleConnectPhone()}
                                />
                                <button className="btn btn-primary" onClick={handleConnectPhone}>
                                    <Wifi size={14} /> Kết nối
                                </button>
                            </div>
                            <div className="phone-help-tips">
                                <div className="help-tip">
                                    <strong>🍎 iPhone (đơn giản nhất):</strong> Giữ iPhone gần Mac → chọn iPhone trong danh sách camera ở trên
                                </div>
                                <div className="help-tip">
                                    <strong>🤖 Android:</strong> IP Webcam → Start Server → nhập IP vào ô trên → bấm "Kết nối"
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Gate mode selector */}
                    <div style={{
                        display: 'flex',
                        gap: '4px',
                        padding: '6px',
                        background: 'var(--bg-secondary, #f5f5f5)',
                        borderRadius: '8px',
                        marginBottom: '8px',
                    }}>
                        {([
                            { mode: 'entry' as GateMode, label: '🟢 Cổng VÀO', color: '#22c55e' },
                            { mode: 'exit' as GateMode, label: '🔴 Cổng RA', color: '#ef4444' },
                            { mode: 'manual' as GateMode, label: '✋ Thủ công', color: '#6366f1' },
                        ]).map(({ mode, label, color }) => (
                            <button
                                key={mode}
                                onClick={async () => {
                                    setGateMode(mode)
                                    await window.electronAPI.settings.set('gate_mode', mode)
                                }}
                                style={{
                                    flex: 1,
                                    padding: '8px 4px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: gateMode === mode ? color : 'transparent',
                                    color: gateMode === mode ? 'white' : 'var(--text-secondary, #666)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="camera-viewport">
                        {/* Local webcam video element */}
                        <video
                            ref={videoRef}
                            autoPlay playsInline muted
                            className="camera-video"
                            style={{ display: cameraSource === 'local' ? 'block' : 'none' }}
                        />
                        {/* Phone camera MJPEG stream */}
                        <img
                            ref={phoneImgRef}
                            className="camera-video"
                            style={{
                                display: cameraSource === 'phone' ? 'block' : 'none',
                                objectFit: 'cover',
                                width: '100%',
                                height: '100%',
                            }}
                            alt="Phone camera"
                            onError={() => {
                                setPhoneConnected(false)
                                setCameraActive(false)
                            }}
                            onLoad={() => {
                                setPhoneConnected(true)
                                setCameraActive(true)
                            }}
                        />

                        <div className="camera-overlay">
                            <div className={`scan-region ${scanning ? 'scanning' : ''}`}>
                                <span className="scan-label">
                                    {!cameraActive
                                        ? cameraSource === 'phone'
                                            ? '📱 Đang kết nối camera điện thoại...'
                                            : '📷 Đang khởi động camera...'
                                        : scanning
                                            ? '🔍 AI đang nhận diện...'
                                            : autoScan
                                                ? '🟢 Đang quét tự động'
                                                : 'Đặt biển số vào khung này'}
                                </span>
                            </div>
                        </div>

                        {/* Bounding box overlay */}
                        {scanResults.length > 0 && scanResults[0].bbox && (
                            <div className="bbox-overlay" style={{
                                left: `${(scanResults[0].bbox[0] / getVideoWidth()) * 100}%`,
                                top: `${(scanResults[0].bbox[1] / getVideoHeight()) * 100}%`,
                                width: `${((scanResults[0].bbox[2] - scanResults[0].bbox[0]) / getVideoWidth()) * 100}%`,
                                height: `${((scanResults[0].bbox[3] - scanResults[0].bbox[1]) / getVideoHeight()) * 100}%`,
                            }}>
                                <span className="bbox-label">{scanResults[0].plate}</span>
                            </div>
                        )}

                        {/* Auto-scan active indicator */}
                        {autoScan && cameraActive && (
                            <div className="autoscan-badge">
                                <Zap size={12} /> Tự động nhận diện
                            </div>
                        )}

                        {/* Phone camera source badge */}
                        {cameraSource === 'phone' && cameraActive && (
                            <div className="camera-source-badge">
                                <Smartphone size={11} /> Camera điện thoại
                            </div>
                        )}
                    </div>

                    {/* Camera controls */}
                    <div className="camera-controls">
                        <button
                            className={`btn ${autoScan ? 'btn-success' : 'btn-ghost'}`}
                            onClick={() => setAutoScan(!autoScan)}
                            style={{ flex: 1 }}
                            disabled={lprStatus !== 'online' || !cameraActive}
                        >
                            {autoScan ? <><Zap /> Tự động: BẬT</> : <><Zap /> Tự động: TẮT</>}
                        </button>
                        <button className="btn btn-ghost" onClick={cameraActive ? stopCamera : () => {
                            if (cameraSource === 'local') startLocalCamera()
                            else startPhoneCamera()
                        }}>
                            {cameraActive ? <><CameraOff /> Tắt cam</> : <><Camera /> Bật cam</>}
                        </button>
                    </div>

                    {/* Scan results */}
                    {scanResults.length > 0 && (
                        <div className="scan-results-list">
                            {scanResults.map((r, i) => (
                                <div
                                    key={i}
                                    className={`scan-result ${plate === r.plate ? 'active' : ''}`}
                                    onClick={() => { setPlate(r.plate); searchPlate(r.plate) }}
                                >
                                    <div className="scan-result-header">
                                        <CircleDot size={14} />
                                        <span>Biển số #{i + 1}</span>
                                        <span className={`confidence ${r.confidence > 80 ? 'high' : r.confidence > 50 ? 'medium' : 'low'}`}>
                                            {Math.round(r.confidence)}%
                                        </span>
                                    </div>
                                    <div className="scan-result-plate">{r.plate}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>

                {/* ======= CENTER: Info & Actions ======= */}
                <div className="checkin-panel">
                    <div className="section-label">
                        <Car size={14} /> Thông tin xe
                    </div>

                    <div className="input-group" style={{ marginBottom: '14px' }}>
                        <label>Biển số xe (tự động hoặc nhập tay)</label>
                        <input
                            type="text"
                            className="input input-large"
                            placeholder="30A-12345"
                            value={plate}
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-\.]/g, '')
                                setPlate(val)
                                if (val.length >= 3) searchPlate(val)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && plate) {
                                    handleAction(vehicleStatus === 'INSIDE' ? 'CHECK_OUT' : 'CHECK_IN')
                                }
                            }}
                        />
                    </div>

                    {plate.length >= 3 && (
                        <div className="vehicle-info-card" style={{ animation: 'slideUp 0.3s ease' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                {isRegistered ? (
                                    <span className="badge badge-green"><CheckCircle2 size={13} /> Đã đăng ký</span>
                                ) : (
                                    <span className="badge badge-amber"><AlertTriangle size={13} /> Chưa đăng ký</span>
                                )}
                                {vehicleStatus === 'INSIDE' ? (
                                    <span className="badge badge-blue"><span className="status-dot green"></span> Đang ở trong</span>
                                ) : (
                                    <span className="badge badge-purple"><span className="status-dot red"></span> Đang ở ngoài</span>
                                )}
                            </div>

                            {isRegistered && vehicleInfo && (
                                <>
                                    <div className="vehicle-info-row">
                                        <span className="label"><User size={14} /> Chủ xe</span>
                                        <span className="value">{vehicleInfo.owner_name}</span>
                                    </div>
                                    <div className="vehicle-info-row">
                                        <span className="label"><Building size={14} /> Phòng ban</span>
                                        <span className="value">{vehicleInfo.department}</span>
                                    </div>
                                    <div className="vehicle-info-row">
                                        <span className="label"><Car size={14} /> Loại xe</span>
                                        <span className="value">{vehicleInfo.vehicle_type} • {vehicleInfo.color}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="input-group" style={{ marginBottom: '16px' }}>
                        <label>Ghi chú (tùy chọn)</label>
                        <input type="text" className="input" placeholder="Ghi chú thêm..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <div className="action-buttons">
                        <button
                            className="btn btn-success"
                            onClick={() => handleAction('CHECK_IN')}
                            disabled={!plate || loading || vehicleStatus === 'INSIDE'}
                        >
                            <LogIn /> VÀO
                        </button>
                        <button
                            className="btn"
                            style={{
                                background: vehicleStatus === 'INSIDE' ? '#ef4444' : '#fecaca',
                                color: vehicleStatus === 'INSIDE' ? 'white' : '#ef4444',
                                boxShadow: vehicleStatus === 'INSIDE' ? '0 1px 3px rgba(239, 68, 68, 0.25)' : 'none',
                            }}
                            onClick={() => handleAction('CHECK_OUT')}
                            disabled={!plate || loading || vehicleStatus !== 'INSIDE'}
                        >
                            <LogOut /> RA
                        </button>
                    </div>

                    {/* Captured evidence image */}
                    {capturedImage && (
                        <div style={{
                            marginTop: '12px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '2px solid #22c55e',
                            position: 'relative',
                        }}>
                            <div style={{
                                background: '#22c55e',
                                color: 'white',
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '4px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}>
                                <Camera size={12} /> Ảnh chụp bằng chứng
                            </div>
                            <img
                                src={capturedImage}
                                alt="Captured plate"
                                style={{
                                    width: '100%',
                                    display: 'block',
                                    maxHeight: '160px',
                                    objectFit: 'cover',
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* ======= RIGHT: Recent Logs ======= */}
                <div className="checkin-panel">
                    <div className="section-label">
                        <Clock size={14} /> Lịch sử gần đây
                    </div>

                    {recentLogs.length === 0 ? (
                        <div className="empty-state">
                            <Clock />
                            <p>Chưa có lượt ra / vào nào</p>
                        </div>
                    ) : (
                        <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Biển số</th>
                                        <th>Hành động</th>
                                        <th>Thời gian</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentLogs.map((log: any) => (
                                        <tr key={log.id}>
                                            <td><span className="plate-number">{log.plate_number}</span></td>
                                            <td>
                                                {log.action === 'CHECK_IN' ? (
                                                    <span className="badge badge-green"><LogIn size={12} /> Vào</span>
                                                ) : (
                                                    <span className="badge badge-red"><LogOut size={12} /> Ra</span>
                                                )}
                                            </td>
                                            <td className="text-muted text-sm">
                                                {formatDate(log.timestamp)} {formatTime(log.timestamp)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </div>
    )
}
