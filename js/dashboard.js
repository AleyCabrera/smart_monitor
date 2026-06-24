// ========== DASHBOARD CONTROLLER ==========
class DashboardController {
    constructor() {
        this.data = {
            temperature: null,
            humidity: null,
            gas: null,
            door: null,
            timestamp: null
        };
        
        this.alerts = [];
        this.isInitialized = false;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.alertCooldown = {}; // Para prevenir spam de alertas
        this.listeners = []; // Para limpiar listeners
        
        // Bind de métodos para evitar pérdida de contexto
        this.handleSensorData = this.handleSensorData.bind(this);
        this.handleAlerts = this.handleAlerts.bind(this);
        
        this.init();
    }
    
    init() {
        try {
            // Inicializar UI
            this.updateClock();
            this.clockInterval = setInterval(() => this.updateClock(), 1000);
            
            // Configurar listeners de Firebase con manejo de errores
            this.setupFirebaseListeners();
            
            // Configurar UI
            this.setupNavigation();
            this.setupMenuToggle();
            this.setupChartButtons();
            this.setupClearAlerts();
            this.setupRetryConnection();
            
            // Ocultar loading screen
            this.hideLoadingScreen();
            
            this.isInitialized = true;
            console.log('✅ Dashboard inicializado correctamente');
            
            // Verificar conexión inicial
            this.checkConnection();
            
        } catch (error) {
            console.error('❌ Error inicializando dashboard:', error);
            this.showError('Error al inicializar el sistema. Por favor, recarga la página.');
        }
    }
    
    setupFirebaseListeners() {
        // Verificar que FirebaseService existe
        if (typeof FirebaseService === 'undefined') {
            console.error('❌ FirebaseService no está definido');
            this.showError('Error de conexión con Firebase');
            return;
        }
        
        try {
            // Escuchar datos de sensores con manejo de errores
            const sensorListener = FirebaseService.onSensorData(this.handleSensorData);
            if (sensorListener) this.listeners.push(sensorListener);
            
            // Escuchar alertas con manejo de errores
            const alertsListener = FirebaseService.onAlerts(this.handleAlerts);
            if (alertsListener) this.listeners.push(alertsListener);
            
            // Monitorear estado de conexión
            this.monitorConnection();
            
        } catch (error) {
            console.error('❌ Error configurando listeners:', error);
            this.handleConnectionError();
        }
    }
    
    handleSensorData(data) {
        try {
            // Validar datos
            if (!data || typeof data !== 'object') {
                console.warn('⚠️ Datos inválidos recibidos:', data);
                return;
            }
            
            // Actualizar datos con validación
            this.data = {
                temperature: this.validateNumber(data.temperature, -10, 50),
                humidity: this.validateNumber(data.humidity, 0, 100),
                gas: this.validateNumber(data.gas, 0, 1000),
                door: this.validateDoor(data.door),
                timestamp: data.timestamp || Date.now()
            };
            
            // Actualizar UI
            this.updateKPIs();
            this.updateChamber();
            
            // Actualizar gráficos
            if (window.chartManager) {
                window.chartManager.addDataPoint(this.data);
            }
            
            // Verificar alertas
            this.checkAlerts();
            
            // Actualizar estado de conexión
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.retryCount = 0;
            
        } catch (error) {
            console.error('❌ Error procesando datos:', error);
        }
    }
    
    handleAlerts(alerts) {
        try {
            if (!alerts || !Array.isArray(alerts)) {
                console.warn('⚠️ Alertas inválidas recibidas:', alerts);
                return;
            }
            
            this.alerts = alerts;
            this.renderAlerts();
            
            // Actualizar badge
            this.updateAlertBadge();
            
        } catch (error) {
            console.error('❌ Error procesando alertas:', error);
        }
    }
    
    // ========== VALIDACIÓN DE DATOS ==========
    validateNumber(value, min, max) {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        if (isNaN(num)) return null;
        return Math.max(min, Math.min(max, num));
    }
    
    validateDoor(value) {
        if (value === null || value === undefined) return null;
        return value === 1 || value === true ? 1 : 0;
    }
    
