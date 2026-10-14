/**
 * EPUB AI Translator - Language Tools
 * Инструменты для работы с языками, детекция, сегментация, глоссарий
 */

var LanguageTools = (function() {
    'use strict';

    // Стоп-слова
    var STOP_WORDS = {
        en: new Set(['the', 'a', 'an', 'to', 'in', 'on', 'of', 'for', 'with', 'am', 'i', 'is', 'are', 'was', 'were']),
        cjk: new Set(['的', '是', '一', '不', '人', '我', '了', '在', '有', '和', '之'])
    };

    // Морфологические суффиксы для игнорирования
    var MORPHOLOGY_SUFFIXES = ["'s", "es", "s"];

    // Пороги для fuzzy поиска
    var THRESHOLDS = {
        orderedSearch: 99,
        unorderedWords: 98,
        charSimilarity: 94,
        fuzzySearch: 89,
        relatedSearch: 84
    };

    /**
     * Language Detector - Определение языка текста
     */
    var LanguageDetector = {
        /**
         * Проверяет наличие китайских иероглифов
         * @param {string} text
         * @returns {boolean}
         */
        containsChinese: function(text) {
            return /[\u4e00-\u9fff]/.test(text);
        },

        /**
         * Проверяет наличие японских символов (хирагана, катакана)
         * @param {string} text
         * @returns {boolean}
         */
        containsJapanese: function(text) {
            return /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
        },

        /**
         * Проверяет наличие корейских символов (хангыль)
         * @param {string} text
         * @returns {boolean}
         */
        containsKorean: function(text) {
            return /[\uac00-\ud7af]/.test(text);
        },

        /**
         * Проверяет, является ли текст CJK (китайский, японский, корейский)
         * @param {string} text
         * @returns {boolean}
         */
        isCjkText: function(text) {
            return this.containsChinese(text) || 
                   this.containsJapanese(text) || 
                   this.containsKorean(text);
        },

        /**
         * Проверяет наличие кириллицы
         * @param {string} text
         * @returns {boolean}
         */
        containsCyrillic: function(text) {
            return /[а-яА-ЯёЁ]/.test(text);
        },

        /**
         * Определяет основной язык текста
         * @param {string} text
         * @returns {string} - 'cjk', 'cyrillic', 'latin', 'mixed'
         */
        detectPrimaryLanguage: function(text) {
            if (!text) return 'unknown';

            var cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
            var cyrillicCount = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
            var latinCount = (text.match(/[a-zA-Z]/g) || []).length;

            var total = cjkCount + cyrillicCount + latinCount;
            if (total === 0) return 'unknown';

            if (cjkCount / total > 0.5) return 'cjk';
            if (cyrillicCount / total > 0.5) return 'cyrillic';
            if (latinCount / total > 0.5) return 'latin';

            return 'mixed';
        }
    };

    /**
     * Text Normalizer - Нормализация текста
     */
    var TextNormalizer = {
        /**
         * Unicode нормализация NFKC
         * @param {string} text
         * @returns {string}
         */
        normalize: function(text) {
            if (!text) return '';
            return text.normalize ? text.normalize('NFKC') : text;
        },

        /**
         * Удаляет не-словесные символы
         * @param {string} text
         * @returns {string}
         */
        cleanNonWord: function(text) {
            if (!text) return '';
            return text.replace(/\W+/gu, ' ').trim();
        },

        /**
         * Нормализует слово (удаляет суффиксы)
         * @param {string} word
         * @returns {string}
         */
        normalizeWord: function(word) {
            if (!word) return '';
            for (var i = 0; i < MORPHOLOGY_SUFFIXES.length; i++) {
                var suffix = MORPHOLOGY_SUFFIXES[i];
                if (word.endsWith(suffix)) {
                    return word.slice(0, -suffix.length);
                }
            }
            return word;
        },

        /**
         * Токенизация текста
         * @param {string} text
         * @param {boolean} normalizeWords
         * @returns {Array<string>}
         */
        tokenize: function(text, normalizeWords) {
            if (!text) return [];

            var normalized = this.normalize(text);
            var cleaned = this.cleanNonWord(normalized).toLowerCase();
            var words = cleaned.split(/\s+/).filter(function(w) { return w.length > 0; });

            if (normalizeWords) {
                var self = this;
                words = words.map(function(w) { return self.normalizeWord(w); });
            }

            return words;
        },

        /**
         * Получить универсальные токены (для CJK - посимвольно)
         * @param {string} text
         * @returns {Array<string>}
         */
        getUniversalTokens: function(text) {
            if (!text) return [];

            if (LanguageDetector.isCjkText(text)) {
                return text.split('').filter(function(c) { return c.trim(); });
            }

            var normalized = this.normalize(text).toLowerCase();
            var cleaned = this.cleanNonWord(normalized);
            var tokens = cleaned.split(/\s+/).filter(function(t) { return t.length > 0; });

            var self = this;
            return tokens
                .filter(function(t) { return !STOP_WORDS.en.has(t); })
                .map(function(t) { return self.normalizeWord(t); });
        }
    };

    /**
     * Similarity Calculator - Вычисление схожести
     */
    var SimilarityCalculator = {
        /**
         * Расстояние Левенштейна
         * @param {string} s1
         * @param {string} s2
         * @returns {number} - 0 to 1
         */
        levenshteinSimilarity: function(s1, s2) {
            if (!s1 && !s2) return 1;
            if (!s1 || !s2) return 0;

            var m = s1.length;
            var n = s2.length;

            if (m < n) {
                var temp = s1; s1 = s2; s2 = temp;
                temp = m; m = n; n = temp;
            }

            if (m === 0) return 1;

            var prevRow = [];
            for (var j = 0; j <= n; j++) prevRow[j] = j;

            for (var i = 0; i < m; i++) {
                var currRow = [i + 1];
                for (j = 0; j < n; j++) {
                    var cost = s1[i] === s2[j] ? 0 : 1;
                    currRow[j + 1] = Math.min(
                        currRow[j] + 1,
                        prevRow[j + 1] + 1,
                        prevRow[j] + cost
                    );
                }
                prevRow = currRow;
            }

            return 1 - (prevRow[n] / m);
        },

        /**
         * Схожесть по "мешку символов"
         * @param {string} s1
         * @param {string} s2
         * @returns {number} - 0 to 1
         */
        bagOfCharsSimilarity: function(s1, s2) {
            if (!s1 && !s2) return 1;
            if (!s1 || !s2) return 0;

            var counter1 = Helpers.countBy(s1.split(''));
            var counter2 = Helpers.countBy(s2.split(''));

            var intersection = 0;
            for (var char in counter1) {
                if (counter2[char]) {
                    intersection += Math.min(counter1[char], counter2[char]);
                }
            }

            var total = s1.length + s2.length;
            return total > 0 ? (2 * intersection) / total : 1;
        },

        /**
         * Универсальная схожесть
         * @param {string} s1
         * @param {string} s2
         * @returns {number} - 0 to 1
         */
        calculateSimilarity: function(s1, s2) {
            if (s1 === s2) return 1;

            var tokens1 = TextNormalizer.getUniversalTokens(s1);
            var tokens2 = TextNormalizer.getUniversalTokens(s2);

            if (!tokens1.length && !tokens2.length) return 1;
            if (!tokens1.length || !tokens2.length) return 0;

            var counter1 = Helpers.countBy(tokens1);
            var counter2 = Helpers.countBy(tokens2);

            // Общие токены
            var commonMass = 0;
            for (var token in counter1) {
                if (counter2[token]) {
                    var count = Math.min(counter1[token], counter2[token]);
                    commonMass += token.length * count;
                }
            }

            var totalMass = 0;
            tokens1.forEach(function(t) { totalMass += t.length; });
            tokens2.forEach(function(t) { totalMass += t.length; });

            return totalMass > 0 ? Math.min((2 * commonMass) / totalMass, 1) : 1;
        }
    };

    /**
     * Smart Glossary Filter - Фильтрация глоссария
     */
    var GlossaryFilter = {
        /**
         * Фильтрует глоссарий для текста
         * @param {Object} fullGlossary - Полный глоссарий
         * @param {string} text - Текст для анализа
         * @param {Object} options - Опции
         * @returns {Object} - Отфильтрованный глоссарий
         */
        filterForText: function(fullGlossary, text, options) {
            options = options || {};
            var fuzzyThreshold = options.fuzzyThreshold || 100;

            if (!fullGlossary || !text) return {};

            var normalizedText = TextNormalizer.normalize(text);
            var foundOriginals = new Set();

            // Точный поиск
            var orderedMatches = this._findOrderedMatches(
                fullGlossary, 
                normalizedText, 
                fuzzyThreshold === 100
            );
            orderedMatches.forEach(function(term) { foundOriginals.add(term); });

            // Для CJK - специальный поиск
            if (LanguageDetector.isCjkText(normalizedText)) {
                var cjkMatches = this._findCjkMatches(fullGlossary, normalizedText);
                cjkMatches.forEach(function(term) { foundOriginals.add(term); });
            }

            // Формируем результат
            var result = {};
            foundOriginals.forEach(function(term) {
                if (fullGlossary[term]) {
                    result[term] = fullGlossary[term];
                }
            });

            return result;
        },

        /**
         * Поиск с сохранением порядка слов
         * @private
         */
        _findOrderedMatches: function(glossary, text, strictMode) {
            var found = new Set();
            var textLower = text.toLowerCase();

            for (var term in glossary) {
                var termNormalized = TextNormalizer.normalize(term);
                var termClean = TextNormalizer.cleanNonWord(termNormalized).toLowerCase();

                if (!termClean) continue;

                // Для CJK - простой поиск подстроки
                if (LanguageDetector.isCjkText(term)) {
                    var cleanTerm = termClean.replace(/\s+/g, '');
                    var cleanText = textLower.replace(/\s+/g, '');
                    if (cleanText.indexOf(cleanTerm) !== -1) {
                        found.add(term);
                    }
                } else {
                    // Для алфавитных языков - поиск с границами слов
                    try {
                        var pattern = '\\b' + termClean.replace(/\s+/g, '\\s+') + '\\b';
                        var regex = new RegExp(pattern, 'i');
                        if (regex.test(textLower)) {
                            found.add(term);
                        }
                    } catch (e) {
                        // Fallback на простой поиск
                        if (textLower.indexOf(termClean) !== -1) {
                            found.add(term);
                        }
                    }
                }
            }

            return found;
        },

        /**
         * Поиск CJK терминов
         * @private
         */
        _findCjkMatches: function(glossary, text) {
            var found = new Set();
            var cleanText = text.replace(/\W+/gu, '');

            // Собираем все CJK термины
            var cjkTerms = [];
            for (var term in glossary) {
                if (LanguageDetector.isCjkText(term)) {
                    var cleanTerm = TextNormalizer.normalize(term).replace(/\W+/gu, '');
                    if (cleanTerm) {
                        cjkTerms.push({ original: term, clean: cleanTerm });
                    }
                }
            }

            // Сортируем по длине (длинные первыми)
            cjkTerms.sort(function(a, b) { return b.clean.length - a.clean.length; });

            // Ищем в тексте
            cjkTerms.forEach(function(termObj) {
                if (cleanText.indexOf(termObj.clean) !== -1) {
                    found.add(termObj.original);
                }
            });

            return found;
        }
    };

    /**
     * Glossary Logic - Анализ глоссария
     */
    var GlossaryLogic = {
        /**
         * Находит прямые конфликты (один термин - разные переводы)
         * @param {Array} glossaryList - [{original, translation, note}, ...]
         * @returns {Object}
         */
        findDirectConflicts: function(glossaryList) {
            var termMap = {};

            glossaryList.forEach(function(entry) {
                var original = (entry.original || '').trim();
                if (!original) return;

                if (!termMap[original]) {
                    termMap[original] = [];
                }
                termMap[original].push(entry);
            });

            var conflicts = {};
            for (var term in termMap) {
                var entries = termMap[term];
                if (entries.length > 1) {
                    var translations = new Set();
                    entries.forEach(function(e) {
                        translations.add(e.translation + '|' + (e.note || ''));
                    });
                    if (translations.size > 1) {
                        conflicts[term] = entries;
                    }
                }
            }

            return conflicts;
        },

        /**
         * Находит группы пересечений (термины, содержащие друг друга)
         * @param {Array} glossaryList
         * @returns {Object}
         */
        findOverlapGroups: function(glossaryList) {
            var terms = glossaryList
                .map(function(e) { return (e.original || '').trim(); })
                .filter(function(t) { return t.length > 0; });

            terms = Helpers.unique(terms);
            terms.sort(function(a, b) { return a.length - b.length; });

            var groups = {};
            var inverted = {};

            for (var i = 0; i < terms.length; i++) {
                for (var j = i + 1; j < terms.length; j++) {
                    if (terms[j].indexOf(terms[i]) !== -1) {
                        if (!groups[terms[i]]) groups[terms[i]] = [];
                        groups[terms[i]].push(terms[j]);

                        if (!inverted[terms[j]]) inverted[terms[j]] = [];
                        inverted[terms[j]].push(terms[i]);
                    }
                }
            }

            return { groups: groups, inverted: inverted };
        },

        /**
         * Строит карту схожести терминов
         * @param {Array} glossaryList
         * @param {number} threshold - Порог схожести (0-100)
         * @returns {Object}
         */
        buildSimilarityMap: function(glossaryList, threshold) {
            if (!glossaryList || glossaryList.length < 2) return null;
            if (threshold > THRESHOLDS.relatedSearch) return null;

            var terms = glossaryList
                .map(function(e) { return (e.original || '').trim(); })
                .filter(function(t) { return t.length > 0; });

            terms = Helpers.unique(terms);

            var similarityMap = {};
            var minThreshold = threshold / 100;

            for (var i = 0; i < terms.length; i++) {
                for (var j = i + 1; j < terms.length; j++) {
                    var similarity = SimilarityCalculator.calculateSimilarity(terms[i], terms[j]);

                    if (similarity >= minThreshold) {
                        var percent = Math.round(similarity * 100);

                        if (!similarityMap[terms[i]]) similarityMap[terms[i]] = [];
                        similarityMap[terms[i]].push([terms[j], percent]);

                        if (!similarityMap[terms[j]]) similarityMap[terms[j]] = [];
                        similarityMap[terms[j]].push([terms[i], percent]);
                    }
                }
            }

            // Сортируем по схожести
            for (var term in similarityMap) {
                similarityMap[term].sort(function(a, b) { return b[1] - a[1]; });
            }

            return similarityMap;
        }
    };

    // Публичный API
    return {
        LanguageDetector: LanguageDetector,
        TextNormalizer: TextNormalizer,
        SimilarityCalculator: SimilarityCalculator,
        GlossaryFilter: GlossaryFilter,
        GlossaryLogic: GlossaryLogic,
        STOP_WORDS: STOP_WORDS,
        THRESHOLDS: THRESHOLDS
    };
})();
