// ========== FIREBASE CONFIGURATION ==========
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
let firebaseInitialized = false;
let retryCount = 0;
const maxRetries = 3;

try {
    // Verificar que Firebase está disponible
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
        throw new Error('Firebase SDK no está cargado correctamente');
    }
    
    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    firebaseInitialized = true;
    console.log('🔥 Firebase inicializado correctamente');
    
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    firebaseInitialized = false;
}

// ========== REFERENCIAS ==========
const database = firebaseInitialized ? firebase.database() : null;
const sensorsRef = database ? database.ref('sensors') : null;
const alertsRef = database ? database.ref('alerts') : null;
const historyRef = database ? database.ref('history') : null;
const connectionRef = database ? database.ref('.info/connected') : null;

// ========== CACHE LOCAL ==========
class FirebaseCache {
    constructor() {
        this.cache = {};
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
        const cached = this.cache[key];
        if (!cached) return null;
        
        // Verificar si el cache ha expirado
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            delete this.cache[key];
            return null;
        }
        
        return cached.data;
    }
    
    set(key, data) {
        this.cache[key] = {
            data: data,
            timestamp: Date.now()
        };
    }
    
    clear() {
        this.cache = {};
    }
    
    addPendingWrite(path, data) {
        this.pendingWrites.push({
            path,
            data,
            timestamp: Date.now(),
            id: Date.now() + Math.random()
        });
        this.savePendingWrites();
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
            localStorage.setItem('firebase_pending_writes', JSON.stringify(this.pendingWrites));
        } catch (error) {
            console.warn('⚠️ No se pudieron guardar escrituras pendientes:', error);
        }
    }
    
    loadPendingWrites() {
        try {
            const stored = localStorage.getItem('firebase_pending_writes');
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
    }
}

// Inicializar cache
const firebaseCache = new FirebaseCache();

// Cargar escrituras pendientes
firebaseCache.loadPendingWrites();

