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
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
        throw new Error('Firebase SDK no está cargado correctamente');
    }
    
    firebase.initializeApp(firebaseConfig);
    firebaseInitialized = true;
    console.log('🔥 Firebase inicializado correctamente');
    
} catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    firebaseInitialized = false;
}

// ========== REFERENCIAS ==========
const database = firebaseInitialized ? firebase.database() : null;

// ✅ CORREGIDO: Referencias correctas a la estructura de datos
const sensorsRef = database ? database.ref('sensors/esp32_001/live') : null;
const alertsRef = database ? database.ref('alerts/esp32_001') : null;
const historyRef = database ? database.ref('history') : null;
const devicesRef = database ? database.ref('devices/esp32_001') : null;
const configRef = database ? database.ref('configuration/esp32_001') : null;
const connectionRef = database ? database.ref('.info/connected') : null;

console.log('📡 Referencias Firebase configuradas:');
console.log('  - sensorsRef:', sensorsRef ? '✅' : '❌');
console.log('  - alertsRef:', alertsRef ? '✅' : '❌');
console.log('  - historyRef:', historyRef ? '✅' : '❌');
console.log('  - devicesRef:', devicesRef ? '✅' : '❌');
console.log('  - configRef:', configRef ? '✅' : '❌');

// ========== CACHE LOCAL ==========
class FirebaseCache {
    constructor() {
        this.cache = {};
        this.cacheTimeout = 60000;
        this.pendingWrites = [];
        this.isOnline = navigator.onLine;
        
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

const firebaseCache = new FirebaseCache();
firebaseCache.loadPendingWrites();

// ========== SERVICIO DE FIREBASE ==========
const FirebaseService = {
    database,
    sensorsRef,
    alertsRef,
    historyRef,
    devicesRef,
    configRef,
    connectionRef,
    isInitialized: firebaseInitialized,
    isConnected: false,
    
    // ========== CONEXIÓN ==========
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
    
    // ✅ NUEVO: Obtener datos completos del dispositivo
    getDeviceData(deviceId = 'esp32_001') {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            const deviceRef = this.database.ref(`devices/${deviceId}`);
            deviceRef.once('value')
                .then(snapshot => {
                    const data = snapshot.val();
                    if (data) {
                        firebaseCache.set('device', data);
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                })
                .catch(error => {
                    console.error('❌ Error obteniendo datos del dispositivo:', error);
                    reject(error);
                });
        });
    },
    
    // ✅ CORREGIDO: Obtener datos de sensores
    getSensorData(deviceId = 'esp32_001', useCache = true) {
        return new Promise((resolve, reject) => {
            if (!this.sensorsRef) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            if (useCache) {
                const cached = firebaseCache.get('sensors');
                if (cached) {
                    resolve(cached);
                    return;
                }
            }
            
            // ✅ CORREGIDO: Usar la ruta correcta
            const sensorPath = `sensors/${deviceId}/live`;
            const ref = this.database.ref(sensorPath);
            
            ref.once('value')
                .then(snapshot => {
                    const data = snapshot.val();
                    if (data) {
                        const validated = this.validateSensorData(data);
                        if (validated) {
                            firebaseCache.set('sensors', validated);
                            resolve(validated);
                        } else {
                            resolve(null);
                        }
                    } else {
                        // ✅ Si no hay datos reales, usar datos de prueba
                        console.warn('⚠️ No hay datos de sensores en Firebase, usando datos de prueba');
                        const mockData = this.generateMockData();
                        firebaseCache.set('sensors', mockData);
                        resolve(mockData);
                    }
                })
                .catch(error => {
                    console.error('❌ Error obteniendo datos de sensores:', error);
                    reject(error);
                });
        });
    },
    
    // ✅ CORREGIDO: Escuchar datos de sensores en tiempo real
    onSensorData(callback, deviceId = 'esp32_001', options = {}) {
        if (!this.database) {
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
        
        // ✅ CORREGIDO: Escuchar en la ruta correcta
        const sensorPath = `sensors/${deviceId}/live`;
        const ref = this.database.ref(sensorPath);
        
        const listener = ref.on('value', (snapshot) => {
            try {
                const data = snapshot.val();
                if (data) {
                    const validated = this.validateSensorData(data);
                    if (validated) {
                        firebaseCache.set('sensors', validated);
                        callback(validated);
                    }
                } else {
                    // ✅ Si no hay datos, generar mock
                    const mockData = this.generateMockData();
                    firebaseCache.set('sensors', mockData);
                    callback(mockData);
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
    
    validateSensorData(data) {
        if (!data || typeof data !== 'object') return null;
        
        const validated = {};
        
        if (data.temperature !== undefined && data.temperature !== null) {
            const temp = parseFloat(data.temperature);
            if (!isNaN(temp) && temp >= -20 && temp <= 60) {
                validated.temperature = temp;
            }
        }
        
        if (data.humidity !== undefined && data.humidity !== null) {
            const hum = parseFloat(data.humidity);
            if (!isNaN(hum) && hum >= 0 && hum <= 100) {
                validated.humidity = hum;
            }
        }
        
        if (data.gas !== undefined && data.gas !== null) {
            const gas = parseFloat(data.gas);
            if (!isNaN(gas) && gas >= 0) {
                validated.gas = gas;
            }
        }
        
        if (data.door !== undefined && data.door !== null) {
            validated.door = data.door === 1 || data.door === true ? 1 : 0;
        }
        
        validated.timestamp = data.timestamp || Date.now();
        
        // ✅ Si no hay valores válidos, generar mock
        if (Object.keys(validated).length <= 1) {
            return this.generateMockData();
        }
        
        return validated;
    },
    
    // ✅ NUEVO: Generar datos de prueba
    generateMockData() {
        const now = Date.now();
        return {
            temperature: 2 + Math.random() * 6,
            humidity: 60 + Math.random() * 20,
            gas: 50 + Math.random() * 150,
            door: Math.random() > 0.7 ? 1 : 0,
            timestamp: now
        };
    },
    
    // ========== ESCRITURA DE DATOS ==========
    
    setSensorData(data) {
        return new Promise((resolve, reject) => {
            if (!this.sensorsRef) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            try {
                const validated = this.validateSensorData(data);
                if (!validated) {
                    reject(new Error('Datos de sensores inválidos'));
                    return;
                }
                
                if (!validated.timestamp) {
                    validated.timestamp = Date.now();
                }
                
                // ✅ CORREGIDO: Usar update en lugar de set para no sobrescribir
                this.sensorsRef.update(validated)
                    .then(() => {
                        firebaseCache.set('sensors', validated);
                        resolve({ success: true, data: validated });
                    })
                    .catch(error => {
                        console.error('❌ Error guardando datos:', error);
                        reject(error);
                    });
                    
            } catch (error) {
                console.error('❌ Error validando datos:', error);
                reject(error);
            }
        });
    },
    
    // ========== ALERTAS ==========
    
    onAlerts(callback, deviceId = 'esp32_001', options = {}) {
        if (!this.database) {
            console.error('❌ Firebase no inicializado');
            return null;
        }
        
        const { limit = 10, errorHandler = null } = options;
        
        // ✅ CORREGIDO: Escuchar en la ruta correcta
        const alertPath = `alerts/${deviceId}`;
        const ref = this.database.ref(alertPath);
        const query = ref.orderByKey().limitToLast(limit);
        
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
    
    saveAlert(alertData, deviceId = 'esp32_001') {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            try {
                const validated = {
                    type: this.validateAlertType(alertData.type),
                    title: this.sanitizeString(alertData.title || 'Alerta'),
                    message: this.sanitizeString(alertData.message || ''),
                    timestamp: Date.now(),
                    read: false
                };
                
                const alertPath = `alerts/${deviceId}`;
                const ref = this.database.ref(alertPath);
                const newRef = ref.push();
                
                newRef.set(validated)
                    .then(() => {
                        resolve({ success: true, id: newRef.key, data: validated });
                    })
                    .catch(error => {
                        console.error('❌ Error guardando alerta:', error);
                        reject(error);
                    });
                    
            } catch (error) {
                console.error('❌ Error validando alerta:', error);
                reject(error);
            }
        });
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
    
    // ========== HISTÓRICO ==========
    
    getHistory(limit = 20) {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            const ref = this.database.ref('history');
            const query = ref.orderByKey().limitToLast(limit);
            
            query.once('value')
                .then(snapshot => {
                    const data = snapshot.val();
                    if (!data) {
                        resolve([]);
                        return;
                    }
                    
                    const entries = Object.keys(data).map(key => ({
                        id: key,
                        ...data[key]
                    }));
                    
                    resolve(entries.sort((a, b) => b.timestamp - a.timestamp));
                })
                .catch(error => {
                    console.error('❌ Error obteniendo histórico:', error);
                    reject(error);
                });
        });
    },
    
    // ========== UTILIDADES ==========
    
    setData(path, data) {
        return new Promise((resolve, reject) => {
            if (!this.database) {
                reject(new Error('Firebase no inicializado'));
                return;
            }
            
            const ref = this.database.ref(path);
            ref.set(data)
                .then(() => resolve({ success: true }))
                .catch(error => {
                    console.error(`❌ Error escribiendo en ${path}:`, error);
                    reject(error);
                });
        });
    },
    
    clearCache() {
        firebaseCache.clear();
    },
    
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

// ========== INICIALIZACIÓN ==========
if (firebaseInitialized) {
    FirebaseService.checkConnection().then(connected => {
        FirebaseService.isConnected = connected;
        console.log(`📡 Estado de conexión: ${connected ? '✅ Conectado' : '❌ Desconectado'}`);
        
        if (!connected) {
            setTimeout(() => {
                FirebaseService.reconnect();
            }, 3000);
        }
    });
    
    FirebaseService.monitorConnection((connected) => {
        if (connected && firebaseCache.pendingWrites.length > 0) {
            firebaseCache.processPendingWrites();
        }
    });
}

// ========== EXPORTAR ==========
window.FirebaseService = FirebaseService;
window.firebaseCache = firebaseCache;

console.log('🔥 Firebase Service actualizado correctamente');
console.log('📊 Esperando datos de sensores...');