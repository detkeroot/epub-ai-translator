/**
 * EPUB AI Translator - Response Validator
 * Валидация ответов API на основе структурного сходства
 */

var ResponseValidator = (function() {
    'use strict';

    /**
     * Создает "отпечаток" структуры HTML (на основе Python версии)
     */
    function createStructuralFingerprint(html) {
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        var fp = {
            headings: 0,
            images: tempDiv.querySelectorAll('img, svg, picture').length,
            links: tempDiv.querySelectorAll('a').length,
            lists: tempDiv.querySelectorAll('ol, ul, li').length,
            paragraphs: tempDiv.querySelectorAll('p, div').length
        };

        var headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
        fp.headings = headings.length;

        return fp;
    }

    /**
     * Проверяет наличие кириллицы
     */
    function hasCyrillic(text) {
        return /[а-яА-ЯёЁ]/.test(text);
    }

    /**
     * Проверяет баланс тегов
     */
    function checkTagBalance(html, tagName) {
        var openPattern = new RegExp('<' + tagName + '(?:\\s|>)', 'gi');
        var closePattern = new RegExp('</' + tagName + '>', 'gi');
        
        var openCount = (html.match(openPattern) || []).length;
        var closeCount = (html.match(closePattern) || []).length;

        return { open: openCount, close: closeCount, balanced: openCount === closeCount };
    }

    /**
     * Главная функция валидации
     */
    function validateResponse(originalHtml, translatedHtml, options) {
        options = options || {};
        var result = { isValid: true, reason: 'OK', warnings: [] };

        if (!translatedHtml || !translatedHtml.trim()) {
            return { isValid: false, reason: 'API вернуло пустой ответ' };
        }

        // 1. Проверка фундаментальных тегов
        var tagsToSearch = {
            '<html>': /<html/i,
            '<body>': /<body/i,
            '</body>': /<\/body>/i,
            '</html>': /<\/html>/i
        };

        for (var tagName in tagsToSearch) {
            if (tagsToSearch[tagName].test(originalHtml) && !tagsToSearch[tagName].test(translatedHtml)) {
                return { isValid: false, reason: 'Потерян фундаментальный тег ' + tagName };
            }
        }

        // 2. Сравнение структурных отпечатков
        var origFp = createStructuralFingerprint(originalHtml);
        var transFp = createStructuralFingerprint(translatedHtml);

        if (origFp.headings !== transFp.headings) {
            result.warnings.push('Несоответствие заголовков: ' + origFp.headings + ' vs ' + transFp.headings);
        }
        
        // В Python если пропали картинки или ссылки - это серьезное предупреждение
        if (origFp.images > transFp.images) {
            result.warnings.push('Потеряно изображений: ' + (origFp.images - transFp.images));
        }
        
        if (origFp.links > transFp.links) {
            result.warnings.push('Потеряно ссылок: ' + (origFp.links - transFp.links));
        }

        // 3. Проверка длины текста (эвристика из Python: не короче чем 1/8 оригинала для больших текстов)
        var tempOrig = document.createElement('div');
        tempOrig.innerHTML = originalHtml;
        var textOrig = tempOrig.textContent || '';

        var tempTrans = document.createElement('div');
        tempTrans.innerHTML = translatedHtml;
        var textTrans = tempTrans.textContent || '';

        if (textOrig.length > 500 && textTrans.length < textOrig.length / 8) {
            return { isValid: false, reason: 'Ответ слишком короткий (' + textTrans.length + ' симв. против ' + textOrig.length + ')' };
        }

        // 4. Проверка кириллицы (если ожидается русский)
        if (options.expectsCyrillic && textTrans.length > 100 && !hasCyrillic(textTrans)) {
            return { isValid: false, reason: 'В ответе отсутствует кириллица' };
        }

        return result;
    }

    return {
        validateResponse: validateResponse,
        hasCyrillic: hasCyrillic
    };
})();