// ========== SERVICIO DE FIREBASE ==========
const FirebaseService = {
    // ========== PROPIEDADES ==========
    database,
    sensorsRef,
    alertsRef,
    historyRef,
    connectionRef,
    isInitialized: firebaseInitialized,
    isConnected: false,
    
    // ========== CONEXIÓN ==========
    
    /**
     * Verificar el estado de la conexión
     */
    checkConnection() {
        return new Promise((resolve) => {
            if (!this.connectionRef) {
                resolve(false);
                return;
            }
            
            this.connectionRef.once('value')
                .then(snapshot => {
                    const connected = snapshot.val() === true;
                    this.isConnected = connected;
                    resolve(connected);
                })
                .catch(() => {
                    this.isConnected = false;
                    resolve(false);
                });
        });
    },
    
    /**
     * Monitorear el estado de la conexión en tiempo real
     */
    monitorConnection(callback) {
        if (!this.connectionRef) {
            if (callback) callback(false);
            return null;
        }
        
        const listener = this.connectionRef.on('value', (snapshot) => {
            const connected = snapshot.val() === true;
            this.isConnected = connected;
            if (callback) callback(connected);
        });
        
        return listener;
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
    
    // ========== LECTURA DE DATOS ==========
    
    /**
     * Obtener datos de sensores con cache
     */
    getSensorData(useCache = true) {
        return new Promise((resolve, reject) => {
            if (!this.sensorsRef) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            // Verificar cache
            if (useCache) {
                const cached = firebaseCache.get('sensors');
                if (cached) {
                    resolve(cached);
                    return;
                }
            }
            
            this.sensorsRef.once('value')
                .then(snapshot => {
                    const data = snapshot.val();
                    if (data) {
                        firebaseCache.set('sensors', data);
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                })
                .catch(error => {
                    console.error('❌ Error obteniendo datos de sensores:', error);
                    reject(error);
                });
        });
    },
    
    /**
     * Escuchar cambios en sensores en tiempo real
     */
    onSensorData(callback, options = {}) {
        if (!this.sensorsRef) {
            console.error('❌ Firebase no inicializado');
            return null;
        }
        
        const { useCache = true, errorHandler = null } = options;
        
        // Si hay cache, llamar inmediatamente
        if (useCache) {
            const cached = firebaseCache.get('sensors');
            if (cached) {
                callback(cached);
            }
        }
        
        const listener = this.sensorsRef.on('value', (snapshot) => {
            try {
                const data = snapshot.val();
                if (data) {
                    // Validar datos
                    const validatedData = this.validateSensorData(data);
                    if (validatedData) {
                        firebaseCache.set('sensors', validatedData);
                        callback(validatedData);
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
        
        return listener;
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
        if (!this.sensorsRef) {
            throw new Error('Firebase no inicializado');
        }
        
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
                firebaseCache.addPendingWrite('sensors', validated);
                return { success: true, pending: true };
            }
            
            // Guardar en Firebase
            await this.sensorsRef.update(validated);
            
            // Guardar en histórico
            await this.saveHistory(validated);
            
            // Actualizar cache
            const currentCache = firebaseCache.get('sensors') || {};
            firebaseCache.set('sensors', { ...currentCache, ...validated });
            
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
        if (!this.historyRef) return;
        
        try {
            const historyEntry = {
                ...data,
                timestamp: data.timestamp || Date.now()
            };
            
            const newRef = this.historyRef.push();
            await newRef.set(historyEntry);
            
            // Limitar histórico (mantener últimos 1000 registros)
            this.cleanHistory(1000);
            
        } catch (error) {
            console.warn('⚠️ Error guardando en histórico:', error);
            // No falla la operación principal si el histórico falla
        }
    },
    
    /**
     * Limpiar histórico antiguo
     */
    async cleanHistory(limit = 1000) {
        if (!this.historyRef) return;
        
        try {
            const snapshot = await this.historyRef.orderByKey().limitToLast(limit + 1).once('value');
            const data = snapshot.val();
            
            if (data) {
                const keys = Object.keys(data);
                if (keys.length > limit) {
                    const keysToRemove = keys.slice(0, keys.length - limit);
                    const updates = {};
                    keysToRemove.forEach(key => {
                        updates[key] = null;
                    });
                    await this.historyRef.update(updates);
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
        if (!this.historyRef) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            let query = this.historyRef.orderByChild(orderBy);
            if (limit) {
                query = query.limitToLast(limit);
            }
            
            const snapshot = await query.once('value');
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
        if (!this.alertsRef) {
            console.error('❌ Firebase no inicializado');
            return null;
        }
        
        const { limit = 10, errorHandler = null } = options;
        
        const query = this.alertsRef
            .orderByChild('timestamp')
            .limitToLast(limit);
        
        const listener = query.on('value', (snapshot) => {
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
        
        return listener;
    },
    
    /**
     * Guardar una alerta
     */
    async saveAlert(alertData) {
        if (!this.alertsRef) {
            throw new Error('Firebase no inicializado');
        }
        
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
                firebaseCache.addPendingWrite('alerts', validated);
                return { success: true, pending: true };
            }
            
            const newRef = this.alertsRef.push();
            await newRef.set(validated);
            
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
        if (!this.alertsRef) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            await this.alertsRef.child(alertId).update({
                read: true
            });
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
        if (!this.alertsRef) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            await this.alertsRef.child(alertId).remove();
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
        if (!this.alertsRef) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            await this.alertsRef.remove();
            return { success: true };
        } catch (error) {
            console.error('❌ Error limpiando alertas:', error);
            throw error;
        }
    },
    
    // ========== UTILIDADES ==========
    
    /**
     * Escribir datos en cualquier ruta
     */
    async setData(path, data) {
        if (!this.database) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            const ref = this.database.ref(path);
            await ref.set(data);
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
        if (!this.database) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            const ref = this.database.ref(path);
            await ref.update(data);
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
        if (!this.database) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            const ref = this.database.ref(path);
            await ref.remove();
            return { success: true };
        } catch (error) {
            console.error(`❌ Error eliminando ${path}:`, error);
            throw error;
        }
    },
    
    /**
     * Procesar escrituras pendientes
     */
    async processPendingWrites() {
        return await firebaseCache.processPendingWrites();
    },
    
    /**
     * Limpiar cache
     */
    clearCache() {
        firebaseCache.clear();
    },
    
    // ========== TRANSACCIONES ==========
    
    /**
     * Transacción para datos de sensores
     */
    async transactionSensorData(updateFunction) {
        if (!this.sensorsRef) {
            throw new Error('Firebase no inicializado');
        }
        
        return new Promise((resolve, reject) => {
            this.sensorsRef.transaction((currentData) => {
                // Aplicar función de actualización
                return updateFunction(currentData || {});
            }, (error, committed, snapshot) => {
                if (error) {
                    reject(error);
                } else if (committed) {
                    resolve(snapshot.val());
                } else {
                    reject(new Error('Transacción abortada'));
                }
            });
        });
    },
    
    // ========== DATOS EN BATCH ==========
    
    /**
     * Operación en batch (múltiples escrituras)
     */
    async batchWrite(operations) {
        if (!this.database) {
            throw new Error('Firebase no inicializado');
        }
        
        try {
            const updates = {};
            
            operations.forEach(op => {
                const { path, data } = op;
                updates[path] = data;
            });
            
            await this.database.ref().update(updates);
            return { success: true };
        } catch (error) {
            console.error('❌ Error en batch write:', error);
            throw error;
        }
    },
    
    // ========== LIMPIEZA ==========
    
    /**
     * Desconectar y limpiar listeners
     */
    cleanup() {
        if (this.sensorsRef) {
            this.sensorsRef.off();
        }
        if (this.alertsRef) {
            this.alertsRef.off();
        }
        if (this.connectionRef) {
            this.connectionRef.off();
        }
        console.log('🧹 Firebase cleanup realizado');
    }
};

// ========== VERIFICACIÓN INICIAL ==========
if (firebaseInitialized) {
    // Verificar conexión inicial
    FirebaseService.checkConnection().then(connected => {
        FirebaseService.isConnected = connected;
        console.log(`📡 Estado de conexión: ${connected ? 'Conectado' : 'Desconectado'}`);
        
        // Si está desconectado, intentar reconectar
        if (!connected) {
            setTimeout(() => {
                FirebaseService.reconnect();
            }, 3000);
        }
    });
    
    // Monitorear conexión
    FirebaseService.monitorConnection((connected) => {
        if (connected && firebaseCache.pendingWrites.length > 0) {
            firebaseCache.processPendingWrites();
        }
    });
}

// ========== EXPORTAR ==========
// Para uso global
window.FirebaseService = FirebaseService;
window.firebaseCache = firebaseCache;

// Para módulos ES
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FirebaseService, firebaseCache };
}

console.log('🔥 Firebase Service inicializado correctamente');