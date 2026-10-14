/**
 * EPUB AI Translator - Settings Manager
 * Управление настройками и хранением данных
 */

var SettingsManager = (function() {
    'use strict';

    var STORAGE_PREFIX = 'epub_translator_';
    var KEYS = {
        SETTINGS: STORAGE_PREFIX + 'settings',
        API_KEYS: STORAGE_PREFIX + 'api_keys',
        GLOSSARY: STORAGE_PREFIX + 'glossary',
        PROMPTS: STORAGE_PREFIX + 'prompts',
        GLOSSARY_PROMPTS: STORAGE_PREFIX + 'glossary_prompts',
        PROJECT_HISTORY: STORAGE_PREFIX + 'project_history',
        LAST_SESSION: STORAGE_PREFIX + 'last_session'
    };

    /**
     * Базовые методы хранения
     */
    function saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Error saving to localStorage:', e);
            return false;
        }
    }

    function loadFromStorage(key, defaultValue) {
        try {
            var data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.error('Error loading from localStorage:', e);
            return defaultValue;
        }
    }

    function removeFromStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Настройки приложения
     */
    function loadSettings() {
        return loadFromStorage(KEYS.SETTINGS, {});
    }

    function saveSettings(settings) {
        return saveToStorage(KEYS.SETTINGS, settings);
    }

    function getSetting(key, defaultValue) {
        var settings = loadSettings();
        return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
    }

    function setSetting(key, value) {
        var settings = loadSettings();
        settings[key] = value;
        return saveSettings(settings);
    }

    /**
     * API Ключи
     */
    function loadApiKeys() {
        return loadFromStorage(KEYS.API_KEYS, []);
    }

    function saveApiKeys(keysData) {
        var result = saveToStorage(KEYS.API_KEYS, keysData);
        if (result) {
            EventBus.emit(EventBus.EVENTS.KEY_STATUSES_UPDATED, {}, { source: 'SettingsManager' });
        }
        return result;
    }

    function addApiKey(keyData) {
        var keys = loadApiKeys();
        
        // Проверяем, есть ли уже такой ключ
        var exists = keys.some(function(k) { return k.key === keyData.key; });
        if (exists) return false;

        keys.push({
            key: keyData.key,
            provider: keyData.provider || 'gemini',
            name: keyData.name || '',
            statusByModel: {}
        });

        return saveApiKeys(keys);
    }

    function removeApiKey(keyToRemove) {
        var keys = loadApiKeys();
        keys = keys.filter(function(k) { return k.key !== keyToRemove; });
        return saveApiKeys(keys);
    }

    function getKeyInfo(keyToFind) {
        var keys = loadApiKeys();
        return keys.find(function(k) { return k.key === keyToFind; }) || null;
    }

    function updateKeyStatus(keyToUpdate, modelId, statusUpdate) {
        var keys = loadApiKeys();
        
        keys.forEach(function(keyInfo) {
            if (keyInfo.key === keyToUpdate) {
                if (!keyInfo.statusByModel) {
                    keyInfo.statusByModel = {};
                }
                if (!keyInfo.statusByModel[modelId]) {
                    keyInfo.statusByModel[modelId] = {
                        exhaustedAt: null,
                        exhaustedLevel: 0,
                        requests: []
                    };
                }
                Object.assign(keyInfo.statusByModel[modelId], statusUpdate);
            }
        });

        return saveApiKeys(keys);
    }

    function markKeyExhausted(key, modelId) {
        return updateKeyStatus(key, modelId, {
            exhaustedAt: Date.now(),
            exhaustedLevel: 2
        });
    }

    function clearKeyExhaustion(key, modelId) {
        return updateKeyStatus(key, modelId, {
            exhaustedAt: null,
            exhaustedLevel: 0
        });
    }

    function incrementRequestCount(key, modelId) {
        var keys = loadApiKeys();
        var now = Math.floor(Date.now() / 1000);

        keys.forEach(function(keyInfo) {
            if (keyInfo.key === key) {
                if (!keyInfo.statusByModel) keyInfo.statusByModel = {};
                if (!keyInfo.statusByModel[modelId]) {
                    keyInfo.statusByModel[modelId] = { requests: [] };
                }

                var requests = keyInfo.statusByModel[modelId].requests || [];
                requests.push(now);

                // Очищаем старые запросы (старше 25 часов)
                var cutoff = now - (25 * 3600);
                keyInfo.statusByModel[modelId].requests = requests.filter(function(ts) {
                    return ts > cutoff;
                });
            }
        });

        return saveApiKeys(keys);
    }

    function decrementRequestCount(key, modelId) {
        var keys = loadApiKeys();

        keys.forEach(function(keyInfo) {
            if (keyInfo.key === key) {
                if (keyInfo.statusByModel && keyInfo.statusByModel[modelId]) {
                    var requests = keyInfo.statusByModel[modelId].requests || [];
                    if (requests.length > 0) {
                        requests.pop();
                        keyInfo.statusByModel[modelId].requests = requests;
                    }
                }
            }
        });

        return saveApiKeys(keys);
    }

    function getRequestCount(keyInfo, modelId) {
        if (!keyInfo || !modelId) return 0;
        if (!keyInfo.statusByModel || !keyInfo.statusByModel[modelId]) return 0;

        var requests = keyInfo.statusByModel[modelId].requests || [];
        var now = Math.floor(Date.now() / 1000);
        var cutoff = now - (24 * 3600);

        return requests.filter(function(ts) { return ts > cutoff; }).length;
    }

    function isKeyLimitActive(keyInfo, modelId) {
        if (!keyInfo || !modelId) return false;
        if (!keyInfo.statusByModel || !keyInfo.statusByModel[modelId]) return false;

        var status = keyInfo.statusByModel[modelId];
        if (!status.exhaustedAt || status.exhaustedLevel < 2) return false;

        var provider = keyInfo.provider || 'gemini';
        var providerConfig = AppConfig.getProvider(provider);
        var policy = providerConfig ? providerConfig.resetPolicy : { type: 'rolling', durationHours: 24 };

        var exhaustedTime = status.exhaustedAt;
        var now = Date.now();

        if (policy.type === 'rolling') {
            var durationMs = (policy.durationHours || 24) * 60 * 60 * 1000;
            return now < exhaustedTime + durationMs;
        } else if (policy.type === 'daily') {
            // Упрощенная логика - 24 часа
            return now < exhaustedTime + (24 * 60 * 60 * 1000);
        }

        return now < exhaustedTime + (24 * 60 * 60 * 1000);
    }

    /**
     * Именованные промпты
     */
    function loadNamedPrompts() {
        return loadFromStorage(KEYS.PROMPTS, {});
    }

    function saveNamedPrompts(prompts) {
        return saveToStorage(KEYS.PROMPTS, prompts);
    }

    function savePrompt(name, promptText) {
        var prompts = loadNamedPrompts();
        prompts[name] = promptText;
        return saveNamedPrompts(prompts);
    }

    function deletePrompt(name) {
        var prompts = loadNamedPrompts();
        delete prompts[name];
        return saveNamedPrompts(prompts);
    }

    /**
     * Промпты для глоссария
     */
    function loadGlossaryPrompts() {
        return loadFromStorage(KEYS.GLOSSARY_PROMPTS, {});
    }

    function saveGlossaryPrompts(prompts) {
        return saveToStorage(KEYS.GLOSSARY_PROMPTS, prompts);
    }

    /**
     * История проектов
     */
    function loadProjectHistory() {
        return loadFromStorage(KEYS.PROJECT_HISTORY, []);
    }

    function saveProjectHistory(history) {
        return saveToStorage(KEYS.PROJECT_HISTORY, history);
    }

    function addToProjectHistory(entry) {
        var history = loadProjectHistory();

        // Удаляем дубликат, если есть
        history = history.filter(function(h) {
            return h.name !== entry.name;
        });

        // Добавляем в начало
        history.unshift(entry);

        // Ограничиваем размер
        if (history.length > 30) {
            history = history.slice(0, 30);
        }

        return saveProjectHistory(history);
    }

    /**
     * Последняя сессия
     */
    function loadLastSession() {
        return loadFromStorage(KEYS.LAST_SESSION, {});
    }

    function saveLastSession(sessionData) {
        return saveToStorage(KEYS.LAST_SESSION, sessionData);
    }

    /**
     * Последние настройки
     */
    function getLastSettings() {
        var settings = loadSettings();
        return {
            outputFolder: settings.lastOutputFolder || '',
            model: settings.lastModel || AppConfig.getDefaultModel(),
            provider: settings.lastProvider || AppConfig.getDefaultProvider(),
            temperature: settings.lastTemperature !== undefined ? parseFloat(settings.lastTemperature) : 1.0,
            rpmLimit: parseInt(settings.lastRpmLimit || 10, 10),
            chunking: settings.lastChunking !== false,
            dynamicGlossary: settings.lastDynamicGlossary !== false,
            systemInstruction: settings.lastSystemInstruction === true,
            thinkingEnabled: settings.lastThinkingEnabled === true,
            thinkingBudget: parseInt(settings.lastThinkingBudget !== undefined ? settings.lastThinkingBudget : -1, 10),
            useJieba: settings.lastUseJieba === true,
            segmentCjk: settings.lastSegmentCjk === true,
            fuzzyThreshold: parseInt(settings.lastFuzzyThreshold || 100, 10),
            chunkSize: parseInt(settings.lastChunkSize || 30000, 10),
            numInstances: parseInt(settings.lastNumInstances || 1, 10),
            glossaryAiMode: settings.lastGlossaryAiMode || 'supplement'
        };
    }

    function saveLastSettings(newSettings) {
        var settings = loadSettings();

        if (newSettings.model !== undefined) settings.lastModel = newSettings.model;
        if (newSettings.provider !== undefined) settings.lastProvider = newSettings.provider;
        if (newSettings.temperature !== undefined) settings.lastTemperature = newSettings.temperature;
        if (newSettings.rpmLimit !== undefined) settings.lastRpmLimit = newSettings.rpmLimit;
        if (newSettings.chunking !== undefined) settings.lastChunking = newSettings.chunking;
        if (newSettings.dynamicGlossary !== undefined) settings.lastDynamicGlossary = newSettings.dynamicGlossary;
        if (newSettings.systemInstruction !== undefined) settings.lastSystemInstruction = newSettings.systemInstruction;
        if (newSettings.thinkingEnabled !== undefined) settings.lastThinkingEnabled = newSettings.thinkingEnabled;
        if (newSettings.thinkingBudget !== undefined) settings.lastThinkingBudget = newSettings.thinkingBudget;
        if (newSettings.useJieba !== undefined) settings.lastUseJieba = newSettings.useJieba;
        if (newSettings.segmentCjk !== undefined) settings.lastSegmentCjk = newSettings.segmentCjk;
        if (newSettings.fuzzyThreshold !== undefined) settings.lastFuzzyThreshold = newSettings.fuzzyThreshold;
        if (newSettings.chunkSize !== undefined) settings.lastChunkSize = newSettings.chunkSize;
        if (newSettings.numInstances !== undefined) settings.lastNumInstances = newSettings.numInstances;
        if (newSettings.outputFolder !== undefined) settings.lastOutputFolder = newSettings.outputFolder;
        if (newSettings.glossaryAiMode !== undefined) settings.lastGlossaryAiMode = newSettings.glossaryAiMode;

        return saveSettings(settings);
    }

    /**
     * Пресеты промптов
     */
    function getPromptPresets() {
        var presets = loadNamedPrompts();
        // Добавляем дефолтный если пусто
        if (Object.keys(presets).length === 0) {
            presets['Художественный (дефолт)'] = AppConfig.DEFAULT_PROMPT;
        }
        return presets;
    }

    /**
     * Кастомный промпт
     */
    function getCustomPrompt() {
        return getSetting('customPrompt', AppConfig.DEFAULT_PROMPT);
    }

    function saveCustomPrompt(prompt) {
        return setSetting('customPrompt', prompt);
    }

    function getLastPromptPreset() {
        return getSetting('lastPromptPreset', null);
    }

    function saveLastPromptPreset(presetName) {
        return setSetting('lastPromptPreset', presetName);
    }

    /**
     * Экспорт/Импорт настроек
     */
    function exportAllSettings() {
        return {
            settings: loadSettings(),
            apiKeys: loadApiKeys(),
            prompts: loadNamedPrompts(),
            glossaryPrompts: loadGlossaryPrompts(),
            projectHistory: loadProjectHistory(),
            exportDate: new Date().toISOString()
        };
    }

    function importAllSettings(data) {
        try {
            if (data.settings) saveSettings(data.settings);
            if (data.apiKeys) saveApiKeys(data.apiKeys);
            if (data.prompts) saveNamedPrompts(data.prompts);
            if (data.glossaryPrompts) saveGlossaryPrompts(data.glossaryPrompts);
            if (data.projectHistory) saveProjectHistory(data.projectHistory);
            return true;
        } catch (e) {
            console.error('Error importing settings:', e);
            return false;
        }
    }

    function clearAllStorage() {
        Object.values(KEYS).forEach(function(key) {
            removeFromStorage(key);
        });
        EventBus.emit(EventBus.EVENTS.SETTINGS_CHANGED, {}, { source: 'SettingsManager' });
    }

    // Публичный API
    return {
        // Общие настройки
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        getSetting: getSetting,
        setSetting: setSetting,

        // API Ключи
        loadApiKeys: loadApiKeys,
        saveApiKeys: saveApiKeys,
        addApiKey: addApiKey,
        removeApiKey: removeApiKey,
        getKeyInfo: getKeyInfo,
        updateKeyStatus: updateKeyStatus,
        markKeyExhausted: markKeyExhausted,
        clearKeyExhaustion: clearKeyExhaustion,
        incrementRequestCount: incrementRequestCount,
        decrementRequestCount: decrementRequestCount,
        getRequestCount: getRequestCount,
        isKeyLimitActive: isKeyLimitActive,

        // Промпты
        loadNamedPrompts: loadNamedPrompts,
        saveNamedPrompts: saveNamedPrompts,
        savePrompt: savePrompt,
        deletePrompt: deletePrompt,
        loadGlossaryPrompts: loadGlossaryPrompts,
        saveGlossaryPrompts: saveGlossaryPrompts,
        getCustomPrompt: getCustomPrompt,
        saveCustomPrompt: saveCustomPrompt,
        getLastPromptPreset: getLastPromptPreset,
        saveLastPromptPreset: saveLastPromptPreset,
        getPromptPresets: getPromptPresets,

        // История
        loadProjectHistory: loadProjectHistory,
        saveProjectHistory: saveProjectHistory,
        addToProjectHistory: addToProjectHistory,

        // Сессия
        loadLastSession: loadLastSession,
        saveLastSession: saveLastSession,
        getLastSettings: getLastSettings,
        saveLastSettings: saveLastSettings,

        // Экспорт/Импорт
        exportAllSettings: exportAllSettings,
        importAllSettings: importAllSettings,
        clearAllStorage: clearAllStorage,

        // Константы
        KEYS: KEYS
    };
})();
