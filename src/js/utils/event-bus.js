/**
 * EPUB AI Translator - Event Bus
 * Централизованная шина событий для связи компонентов
 */

var EventBus = (function() {
    'use strict';

    var listeners = {};
    var eventHistory = [];
    var maxHistorySize = 100;
    var debugMode = false;

    /**
     * Подписаться на событие
     * @param {string} eventName - Имя события
     * @param {Function} callback - Функция-обработчик
     * @param {Object} context - Контекст выполнения (this)
     * @returns {Function} - Функция для отписки
     */
    function on(eventName, callback, context) {
        if (!listeners[eventName]) {
            listeners[eventName] = [];
        }

        var listener = {
            callback: callback,
            context: context || null
        };

        listeners[eventName].push(listener);

        // Возвращаем функцию для отписки
        return function() {
            off(eventName, callback, context);
        };
    }

    /**
     * Подписаться на событие один раз
     * @param {string} eventName - Имя события
     * @param {Function} callback - Функция-обработчик
     * @param {Object} context - Контекст выполнения
     */
    function once(eventName, callback, context) {
        var unsubscribe = on(eventName, function() {
            unsubscribe();
            callback.apply(context, arguments);
        }, context);
        return unsubscribe;
    }

    /**
     * Отписаться от события
     * @param {string} eventName - Имя события
     * @param {Function} callback - Функция-обработчик
     * @param {Object} context - Контекст выполнения
     */
    function off(eventName, callback, context) {
        if (!listeners[eventName]) return;

        listeners[eventName] = listeners[eventName].filter(function(listener) {
            if (callback && context) {
                return listener.callback !== callback || listener.context !== context;
            } else if (callback) {
                return listener.callback !== callback;
            }
            return false;
        });

        if (listeners[eventName].length === 0) {
            delete listeners[eventName];
        }
    }

    /**
     * Отправить событие
     * @param {string} eventName - Имя события
     * @param {Object} data - Данные события
     * @param {Object} options - Опции (source, sessionId)
     */
    function emit(eventName, data, options) {
        options = options || {};

        var event = {
            event: eventName,
            source: options.source || 'unknown',
            sessionId: options.sessionId || null,
            data: data || {},
            timestamp: Date.now()
        };

        // Сохраняем в историю
        eventHistory.push(event);
        if (eventHistory.length > maxHistorySize) {
            eventHistory.shift();
        }

        // Логирование в debug режиме
        if (debugMode) {
            console.log('[EventBus]', eventName, event);
        }

        // Вызываем всех слушателей
        var eventListeners = listeners[eventName];
        if (eventListeners) {
            eventListeners.forEach(function(listener) {
                try {
                    listener.callback.call(listener.context, event);
                } catch (error) {
                    console.error('[EventBus] Error in listener for "' + eventName + '":', error);
                }
            });
        }

        // Вызываем глобальных слушателей (wildcard)
        var wildcardListeners = listeners['*'];
        if (wildcardListeners) {
            wildcardListeners.forEach(function(listener) {
                try {
                    listener.callback.call(listener.context, event);
                } catch (error) {
                    console.error('[EventBus] Error in wildcard listener:', error);
                }
            });
        }
    }

    /**
     * Удобный метод для отправки события с логом
     * @param {string} message - Сообщение для лога
     * @param {string} level - Уровень (info, success, warning, error, debug)
     * @param {Object} options - Опции
     */
    function log(message, level, options) {
        level = level || 'info';
        emit('log_message', { message: message, level: level }, options);
    }

    /**
     * Очистить все подписки
     */
    function clear() {
        listeners = {};
    }

    /**
     * Очистить подписки для конкретного события
     * @param {string} eventName - Имя события
     */
    function clearEvent(eventName) {
        delete listeners[eventName];
    }

    /**
     * Получить историю событий
     * @param {string} eventName - Фильтр по имени события (опционально)
     * @returns {Array}
     */
    function getHistory(eventName) {
        if (eventName) {
            return eventHistory.filter(function(e) {
                return e.event === eventName;
            });
        }
        return eventHistory.slice();
    }

    /**
     * Очистить историю
     */
    function clearHistory() {
        eventHistory = [];
    }

    /**
     * Включить/выключить режим отладки
     * @param {boolean} enabled
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
    }

    /**
     * Получить количество слушателей для события
     * @param {string} eventName
     * @returns {number}
     */
    function listenerCount(eventName) {
        return listeners[eventName] ? listeners[eventName].length : 0;
    }

    /**
     * Получить список всех событий с подписчиками
     * @returns {Array}
     */
    function getEventNames() {
        return Object.keys(listeners);
    }

    // Список стандартных событий приложения
    var EVENTS = {
        // Сессия перевода
        SESSION_STARTED: 'session_started',
        SESSION_FINISHED: 'session_finished',
        STOP_SESSION_REQUESTED: 'stop_session_requested',
        START_SESSION_REQUESTED: 'start_session_requested',

        // Задачи
        TASK_FINISHED: 'task_finished',
        TASK_STATUS_UPDATED: 'task_status_updated',
        TASKS_ADDED: 'tasks_added',
        PROGRESS_UPDATED: 'progress_updated',

        // Воркеры
        WORKER_ROTATED: 'worker_rotated',
        GRACEFUL_SHUTDOWN_REQUESTED: 'graceful_shutdown_requested',
        CANCEL_GRACEFUL_SHUTDOWN: 'cancel_graceful_shutdown',

        // Ошибки
        FATAL_ERROR: 'fatal_error',
        GEOBLOCK_DETECTED: 'geoblock_detected',
        TEMPORARY_LIMIT_WARNING: 'temporary_limit_warning_received',
        API_CONNECTION_HEALTHY: 'api_connection_healthy',

        // Логи
        LOG_MESSAGE: 'log_message',

        // UI
        FILE_LOADED: 'file_loaded',
        CHAPTERS_EXTRACTED: 'chapters_extracted',
        GLOSSARY_UPDATED: 'glossary_updated',
        SETTINGS_CHANGED: 'settings_changed',
        KEY_STATUSES_UPDATED: 'key_statuses_updated',

        // Глоссарий
        GLOSSARY_GENERATION_FINISHED: 'glossary_generation_finished',

        // Сборка чанков
        ASSEMBLY_FINISHED: 'assembly_finished',

        // Dry Run
        DRY_RUN_PROMPT_READY: 'dry_run_prompt_ready',

        // Результаты
        TRANSLATION_SAVED: 'translation_saved',

        // Очистка
        CLEANUP_REQUESTED: 'cleanup_requested'
    };

    // Публичный API
    return {
        on: on,
        once: once,
        off: off,
        emit: emit,
        log: log,
        clear: clear,
        clearEvent: clearEvent,
        getHistory: getHistory,
        clearHistory: clearHistory,
        setDebugMode: setDebugMode,
        listenerCount: listenerCount,
        getEventNames: getEventNames,
        EVENTS: EVENTS
    };
})();
