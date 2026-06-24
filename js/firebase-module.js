// ========== FIREBASE MODULE (VERSIÓN MODULAR) ==========
// Importar solo lo que necesitas
import { initializeApp } from "firebase/app";
import { 
    getDatabase, 
    ref, 
    onValue, 
    push, 
    set, 
    update,
    remove,
    query, 
    limitToLast, 
    orderByChild,
    once,
    onDisconnect,
    serverTimestamp,
    runTransaction,
    get,
    child,
    off,
    setPriority
} from "firebase/database";

// ========== CONFIGURACIÓN ==========
const firebaseConfig = {
    apiKey: "AIzaSyDMPpvQT0SMzq4o8VjfKpJvqgzFA191LYA",
    authDomain: "smart-monitor-6ec58.firebaseapp.com",
    databaseURL: "https://smart-monitor-6ec58-default-rtdb.firebaseio.com",
    projectId: "smart-monitor-6ec58",
    storageBucket: "smart-monitor-6ec58.firebasestorage.app",
    messagingSenderId: "298178902558",
    appId: "1:298178902558:web:51f503baa9358068f74c0f",
    measurementId: "G-Z1418C0EL7"
};

// ========== INICIALIZACIÓN ==========
let firebaseApp = null;
let database = null;
let isInitialized = false;
let retryCount = 0;
const maxRetries = 3;

try {
    // Inicializar Firebase
    firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
    isInitialized = true;
    console.log('🔥 Firebase (modular) inicializado correctamente');
} catch (error) {
    console.error('❌ Error inicializando Firebase (modular):', error);
    isInitialized = false;
}

// ========== CACHE LOCAL ==========
class FirebaseCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 60000; // 1 minuto
        this.pendingWrites = [];
        this.isOnline = navigator.onLine;
        
        // Escuchar cambios en la conexión
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processPendingWrites();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }
    
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        // Verificar si el cache ha expirado
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    set(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }
    
    clear() {
        this.cache.clear();
    }
    
    addPendingWrite(path, data) {
        const write = {
            path,
            data,
            timestamp: Date.now(),
            id: Date.now() + Math.random().toString(36).substr(2, 9)
        };
        this.pendingWrites.push(write);
        this.savePendingWrites();
        return write;
    }
    
    getPendingWrites() {
        return this.pendingWrites;
    }
    
    removePendingWrite(id) {
        this.pendingWrites = this.pendingWrites.filter(w => w.id !== id);
        this.savePendingWrites();
    }
    
    savePendingWrites() {
        try {
            localStorage.setItem('firebase_modular_pending', JSON.stringify(this.pendingWrites));
        } catch (error) {
            console.warn('⚠️ No se pudieron guardar escrituras pendientes:', error);
        }
    }
    
    loadPendingWrites() {
        try {
            const stored = localStorage.getItem('firebase_modular_pending');
            if (stored) {
                this.pendingWrites = JSON.parse(stored);
                console.log(`📦 ${this.pendingWrites.length} escrituras pendientes cargadas`);
            }
        } catch (error) {
            console.warn('⚠️ No se pudieron cargar escrituras pendientes:', error);
        }
    }
    
    async processPendingWrites() {
        if (!this.isOnline || this.pendingWrites.length === 0) return;
        
        console.log(`📤 Procesando ${this.pendingWrites.length} escrituras pendientes...`);
        
        const writes = [...this.pendingWrites];
        let successCount = 0;
        
        for (const write of writes) {
            try {
                await FirebaseService.setData(write.path, write.data);
                this.removePendingWrite(write.id);
                successCount++;
            } catch (error) {
                console.warn(`⚠️ Error procesando escritura ${write.id}:`, error);
            }
        }
        
        if (successCount > 0) {
            console.log(`✅ ${successCount} escrituras pendientes procesadas`);
        }
        
        return successCount;
    }
}

// Inicializar cache
const firebaseCache = new FirebaseCache();
firebaseCache.loadPendingWrites();

