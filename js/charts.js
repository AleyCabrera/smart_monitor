// ========== CHART MANAGER ==========
class ChartManager {
    constructor() {
        this.charts = {};
        this.data = {
            temperature: [],
            humidity: [],
            gas: [],
            timestamps: []
        };
        this.maxDataPoints = 60;
        this.currentPeriod = 10; // minutos
        this.isInitialized = false;
        this.updateQueue = [];
        this.isUpdating = false;
        this.batchSize = 5;
        this.lastUpdateTime = 0;
        this.updateThrottle = 100; // ms entre actualizaciones
        
        // Configuración de colores
        this.colors = {
            temperature: {
                border: '#EF4444',
                background: 'rgba(239, 68, 68, 0.1)',
                fill: 'rgba(239, 68, 68, 0.05)'
            },
            humidity: {
                border: '#3B82F6',
                background: 'rgba(59, 130, 246, 0.1)',
                fill: 'rgba(59, 130, 246, 0.05)'
            },
            gas: {
                border: '#F59E0B',
                background: 'rgba(245, 158, 11, 0.1)',
                fill: 'rgba(245, 158, 11, 0.05)'
            }
        };
        
        // Umbrales para zonas de alerta
        this.thresholds = {
            temperature: {
                warning: 4,
                danger: 8
            },
            humidity: {
                warning: 80,
                danger: 90
            },
            gas: {
                warning: 200,
                danger: 500
            }
        };
        
        this.initCharts();
        this.setupResizeHandler();
    }
    
    initCharts() {
        try {
            // Verificar que Chart.js está disponible
            if (typeof Chart === 'undefined') {
                console.error('❌ Chart.js no está cargado');
                return;
            }
            
            // Configuración común de gráficos
            const commonOptions = this.getCommonOptions();
            
            // Inicializar gráfico de temperatura
            this.initTemperatureChart(commonOptions);
            
            // Inicializar gráfico de humedad
            this.initHumidityChart(commonOptions);
            
            // Inicializar gráfico de gas
            this.initGasChart(commonOptions);
            
            this.isInitialized = true;
            console.log('📊 Gráficos inicializados correctamente');
            
        } catch (error) {
            console.error('❌ Error inicializando gráficos:', error);
            this.showChartError('Error al cargar los gráficos');
        }
    }
    
    getCommonOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300,
                easing: 'easeOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        boxWidth: 12,
                        padding: 12,
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: {
                        size: 13,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 12
                    },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1);
                                if (context.dataset.label === 'Temperatura') {
                                    label += '°C';
                                } else if (context.dataset.label === 'Humedad') {
                                    label += '%';
                                } else if (context.dataset.label === 'Gas') {
                                    label += ' ppm';
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 12,
                        font: {
                            size: 10
                        },
                        color: '#9CA3AF'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        },
                        color: '#9CA3AF',
                        padding: 8
                    }
                }
            }
        };
    }
    
    initTemperatureChart(commonOptions) {
        const ctx = document.getElementById('tempChart');
        if (!ctx) return;
        
        const options = {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    min: -5,
                    max: 15,
                    title: {
                        display: true,
                        text: 'Temperatura (°C)',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        color: '#6B7280'
                    }
                }
            }
        };
        
        this.charts.temperature = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Temperatura',
                        data: [],
                        borderColor: this.colors.temperature.border,
                        backgroundColor: this.colors.temperature.fill,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: this.colors.temperature.border,
                        spanGaps: false
                    }
                ]
            },
            options: options
        });
    }
    
    initHumidityChart(commonOptions) {
        const ctx = document.getElementById('humidityChart');
        if (!ctx) return;
        
        const options = {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Humedad (%)',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        color: '#6B7280'
                    }
                }
            }
        };
        
        this.charts.humidity = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Humedad',
                        data: [],
                        borderColor: this.colors.humidity.border,
                        backgroundColor: this.colors.humidity.fill,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: this.colors.humidity.border,
                        spanGaps: false
                    }
                ]
            },
            options: options
        });
    }
    
    initGasChart(commonOptions) {
        const ctx = document.getElementById('gasChart');
        if (!ctx) {
            // Si no existe el canvas de gas, no lo creamos
            return;
        }
        
        const options = {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    min: 0,
                    max: 1000,
                    title: {
                        display: true,
                        text: 'Gas (ppm)',
                        font: {
                            size: 11,
                            weight: '500'
                        },
                        color: '#6B7280'
                    }
                }
            }
        };
        
        this.charts.gas = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Gas',
                        data: [],
                        borderColor: this.colors.gas.border,
                        backgroundColor: this.colors.gas.fill,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: this.colors.gas.border,
                        spanGaps: false
                    }
                ]
            },
            options: options
        });
    }
    
    addDataPoint(data) {
        try {
            // Validar datos
            if (!data || typeof data !== 'object') {
                console.warn('⚠️ Datos inválidos para gráfico:', data);
                return;
            }
            
            // Verificar que hay al menos un valor
            const hasValue = data.temperature !== null || 
                           data.humidity !== null || 
                           data.gas !== null;
            if (!hasValue) return;
            
            // Prevenir duplicados (mismo timestamp)
            const timestamp = data.timestamp || Date.now();
            const lastTimestamp = this.data.timestamps.length > 0 ? 
                this.data.timestamps[this.data.timestamps.length - 1] : null;
            
            // Si el timestamp es igual al último, actualizar en lugar de agregar
            if (lastTimestamp === timestamp) {
                this.updateLastDataPoint(data);
                return;
            }
            
            // Formatear timestamp
            const time = new Date(timestamp);
            const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
            
            // Agregar a la cola de actualización
            this.updateQueue.push({
                timestamp: timestamp,
                label: label,
                temperature: data.temperature,
                humidity: data.humidity,
                gas: data.gas
            });
            
            // Procesar cola si no está actualizando
            if (!this.isUpdating) {
                this.processUpdateQueue();
            }
            
        } catch (error) {
            console.error('❌ Error agregando punto de datos:', error);
        }
    }
    
    processUpdateQueue() {
        if (this.updateQueue.length === 0) {
            this.isUpdating = false;
            return;
        }
        
        this.isUpdating = true;
        
        // Tomar un lote de datos
        const batch = this.updateQueue.splice(0, this.batchSize);
        
        batch.forEach(item => {
            // Agregar datos
            if (item.temperature !== null && item.temperature !== undefined) {
                this.data.temperature.push(item.temperature);
            }
            if (item.humidity !== null && item.humidity !== undefined) {
                this.data.humidity.push(item.humidity);
            }
            if (item.gas !== null && item.gas !== undefined) {
                this.data.gas.push(item.gas);
            }
            this.data.timestamps.push(item.label);
        });
        
        // Limitar tamaño
        this.trimData();
        
        // Actualizar gráficos con throttling
        this.throttledUpdate();
        
        // Procesar siguiente lote
        if (this.updateQueue.length > 0) {
            setTimeout(() => this.processUpdateQueue(), 50);
        } else {
            this.isUpdating = false;
        }
    }
    
    updateLastDataPoint(data) {
        // Actualizar el último punto en lugar de agregar uno nuevo
        const lastIndex = this.data.temperature.length - 1;
        if (lastIndex >= 0) {
            if (data.temperature !== null && data.temperature !== undefined) {
                this.data.temperature[lastIndex] = data.temperature;
            }
            if (data.humidity !== null && data.humidity !== undefined) {
                this.data.humidity[lastIndex] = data.humidity;
            }
            if (data.gas !== null && data.gas !== undefined) {
                this.data.gas[lastIndex] = data.gas;
            }
            this.throttledUpdate();
        }
    }
    
    trimData() {
        const maxPoints = this.maxDataPoints;
        const dataKeys = ['temperature', 'humidity', 'gas'];
        
        dataKeys.forEach(key => {
            if (this.data[key].length > maxPoints) {
                this.data[key] = this.data[key].slice(-maxPoints);
            }
        });
        
        if (this.data.timestamps.length > maxPoints) {
            this.data.timestamps = this.data.timestamps.slice(-maxPoints);
        }
        
        // Asegurar que todos los arrays tengan la misma longitud
        const maxLength = Math.max(
            this.data.temperature.length,
            this.data.humidity.length,
            this.data.gas.length,
            this.data.timestamps.length
        );
        
        ['temperature', 'humidity', 'gas'].forEach(key => {
            while (this.data[key].length < maxLength) {
                this.data[key].unshift(null);
            }
        });
        while (this.data.timestamps.length < maxLength) {
            this.data.timestamps.unshift('');
        }
    }
    
    throttledUpdate() {
        const now = Date.now();
        if (now - this.lastUpdateTime >= this.updateThrottle) {
            this.updateCharts();
            this.lastUpdateTime = now;
        } else {
            // Programar actualización
            clearTimeout(this._updateTimeout);
            this._updateTimeout = setTimeout(() => {
                this.updateCharts();
                this.lastUpdateTime = Date.now();
            }, this.updateThrottle);
        }
    }
    
    updateCharts() {
        try {
            // Actualizar gráfico de temperatura
            this.updateChart('temperature', this.colors.temperature);
            
            // Actualizar gráfico de humedad
            this.updateChart('humidity', this.colors.humidity);
            
            // Actualizar gráfico de gas si existe
            if (this.charts.gas) {
                this.updateChart('gas', this.colors.gas);
            }
            
        } catch (error) {
            console.error('❌ Error actualizando gráficos:', error);
        }
    }
    
    updateChart(chartKey, colors) {
        const chart = this.charts[chartKey];
        if (!chart) return;
        
        try {
            const data = this.data[chartKey] || [];
            const labels = this.data.timestamps || [];
            
            chart.data.labels = labels;
            chart.data.datasets[0].data = data;
            
            // Actualizar colores si hay alertas
            const thresholds = this.thresholds[chartKey];
            if (thresholds) {
                const lastValue = data[data.length - 1];
                if (lastValue !== null && lastValue !== undefined) {
                    if (lastValue > thresholds.danger) {
                        chart.data.datasets[0].borderColor = '#EF4444';
                        chart.data.datasets[0].backgroundColor = 'rgba(239, 68, 68, 0.1)';
                    } else if (lastValue > thresholds.warning) {
                        chart.data.datasets[0].borderColor = '#F59E0B';
                        chart.data.datasets[0].backgroundColor = 'rgba(245, 158, 11, 0.1)';
                    } else {
                        chart.data.datasets[0].borderColor = colors.border;
                        chart.data.datasets[0].backgroundColor = colors.fill;
                    }
                }
            }
            
            chart.update('none');
            
        } catch (error) {
            console.error(`❌ Error actualizando gráfico ${chartKey}:`, error);
        }
    }
    
    updatePeriod(minutes) {
        try {
            this.currentPeriod = Math.max(1, minutes);
            
            // Calcular puntos según el período
            const pointsPerMinute = 1;
            const totalPoints = minutes * pointsPerMinute;
            this.maxDataPoints = Math.min(totalPoints, 120);
            
            // Limpiar datos y recargar histórico
            this.clearData();
            
            // Cargar histórico con el nuevo límite
            this.loadHistory(this.maxDataPoints);
            
            console.log(`📊 Período actualizado a ${minutes} minutos`);
            
        } catch (error) {
            console.error('❌ Error actualizando período:', error);
        }
    }
    
    clearData() {
        this.data = {
            temperature: [],
            humidity: [],
            gas: [],
            timestamps: []
        };
        this.updateQueue = [];
        this.isUpdating = false;
        this.updateCharts();
    }
    
    async loadHistory(limit = 20) {
        try {
            // Verificar que FirebaseService está disponible
            if (typeof FirebaseService === 'undefined' || !FirebaseService.getHistory) {
                console.warn('⚠️ FirebaseService no disponible para cargar histórico');
                this.generateMockData();
                return;
            }
            
            const snapshot = await FirebaseService.getHistory(limit);
            const data = snapshot.val();
            
            if (data && typeof data === 'object') {
                const keys = Object.keys(data);
                if (keys.length === 0) {
                    // No hay datos históricos, generar datos de prueba
                    this.generateMockData();
                    return;
                }
                
                // Ordenar por timestamp
                const sortedKeys = keys.sort((a, b) => {
                    return (data[a].timestamp || 0) - (data[b].timestamp || 0);
                });
                
                sortedKeys.forEach(key => {
                    const entry = data[key];
                    if (entry && typeof entry === 'object') {
                        this.addDataPoint({
                            temperature: entry.temperature || null,
                            humidity: entry.humidity || null,
                            gas: entry.gas || null,
                            timestamp: entry.timestamp || Date.now()
                        });
                    }
                });
                
                console.log(`📊 Histórico cargado: ${sortedKeys.length} puntos`);
            } else {
                // No hay datos, generar mock
                this.generateMockData();
            }
            
        } catch (error) {
            console.warn('⚠️ Error cargando histórico, generando datos de prueba:', error);
            this.generateMockData();
        }
    }
    
    generateMockData() {
        console.log('📊 Generando datos de prueba para gráficos');
        const now = Date.now();
        const points = 30;
        
        for (let i = 0; i < points; i++) {
            const timestamp = now - (points - i) * 60000; // 1 minuto entre puntos
            const mockData = {
                temperature: 2 + Math.random() * 6 + Math.sin(i / 5) * 2,
                humidity: 60 + Math.random() * 20 + Math.cos(i / 4) * 5,
                gas: 50 + Math.random() * 150 + Math.sin(i / 3) * 30,
                timestamp: timestamp
            };
            this.addDataPoint(mockData);
        }
    }
    
    setupResizeHandler() {
        let resizeTimeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                Object.values(this.charts).forEach(chart => {
                    if (chart && typeof chart.resize === 'function') {
                        try {
                            chart.resize();
                        } catch (error) {
                            // Silenciar error de resize
                        }
                    }
                });
            }, 250);
        };
        
        window.addEventListener('resize', handleResize);
        
        // Observer para cambios en el contenedor
        try {
            const observer = new ResizeObserver(() => {
                handleResize();
            });
            
            document.querySelectorAll('.chart-container').forEach(container => {
                if (container) {
                    observer.observe(container);
                }
            });
        } catch (error) {
            // ResizeObserver no soportado
        }
    }
    
    showChartError(message) {
        const containers = document.querySelectorAll('.chart-container');
        containers.forEach(container => {
            if (container && !container.querySelector('canvas')) {
                container.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6B7280;flex-direction:column;gap:8px;">
                        <i class="fas fa-chart-line" style="font-size:24px;opacity:0.5;"></i>
                        <span style="font-size:14px;">${message}</span>
                    </div>
                `;
            }
        });
    }
    
    // Método para exportar gráficos como imagen
    exportChart(chartKey, format = 'png') {
        const chart = this.charts[chartKey];
        if (!chart) return null;
        
        try {
            const canvas = chart.canvas;
            if (format === 'png') {
                return canvas.toDataURL('image/png');
            } else if (format === 'jpeg') {
                return canvas.toDataURL('image/jpeg', 0.9);
            }
        } catch (error) {
            console.error('❌ Error exportando gráfico:', error);
            return null;
        }
    }
    
    // Método para descargar gráfico
    downloadChart(chartKey, filename = 'grafico') {
        const dataUrl = this.exportChart(chartKey);
        if (!dataUrl) return;
        
        try {
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            console.error('❌ Error descargando gráfico:', error);
        }
    }
    
    // Destruir gráficos y liberar memoria
    destroy() {
        Object.keys(this.charts).forEach(key => {
            try {
                if (this.charts[key] && typeof this.charts[key].destroy === 'function') {
                    this.charts[key].destroy();
                }
            } catch (error) {
                // Silenciar error
            }
        });
        this.charts = {};
        this.data = {
            temperature: [],
            humidity: [],
            gas: [],
            timestamps: []
        };
        this.updateQueue = [];
        this.isUpdating = false;
        
        console.log('🧹 Gráficos destruidos correctamente');
    }
}

// ========== INICIALIZAR ==========
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.chartManager = new ChartManager();
        
        // Cargar historial después de un momento
        setTimeout(() => {
            if (window.chartManager && typeof window.chartManager.loadHistory === 'function') {
                window.chartManager.loadHistory(30);
            }
        }, 2000);
        
        // Limpiar al cerrar
        window.addEventListener('beforeunload', () => {
            if (window.chartManager && typeof window.chartManager.destroy === 'function') {
                window.chartManager.destroy();
            }
        });
        
    } catch (error) {
        console.error('❌ Error inicializando ChartManager:', error);
    }
});