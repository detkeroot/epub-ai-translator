/**
 * EPUB AI Translator - Helper Utilities
 * Вспомогательные функции
 */

var Helpers = (function() {
    'use strict';

    /**
     * Форматирует размер файла в читаемый вид
     * @param {number} bytes - Размер в байтах
     * @returns {string}
     */
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        var i = Math.floor(Math.log(bytes) / Math.log(1024));
        i = Math.min(i, sizes.length - 1);
        
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    /**
     * Генерирует UUID v4
     * @returns {string}
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Debounce функция
     * @param {Function} func - Функция для дебаунса
     * @param {number} wait - Задержка в мс
     * @returns {Function}
     */
    function debounce(func, wait) {
        var timeout;
        return function() {
            var context = this;
            var args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
                func.apply(context, args);
            }, wait);
        };
    }

    /**
     * Throttle функция
     * @param {Function} func - Функция для троттлинга
     * @param {number} limit - Лимит в мс
     * @returns {Function}
     */
    function throttle(func, limit) {
        var inThrottle;
        return function() {
            var context = this;
            var args = arguments;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(function() {
                    inThrottle = false;
                }, limit);
            }
        };
    }

    /**
     * Экранирует HTML спецсимволы
     * @param {string} text
     * @returns {string}
     */
    function escapeHtml(text) {
        if (!text) return '';
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    /**
     * Деэкранирует HTML спецсимволы
     * @param {string} text
     * @returns {string}
     */
    function unescapeHtml(text) {
        if (!text) return '';
        var doc = new DOMParser().parseFromString(text, 'text/html');
        return doc.body.textContent || '';
    }

    /**
     * Глубокое копирование объекта
     * @param {*} obj
     * @returns {*}
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) {
            return obj.map(function(item) { return deepClone(item); });
        }
        if (obj instanceof Object) {
            var copy = {};
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    copy[key] = deepClone(obj[key]);
                }
            }
            return copy;
        }
        return obj;
    }

    /**
     * Сливает объекты (shallow merge)
     * @param {Object} target
     * @param {...Object} sources
     * @returns {Object}
     */
    function merge(target) {
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            if (source) {
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        target[key] = source[key];
                    }
                }
            }
        }
        return target;
    }

    /**
     * Проверяет значение по эталону
     * @param {*} etalon - Эталонный тип
     * @param {*} value - Проверяемое значение
     * @param {number} minLen - Минимальная длина (опционально)
     * @returns {boolean}
     */
    function checkValue(etalon, value, minLen) {
        // Проверка типа
        if (typeof value !== typeof etalon) return false;
        if (Array.isArray(etalon) !== Array.isArray(value)) return false;

        // Если minLen не задан, проверяем на непустоту
        if (minLen === undefined) {
            return Boolean(value);
        }

        // Проверка длины
        try {
            return value.length >= minLen;
        } catch (e) {
            return false;
        }
    }

    /**
     * Форматирует время
     * @param {number} seconds
     * @returns {string}
     */
    function formatTime(seconds) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return hours + ':' + padZero(minutes) + ':' + padZero(secs);
        }
        return minutes + ':' + padZero(secs);
    }

    /**
     * Добавляет ведущий ноль
     * @param {number} num
     * @returns {string}
     */
    function padZero(num) {
        return num < 10 ? '0' + num : String(num);
    }

    /**
     * Обрезает строку до указанной длины
     * @param {string} str
     * @param {number} maxLen
     * @param {string} suffix
     * @returns {string}
     */
    function truncate(str, maxLen, suffix) {
        suffix = suffix || '...';
        if (!str || str.length <= maxLen) return str;
        return str.substring(0, maxLen - suffix.length) + suffix;
    }

    /**
     * Извлекает имя файла из пути
     * @param {string} path
     * @returns {string}
     */
    function getFileName(path) {
        if (!path) return '';
        return path.split(/[\\/]/).pop();
    }

    /**
     * Извлекает расширение файла
     * @param {string} filename
     * @returns {string}
     */
    function getFileExtension(filename) {
        if (!filename) return '';
        var parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    /**
     * Удаляет расширение из имени файла
     * @param {string} filename
     * @returns {string}
     */
    function removeExtension(filename) {
        if (!filename) return '';
        var lastDot = filename.lastIndexOf('.');
        return lastDot !== -1 ? filename.substring(0, lastDot) : filename;
    }

    /**
     * Извлекает число из строки (для сортировки)
     * @param {string} str
     * @returns {number}
     */
    function extractNumber(str) {
        if (!str) return Infinity;
        var filename = getFileName(str);
        var match = filename.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    }

    /**
     * Сортирует массив строк натуральным порядком
     * @param {Array} arr
     * @returns {Array}
     */
    function naturalSort(arr) {
        return arr.slice().sort(function(a, b) {
            return extractNumber(a) - extractNumber(b);
        });
    }

    /**
     * Ожидание (Promise-based)
     * @param {number} ms
     * @returns {Promise}
     */
    function sleep(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Повторяет вызов функции с задержкой
     * @param {Function} fn - Функция (должна возвращать Promise)
     * @param {number} retries - Количество повторов
     * @param {number} delay - Задержка между повторами (мс)
     * @returns {Promise}
     */
    function retry(fn, retries, delay) {
        retries = retries || 3;
        delay = delay || 1000;

        return fn().catch(function(error) {
            if (retries <= 0) {
                return Promise.reject(error);
            }
            return sleep(delay).then(function() {
                return retry(fn, retries - 1, delay);
            });
        });
    }

    /**
     * Группирует массив объектов по ключу
     * @param {Array} arr
     * @param {string|Function} key
     * @returns {Object}
     */
    function groupBy(arr, key) {
        return arr.reduce(function(groups, item) {
            var groupKey = typeof key === 'function' ? key(item) : item[key];
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(item);
            return groups;
        }, {});
    }

    /**
     * Создает объект счетчика из массива
     * @param {Array} arr
     * @returns {Object}
     */
    function countBy(arr) {
        return arr.reduce(function(counts, item) {
            counts[item] = (counts[item] || 0) + 1;
            return counts;
        }, {});
    }

    /**
     * Находит уникальные элементы массива
     * @param {Array} arr
     * @returns {Array}
     */
    function unique(arr) {
        return arr.filter(function(item, index) {
            return arr.indexOf(item) === index;
        });
    }

    /**
     * Скачивает файл
     * @param {Blob|string} content - Содержимое или URL
     * @param {string} filename - Имя файла
     * @param {string} mimeType - MIME тип (для строки)
     */
    function downloadFile(content, filename, mimeType) {
        var blob;
        if (content instanceof Blob) {
            blob = content;
        } else {
            mimeType = mimeType || 'text/plain;charset=utf-8';
            blob = new Blob([content], { type: mimeType });
        }

        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Читает файл как текст
     * @param {File} file
     * @returns {Promise<string>}
     */
    function readFileAsText(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function(e) { reject(e); };
            reader.readAsText(file);
        });
    }

    /**
     * Читает файл как ArrayBuffer
     * @param {File} file
     * @returns {Promise<ArrayBuffer>}
     */
    function readFileAsArrayBuffer(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function(e) { reject(e); };
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Копирует текст в буфер обмена
     * @param {string} text
     * @returns {Promise}
     */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        
        // Fallback
        return new Promise(function(resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                resolve();
            } catch (e) {
                reject(e);
            }
            document.body.removeChild(textarea);
        });
    }

    /**
     * Проверяет, является ли объект пустым
     * @param {Object} obj
     * @returns {boolean}
     */
    function isEmpty(obj) {
        if (!obj) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        return !obj;
    }

    // Публичный API
    return {
        formatSize: formatSize,
        generateUUID: generateUUID,
        debounce: debounce,
        throttle: throttle,
        escapeHtml: escapeHtml,
        unescapeHtml: unescapeHtml,
        deepClone: deepClone,
        merge: merge,
        checkValue: checkValue,
        formatTime: formatTime,
        padZero: padZero,
        truncate: truncate,
        getFileName: getFileName,
        getFileExtension: getFileExtension,
        removeExtension: removeExtension,
        extractNumber: extractNumber,
        naturalSort: naturalSort,
        sleep: sleep,
        retry: retry,
        groupBy: groupBy,
        countBy: countBy,
        unique: unique,
        downloadFile: downloadFile,
        readFileAsText: readFileAsText,
        readFileAsArrayBuffer: readFileAsArrayBuffer,
        copyToClipboard: copyToClipboard,
        isEmpty: isEmpty
    };
})();


