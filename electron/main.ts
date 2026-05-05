import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import Database from 'better-sqlite3'

let db: Database.Database
let mainWindow: BrowserWindow | null = null
let lprProcess: ChildProcess | null = null
const LPR_PORT = 8765

function initDatabase() {
    // Use local data directory to avoid permission issues
    const dbDir = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'data')

    // Ensure dir exists
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
    }

    const dbPath = path.join(dbDir, 'tts-camera.db')
    console.log('[DB] Opening database at:', dbPath)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')

    db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT UNIQUE NOT NULL,
      owner_name TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      vehicle_type TEXT NOT NULL DEFAULT 'Xe máy',
      color TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS check_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT NOT NULL DEFAULT '',
      guard_name TEXT NOT NULL DEFAULT '',
      image_path TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', 'Công ty TTS');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('guard_name', 'Bảo vệ');

    CREATE INDEX IF NOT EXISTS idx_check_logs_plate ON check_logs(plate_number);
    CREATE INDEX IF NOT EXISTS idx_check_logs_timestamp ON check_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_check_logs_plate_ts ON check_logs(plate_number, timestamp DESC);
  `)

    // Add image_path column for existing databases
    try {
        db.exec("ALTER TABLE check_logs ADD COLUMN image_path TEXT NOT NULL DEFAULT ''")
    } catch { /* column already exists */ }
}

function registerIpcHandlers() {
    // --- VEHICLES ---
    ipcMain.handle('db:vehicles:getAll', () => {
        return db.prepare('SELECT * FROM vehicles WHERE status = ? ORDER BY created_at DESC').all('active')
    })

    ipcMain.handle('db:vehicles:search', (_e, query: string) => {
        return db.prepare("SELECT * FROM vehicles WHERE status = 'active' AND plate_number LIKE ? ORDER BY plate_number").all(`%${query}%`)
    })

    ipcMain.handle('db:vehicles:getByPlate', (_e, plate: string) => {
        return db.prepare('SELECT * FROM vehicles WHERE plate_number = ? AND status = ?').get(plate, 'active')
    })

    ipcMain.handle('db:vehicles:create', (_e, vehicle: any) => {
        const stmt = db.prepare('INSERT INTO vehicles (plate_number, owner_name, department, vehicle_type, color, notes) VALUES (?, ?, ?, ?, ?, ?)')
        return stmt.run(vehicle.plate_number, vehicle.owner_name, vehicle.department, vehicle.vehicle_type, vehicle.color, vehicle.notes || '')
    })

    ipcMain.handle('db:vehicles:update', (_e, id: number, vehicle: any) => {
        const stmt = db.prepare('UPDATE vehicles SET plate_number=?, owner_name=?, department=?, vehicle_type=?, color=?, notes=? WHERE id=?')
        return stmt.run(vehicle.plate_number, vehicle.owner_name, vehicle.department, vehicle.vehicle_type, vehicle.color, vehicle.notes || '', id)
    })

    ipcMain.handle('db:vehicles:delete', (_e, id: number) => {
        return db.prepare("UPDATE vehicles SET status = 'inactive' WHERE id = ?").run(id)
    })

    ipcMain.handle('db:vehicles:count', () => {
        const row = db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE status = 'active'").get() as any
        return row.count
    })

    // --- CAPTURE IMAGE ---
    ipcMain.handle('capture:save', (_e, imageBase64: string, plate: string) => {
        try {
            const captureDir = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'data', 'captures')
            if (!fs.existsSync(captureDir)) fs.mkdirSync(captureDir, { recursive: true })

            // Filename: plate_timestamp.jpg
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
            const safePlate = plate.replace(/[^A-Z0-9]/gi, '')
            const filename = `${safePlate}_${timestamp}.jpg`
            const filepath = path.join(captureDir, filename)

            // Strip data URI prefix and save
            const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
            fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'))

            console.log('[CAPTURE] Saved:', filepath)
            return { success: true, path: filepath, filename }
        } catch (err: any) {
            console.error('[CAPTURE] Error:', err)
            return { success: false, error: err.message }
        }
    })

    // --- CHECK LOGS ---
    ipcMain.handle('db:logs:checkIn', (_e, plate: string, guardName: string, notes: string, imagePath: string) => {
        const result = db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes, image_path) VALUES (?, ?, ?, ?, ?)').run(plate, 'CHECK_IN', guardName, notes || '', imagePath || '')
        // Push realtime event to all renderer windows
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('check-log-updated', { plate, action: 'CHECK_IN' })
        }
        return result
    })

    ipcMain.handle('db:logs:checkOut', (_e, plate: string, guardName: string, notes: string, imagePath: string) => {
        const result = db.prepare('INSERT INTO check_logs (plate_number, action, guard_name, notes, image_path) VALUES (?, ?, ?, ?, ?)').run(plate, 'CHECK_OUT', guardName, notes || '', imagePath || '')
        // Push realtime event to all renderer windows
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('check-log-updated', { plate, action: 'CHECK_OUT' })
        }
        return result
    })

    ipcMain.handle('db:logs:getStatus', (_e, plate: string) => {
        const last = db.prepare('SELECT * FROM check_logs WHERE plate_number = ? ORDER BY timestamp DESC LIMIT 1').get(plate) as any
        if (!last) return 'OUTSIDE'
        return last.action === 'CHECK_IN' ? 'INSIDE' : 'OUTSIDE'
    })

    ipcMain.handle('db:logs:getRecent', (_e, limit: number) => {
        return db.prepare('SELECT * FROM check_logs ORDER BY timestamp DESC LIMIT ?').all(limit || 10)
    })

    ipcMain.handle('db:logs:getAll', (_e, filters: any) => {
        let query = 'SELECT * FROM check_logs WHERE 1=1'
        const params: any[] = []

        if (filters?.plate) {
            query += ' AND plate_number LIKE ?'
            params.push(`%${filters.plate}%`)
        }
        if (filters?.action) {
            query += ' AND action = ?'
            params.push(filters.action)
        }
        if (filters?.dateFrom) {
            query += ' AND timestamp >= ?'
            params.push(filters.dateFrom)
        }
        if (filters?.dateTo) {
            query += ' AND timestamp <= ?'
            params.push(filters.dateTo + ' 23:59:59')
        }

        query += ' ORDER BY timestamp DESC LIMIT 500'
        return db.prepare(query).all(...params)
    })

    ipcMain.handle('db:logs:count', () => {
        const row = db.prepare('SELECT COUNT(*) as count FROM check_logs').get() as any
        return row.count
    })

    ipcMain.handle('db:logs:todayCount', () => {
        const today = new Date().toISOString().split('T')[0]
        const row = db.prepare("SELECT COUNT(*) as count FROM check_logs WHERE date(timestamp) = date(?)").get(today) as any
        return row.count
    })

    ipcMain.handle('db:logs:insideCount', () => {
        // Get vehicles currently inside: last action = CHECK_IN
        const rows = db.prepare(`
      SELECT plate_number FROM check_logs
      WHERE id IN (
        SELECT MAX(id) FROM check_logs GROUP BY plate_number
      ) AND action = 'CHECK_IN'
    `).all() as any[]
        return rows.length
    })

    ipcMain.handle('db:logs:insideVehicles', () => {
        return db.prepare(`
      SELECT cl.plate_number, cl.timestamp, cl.guard_name, v.owner_name, v.department, v.vehicle_type
      FROM check_logs cl
      LEFT JOIN vehicles v ON cl.plate_number = v.plate_number AND v.status = 'active'
      WHERE cl.id IN (
        SELECT MAX(id) FROM check_logs GROUP BY plate_number
      ) AND cl.action = 'CHECK_IN'
      ORDER BY cl.timestamp DESC
    `).all()
    })

    ipcMain.handle('db:logs:weeklyStats', () => {
        const rows = db.prepare(`
      SELECT date(timestamp) as day, action, COUNT(*) as count
      FROM check_logs
      WHERE timestamp >= date('now', '-6 days')
      GROUP BY date(timestamp), action
      ORDER BY day ASC
    `).all()
        return rows
    })

    // --- SETTINGS ---
    ipcMain.handle('db:settings:get', (_e, key: string) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
        return row?.value || ''
    })

    ipcMain.handle('db:settings:set', (_e, key: string, value: string) => {
        return db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    })

    ipcMain.handle('db:settings:getAll', () => {
        const rows = db.prepare('SELECT * FROM settings').all() as any[]
        const obj: Record<string, string> = {}
        rows.forEach(r => { obj[r.key] = r.value })
        return obj
    })
}

// =============================================================
// LPR SERVICE (Python FastAPI)
// =============================================================
let lprRestartAttempts = 0
const LPR_MAX_RESTARTS = 3

function startLprService() {
    const lprDir = app.isPackaged
        ? path.join(path.dirname(app.getPath('exe')), 'lpr-service')
        : path.join(__dirname, '..', 'lpr-service')

    const venvPython = path.join(lprDir, 'venv', 'bin', 'python3')
    const serverScript = path.join(lprDir, 'server.py')

    if (!fs.existsSync(venvPython)) {
        console.log('[LPR] Python venv not found at:', venvPython)
        console.log('[LPR] LPR service will not be available')
        return
    }

    console.log('[LPR] Starting LPR service v2.0 on port', LPR_PORT)
    lprProcess = spawn(venvPython, [serverScript, String(LPR_PORT)], {
        cwd: lprDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True' }
    })

    lprProcess.stdout?.on('data', (data: Buffer) => {
        console.log('[LPR]', data.toString().trim())
    })

    lprProcess.stderr?.on('data', (data: Buffer) => {
        console.log('[LPR-ERR]', data.toString().trim())
    })

    lprProcess.on('close', (code: number) => {
        console.log('[LPR] Process exited with code:', code)
        lprProcess = null

        // Auto-restart with exponential backoff
        if (code !== 0 && lprRestartAttempts < LPR_MAX_RESTARTS) {
            const delay = 2000 * Math.pow(2, lprRestartAttempts)
            lprRestartAttempts++
            console.log(`[LPR] Restarting in ${delay}ms (attempt ${lprRestartAttempts}/${LPR_MAX_RESTARTS})`)
            setTimeout(startLprService, delay)
        }
    })
}

function stopLprService() {
    if (lprProcess) {
        console.log('[LPR] Stopping LPR service...')
        lprProcess.kill('SIGTERM')
        lprProcess = null
    }
}

function registerLprHandlers() {
    ipcMain.handle('lpr:recognize', async (_e, imageBase64: string) => {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 15000)  // 15s timeout
            const response = await fetch(`http://127.0.0.1:${LPR_PORT}/recognize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageBase64 }),
                signal: controller.signal,
            })
            clearTimeout(timeout)
            return await response.json()
        } catch (err: any) {
            return { success: false, plates: [], message: 'LPR service not available: ' + err.message }
        }
    })

    ipcMain.handle('lpr:health', async () => {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)
            const response = await fetch(`http://127.0.0.1:${LPR_PORT}/health`, { signal: controller.signal })
            clearTimeout(timeout)
            return await response.json()
        } catch {
            return { status: 'offline', model_loaded: false }
        }
    })
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#f0f2f5',
        show: false
    })

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
    })

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(() => {
    initDatabase()
    registerIpcHandlers()
    registerLprHandlers()
    startLprService()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    stopLprService()
})