    // ========== CONEXIÓN Y ESTADO ==========
    monitorConnection() {
        // Verificar conexión cada 30 segundos
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 30000);
    }
    
    checkConnection() {
        try {
            const db = FirebaseService.database;
            if (!db) {
                this.handleConnectionError();
                return;
            }
            
            // Prueba de conexión
            db.ref('.info/connected').once('value')
                .then(snapshot => {
                    const connected = snapshot.val() === true;
                    this.isConnected = connected;
                    this.updateConnectionStatus(connected);
                    
                    if (!connected) {
                        this.handleConnectionError();
                    }
                })
                .catch(() => {
                    this.handleConnectionError();
                });
                
        } catch (error) {
            this.handleConnectionError();
        }
    }
    
    handleConnectionError() {
        this.isConnected = false;
        this.updateConnectionStatus(false);
        
        // Intentar reconectar
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`🔄 Intentando reconectar... (${this.retryCount}/${this.maxRetries})`);
            
            setTimeout(() => {
                this.checkConnection();
            }, 5000 * this.retryCount);
            
        } else {
            this.showError('⚠️ Error de conexión persistente. Verifica tu conexión a internet.');
        }
    }
    
    setupRetryConnection() {
        // Botón para reconectar manualmente
        const retryBtn = document.getElementById('retryConnection');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.retryCount = 0;
                this.checkConnection();
            });
        }
    }
    
    updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-indicator span:last-child');
        
        if (statusDot) {
            statusDot.className = `status-dot ${connected ? 'online' : 'offline'}`;
        }
        
        if (statusText) {
            statusText.textContent = connected ? 'Sistema Online' : '⚠️ Sin conexión';
            statusText.style.color = connected ? 'rgba(255,255,255,0.7)' : 'var(--danger)';
        }
        
        // Mostrar/ocultar mensaje de error
        const errorMsg = document.getElementById('connectionError');
        if (errorMsg) {
            errorMsg.style.display = connected ? 'none' : 'block';
        }
    }
    
    // ========== UI UPDATES ==========
    updateClock() {
        try {
            const now = new Date();
            const options = { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            const datetimeEl = document.getElementById('datetime');
            if (datetimeEl) {
                const span = datetimeEl.querySelector('span');
                if (span) {
                    span.textContent = now.toLocaleDateString('es-ES', options);
                }
            }
        } catch (error) {
            console.error('❌ Error actualizando reloj:', error);
        }
    }
    
    updateKPIs() {
        try {
            this.updateTemperatureKPI();
            this.updateHumidityKPI();
            this.updateGasKPI();
            this.updateDoorKPI();
        } catch (error) {
            console.error('❌ Error actualizando KPIs:', error);
        }
    }
    
    updateTemperatureKPI() {
        const tempEl = document.getElementById('tempValue');
        const tempStatus = document.getElementById('tempStatus');
        
        if (!tempEl || !tempStatus) return;
        
        if (this.data.temperature === null) {
            tempEl.textContent = '--';
            tempStatus.textContent = 'Esperando...';
            tempStatus.className = 'status-label';
            return;
        }
        
        const temp = this.data.temperature;
        tempEl.textContent = temp.toFixed(1);
        
        if (temp > 8) {
            tempStatus.textContent = '⚠️ Crítica';
            tempStatus.className = 'status-label danger';
        } else if (temp > 4) {
            tempStatus.textContent = '⚠️ Alta';
            tempStatus.className = 'status-label warning';
        } else if (temp < -2) {
            tempStatus.textContent = '⚠️ Baja';
            tempStatus.className = 'status-label warning';
        } else {
            tempStatus.textContent = '✅ Normal';
            tempStatus.className = 'status-label normal';
        }
    }
    
    updateHumidityKPI() {
        const humEl = document.getElementById('humidityValue');
        const humStatus = document.getElementById('humidityStatus');
        
        if (!humEl || !humStatus) return;
        
        if (this.data.humidity === null) {
            humEl.textContent = '--';
            humStatus.textContent = 'Esperando...';
            humStatus.className = 'status-label';
            return;
        }
        
        const hum = this.data.humidity;
        humEl.textContent = hum.toFixed(1);
        
        if (hum > 80) {
            humStatus.textContent = '⚠️ Alta';
            humStatus.className = 'status-label warning';
        } else if (hum < 30) {
            humStatus.textContent = '⚠️ Baja';
            humStatus.className = 'status-label warning';
        } else {
            humStatus.textContent = '✅ Normal';
            humStatus.className = 'status-label normal';
        }
    }
    
    updateGasKPI() {
        const gasEl = document.getElementById('gasValue');
        const gasStatus = document.getElementById('gasStatus');
        
        if (!gasEl || !gasStatus) return;
        
        if (this.data.gas === null) {
            gasEl.textContent = '--';
            gasStatus.textContent = 'Esperando...';
            gasStatus.className = 'status-label';
            return;
        }
        
        const gas = this.data.gas;
        gasEl.textContent = gas.toFixed(0);
        
        if (gas > 500) {
            gasStatus.textContent = '🚨 Alerta';
            gasStatus.className = 'status-label danger';
        } else if (gas > 200) {
            gasStatus.textContent = '⚠️ Atención';
            gasStatus.className = 'status-label warning';
        } else {
            gasStatus.textContent = '✅ Normal';
            gasStatus.className = 'status-label normal';
        }
    }
    
    updateDoorKPI() {
        const doorEl = document.getElementById('doorValue');
        const doorStatus = document.getElementById('doorStatus');
        
        if (!doorEl || !doorStatus) return;
        
        if (this.data.door === null) {
            doorEl.textContent = '--';
            doorStatus.textContent = 'Esperando...';
            doorStatus.className = 'status-label';
            return;
        }
        
        const isOpen = this.data.door === 1;
        doorEl.textContent = isOpen ? 'Abierta' : 'Cerrada';
        doorStatus.textContent = isOpen ? '🔴 Abierta' : '🟢 Cerrada';
        doorStatus.className = `status-label ${isOpen ? 'door-open' : 'door-closed'}`;
    }
    
    updateChamber() {
        try {
            // Actualizar puerta
            const doorPanel = document.getElementById('doorPanel');
            if (doorPanel && this.data.door !== null) {
                const isOpen = this.data.door === 1;
                doorPanel.classList.toggle('open', isOpen);
            }
            
            // Actualizar sensores en la cámara
            const tempEl = document.getElementById('chamberTemp');
            const humEl = document.getElementById('chamberHumidity');
            const gasEl = document.getElementById('chamberGas');
            
            if (tempEl) {
                tempEl.textContent = this.data.temperature !== null ? 
                    `${this.data.temperature.toFixed(1)}°C` : '--°C';
            }
            
            if (humEl) {
                humEl.textContent = this.data.humidity !== null ? 
                    `${this.data.humidity.toFixed(1)}%` : '--%';
            }
            
            if (gasEl && this.data.gas !== null) {
                const gasValue = this.data.gas;
                if (gasValue > 500) {
                    gasEl.textContent = '🚨 Peligro';
                    gasEl.style.color = 'var(--danger)';
                } else if (gasValue > 200) {
                    gasEl.textContent = '⚠️ Atención';
                    gasEl.style.color = 'var(--warning)';
                } else {
                    gasEl.textContent = '✅ Normal';
                    gasEl.style.color = 'var(--success)';
                }
            } else if (gasEl) {
                gasEl.textContent = '--';
            }
            
            // Estado de la cámara
            const chamberStatus = document.getElementById('chamberStatus');
            if (chamberStatus) {
                if (this.data.temperature === null) {
                    chamberStatus.textContent = '⏳ Cargando...';
                    chamberStatus.className = 'chamber-status';
                    return;
                }
                
                if (this.data.temperature > 8) {
                    chamberStatus.textContent = '⚠️ Alerta Temperatura';
                    chamberStatus.className = 'chamber-status danger';
                } else if (this.data.temperature > 4) {
                    chamberStatus.textContent = '⚠️ Temperatura Elevada';
                    chamberStatus.className = 'chamber-status warning';
                } else {
                    chamberStatus.textContent = '✅ Operativa';
                    chamberStatus.className = 'chamber-status';
                }
            }
            
        } catch (error) {
            console.error('❌ Error actualizando cámara:', error);
        }
    }
    
    // ========== ALERTAS ==========
    checkAlerts() {
        try {
            let hasAlert = false;
            const timestamp = Date.now();
            
            // Verificar temperatura
            if (this.data.temperature !== null && this.data.temperature > 8) {
                this.addAlert('danger', '🌡️ Temperatura crítica', 
                    `La temperatura ha alcanzado ${this.data.temperature.toFixed(1)}°C`);
                hasAlert = true;
            }
            
            // Verificar gas
            if (this.data.gas !== null) {
                if (this.data.gas > 500) {
                    this.addAlert('danger', '💨 Fuga de gas detectada', 
                        `Nivel de gas: ${this.data.gas.toFixed(0)} ppm`);
                    hasAlert = true;
                } else if (this.data.gas > 200) {
                    this.addAlert('warning', '⚠️ Nivel de gas elevado', 
                        `Nivel de gas: ${this.data.gas.toFixed(0)} ppm`);
                    hasAlert = true;
                }
            }
            
            // Verificar puerta
            if (this.data.door !== null && this.data.door === 1) {
                // Solo alertar si la puerta ha estado abierta por más de 1 minuto
                const doorOpenTime = timestamp - (this._doorOpenTime || timestamp);
                if (doorOpenTime > 60000) {
                    this.addAlert('warning', '🚪 Puerta abierta', 
                        'La puerta de la cámara lleva más de 1 minuto abierta');
                    hasAlert = true;
                }
            } else if (this.data.door === 0) {
                // Resetear tiempo cuando se cierra
                this._doorOpenTime = null;
            }
            
            // Actualizar badge
            this.updateAlertBadge();
            
        } catch (error) {
            console.error('❌ Error verificando alertas:', error);
        }
    }
    
    addAlert(type, title, message) {
        try {
            const alertKey = `${type}-${message}`;
            const now = Date.now();
            
            // Prevenir spam: misma alerta no puede repetirse en 2 minutos
            if (this.alertCooldown[alertKey] && 
                (now - this.alertCooldown[alertKey]) < 120000) {
                return;
            }
            
            this.alertCooldown[alertKey] = now;
            
            const alert = {
                id: now,
                type,
                title,
                message,
                timestamp: now,
                read: false
            };
            
            // Verificar si ya existe una alerta similar reciente
            const exists = this.alerts.some(a => 
                a.message === message && 
                (now - a.timestamp) < 120000
            );
            
            if (exists) return;
            
            this.alerts.unshift(alert); // Agregar al inicio
            
            // Mantener máximo 50 alertas
            if (this.alerts.length > 50) {
                this.alerts = this.alerts.slice(0, 50);
            }
            
            // Guardar en Firebase con manejo de errores
            try {
                FirebaseService.saveAlert({
                    type,
                    title,
                    message
                }).catch(error => {
                    console.warn('⚠️ No se pudo guardar alerta en Firebase:', error);
                });
            } catch (error) {
                console.warn('⚠️ Error guardando alerta:', error);
            }
            
            // Actualizar UI
            this.renderAlerts();
            
            // Mostrar notificación en el navegador si está permitido
            this.showBrowserNotification(title, message);
            
        } catch (error) {
            console.error('❌ Error agregando alerta:', error);
        }
    }
    
    showBrowserNotification(title, message) {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🔔 SmartFood Monitor', {
                    body: `${title}: ${message}`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">❄️</text></svg>',
                    silent: true
                });
            } else if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        } catch (error) {
            // Silenciar error de notificaciones
        }
    }
    
    updateAlerts(alerts) {
        if (alerts && alerts.length > 0) {
            this.alerts = alerts;
            this.renderAlerts();
            this.updateAlertBadge();
        }
    }
    
    renderAlerts() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;
        
        try {
            if (this.alerts.length === 0) {
                container.innerHTML = `
                    <div class="alert-placeholder">
                        <i class="fas fa-check-circle"></i>
                        <p>No hay alertas activas</p>
                    </div>
                `;
                return;
            }
            
            // Mostrar solo las últimas 5 alertas
            const recentAlerts = this.alerts.slice(0, 5);
            
            container.innerHTML = recentAlerts.map(alert => `
                <div class="alert-item ${alert.read ? 'read' : ''}">
                    <div class="alert-icon ${alert.type || 'info'}">
                        <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                    </div>
                    <div class="alert-content">
                        <p>${this.escapeHtml(alert.title || alert.message)}</p>
                        <span class="alert-time">${this.formatTime(alert.timestamp)}</span>
                    </div>
                    ${!alert.read ? '<span class="badge">Nuevo</span>' : ''}
                </div>
            `).join('');
            
        } catch (error) {
            console.error('❌ Error renderizando alertas:', error);
        }
    }
    
    updateAlertBadge() {
        const badge = document.getElementById('alertBadge');
        const dot = document.getElementById('notificationDot');
        const unreadCount = this.alerts.filter(a => !a.read).length;
        
        if (badge) {
            badge.textContent = unreadCount || '0';
            badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
        }
        
        if (dot) {
            dot.classList.toggle('active', unreadCount > 0);
        }
    }
    
    // ========== UTILIDADES ==========
    getAlertIcon(type) {
        const icons = {
            danger: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || 'fa-bell';
    }
    
    formatTime(timestamp) {
        if (!timestamp) return 'Hace un momento';
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);
            
            if (diff < 60) return 'Hace un momento';
            if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
            if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
            return date.toLocaleString('es-ES');
        } catch (error) {
            return 'Fecha desconocida';
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showError(message) {
        // Mostrar error en la UI
        const errorContainer = document.getElementById('errorContainer');
        if (errorContainer) {
            errorContainer.textContent = message;
            errorContainer.style.display = 'block';
            
            // Auto-ocultar después de 10 segundos
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 10000);
        }
        console.error('❌', message);
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }
    
    // ========== NAVEGACIÓN Y UI ==========
    setupNavigation() {
        const navLinks = document.querySelectorAll('.sidebar-nav ul li a');
        const sections = {
            dashboard: document.getElementById('dashboard'),
            sensores: document.getElementById('sensores'),
            alertas: document.getElementById('alertas'),
            historico: document.getElementById('historico'),
            configuracion: document.getElementById('configuracion')
        };
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.getAttribute('href').replace('#', '');
                
                // Activar link
                navLinks.forEach(l => l.closest('li').classList.remove('active'));
                link.closest('li').classList.add('active');
                
                // Mostrar sección
                Object.keys(sections).forEach(key => {
                    if (sections[key]) {
                        sections[key].classList.toggle('active', key === href);
                    }
                });
                
                // Cerrar sidebar en móvil
                const sidebar = document.querySelector('.sidebar');
                if (window.innerWidth <= 992) {
                    sidebar.classList.remove('open');
                }
            });
        });
    }
    
    setupMenuToggle() {
        const toggle = document.getElementById('menuToggle');
        const sidebar = document.querySelector('.sidebar');
        
        if (toggle && sidebar) {
            toggle.addEventListener('click', () => {
                const isOpen = sidebar.classList.toggle('open');
                toggle.setAttribute('aria-expanded', isOpen);
            });
            
            // Cerrar al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 992) {
                    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
                        sidebar.classList.remove('open');
                        toggle.setAttribute('aria-expanded', 'false');
                    }
                }
            });
            
            // Cerrar con tecla ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }
    
    setupChartButtons() {
        const buttons = document.querySelectorAll('.chart-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const parent = btn.closest('.chart-controls');
                if (parent) {
                    parent.querySelectorAll('.chart-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-pressed', 'true');
                }
                
                // Actualizar gráfico
                const period = parseInt(btn.dataset.period);
                if (window.chartManager) {
                    window.chartManager.updatePeriod(period);
                }
            });
        });
    }
    
    setupClearAlerts() {
        const clearBtn = document.getElementById('clearAlerts');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                // Marcar todas como leídas
                this.alerts.forEach(alert => {
                    alert.read = true;
                    // Actualizar en Firebase
                    try {
                        if (alert.id && typeof FirebaseService !== 'undefined') {
                            FirebaseService.database.ref(`alerts/${alert.id}`).update({
                                read: true
                            }).catch(() => {});
                        }
                    } catch (error) {
                        // Silenciar error
                    }
                });
                
                this.renderAlerts();
                this.updateAlertBadge();
            });
        }
    }
    
    // ========== LIMPIEZA ==========
    destroy() {
        // Limpiar listeners
        this.listeners.forEach(listener => {
            if (listener && typeof listener === 'function') {
                try {
                    listener();
                } catch (error) {
                    // Silenciar error
                }
            }
        });
        
        // Limpiar intervalos
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
        }
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        
        console.log('🧹 Dashboard limpiado correctamente');
    }
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.dashboard = new DashboardController();
        
        // Limpiar al cerrar la página
        window.addEventListener('beforeunload', () => {
            if (window.dashboard && typeof window.dashboard.destroy === 'function') {
                window.dashboard.destroy();
            }
        });
        
    } catch (error) {
        console.error('❌ Error crítico inicializando dashboard:', error);
        document.body.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:20px;">
                <div>
                    <h1 style="font-size:24px;color:#EF4444;">⚠️ Error de Inicialización</h1>
                    <p style="color:#6B7280;margin:16px 0;">Hubo un problema al cargar el dashboard.</p>
                    <button onclick="location.reload()" style="padding:12px 24px;background:#0D9488;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">
                        Recargar Página
                    </button>
                </div>
            </div>
        `;
    }
});