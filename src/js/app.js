/**
 * EPUB AI Translator - Main Application
 * Главный файл приложения
 */

var App = (function() {
    'use strict';

    var isInitialized = false;

    /**
     * Инициализация приложения
     */
    function init() {
        if (isInitialized) {
            console.warn('App already initialized');
            return;
        }

        console.log('EPUB AI Translator initializing...');

        // Ждем загрузки JSZip с CDN
        if (typeof JSZip === 'undefined') {
            console.log('Waiting for JSZip to load...');
            setTimeout(init, 100);
            return;
        }

        // Проверка зависимостей
        if (!checkDependencies()) {
            console.error('Missing dependencies');
            showDependencyError();
            return;
        }

        // Инициализация компонентов
        try {
            // Загрузка глоссария
            if (typeof GlossaryManager !== 'undefined') {
                GlossaryManager.load();
            }

            // Инициализация UI
            if (typeof UIManager !== 'undefined') {
                UIManager.init();
            }

            // Подписка на глобальные события
            setupGlobalEventHandlers();

            isInitialized = true;
            console.log('EPUB AI Translator initialized successfully');

        } catch (error) {
            console.error('Initialization error:', error);
            alert('Ошибка инициализации приложения: ' + error.message);
        }
    }

    /**
     * Показать ошибку зависимостей
     */
    function showDependencyError() {
        var statusEl = document.getElementById('status-text');
        if (statusEl) {
            statusEl.textContent = 'Ошибка: не все библиотеки загружены';
            statusEl.style.color = 'red';
        }
    }

    /**
     * Проверка зависимостей
     */
    function checkDependencies() {
        var missing = [];

        if (typeof JSZip === 'undefined') {
            missing.push('JSZip');
        }

        if (typeof EventBus === 'undefined') {
            missing.push('EventBus');
        }

        if (typeof Helpers === 'undefined') {
            missing.push('Helpers');
        }

        if (typeof TextProcessing === 'undefined') {
            missing.push('TextProcessing');
        }

        if (typeof EpubTools === 'undefined') {
            missing.push('EpubTools');
        }

        if (missing.length > 0) {
            console.error('Missing dependencies:', missing.join(', '));
            return false;
        }

        console.log('All dependencies loaded successfully');
        return true;
    }

    /**
     * Настройка глобальных обработчиков событий
     */
    function setupGlobalEventHandlers() {
        // Предупреждение при закрытии страницы во время перевода
        window.addEventListener('beforeunload', function(e) {
            var engine = TranslationEngine.getEngine();
            if (engine && engine.isRunning) {
                e.preventDefault();
                e.returnValue = 'Перевод еще не завершен. Вы уверены, что хотите покинуть страницу?';
                return e.returnValue;
            }
        });

        // Глобальная обработка ошибок
        window.addEventListener('error', function(e) {
            console.error('Global error:', e.error);
            EventBus.log('Ошибка: ' + e.message, 'error');
        });

        // Обработка неперехваченных промисов
        window.addEventListener('unhandledrejection', function(e) {
            console.error('Unhandled promise rejection:', e.reason);
            EventBus.log('Ошибка промиса: ' + (e.reason.message || e.reason), 'error');
        });

        // Горячие клавиши
        document.addEventListener('keydown', function(e) {
            // Ctrl+S - сохранение
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                EventBus.log('Настройки автоматически сохраняются', 'info');
            }

            // Escape - закрытие модальных окон
            if (e.key === 'Escape') {
                UIManager.hideModals();
            }
        });
    }

    /**
     * Получение версии приложения
     */
    function getVersion() {
        return '1.0.0';
    }

    /**
     * Получение информации о приложении
     */
    function getInfo() {
        return {
            name: 'EPUB AI Translator',
            version: getVersion(),
            description: 'Перевод EPUB книг с помощью AI',
            author: 'AI Translation Tools'
        };
    }

    /**
     * Сброс приложения
     */
    function reset() {
        if (confirm('Сбросить все данные и перезагрузить приложение?')) {
            SettingsManager.clearAllStorage();
            location.reload();
        }
    }

    /**
     * Экспорт состояния для отладки
     */
    function exportDebugState() {
        var state = {
            version: getVersion(),
            timestamp: new Date().toISOString(),
            settings: SettingsManager.loadSettings(),
            glossaryCount: GlossaryManager.count(),
            eventHistory: EventBus.getHistory().slice(-50),
            engine: TranslationEngine.getEngine().getStatus()
        };

        return JSON.stringify(state, null, 2);
    }

    // Публичный API
    return {
        init: init,
        getVersion: getVersion,
        getInfo: getInfo,
        reset: reset,
        exportDebugState: exportDebugState
    };
})();

// Автоматическая инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    App.init();
});
