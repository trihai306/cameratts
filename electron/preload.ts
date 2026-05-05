import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    vehicles: {
        getAll: () => ipcRenderer.invoke('db:vehicles:getAll'),
        search: (query: string) => ipcRenderer.invoke('db:vehicles:search', query),
        getByPlate: (plate: string) => ipcRenderer.invoke('db:vehicles:getByPlate', plate),
        create: (vehicle: any) => ipcRenderer.invoke('db:vehicles:create', vehicle),
        update: (id: number, vehicle: any) => ipcRenderer.invoke('db:vehicles:update', id, vehicle),
        delete: (id: number) => ipcRenderer.invoke('db:vehicles:delete', id),
        count: () => ipcRenderer.invoke('db:vehicles:count'),
    },
    logs: {
        checkIn: (plate: string, guardName: string, notes: string, imagePath?: string) => ipcRenderer.invoke('db:logs:checkIn', plate, guardName, notes, imagePath || ''),
        checkOut: (plate: string, guardName: string, notes: string, imagePath?: string) => ipcRenderer.invoke('db:logs:checkOut', plate, guardName, notes, imagePath || ''),
        getStatus: (plate: string) => ipcRenderer.invoke('db:logs:getStatus', plate),
        getRecent: (limit: number) => ipcRenderer.invoke('db:logs:getRecent', limit),
        count: () => ipcRenderer.invoke('db:logs:count'),
        getAll: (filters: any) => ipcRenderer.invoke('db:logs:getAll', filters),
        todayCount: () => ipcRenderer.invoke('db:logs:todayCount'),
        insideCount: () => ipcRenderer.invoke('db:logs:insideCount'),
        insideVehicles: () => ipcRenderer.invoke('db:logs:insideVehicles'),
        weeklyStats: () => ipcRenderer.invoke('db:logs:weeklyStats'),
    },
    settings: {
        get: (key: string) => ipcRenderer.invoke('db:settings:get', key),
        set: (key: string, value: string) => ipcRenderer.invoke('db:settings:set', key, value),
        getAll: () => ipcRenderer.invoke('db:settings:getAll'),
    },
    lpr: {
        recognize: (imageBase64: string) => ipcRenderer.invoke('lpr:recognize', imageBase64),
        health: () => ipcRenderer.invoke('lpr:health'),
    },
    capture: {
        save: (imageBase64: string, plate: string) => ipcRenderer.invoke('capture:save', imageBase64, plate),
    },
    // Realtime event listeners (push from main process)
    onCheckLogUpdated: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data)
        ipcRenderer.on('check-log-updated', handler)
        // Return unsubscribe function
        return () => ipcRenderer.removeListener('check-log-updated', handler)
    },
})