// ========== SERVICIO PRINCIPAL ==========
const FirebaseService = {
    // ========== PROPIEDADES ==========
    database,
    app: firebaseApp,
    isInitialized,
    isConnected: false,
    cache: firebaseCache,
    
    // ========== REFERENCIAS ==========
    getRef(path) {
        if (!database) throw new Error('Firebase no inicializado');
        return ref(database, path);
    },
    
    getSensorsRef() {
        return this.getRef('sensors');
    },
    
    getAlertsRef() {
        return this.getRef('alerts');
    },
    
    getHistoryRef() {
        return this.getRef('history');
    },
    
    // ========== CONEXIÓN ==========
    
    /**
     * Verificar el estado de la conexión
     */
    async checkConnection() {
        if (!database) return false;
        
        try {
            const connectedRef = ref(database, '.info/connected');
            const snapshot = await once(connectedRef, 'value');
            this.isConnected = snapshot.val() === true;
            return this.isConnected;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    },
    
    /**
     * Monitorear el estado de la conexión en tiempo real
     */
    monitorConnection(callback) {
        if (!database) {
            if (callback) callback(false);
            return null;
        }
        
        const connectedRef = ref(database, '.info/connected');
        
        const unsubscribe = onValue(connectedRef, (snapshot) => {
            const connected = snapshot.val() === true;
            this.isConnected = connected;
            if (callback) callback(connected);
            
            // Si se reconecta, procesar escrituras pendientes
            if (connected && this.cache.pendingWrites.length > 0) {
                this.cache.processPendingWrites();
            }
        });
        
        return unsubscribe;
    },
    
    /**
     * Intentar reconectar
     */
    async reconnect() {
        console.log('🔄 Intentando reconectar a Firebase...');
        retryCount = 0;
        
        while (retryCount < maxRetries) {
            const connected = await this.checkConnection();
            if (connected) {
                console.log('✅ Reconectado a Firebase');
                return true;
            }
            
            retryCount++;
            console.log(`⏳ Intento ${retryCount}/${maxRetries} - Esperando ${retryCount * 2}s...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
        }
        
        console.error('❌ No se pudo reconectar a Firebase');
        return false;
    },
    
    /**
     * Configurar estado offline
     */
    setupOfflineHandlers() {
        if (!database) return;
        
        const sensorsRef = this.getSensorsRef();
        const connectedRef = ref(database, '.info/connected');
        
        onValue(connectedRef, (snapshot) => {
            const connected = snapshot.val();
            
            if (connected) {
                console.log('📡 Conexión establecida');
                // Procesar escrituras pendientes
                this.cache.processPendingWrites();
            } else {
                console.warn('📡 Conexión perdida - Modo offline activado');
            }
        });
        
        // Configurar acciones al desconectarse
        const statusRef = ref(database, 'status');
        onDisconnect(statusRef).set({
            status: 'offline',
            lastSeen: serverTimestamp()
        });
    },
    
    // ========== LECTURA DE DATOS ==========
    
    /**
     * Obtener datos de sensores con cache
     */
    async getSensorData(useCache = true) {
        if (!database) throw new Error('Firebase no inicializado');
        
        // Verificar cache
        if (useCache) {
            const cached = this.cache.get('sensors');
            if (cached) {
                return cached;
            }
        }
        
        try {
            const sensorsRef = this.getSensorsRef();
            const snapshot = await get(sensorsRef);
            const data = snapshot.val();
            
            if (data) {
                const validated = this.validateSensorData(data);
                this.cache.set('sensors', validated);
                return validated;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Error obteniendo datos de sensores:', error);
            throw error;
        }
    },
    
    /**
     * Escuchar cambios en sensores en tiempo real
     */
    onSensorData(callback, options = {}) {
        if (!database) {
            console.error('❌ Firebase no inicializado');
            return null;
        }
        
        const { useCache = true, errorHandler = null } = options;
        
        // Si hay cache, llamar inmediatamente
        if (useCache) {
            const cached = this.cache.get('sensors');
            if (cached) {
                callback(cached);
            }
        }
        
        const sensorsRef = this.getSensorsRef();
        
        const unsubscribe = onValue(sensorsRef, (snapshot) => {
            try {
                const data = snapshot.val();
                if (data) {
                    const validated = this.validateSensorData(data);
                    if (validated) {
                        this.cache.set('sensors', validated);
                        callback(validated);
                    }
                } else {
                    callback(null);
                }
            } catch (error) {
                console.error('❌ Error procesando datos de sensores:', error);
                if (errorHandler) errorHandler(error);
            }
        }, (error) => {
            console.error('❌ Error en listener de sensores:', error);
            if (errorHandler) errorHandler(error);
        });
        
        return unsubscribe;
    },
    
    /**
     * Validar datos de sensores
     */
    validateSensorData(data) {
        if (!data || typeof data !== 'object') return null;
        
        const validated = {};
        
        // Temperatura
        if (data.temperature !== undefined && data.temperature !== null) {
            const temp = parseFloat(data.temperature);
            if (!isNaN(temp) && temp >= -20 && temp <= 60) {
                validated.temperature = temp;
            }
        }
        
        // Humedad
        if (data.humidity !== undefined && data.humidity !== null) {
            const hum = parseFloat(data.humidity);
            if (!isNaN(hum) && hum >= 0 && hum <= 100) {
                validated.humidity = hum;
            }
        }
        
        // Gas
        if (data.gas !== undefined && data.gas !== null) {
            const gas = parseFloat(data.gas);
            if (!isNaN(gas) && gas >= 0) {
                validated.gas = gas;
            }
        }
        
        // Puerta
        if (data.door !== undefined && data.door !== null) {
            validated.door = data.door === 1 || data.door === true ? 1 : 0;
        }
        
        // Timestamp
        validated.timestamp = data.timestamp || Date.now();
        
        return validated;
    },
    
    // ========== ESCRITURA DE DATOS ==========
    
    /**
     * Guardar datos de sensores
     */
    async setSensorData(data) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            // Validar datos
            const validated = this.validateSensorData(data);
            if (!validated) {
                throw new Error('Datos de sensores inválidos');
            }
            
            // Agregar timestamp si no tiene
            if (!validated.timestamp) {
                validated.timestamp = Date.now();
            }
            
            // Si está offline, guardar en cola
            if (!this.isConnected) {
                this.cache.addPendingWrite('sensors', validated);
                return { success: true, pending: true };
            }
            
            const sensorsRef = this.getSensorsRef();
            
            // Guardar en Firebase
            await update(sensorsRef, validated);
            
            // Guardar en histórico
            await this.saveHistory(validated);
            
            // Actualizar cache
            const currentCache = this.cache.get('sensors') || {};
            this.cache.set('sensors', { ...currentCache, ...validated });
            
            return { success: true, data: validated };
            
        } catch (error) {
            console.error('❌ Error guardando datos de sensores:', error);
            throw error;
        }
    },
    
    /**
     * Guardar en histórico
     */
    async saveHistory(data) {
        if (!database) return;
        
        try {
            const historyRef = this.getHistoryRef();
            const newRef = push(historyRef);
            await set(newRef, {
                ...data,
                timestamp: data.timestamp || Date.now()
            });
            
            // Limitar histórico (mantener últimos 1000 registros)
            await this.cleanHistory(1000);
            
        } catch (error) {
            console.warn('⚠️ Error guardando en histórico:', error);
        }
    },
    
    /**
     * Limpiar histórico antiguo
     */
    async cleanHistory(limit = 1000) {
        if (!database) return;
        
        try {
            const historyRef = this.getHistoryRef();
            const q = query(historyRef, orderByChild('timestamp'), limitToLast(limit + 1));
            const snapshot = await get(q);
            const data = snapshot.val();
            
            if (data) {
                const keys = Object.keys(data);
                if (keys.length > limit) {
                    const keysToRemove = keys.slice(0, keys.length - limit);
                    const updates = {};
                    keysToRemove.forEach(key => {
                        const refToRemove = ref(database, `history/${key}`);
                        updates[`history/${key}`] = null;
                    });
                    
                    // Ejecutar eliminación en batch
                    await update(ref(database), updates);
                }
            }
        } catch (error) {
            console.warn('⚠️ Error limpiando histórico:', error);
        }
    },
    
    /**
     * Obtener histórico
     */
    async getHistory(limit = 20, orderBy = 'timestamp') {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const historyRef = this.getHistoryRef();
            const q = query(historyRef, orderByChild(orderBy), limitToLast(limit));
            const snapshot = await get(q);
            const data = snapshot.val();
            
            if (!data) return [];
            
            const entries = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
            
            // Ordenar por timestamp descendente
            return entries.sort((a, b) => b.timestamp - a.timestamp);
            
        } catch (error) {
            console.error('❌ Error obteniendo histórico:', error);
            throw error;
        }
    },
    
    // ========== ALERTAS ==========
    
    /**
     * Escuchar alertas en tiempo real
     */
    onAlerts(callback, options = {}) {
        if (!database) {
            console.error('❌ Firebase no inicializado');
            return null;
        }
        
        const { limit = 10, errorHandler = null } = options;
        
        const alertsRef = this.getAlertsRef();
        const q = query(alertsRef, orderByChild('timestamp'), limitToLast(limit));
        
        const unsubscribe = onValue(q, (snapshot) => {
            try {
                const alerts = [];
                snapshot.forEach((child) => {
                    const alert = child.val();
                    if (alert) {
                        alerts.push({
                            id: child.key,
                            ...alert
                        });
                    }
                });
                callback(alerts.reverse());
            } catch (error) {
                console.error('❌ Error procesando alertas:', error);
                if (errorHandler) errorHandler(error);
            }
        }, (error) => {
            console.error('❌ Error en listener de alertas:', error);
            if (errorHandler) errorHandler(error);
        });
        
        return unsubscribe;
    },
    
    /**
     * Guardar una alerta
     */
    async saveAlert(alertData) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            // Validar datos
            const validated = {
                type: this.validateAlertType(alertData.type),
                title: this.sanitizeString(alertData.title || 'Alerta'),
                message: this.sanitizeString(alertData.message || ''),
                timestamp: Date.now(),
                read: false
            };
            
            // Si está offline, guardar en cola
            if (!this.isConnected) {
                this.cache.addPendingWrite('alerts', validated);
                return { success: true, pending: true };
            }
            
            const alertsRef = this.getAlertsRef();
            const newRef = push(alertsRef);
            await set(newRef, validated);
            
            return { success: true, id: newRef.key, data: validated };
            
        } catch (error) {
            console.error('❌ Error guardando alerta:', error);
            throw error;
        }
    },
    
    validateAlertType(type) {
        const validTypes = ['danger', 'warning', 'info', 'success'];
        return validTypes.includes(type) ? type : 'info';
    },
    
    sanitizeString(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Marcar alerta como leída
     */
    async markAlertAsRead(alertId) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const alertRef = ref(database, `alerts/${alertId}`);
            await update(alertRef, { read: true });
            return { success: true };
        } catch (error) {
            console.error('❌ Error marcando alerta como leída:', error);
            throw error;
        }
    },
    
    /**
     * Eliminar alerta
     */
    async deleteAlert(alertId) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const alertRef = ref(database, `alerts/${alertId}`);
            await remove(alertRef);
            return { success: true };
        } catch (error) {
            console.error('❌ Error eliminando alerta:', error);
            throw error;
        }
    },
    
    /**
     * Limpiar todas las alertas
     */
    async clearAllAlerts() {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const alertsRef = this.getAlertsRef();
            await remove(alertsRef);
            return { success: true };
        } catch (error) {
            console.error('❌ Error limpiando alertas:', error);
            throw error;
        }
    },
    
    // ========== OPERACIONES AVANZADAS ==========
    
    /**
     * Transacción para datos de sensores
     */
    async transactionSensorData(updateFunction) {
        if (!database) throw new Error('Firebase no inicializado');
        
        const sensorsRef = this.getSensorsRef();
        
        try {
            const result = await runTransaction(sensorsRef, (currentData) => {
                return updateFunction(currentData || {});
            });
            
            if (result.committed) {
                const validated = this.validateSensorData(result.snapshot.val());
                if (validated) {
                    this.cache.set('sensors', validated);
                }
                return result.snapshot.val();
            } else {
                throw new Error('Transacción abortada');
            }
        } catch (error) {
            console.error('❌ Error en transacción:', error);
            throw error;
        }
    },
    
    /**
     * Operación en batch (múltiples escrituras)
     */
    async batchWrite(operations) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const updates = {};
            
            operations.forEach(op => {
                const { path, data } = op;
                updates[path] = data;
            });
            
            const rootRef = ref(database);
            await update(rootRef, updates);
            return { success: true };
        } catch (error) {
            console.error('❌ Error en batch write:', error);
            throw error;
        }
    },
    
    /**
     * Escribir datos en cualquier ruta
     */
    async setData(path, data) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const pathRef = ref(database, path);
            await set(pathRef, data);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error escribiendo en ${path}:`, error);
            throw error;
        }
    },
    
    /**
     * Actualizar datos en cualquier ruta
     */
    async updateData(path, data) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const pathRef = ref(database, path);
            await update(pathRef, data);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error actualizando ${path}:`, error);
            throw error;
        }
    },
    
    /**
     * Eliminar datos en cualquier ruta
     */
    async deleteData(path) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const pathRef = ref(database, path);
            await remove(pathRef);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error eliminando ${path}:`, error);
            throw error;
        }
    },
    
    /**
     * Obtener datos de cualquier ruta
     */
    async getData(path) {
        if (!database) throw new Error('Firebase no inicializado');
        
        try {
            const pathRef = ref(database, path);
            const snapshot = await get(pathRef);
            return snapshot.val();
        } catch (error) {
            console.error(`❌ Error obteniendo ${path}:`, error);
            throw error;
        }
    },
    
    /**
     * Procesar escrituras pendientes
     */
    async processPendingWrites() {
        return await this.cache.processPendingWrites();
    },
    
    /**
     * Limpiar cache
     */
    clearCache() {
        this.cache.clear();
    },
    
    // ========== LIMPIEZA ==========
    
    /**
     * Desconectar y limpiar listeners
     */
    cleanup() {
        // No hay una función directa para limpiar todos los listeners en la API modular
        // Los listeners se limpian con las funciones unsubscribe devueltas
        console.log('🧹 Firebase cleanup: los listeners deben limpiarse individualmente');
    }
};

// ========== CONFIGURACIÓN INICIAL ==========
if (isInitialized) {
    // Verificar conexión inicial
    FirebaseService.checkConnection().then(connected => {
        FirebaseService.isConnected = connected;
        console.log(`📡 Estado de conexión: ${connected ? 'Conectado' : 'Desconectado'}`);
        
        if (!connected) {
            setTimeout(() => {
                FirebaseService.reconnect();
            }, 3000);
        }
    });
    
    // Configurar manejo offline
    FirebaseService.setupOfflineHandlers();
}

// ========== EXPORTAR ==========
export { 
    FirebaseService,
    firebaseCache,
    // Exportar funciones base para uso directo
    database,
    ref,
    onValue,
    push,
    set,
    update,
    remove,
    query,
    limitToLast,
    orderByChild,
    once,
    get,
    child,
    runTransaction
};

// Para uso global
if (typeof window !== 'undefined') {
    window.FirebaseService = FirebaseService;
    window.firebaseCache = firebaseCache;
}

console.log('📦 Firebase Modular Service inicializado correctamente');