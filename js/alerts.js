// ========== ALERTS MANAGER ==========
class AlertsManager {
    constructor() {
        this.alerts = [];
        this.filteredAlerts = [];
        this.isInitialized = false;
        this.maxAlerts = 100;
        this.unreadCount = 0;
        this.currentFilter = 'all'; // all, unread, read, danger, warning, info
        
        // Configuración de sonidos
        this.sounds = {
            danger: new Audio('data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFg=='),
            warning: new Audio('data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFg=='),
            info: new Audio('data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFg==')
        };
        
        // Sonidos precargados
        Object.values(this.sounds).forEach(sound => {
            sound.load();
            sound.volume = 0.5;
        });
        
        this.init();
    }
    
    init() {
        try {
            // Verificar Firebase
            if (typeof FirebaseService === 'undefined' || !FirebaseService.onAlerts) {
                console.warn('⚠️ FirebaseService no disponible para alertas');
                this.generateMockAlerts();
                this.isInitialized = true;
                return;
            }
            
            // Escuchar alertas en tiempo real
            const alertListener = FirebaseService.onAlerts((alerts) => {
                if (alerts && Array.isArray(alerts)) {
                    this.processAlerts(alerts);
                }
            });
            
            // Guardar listener para limpieza
            this._alertListener = alertListener;
            
            // Configurar listeners de UI
            this.setupUIListeners();
            
            // Configurar notificaciones
            this.setupNotifications();
            
            this.isInitialized = true;
            console.log('🔔 Sistema de alertas inicializado');
            
            // Cargar alertas locales si existen
            this.loadLocalAlerts();
            
        } catch (error) {
            console.error('❌ Error inicializando sistema de alertas:', error);
            this.generateMockAlerts();
            this.isInitialized = true;
        }
    }
    