/**
 * Token Counter - Подсчет токенов
 */
var TokenCounter = (function() {
    'use strict';

    var config = AppConfig.TEXT_PROCESSING;

    /**
     * Оценивает количество токенов в тексте
     * @param {string} text
     * @returns {number}
     */
    function estimateTokens(text) {
        if (!text) return 0;

        var totalTokens = 0;

        // ASCII символы (латиница, цифры, пробелы, пунктуация)
        var asciiChars = (text.match(/[a-zA-Z0-9\s.,:"{}\[\]_-]/g) || []).length;
        
        // Кириллица
        var cyrillicChars = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
        
        // CJK символы
        var cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;

        totalTokens += asciiChars / config.charsPerAsciiToken;
        totalTokens += cyrillicChars / config.charsPerCyrillicToken;
        totalTokens += cjkChars / config.charsPerCjkToken;

        // Остальные символы
        var otherChars = text.length - (asciiChars + cyrillicChars + cjkChars);
        totalTokens += otherChars / 2.5;

        return Math.round(totalTokens);
    }

    /**
     * Оценивает стоимость в USD
     * @param {number} inputTokens
     * @param {number} outputTokens
     * @param {string} modelName
     * @returns {number}
     */
    function estimateCost(inputTokens, outputTokens, modelName) {
        var pricing = {
            'gemini-3.8-flash': { input: 0.000025, output: 0.0001 },
            'gemini-3.7-flash': { input: 0.000025, output: 0.0001 },
            'gemini-3.6-flash': { input: 0.000025, output: 0.0001 },
            'gemini-3.5-flash': { input: 0.000025, output: 0.0001 },
            'gemini-3.1-pro': { input: 0.00025, output: 0.001 },
            'gemini-3.0-pro': { input: 0.00025, output: 0.001 },
            'gemini-2.5-pro': { input: 0.00025, output: 0.001 },
            'gemini-2.5-flash': { input: 0.000025, output: 0.0001 },
            'gemini-2.0-flash': { input: 0.000015, output: 0.00006 },
            'deepseek-v4': { input: 0.000014, output: 0.000028 },
            'deepseek-chat': { input: 0.000014, output: 0.000028 }
        };

        var modelKey = 'gemini-2.5-pro';
        for (var key in pricing) {
            if (modelName && modelName.toLowerCase().indexOf(key) !== -1) {
                modelKey = key;
                break;
            }
        }

        var rates = pricing[modelKey];
        var inputCost = (inputTokens / 1000) * rates.input;
        var outputCost = (outputTokens / 1000) * rates.output;

        return inputCost + outputCost;
    }

    /**
     * Вычисляет потенциальный размер вывода
     * @param {string} htmlContent
     * @param {boolean} isCjk
     * @returns {number}
     */
    function calculatePotentialOutputSize(htmlContent, isCjk) {
        if (!htmlContent) return 0;

        try {
            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            var visibleText = tempDiv.textContent || tempDiv.innerText || '';

            var lenHtml = htmlContent.length;
            var lenText = visibleText.length;
            var lenTags = lenHtml - lenText;

            var multiplier = isCjk ? config.cjkExpansionFactor : config.alphabeticExpansionFactor;
            var potentialTextSize = lenText * multiplier;

            // Для кириллицы увеличиваем вес
            var cyrillicWeight = 1.8;
            var weightedTextSize = potentialTextSize * cyrillicWeight;

            return Math.round(lenTags + weightedTextSize);
        } catch (e) {
            var mult = isCjk ? 10 : 3;
            return htmlContent.length * mult;
        }
    }

    return {
        estimateTokens: estimateTokens,
        estimateCost: estimateCost,
        calculatePotentialOutputSize: calculatePotentialOutputSize
    };
})();
