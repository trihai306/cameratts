/// <reference types="vite/client" />

interface ElectronAPI {
    vehicles: {
        getAll: () => Promise<any[]>
        search: (query: string) => Promise<any[]>
        getByPlate: (plate: string) => Promise<any | null>
        create: (vehicle: any) => Promise<any>
        update: (id: number, vehicle: any) => Promise<any>
        delete: (id: number) => Promise<any>
        count: () => Promise<number>
    }
    logs: {
        checkIn: (plate: string, guardName: string, notes: string, imagePath?: string) => Promise<any>
        checkOut: (plate: string, guardName: string, notes: string, imagePath?: string) => Promise<any>
        getStatus: (plate: string) => Promise<string>
        getRecent: (limit: number) => Promise<any[]>
        count: () => Promise<number>
        getAll: (filters: any) => Promise<any[]>
        todayCount: () => Promise<number>
        insideCount: () => Promise<number>
        insideVehicles: () => Promise<any[]>
        weeklyStats: () => Promise<any[]>
    }
    settings: {
        get: (key: string) => Promise<string>
        set: (key: string, value: string) => Promise<any>
        getAll: () => Promise<Record<string, string>>
    }
    lpr: {
        recognize: (imageBase64: string) => Promise<{
            success: boolean
            plates: Array<{
                plate: string
                raw_ocr?: string
                confidence: number
                ocr_confidence?: number
                validation_score?: number
                bbox?: number[]
                province?: string
                plate_type?: string
            }>
            message: string
            processing_time_ms?: number
        }>
        health: () => Promise<{ status: string; model_loaded: boolean; version?: string }>
    }
    capture: {
        save: (imageBase64: string, plate: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>
    }
    // Realtime event listeners (push from main process)
    onCheckLogUpdated?: (callback: (data: { plate: string; action: string }) => void) => (() => void)
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
    }
}

export { }
