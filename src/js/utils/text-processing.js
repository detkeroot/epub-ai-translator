/**
 * EPUB AI Translator - Text Processing
 * Обработка и форматирование текста/HTML
 */

var TextProcessing = (function() {
    'use strict';

    // Константы для символов
    var DASH_CHARS = '—–−-';
    var COMMA_CHARS = ',，';
    var ELLIPSIS_CHAR = '…';
    var LOWERCASE_RU = 'а-яё';
    var UPPERCASE_RU = 'А-ЯЁ';
    var LOWERCASE_EN = 'a-z';
    var UPPERCASE_EN = 'A-Z';
    var ALL_LETTER_CHARS = LOWERCASE_RU + UPPERCASE_RU + LOWERCASE_EN + UPPERCASE_EN;

    // Теги для новой строки
    var TAGS_FOR_NEW_LINE = [
        '</p>', '</div>', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>',
        '</li>', '</blockquote>', '</pre>', '</tr>', '</th>', '</td>'
    ];

    /**
     * Очищает ответ API от маркеров кода
     * @param {string} content
     * @param {boolean} isHtml
     * @returns {string}
     */
    function cleanApiResponse(content, isHtml) {
        if (!content || typeof content !== 'string') return '';

        var cleaned = content.trim();
        var markers = ['```json', '```html', '```xml', '```xhtml', '```'];

        var changed = true;
        while (changed) {
            changed = false;
            markers.forEach(function(marker) {
                if (cleaned.toLowerCase().startsWith(marker)) {
                    cleaned = cleaned.slice(marker.length).trim();
                    changed = true;
                }
            });
            if (cleaned.endsWith('```')) {
                cleaned = cleaned.slice(0, -3).trim();
                changed = true;
            }
        }

        return cleaned;
    }

    /**
     * Форматирует HTML для отправки в AI
     * @param {string} htmlContent
     * @returns {string}
     */
    function prettifyHtmlForAi(htmlContent) {
        if (!htmlContent) return '';

        var content = htmlContent;

        // Объединяем абзацы с запятой
        content = content.replace(
            new RegExp('([' + COMMA_CHARS + '])\\s*</p>\\s*<p[^>]*>', 'g'),
            '$1 '
        );

        // Заменяем тире в конце абзаца на троеточие
        content = content.replace(
            new RegExp('\\s*[' + DASH_CHARS + ']+\\s*</p>', 'g'),
            '…</p>'
        );

        // Добавляем переводы строк после закрывающих тегов
        content = content.replace(/(<\/(p|h1|div)>)/gi, '$1\n');

        return content.trim();
    }

    /**
     * Форматирует HTML после перевода
     * @param {string} htmlContent
     * @returns {string}
     */
    function prettifyHtml(htmlContent) {
        if (!htmlContent) return '';

        var content = htmlContent;

        // Нормализуем последовательности пунктуации
        content = content.replace(/[?!]{2,}/g, function(match) {
            var first = match[0];
            var other = first === '!' ? '?' : '!';
            var second = match.indexOf(other) > 0 ? other : first;
            return first + second;
        });

        // Добавляем переводы строк после тегов
        TAGS_FOR_NEW_LINE.forEach(function(tag) {
            content = content.split(tag).join(tag + '\n');
        });

        // Добавляем перевод строки после <br> и <hr>
        content = content.replace(/<(br|hr)\s*\/?>/gi, '$&\n');

        // Убираем лишние пустые строки
        content = content.replace(/(\s*\n\s*){3,}/g, '\n\n');

        return content.trim();
    }

    /**
     * Находит лучшую точку разрыва в HTML
     * @param {string} text
     * @param {number} startSearch
     * @param {number} endSearch
     * @returns {number}
     */
    function findBestSplitPoint(text, startSearch, endSearch) {
        var searchArea = text.substring(startSearch, endSearch);

        // Приоритет 1: </p>
        var pos = searchArea.lastIndexOf('</p>');
        if (pos !== -1) return startSearch + pos + 4;

        // Приоритет 2: двойной <br>
        var doubleBrMatch = searchArea.match(/(<br\s*\/?>\s*){2,}/gi);
        if (doubleBrMatch) {
            var lastMatch = doubleBrMatch[doubleBrMatch.length - 1];
            pos = searchArea.lastIndexOf(lastMatch);
            if (pos !== -1) return startSearch + pos + lastMatch.length;
        }

        // Приоритет 3: закрывающие блочные теги
        var blockTagMatch = searchArea.match(/<\/(div|h[1-6]|blockquote)>/gi);
        if (blockTagMatch) {
            var lastBlock = blockTagMatch[blockTagMatch.length - 1];
            pos = searchArea.lastIndexOf(lastBlock);
            if (pos !== -1) return startSearch + pos + lastBlock.length;
        }

        // Приоритет 4: одиночный <br>
        var brMatch = searchArea.match(/<br\s*\/?>/gi);
        if (brMatch) {
            var lastBr = brMatch[brMatch.length - 1];
            pos = searchArea.lastIndexOf(lastBr);
            if (pos !== -1) return startSearch + pos + lastBr.length;
        }

        // Приоритет 5: конец предложения
        var sentenceMatch = searchArea.match(/[.!?]\s+/g);
        if (sentenceMatch) {
            var lastSentence = sentenceMatch[sentenceMatch.length - 1];
            pos = searchArea.lastIndexOf(lastSentence);
            if (pos !== -1) return startSearch + pos + lastSentence.length;
        }

        // Приоритет 6: пробел
        pos = searchArea.lastIndexOf(' ');
        if (pos !== -1) return startSearch + pos + 1;

        return -1;
    }

    /**
     * Разделяет текст на чанки
     * @param {string} text
     * @param {number} targetSize
     * @param {number} searchWindow
     * @param {number} minChunkSize
     * @returns {Array<string>}
     */
    function splitTextIntoChunks(text, targetSize, searchWindow, minChunkSize) {
        targetSize = targetSize || AppConfig.CHUNKING.defaultTargetSize;
        searchWindow = searchWindow || AppConfig.CHUNKING.searchWindow;
        minChunkSize = minChunkSize || AppConfig.CHUNKING.minChunkSize;

        var textLen = text.length;
        if (textLen <= targetSize) return [text];

        var numChunks = Math.ceil(textLen / targetSize);
        var idealChunkSize = textLen / numChunks;

        var chunks = [];
        var currentPos = 0;

        for (var i = 1; i < numChunks; i++) {
            var idealSplitPos = Math.floor(idealChunkSize * i);
            var searchStart = Math.max(currentPos + minChunkSize, idealSplitPos - searchWindow);
            var searchEnd = Math.min(textLen, idealSplitPos + searchWindow);

            var splitPos = findBestSplitPoint(text, searchStart, searchEnd);

            if (splitPos === -1 || splitPos <= currentPos) {
                splitPos = idealSplitPos;
            }

            chunks.push(text.substring(currentPos, splitPos));
            currentPos = splitPos;
        }

        chunks.push(text.substring(currentPos));

        return chunks.filter(function(chunk) { return chunk.trim(); });
    }

    /**
     * Принудительно разделяет текст на две части
     * @param {string} text
     * @returns {Object} { prefix, chunks, suffix }
     */
    function bruteForceSplit(text) {
        var contentLower = text.toLowerCase();
        var startBodyPos = contentLower.indexOf('<body');
        var endBodyPos = contentLower.lastIndexOf('</body>');

        var prefix = '', bodyContent = text, suffix = '';

        if (startBodyPos !== -1 && endBodyPos !== -1) {
            var startBodyContentPos = contentLower.indexOf('>', startBodyPos) + 1;
            prefix = text.substring(0, startBodyContentPos);
            bodyContent = text.substring(startBodyContentPos, endBodyPos);
            suffix = text.substring(endBodyPos);
        }

        var textLen = bodyContent.length;
        var midPoint = Math.floor(textLen / 2);

        var splitPos;
        if (textLen < 500) {
            splitPos = midPoint;
        } else {
            var searchStart = Math.max(0, midPoint - 100);
            var searchEnd = Math.min(textLen, midPoint + 100);
            splitPos = findBestSplitPoint(bodyContent, searchStart, searchEnd);
            if (splitPos === -1) splitPos = midPoint;
        }

        var chunks = [
            bodyContent.substring(0, splitPos),
            bodyContent.substring(splitPos)
        ];

        return { prefix: prefix, chunks: chunks, suffix: suffix };
    }

    /**
     * Извлекает body из HTML документа
     * @param {string} htmlContent
     * @returns {Object} { prefix, body, suffix }
     */
    function extractBody(htmlContent) {
        var contentLower = htmlContent.toLowerCase();
        var startMarker = '<body';
        var endMarker = '</body>';

        var startPos = contentLower.indexOf(startMarker);
        var endPos = contentLower.lastIndexOf(endMarker);

        if (startPos !== -1 && endPos !== -1) {
            var endSlicePos = endPos + endMarker.length;
            var bodyTagEnd = htmlContent.indexOf('>', startPos) + 1;
            return {
                prefix: htmlContent.substring(0, bodyTagEnd),
                body: htmlContent.substring(bodyTagEnd, endPos),
                suffix: htmlContent.substring(endPos)
            };
        }

        return { prefix: '', body: htmlContent, suffix: '' };
    }

    /**
     * Заменяет медиа-теги на плейсхолдеры для защиты от AI
     * @param {string} html 
     * @returns {Object} { html, mediaMap }
     */
    function replaceMediaWithPlaceholders(html) {
        var mediaMap = {};
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        var mediaElements = tempDiv.querySelectorAll('img, svg, picture, video, audio');
        mediaElements.forEach(function(el, index) {
            var placeholder = '<!-- MEDIA_' + index + ' -->';
            mediaMap[placeholder] = el.outerHTML;
            var comment = document.createComment(' MEDIA_' + index + ' ');
            el.parentNode.replaceChild(comment, el);
        });

        return {
            html: tempDiv.innerHTML,
            mediaMap: mediaMap
        };
    }

    /**
     * Восстанавливает медиа-теги из плейсхолдеров
     * @param {string} translatedHtml 
     * @param {Object} mediaMap 
     * @returns {string}
     */
    function restoreMediaFromPlaceholders(translatedHtml, mediaMap) {
        var result = translatedHtml;
        var lostMedia = [];

        for (var placeholder in mediaMap) {
            if (result.indexOf(placeholder) !== -1) {
                result = result.split(placeholder).join(mediaMap[placeholder]);
            } else {
                lostMedia.push(mediaMap[placeholder]);
            }
        }

        // Если AI удалил маркеры, пытаемся добавить их в конец body (fallback)
        if (lostMedia.length > 0) {
            console.warn('Lost media detected:', lostMedia.length);
            if (result.toLowerCase().indexOf('</body>') !== -1) {
                result = result.replace('</body>', '<!-- RESTORED MEDIA --> ' + lostMedia.join(' ') + '</body>');
            } else {
                result += lostMedia.join(' ');
            }
        }

        return result;
    }

    /**
     * Проверяет, является ли строка валидным XML
     * @param {string} content
     * @returns {boolean}
     */
    function isWellFormedXml(content) {
        try {
            var parser = new DOMParser();
            var doc = parser.parseFromString(content, 'application/xml');
            return !doc.querySelector('parsererror');
        } catch (e) {
            return false;
        }
    }

    /**
     * Определяет, нужно ли использовать границы слов при поиске
     * @param {string} text
     * @returns {boolean}
     */
    function shouldUseWordBoundaries(text) {
        if (!text || text.length < 25) return true;

        var textLen = text.length;

        // Подсчет CJK символов
        var cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || [];
        var cjkRatio = cjkMatches.length / textLen;

        if (cjkRatio >= 0.5) return false;

        // Подсчет алфавитных символов
        var spacedMatches = text.match(/[a-zA-Zа-яА-Я\uac00-\ud7a3]/g) || [];
        if (spacedMatches.length === 0) return false;

        // Проверка плотности пробелов
        var spaceCount = (text.match(/\s/g) || []).length;
        var spaceDensity = spaceCount / textLen;

        return spaceDensity >= 0.04;
    }

    /**
     * Заменяет термины в HTML
     * @param {string} htmlContent
     * @param {Object} replacements - { original: translation }
     * @returns {string}
     */
    function replaceTermsInHtml(htmlContent, replacements) {
        if (!replacements || !htmlContent) return htmlContent;

        // Извлекаем body
        var bodyMatch = htmlContent.match(/(<body[^>]*>.*<\/body>)/is);
        var prefix = '', bodyContent = htmlContent, suffix = '';

        if (bodyMatch) {
            prefix = htmlContent.substring(0, bodyMatch.index);
            bodyContent = bodyMatch[1];
            suffix = htmlContent.substring(bodyMatch.index + bodyMatch[1].length);
        }

        // Получаем чистый текст для эвристики
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = bodyContent;
        var cleanText = tempDiv.textContent || tempDiv.innerText || '';

        var useBoundaries = shouldUseWordBoundaries(cleanText);
        var boundary = useBoundaries ? '\\b' : '';

        // Сортируем термины по длине (длинные первыми)
        var sortedOriginals = Object.keys(replacements).sort(function(a, b) {
            return b.length - a.length;
        });

        var processedBody = bodyContent;

        sortedOriginals.forEach(function(original) {
            var translation = replacements[original];
            if (!translation) return;

            try {
                // Создаем паттерн, учитывающий теги внутри термина
                var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                var words = escaped.split(/\\?\s+/);
                var patternCore = words.join('(\\s*<[^>]+>\\s*)*');
                var patternStr = boundary + patternCore + boundary;

                var regex = new RegExp(patternStr, 'gi');

                var safeOriginal = Helpers.escapeHtml(original);
                var safeTranslation = Helpers.escapeHtml(translation);
                var replacementHtml = '<span class="glossary-term" title="' + safeOriginal + '">' + safeTranslation + '</span>';

                processedBody = processedBody.replace(regex, replacementHtml);
            } catch (e) {
                console.warn('Error replacing term "' + original + '":', e);
            }
        });

        return prefix + processedBody + suffix;
    }

    /**
     * Восстанавливает JSON из поврежденной строки
     * @param {string} jsonString
     * @returns {string|null}
     */
    function repairJsonString(jsonString) {
        if (!jsonString || typeof jsonString !== 'string') return null;

        // Ищем все блоки "ключ": { ... }
        var entryPattern = /"([^"]+)":\s*\{/g;
        var matches = [];
        var match;

        while ((match = entryPattern.exec(jsonString)) !== null) {
            matches.push({
                key: match[1],
                startPos: match.index,
                contentStart: match.index + match[0].length
            });
        }

        if (matches.length === 0) return null;

        var rescuedPairs = [];

        matches.forEach(function(entry, i) {
            var contentEnd = i + 1 < matches.length 
                ? matches[i + 1].startPos 
                : jsonString.length;

            var content = jsonString.substring(entry.contentStart, contentEnd);

            // Пытаемся найти закрывающую скобку
            var openBraces = 0;
            var inString = false;
            var lastBracePos = -1;

            for (var j = 0; j < content.length; j++) {
                var char = content[j];
                if (char === '"' && (j === 0 || content[j - 1] !== '\\')) {
                    inString = !inString;
                } else if (!inString) {
                    if (char === '{') openBraces++;
                    else if (char === '}') {
                        openBraces--;
                        if (openBraces === -1) {
                            lastBracePos = j;
                            break;
                        }
                    }
                }
            }

            var keyStr = '"' + entry.key + '"';
            var valueStr = null;

            if (lastBracePos !== -1) {
                var potentialValue = '{' + content.substring(0, lastBracePos + 1);
                try {
                    JSON.parse(potentialValue);
                    valueStr = potentialValue;
                } catch (e) {
                    // Не валидный JSON
                }
            }

            if (!valueStr) {
                // Пытаемся добавить закрывающие скобки
                for (var k = 1; k <= 5; k++) {
                    var closingBraces = '}'.repeat(k);
                    var testValue = '{' + content.trim().replace(/,\s*$/, '') + closingBraces;
                    try {
                        JSON.parse(testValue);
                        valueStr = testValue;
                        break;
                    } catch (e) {
                        // Продолжаем
                    }
                }
            }

            if (valueStr) {
                rescuedPairs.push([keyStr, valueStr]);
            }
        });

        if (rescuedPairs.length === 0) return null;

        var innerJson = rescuedPairs.map(function(pair) {
            return pair[0] + ':' + pair[1];
        }).join(',');

        return '{' + innerJson + '}';
    }

    // Публичный API
    return {
        cleanApiResponse: cleanApiResponse,
        prettifyHtmlForAi: prettifyHtmlForAi,
        prettifyHtml: prettifyHtml,
        findBestSplitPoint: findBestSplitPoint,
        splitTextIntoChunks: splitTextIntoChunks,
        bruteForceSplit: bruteForceSplit,
        extractBody: extractBody,
        isWellFormedXml: isWellFormedXml,
        shouldUseWordBoundaries: shouldUseWordBoundaries,
        replaceTermsInHtml: replaceTermsInHtml,
        repairJsonString: repairJsonString
    };
})();
