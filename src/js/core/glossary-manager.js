/**
 * EPUB AI Translator - Glossary Manager
 * Управление глоссарием
 */

var GlossaryManager = (function() {
    'use strict';

    var STORAGE_KEY = 'epub_translator_glossary';

    // Текущий глоссарий в памяти
    var glossary = [];
    var similarityMap = null;
    var fuzzyThreshold = 100;

    /**
     * Загружает глоссарий из localStorage
     * @returns {Array}
     */
    function load() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            glossary = data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Error loading glossary:', e);
            glossary = [];
        }
        return glossary;
    }

    /**
     * Сохраняет глоссарий в localStorage
     * @returns {boolean}
     */
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(glossary));
            EventBus.emit(EventBus.EVENTS.GLOSSARY_UPDATED, { count: glossary.length }, { source: 'GlossaryManager' });
            return true;
        } catch (e) {
            console.error('Error saving glossary:', e);
            return false;
        }
    }

    /**
     * Возвращает текущий глоссарий
     * @returns {Array}
     */
    function getAll() {
        return glossary.slice();
    }

    /**
     * Возвращает глоссарий как объект { original: { translation, note } }
     * @returns {Object}
     */
    function toObject() {
        var result = {};
        glossary.forEach(function(entry) {
            if (entry.original) {
                result[entry.original] = {
                    translation: entry.translation || '',
                    note: entry.note || ''
                };
            }
        });
        return result;
    }

    /**
     * Устанавливает глоссарий из массива
     * @param {Array} newGlossary
     */
    function setAll(newGlossary) {
        glossary = Array.isArray(newGlossary) ? newGlossary : [];
        similarityMap = null;
        save();
    }

    /**
     * Устанавливает глоссарий из объекта
     * @param {Object} glossaryObject
     */
    function fromObject(glossaryObject) {
        glossary = [];
        for (var original in glossaryObject) {
            if (glossaryObject.hasOwnProperty(original)) {
                var data = glossaryObject[original];
                glossary.push({
                    original: original,
                    translation: typeof data === 'string' ? data : (data.translation || ''),
                    note: typeof data === 'object' ? (data.note || '') : ''
                });
            }
        }
        similarityMap = null;
        save();
    }

    /**
     * Добавляет термин
     * @param {Object} entry - { original, translation, note }
     * @returns {boolean}
     */
    function addTerm(entry) {
        if (!entry || !entry.original) return false;

        // Проверяем на дубликат
        var exists = glossary.some(function(e) {
            return e.original === entry.original;
        });

        if (exists) {
            // Обновляем существующий
            glossary.forEach(function(e) {
                if (e.original === entry.original) {
                    e.translation = entry.translation || e.translation;
                    e.note = entry.note !== undefined ? entry.note : e.note;
                }
            });
        } else {
            glossary.push({
                original: entry.original,
                translation: entry.translation || '',
                note: entry.note || ''
            });
        }

        similarityMap = null;
        save();
        return true;
    }

    /**
     * Обновляет термин
     * @param {string} original - Исходный термин
     * @param {Object} updates - { translation?, note?, newOriginal? }
     * @returns {boolean}
     */
    function updateTerm(original, updates) {
        var found = false;

        glossary.forEach(function(entry) {
            if (entry.original === original) {
                if (updates.translation !== undefined) entry.translation = updates.translation;
                if (updates.note !== undefined) entry.note = updates.note;
                if (updates.newOriginal) entry.original = updates.newOriginal;
                found = true;
            }
        });

        if (found) {
            similarityMap = null;
            save();
        }

        return found;
    }

    /**
     * Удаляет термин
     * @param {string} original
     * @returns {boolean}
     */
    function removeTerm(original) {
        var initialLength = glossary.length;
        glossary = glossary.filter(function(e) {
            return e.original !== original;
        });

        if (glossary.length !== initialLength) {
            similarityMap = null;
            save();
            return true;
        }

        return false;
    }

    /**
     * Очищает глоссарий
     */
    function clear() {
        glossary = [];
        similarityMap = null;
        save();
    }

    /**
     * Возвращает количество терминов
     * @returns {number}
     */
    function count() {
        return glossary.length;
    }

    /**
     * Ищет термины
     * @param {string} query
     * @returns {Array}
     */
    function search(query) {
        if (!query) return glossary.slice();

        var lowerQuery = query.toLowerCase();

        return glossary.filter(function(entry) {
            return (entry.original && entry.original.toLowerCase().indexOf(lowerQuery) !== -1) ||
                   (entry.translation && entry.translation.toLowerCase().indexOf(lowerQuery) !== -1) ||
                   (entry.note && entry.note.toLowerCase().indexOf(lowerQuery) !== -1);
        });
    }

    /**
     * Экспортирует глоссарий в JSON
     * @returns {string}
     */
    function exportToJson() {
        return JSON.stringify(glossary, null, 2);
    }

    /**
     * Экспортирует глоссарий в CSV
     * @returns {string}
     */
    function exportToCsv() {
        var lines = ['original,translation,note'];

        glossary.forEach(function(entry) {
            var original = '"' + (entry.original || '').replace(/"/g, '""') + '"';
            var translation = '"' + (entry.translation || '').replace(/"/g, '""') + '"';
            var note = '"' + (entry.note || '').replace(/"/g, '""') + '"';
            lines.push(original + ',' + translation + ',' + note);
        });

        return lines.join('\n');
    }

    /**
     * Импортирует глоссарий из JSON
     * @param {string} jsonString
     * @param {string} mode - 'replace', 'merge', 'supplement'
     * @returns {Object} { success, count, errors }
     */
    function importFromJson(jsonString, mode) {
        mode = mode || 'replace';

        try {
            var data = JSON.parse(jsonString);
            var entries = [];

            // Обрабатываем разные форматы
            if (Array.isArray(data)) {
                entries = data;
            } else if (typeof data === 'object') {
                // Формат { original: { translation, note } }
                for (var key in data) {
                    if (data.hasOwnProperty(key)) {
                        var value = data[key];
                        entries.push({
                            original: key,
                            translation: typeof value === 'string' ? value : (value.translation || ''),
                            note: typeof value === 'object' ? (value.note || '') : ''
                        });
                    }
                }
            }

            return mergeEntries(entries, mode);
        } catch (e) {
            return { success: false, count: 0, errors: [e.message] };
        }
    }

    /**
     * Импортирует глоссарий из CSV
     * @param {string} csvString
     * @param {string} mode
     * @returns {Object}
     */
    function importFromCsv(csvString, mode) {
        mode = mode || 'replace';

        try {
            var lines = csvString.split('\n');
            var entries = [];
            var errors = [];

            // Пропускаем заголовок
            for (var i = 1; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line) continue;

                try {
                    var parts = parseCsvLine(line);
                    if (parts.length >= 2) {
                        entries.push({
                            original: parts[0],
                            translation: parts[1],
                            note: parts[2] || ''
                        });
                    }
                } catch (e) {
                    errors.push('Line ' + (i + 1) + ': ' + e.message);
                }
            }

            var result = mergeEntries(entries, mode);
            result.errors = result.errors.concat(errors);
            return result;
        } catch (e) {
            return { success: false, count: 0, errors: [e.message] };
        }
    }

    /**
     * Парсит строку CSV
     * @private
     */
    function parseCsvLine(line) {
        var result = [];
        var current = '';
        var inQuotes = false;

        for (var i = 0; i < line.length; i++) {
            var char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    /**
     * Сливает записи с существующим глоссарием
     * @private
     */
    function mergeEntries(entries, mode) {
        var addedCount = 0;
        var errors = [];

        entries = entries.filter(function(e) {
            if (!e.original || !e.original.trim()) {
                return false;
            }
            return true;
        });

        if (mode === 'replace') {
            glossary = entries;
            addedCount = entries.length;
        } else if (mode === 'merge' || mode === 'update') {
            var existingMap = {};
            glossary.forEach(function(e) {
                existingMap[e.original.toLowerCase()] = e;
            });

            entries.forEach(function(entry) {
                var key = entry.original.toLowerCase();
                if (existingMap[key]) {
                    // Обновляем
                    existingMap[key].translation = entry.translation || existingMap[key].translation;
                    existingMap[key].note = entry.note || existingMap[key].note;
                } else {
                    glossary.push(entry);
                    existingMap[key] = entry;
                }
                addedCount++;
            });
        } else if (mode === 'supplement') {
            var existingOriginals = new Set(glossary.map(function(e) {
                return e.original.toLowerCase();
            }));

            entries.forEach(function(entry) {
                if (!existingOriginals.has(entry.original.toLowerCase())) {
                    glossary.push(entry);
                    addedCount++;
                }
            });
        }

        similarityMap = null;
        save();

        return { success: true, count: addedCount, errors: errors };
    }

    /**
     * Обновляет настройки фильтрации
     * @param {Object} settings
     */
    function updateSettings(settings) {
        if (settings.fuzzyThreshold !== undefined) {
            fuzzyThreshold = settings.fuzzyThreshold;
        }

        // Перестраиваем карту схожести если нужно
        if (fuzzyThreshold < 100 && glossary.length > 1) {
            similarityMap = LanguageTools.GlossaryLogic.buildSimilarityMap(glossary, fuzzyThreshold);
        } else {
            similarityMap = null;
        }
    }

    /**
     * Фильтрует глоссарий для текста
     * @param {string} text
     * @param {Object} options
     * @returns {Object}
     */
    function filterForText(text, options) {
        options = options || {};
        var threshold = options.fuzzyThreshold || fuzzyThreshold;

        return LanguageTools.GlossaryFilter.filterForText(
            toObject(),
            text,
            { 
                fuzzyThreshold: threshold,
                similarityMap: similarityMap
            }
        );
    }

    /**
     * Форматирует глоссарий для промпта
     * @param {string} textContent - Текст для динамической фильтрации (опционально)
     * @param {boolean} useDynamic - Использовать динамическую фильтрацию
     * @returns {Object} { glossaryString, contextString, stats }
     */
    function formatForPrompt(textContent, useDynamic) {
        var glossaryToUse = toObject();
        var stats = null;

        if (useDynamic && textContent && Object.keys(glossaryToUse).length > 0) {
            var originalSize = Object.keys(glossaryToUse).length;
            // Используем SmartGlossaryFilter если доступен
            glossaryToUse = filterForText(textContent, { fuzzyThreshold: fuzzyThreshold });
            var filteredSize = Object.keys(glossaryToUse).length;

            stats = {
                original: originalSize,
                filtered: filteredSize,
                reductionPercent: originalSize > 0 ? ((1 - filteredSize / originalSize) * 100).toFixed(1) : 0
            };
        }

        var glossaryLines = [];
        var contextLines = [];

        for (var original in glossaryToUse) {
            var data = glossaryToUse[original];
            var translation = typeof data === 'string' ? data : (data ? data.translation : '');
            var note = typeof data === 'object' ? (data ? data.note : '') : '';

            if (translation) {
                glossaryLines.push('* "' + original + '" = "' + translation + '"');
                if (note) {
                    contextLines.push('* ' + translation + ' - ' + note);
                }
            }
        }

        return {
            glossaryString: glossaryLines.length > 0 ? glossaryLines.join('\n') : 'Глоссарий пуст.',
            contextString: contextLines.length > 0 ? contextLines.join('\n') : 'Дополнительный контекст не предоставлен.',
            stats: stats
        };
    }

    /**
     * Находит конфликты в глоссарии
     * @returns {Object}
     */
    function findConflicts() {
        return LanguageTools.GlossaryLogic.findDirectConflicts(glossary);
    }

    /**
     * Находит пересечения терминов
     * @returns {Object}
     */
    function findOverlaps() {
        return LanguageTools.GlossaryLogic.findOverlapGroups(glossary);
    }

    /**
     * Агрегатор глоссария (для слияния результатов AI)
     */
    var Aggregator = {
        /**
         * Сливает новые термины на основе режима
         * @param {Array} initialGlossary - Исходный список
         * @param {Array} newTerms - Новые термины от AI
         * @param {string} mode - 'accumulate', 'supplement', 'update'
         * @returns {Array}
         */
        merge: function(initialGlossary, newTerms, mode) {
            initialGlossary = initialGlossary || [];
            if (!Array.isArray(newTerms)) return initialGlossary.slice();
            mode = mode || 'supplement';

            if (mode === 'accumulate') {
                return initialGlossary.concat(newTerms);
            }

            if (mode === 'supplement') {
                var existingKeys = new Set(initialGlossary.map(function(e) {
                    return (e.original || '').trim().toLowerCase();
                }));

                var result = initialGlossary.slice();
                newTerms.forEach(function(term) {
                    var key = (term.original || '').trim().toLowerCase();
                    if (key && !existingKeys.has(key)) {
                        result.push(term);
                        existingKeys.add(key);
                    }
                });
                return result;
            }

            if (mode === 'update') {
                var existingMap = {};
                initialGlossary.forEach(function(e) {
                    var key = (e.original || '').trim().toLowerCase();
                    if (key) existingMap[key] = e;
                });

                newTerms.forEach(function(term) {
                    var key = (term.original || '').trim().toLowerCase();
                    if (key) {
                        // AI перезаписывает старое значение
                        existingMap[key] = term;
                    }
                });

                return Object.keys(existingMap).map(function(k) { return existingMap[k]; });
            }

            return initialGlossary.slice();
        }
    };

    // Инициализация
    load();

    // Публичный API
    return {
        load: load,
        save: save,
        getAll: getAll,
        toObject: toObject,
        setAll: setAll,
        fromObject: fromObject,
        addTerm: addTerm,
        updateTerm: updateTerm,
        removeTerm: removeTerm,
        clear: clear,
        count: count,
        search: search,
        exportToJson: exportToJson,
        exportToCsv: exportToCsv,
        importFromJson: importFromJson,
        importFromCsv: importFromCsv,
        updateSettings: updateSettings,
        filterForText: filterForText,
        formatForPrompt: formatForPrompt,
        findConflicts: findConflicts,
        findOverlaps: findOverlaps,
        Aggregator: Aggregator
    };
})();