    processAlerts(alerts) {
        try {
            // Validar y procesar alertas
            const processedAlerts = alerts
                .filter(alert => alert && typeof alert === 'object')
                .map(alert => ({
                    id: alert.id || alert._id || Date.now().toString(),
                    type: this.validateType(alert.type),
                    title: this.sanitizeText(alert.title || 'Alerta'),
                    message: this.sanitizeText(alert.message || ''),
                    timestamp: alert.timestamp || Date.now(),
                    read: alert.read === true,
                    priority: this.calculatePriority(alert)
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            // Prevenir duplicados
            const uniqueAlerts = this.removeDuplicates(processedAlerts);
            
            // Limitar cantidad
            if (uniqueAlerts.length > this.maxAlerts) {
                this.alerts = uniqueAlerts.slice(0, this.maxAlerts);
            } else {
                this.alerts = uniqueAlerts;
            }
            
            // Actualizar contador
            this.updateCounts();
            
            // Aplicar filtro actual
            this.applyFilter(this.currentFilter);
            
            // Actualizar UI
            this.updateUI();
            
            // Guardar localmente
            this.saveLocalAlerts();
            
            // Verificar nuevas alertas
            this.checkNewAlerts();
            
        } catch (error) {
            console.error('❌ Error procesando alertas:', error);
        }
    }
    
    validateType(type) {
        const validTypes = ['danger', 'warning', 'info', 'success'];
        return validTypes.includes(type) ? type : 'info';
    }
    
    sanitizeText(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    calculatePriority(alert) {
        const priorities = {
            danger: 3,
            warning: 2,
            info: 1,
            success: 0
        };
        return priorities[alert.type] || 1;
    }
    
    removeDuplicates(alerts) {
        const seen = new Set();
        return alerts.filter(alert => {
            const key = `${alert.type}-${alert.message}-${Math.floor(alert.timestamp / 60000)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    checkNewAlerts() {
        // Verificar si hay alertas nuevas (no leídas)
        const newAlerts = this.alerts.filter(a => !a.read);
        const previousUnread = this.unreadCount;
        this.unreadCount = newAlerts.length;
        
        // Si hay nuevas alertas
        if (this.unreadCount > previousUnread) {
            const latestAlert = newAlerts[0];
            if (latestAlert) {
                // Reproducir sonido según tipo
                this.playSound(latestAlert.type);
                
                // Mostrar notificación
                this.showNotification(latestAlert);
                
                // Actualizar título de la página
                this.updatePageTitle();
            }
        }
    }
    
    updateCounts() {
        this.unreadCount = this.alerts.filter(a => !a.read).length;
        
        // Actualizar badge en sidebar
        const badge = document.getElementById('alertBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
        }
        
        // Actualizar dot en header
        const dot = document.getElementById('notificationDot');
        if (dot) {
            dot.classList.toggle('active', this.unreadCount > 0);
        }
    }
    
    applyFilter(filter) {
        this.currentFilter = filter;
        
        switch(filter) {
            case 'all':
                this.filteredAlerts = this.alerts;
                break;
            case 'unread':
                this.filteredAlerts = this.alerts.filter(a => !a.read);
                break;
            case 'read':
                this.filteredAlerts = this.alerts.filter(a => a.read);
                break;
            case 'danger':
                this.filteredAlerts = this.alerts.filter(a => a.type === 'danger');
                break;
            case 'warning':
                this.filteredAlerts = this.alerts.filter(a => a.type === 'warning');
                break;
            case 'info':
                this.filteredAlerts = this.alerts.filter(a => a.type === 'info');
                break;
            default:
                this.filteredAlerts = this.alerts;
        }
        
        // Actualizar UI si estamos en la sección de alertas
        const alertSection = document.getElementById('alertas');
        if (alertSection && alertSection.classList.contains('active')) {
            this.renderAlertsList();
        }
    }
    
    updateUI() {
        // Actualizar contadores
        this.updateCounts();
        
        // Actualizar lista si está visible
        const alertContainer = document.getElementById('alertsContainer');
        const alertSection = document.getElementById('alertas');
        
        if (alertContainer && alertSection && alertSection.classList.contains('active')) {
            this.renderAlertsList();
        }
    }
    
    renderAlertsList() {
        const container = document.getElementById('alertsContainer');
        if (!container) return;
        
        try {
            const alerts = this.filteredAlerts || this.alerts;
            
            if (alerts.length === 0) {
                container.innerHTML = `
                    <div class="alert-placeholder">
                        <i class="fas fa-check-circle"></i>
                        <p>${this.currentFilter === 'all' ? 'No hay alertas registradas' : 'No hay alertas con este filtro'}</p>
                    </div>
                `;
                return;
            }
            
            // Mostrar máximo 20 alertas
            const displayAlerts = alerts.slice(0, 20);
            
            container.innerHTML = displayAlerts.map(alert => `
                <div class="alert-item ${alert.read ? 'read' : ''}" 
                        data-id="${alert.id}"
                        onclick="window.alertsManager && window.alertsManager.toggleRead('${alert.id}')">
                    <div class="alert-icon ${alert.type}">
                        <i class="fas ${this.getAlertIcon(alert.type)}"></i>
                    </div>
                    <div class="alert-content">
                        <p><strong>${this.getTypeLabel(alert.type)}</strong> ${alert.title}</p>
                        <p style="font-size:13px;color:var(--gray-500);margin-top:2px;">${alert.message}</p>
                        <span class="alert-time">${this.formatTime(alert.timestamp)}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                        ${!alert.read ? '<span class="badge" style="position:static;">Nuevo</span>' : ''}
                        <span style="font-size:11px;color:var(--gray-400);cursor:pointer;" 
                                onclick="event.stopPropagation();window.alertsManager && window.alertsManager.deleteAlert('${alert.id}')">
                            <i class="fas fa-times"></i>
                        </span>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('❌ Error renderizando alertas:', error);
        }
    }
    
    getTypeLabel(type) {
        const labels = {
            danger: '🚨',
            warning: '⚠️',
            info: 'ℹ️',
            success: '✅'
        };
        return labels[type] || '📢';
    }
    
    getAlertIcon(type) {
        const icons = {
            danger: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            success: 'fa-check-circle'
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
            if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
            return date.toLocaleString('es-ES', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Fecha desconocida';
        }
    }
    
    // ========== ACCIONES DE ALERTAS ==========
    
    toggleRead(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.read = !alert.read;
            
            // Actualizar en Firebase
            try {
                if (FirebaseService && FirebaseService.database) {
                    FirebaseService.database.ref(`alerts/${alertId}`).update({
                        read: alert.read
                    }).catch(() => {});
                }
            } catch (error) {
                // Silenciar error
            }
            
            this.updateCounts();
            this.renderAlertsList();
            this.saveLocalAlerts();
        }
    }
    
    markAllAsRead() {
        this.alerts.forEach(alert => {
            if (!alert.read) {
                alert.read = true;
                
                // Actualizar en Firebase
                try {
                    if (FirebaseService && FirebaseService.database) {
                        FirebaseService.database.ref(`alerts/${alert.id}`).update({
                            read: true
                        }).catch(() => {});
                    }
                } catch (error) {
                    // Silenciar error
                }
            }
        });
        
        this.updateCounts();
        this.renderAlertsList();
        this.saveLocalAlerts();
        this.updatePageTitle();
        
        // Feedback visual
        this.showToast('✅ Todas las alertas marcadas como leídas');
    }
    
    deleteAlert(alertId) {
        if (!confirm('¿Eliminar esta alerta?')) return;
        
        this.alerts = this.alerts.filter(a => a.id !== alertId);
        this.filteredAlerts = this.filteredAlerts.filter(a => a.id !== alertId);
        
        // Eliminar en Firebase
        try {
            if (FirebaseService && FirebaseService.database) {
                FirebaseService.database.ref(`alerts/${alertId}`).remove().catch(() => {});
            }
        } catch (error) {
            // Silenciar error
        }
        
        this.updateCounts();
        this.renderAlertsList();
        this.saveLocalAlerts();
        
        this.showToast('🗑️ Alerta eliminada');
    }
    
    clearAllAlerts() {
        if (!confirm('¿Eliminar todas las alertas?')) return;
        
        this.alerts = [];
        this.filteredAlerts = [];
        
        // Eliminar en Firebase
        try {
            if (FirebaseService && FirebaseService.database) {
                FirebaseService.database.ref('alerts').remove().catch(() => {});
            }
        } catch (error) {
            // Silenciar error
        }
        
        this.updateCounts();
        this.renderAlertsList();
        this.saveLocalAlerts();
        this.updatePageTitle();
        
        this.showToast('🗑️ Todas las alertas eliminadas');
    }
    
    // ========== NOTIFICACIONES ==========
    
    setupNotifications() {
        // Solicitar permiso para notificaciones
        if ('Notification' in window && Notification.permission === 'default') {
            setTimeout(() => {
                Notification.requestPermission();
            }, 5000);
        }
    }
    
    showNotification(alert) {
        try {
            if (!('Notification' in window) || Notification.permission !== 'granted') {
                return;
            }
            
            const notification = new Notification('🔔 Smart Monitor', {
                body: `${this.getTypeLabel(alert.type)} ${alert.title}: ${alert.message}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">❄️</text></svg>',
                tag: alert.id,
                requireInteraction: true,
                silent: true
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
                // Ir a la sección de alertas
                const alertLink = document.querySelector('a[href="#alertas"]');
                if (alertLink) alertLink.click();
            };
            
            setTimeout(() => notification.close(), 10000);
            
        } catch (error) {
            // Silenciar error de notificaciones
        }
    }
    
    playSound(type) {
        try {
            const sound = this.sounds[type] || this.sounds.info;
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(() => {});
            }
        } catch (error) {
            // Silenciar error de audio
        }
    }
    
    // ========== UI SETUP ==========
    
    setupUIListeners() {
        // Botón para marcar todas como leídas
        const markAllBtn = document.getElementById('markAllRead');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => this.markAllAsRead());
        }
        
        // Botón para limpiar todas
        const clearAllBtn = document.getElementById('clearAllAlerts');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.clearAllAlerts());
        }
        
        // Filtros
        const filterButtons = document.querySelectorAll('.alert-filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.applyFilter(btn.dataset.filter);
            });
        });
        
        // Notificación icon click
        const notificationIcon = document.querySelector('.notification-icon');
        if (notificationIcon) {
            notificationIcon.addEventListener('click', () => {
                const alertLink = document.querySelector('a[href="#alertas"]');
                if (alertLink) alertLink.click();
            });
        }
    }
    
    updatePageTitle() {
        const title = document.querySelector('title');
        if (title) {
            if (this.unreadCount > 0) {
                title.textContent = `(${this.unreadCount}) Smart Monitor - Sistema IoT`;
            } else {
                title.textContent = 'SmartFood Monitor - Sistema IoT';
            }
        }
    }
    
    // ========== PERSISTENCIA LOCAL ==========
    
    saveLocalAlerts() {
        try {
            localStorage.setItem('smartfood_alerts', JSON.stringify({
                alerts: this.alerts,
                timestamp: Date.now()
            }));
        } catch (error) {
            // Silenciar error de localStorage
        }
    }
    
    loadLocalAlerts() {
        try {
            const stored = localStorage.getItem('smartfood_alerts');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.alerts && Array.isArray(data.alerts) && data.alerts.length > 0) {
                    // Solo cargar si no hay alertas de Firebase
                    if (this.alerts.length === 0) {
                        this.alerts = data.alerts;
                        this.applyFilter(this.currentFilter);
                        this.updateUI();
                    }
                }
            }
        } catch (error) {
            // Silenciar error
        }
    }
    
    // ========== MOCK DATA ==========
    
    generateMockAlerts() {
        const now = Date.now();
        const mockAlerts = [
            {
                id: '1',
                type: 'danger',
                title: 'Temperatura Crítica',
                message: 'La temperatura ha alcanzado 12.5°C',
                timestamp: now - 120000,
                read: false
            },
            {
                id: '2',
                type: 'warning',
                title: 'Puerta Abierta',
                message: 'La puerta de la cámara lleva 5 minutos abierta',
                timestamp: now - 300000,
                read: true
            },
            {
                id: '3',
                type: 'info',
                title: 'Sistema Iniciado',
                message: 'El sistema se ha reiniciado correctamente',
                timestamp: now - 3600000,
                read: true
            },
            {
                id: '4',
                type: 'warning',
                title: 'Nivel de Gas Elevado',
                message: 'Se ha detectado un nivel de gas de 250 ppm',
                timestamp: now - 7200000,
                read: true
            }
        ];
        
        this.alerts = mockAlerts;
        this.applyFilter(this.currentFilter);
        this.updateUI();
    }
    
    // ========== TOAST NOTIFICATIONS ==========
    
    showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:12px 20px;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);border-left:4px solid ${this.getColorForType(type)};">
                <i class="fas ${this.getAlertIcon(type)}" style="color:${this.getColorForType(type)};"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:16px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            animation: slideUp 0.3s ease;
            max-width: 400px;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    }
    
    getColorForType(type) {
        const colors = {
            danger: '#EF4444',
            warning: '#F59E0B',
            info: '#3B82F6',
            success: '#10B981'
        };
        return colors[type] || '#6B7280';
    }
    
    // ========== EXPORTACIÓN ==========
    
    exportAlerts(format = 'json') {
        try {
            if (format === 'json') {
                const data = JSON.stringify(this.alerts, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `alertas_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.showToast('✅ Alertas exportadas correctamente');
            } else if (format === 'csv') {
                // Implementar exportación CSV
                const headers = ['ID', 'Tipo', 'Título', 'Mensaje', 'Fecha', 'Leído'];
                const rows = this.alerts.map(a => [
                    a.id,
                    a.type,
                    a.title,
                    a.message,
                    new Date(a.timestamp).toLocaleString('es-ES'),
                    a.read ? 'Sí' : 'No'
                ]);
                const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `alertas_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                this.showToast('✅ Alertas exportadas correctamente');
            }
        } catch (error) {
            console.error('❌ Error exportando alertas:', error);
            this.showToast('❌ Error al exportar alertas', 'danger');
        }
    }
    
    // ========== LIMPIEZA ==========
    
    destroy() {
        // Limpiar listener de Firebase
        if (this._alertListener && typeof this._alertListener === 'function') {
            try {
                this._alertListener();
            } catch (error) {
                // Silenciar error
            }
        }
        
        // Limpiar datos
        this.alerts = [];
        this.filteredAlerts = [];
        this.isInitialized = false;
        
        console.log('🧹 Sistema de alertas limpiado');
    }
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.alertsManager = new AlertsManager();
        
        // Limpiar al cerrar
        window.addEventListener('beforeunload', () => {
            if (window.alertsManager && typeof window.alertsManager.destroy === 'function') {
                window.alertsManager.destroy();
            }
        });
        
    } catch (error) {
        console.error('❌ Error inicializando AlertsManager:', error);
    }
});

// Agregar estilos para toast y animaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .toast-notification {
        animation: slideUp 0.3s ease;
    }
    
    .alert-item {
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .alert-item:hover {
        background: var(--gray-50);
    }
    
    .alert-item.read {
        opacity: 0.7;
    }
    
    .alert-item.read .alert-content p {
        color: var(--gray-500);
    }
    
    .alert-filter-btn {
        padding: 4px 12px;
        border: 1px solid var(--gray-200);
        background: white;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .alert-filter-btn:hover {
        background: var(--gray-50);
    }
    
    .alert-filter-btn.active {
        background: var(--primary);
        color: white;
        border-color: var(--primary);
    }
`;
document.head.appendChild(style);