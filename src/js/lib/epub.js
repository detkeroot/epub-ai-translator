/**
 * EPUB AI Translator - EPUB Library Extensions
 * Дополнительные функции для работы с EPUB
 */

(function(global) {
    'use strict';

    /**
     * EPUB Parser - расширенный парсер для EPUB файлов
     */
    var EpubParser = {
        /**
         * Парсит container.xml и находит путь к OPF
         */
        parseContainer: function(containerXml) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(containerXml, 'application/xml');
            
            var rootfile = doc.querySelector('rootfile');
            if (!rootfile) {
                throw new Error('Could not find rootfile in container.xml');
            }
            
            return rootfile.getAttribute('full-path');
        },

        /**
         * Парсит OPF файл и извлекает метаданные и spine
         */
        parseOpf: function(opfContent, opfPath) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(opfContent, 'application/xml');
            
            // Определяем директорию OPF для резолюции относительных путей
            var opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
            
            // Извлекаем метаданные
            var metadata = {
                title: this._getTextContent(doc, 'title') || 'Unknown Title',
                author: this._getTextContent(doc, 'creator') || 'Unknown Author',
                language: this._getTextContent(doc, 'language') || 'en',
                identifier: this._getTextContent(doc, 'identifier') || '',
                publisher: this._getTextContent(doc, 'publisher') || '',
                description: this._getTextContent(doc, 'description') || ''
            };
            
            // Извлекаем manifest
            var manifest = {};
            var manifestItems = doc.querySelectorAll('manifest item');
            
            manifestItems.forEach(function(item) {
                var id = item.getAttribute('id');
                var href = item.getAttribute('href');
                var mediaType = item.getAttribute('media-type');
                
                manifest[id] = {
                    id: id,
                    href: opfDir + href,
                    mediaType: mediaType,
                    properties: item.getAttribute('properties') || ''
                };
            });
            
            // Извлекаем spine
            var spine = [];
            var spineEl = doc.querySelector('spine');
            var tocId = spineEl ? spineEl.getAttribute('toc') : null;
            
            var spineItems = doc.querySelectorAll('spine itemref');
            spineItems.forEach(function(item) {
                var idref = item.getAttribute('idref');
                var linear = item.getAttribute('linear') !== 'no';
                
                if (manifest[idref]) {
                    spine.push({
                        idref: idref,
                        linear: linear,
                        href: manifest[idref].href,
                        mediaType: manifest[idref].mediaType
                    });
                }
            });
            
            return {
                metadata: metadata,
                manifest: manifest,
                spine: spine,
                tocId: tocId,
                opfPath: opfPath,
                opfDir: opfDir
            };
        },

        /**
         * Вспомогательный метод для получения текстового содержимого элемента
         */
        _getTextContent: function(doc, tagName) {
            // Пробуем разные namespace-ы
            var el = doc.querySelector(tagName);
            if (!el) {
                el = doc.querySelector('dc\\:' + tagName);
            }
            if (!el) {
                el = doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tagName)[0];
            }
            return el ? el.textContent.trim() : null;
        },

        /**
         * Парсит NCX файл (для EPUB2)
         */
        parseNcx: function(ncxContent) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(ncxContent, 'application/xml');
            
            var navPoints = [];
            var navPointEls = doc.querySelectorAll('navPoint');
            
            navPointEls.forEach(function(np) {
                var label = np.querySelector('navLabel text');
                var content = np.querySelector('content');
                
                if (label && content) {
                    navPoints.push({
                        id: np.getAttribute('id'),
                        playOrder: parseInt(np.getAttribute('playOrder') || '0', 10),
                        label: label.textContent.trim(),
                        src: content.getAttribute('src')
                    });
                }
            });
            
            // Сортируем по playOrder
            navPoints.sort(function(a, b) {
                return a.playOrder - b.playOrder;
            });
            
            return navPoints;
        },

        /**
         * Парсит NAV файл (для EPUB3)
         */
        parseNav: function(navContent) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(navContent, 'application/xhtml+xml');
            
            var toc = [];
            var navEl = doc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"], nav.toc');
            
            if (navEl) {
                var links = navEl.querySelectorAll('a');
                links.forEach(function(a) {
                    toc.push({
                        label: a.textContent.trim(),
                        href: a.getAttribute('href')
                    });
                });
            }
            
            return toc;
        }
    };

    /**
     * HTML Processor - обработка HTML контента глав
     */
    var HtmlProcessor = {
        /**
         * Извлекает чистый текст из HTML
         */
        extractText: function(html) {
            var div = document.createElement('div');
            div.innerHTML = html;
            return div.textContent || div.innerText || '';
        },

        /**
         * Подсчет символов и слов
         */
        getStats: function(html) {
            var text = this.extractText(html);
            var chars = text.length;
            var words = text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
            
            return {
                characters: chars,
                words: words,
                paragraphs: (html.match(/<p[^>]*>/gi) || []).length,
                images: (html.match(/<img[^>]*>/gi) || []).length
            };
        },

        /**
         * Определяет язык контента
         */
        detectLanguage: function(html) {
            var text = this.extractText(html);
            
            // Подсчет символов разных скриптов
            var cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
            var cyrillic = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
            var latin = (text.match(/[a-zA-Z]/g) || []).length;
            
            var total = cjk + cyrillic + latin;
            if (total === 0) return 'unknown';
            
            if (cjk / total > 0.3) {
                // Определяем конкретный CJK язык
                var chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
                var japanese = (text.match(/[\u3040-\u30ff]/g) || []).length;
                var korean = (text.match(/[\uac00-\ud7af]/g) || []).length;
                
                if (japanese > chinese * 0.1) return 'ja';
                if (korean > chinese * 0.1) return 'ko';
                return 'zh';
            }
            
            if (cyrillic / total > 0.3) return 'ru';
            
            return 'en';
        },

        /**
         * Нормализует HTML для лучшего перевода
         */
        normalizeForTranslation: function(html) {
            // Удаляем лишние пробелы
            var normalized = html.replace(/\s+/g, ' ');
            
            // Убираем пустые параграфы
            normalized = normalized.replace(/<p[^>]*>\s*<\/p>/gi, '');
            
            // Нормализуем переводы строк внутри тегов
            normalized = normalized.replace(/>\s+</g, '> <');
            
            return normalized;
        },

        /**
         * Разбивает HTML на предложения
         */
        splitIntoSentences: function(html) {
            var text = this.extractText(html);
            
            // Базовое разбиение по пунктуации
            var sentences = text.split(/(?<=[.!?。！？])\s+/);
            
            return sentences.filter(function(s) { return s.trim().length > 0; });
        }
    };

    /**
     * Content Extractor - извлечение контента из EPUB элементов
     */
    var ContentExtractor = {
        /**
         * Извлекает изображения из HTML
         */
        extractImages: function(html, basePath) {
            var images = [];
            var div = document.createElement('div');
            div.innerHTML = html;
            
            var imgElements = div.querySelectorAll('img');
            imgElements.forEach(function(img) {
                var src = img.getAttribute('src');
                if (src) {
                    images.push({
                        src: src,
                        alt: img.getAttribute('alt') || '',
                        fullPath: basePath ? basePath + src : src
                    });
                }
            });
            
            return images;
        },

        /**
         * Извлекает ссылки из HTML
         */
        extractLinks: function(html) {
            var links = [];
            var div = document.createElement('div');
            div.innerHTML = html;
            
            var linkElements = div.querySelectorAll('a');
            linkElements.forEach(function(a) {
                var href = a.getAttribute('href');
                if (href) {
                    links.push({
                        href: href,
                        text: a.textContent.trim(),
                        isExternal: href.startsWith('http://') || href.startsWith('https://'),
                        isAnchor: href.startsWith('#')
                    });
                }
            });
            
            return links;
        },

        /**
         * Извлекает CSS стили
         */
        extractStyles: function(html) {
            var styles = {
                inline: [],
                linked: []
            };
            
            var div = document.createElement('div');
            div.innerHTML = html;
            
            // Inline styles
            var styleElements = div.querySelectorAll('style');
            styleElements.forEach(function(style) {
                styles.inline.push(style.textContent);
            });
            
            // Linked stylesheets
            var linkElements = div.querySelectorAll('link[rel="stylesheet"]');
            linkElements.forEach(function(link) {
                var href = link.getAttribute('href');
                if (href) {
                    styles.linked.push(href);
                }
            });
            
            return styles;
        }
    };

    /**
     * Chapter Analyzer - анализ глав
     */
    var ChapterAnalyzer = {
        /**
         * Анализирует главу и возвращает её характеристики
         */
        analyze: function(chapter) {
            var html = chapter.content || '';
            var stats = HtmlProcessor.getStats(html);
            var language = HtmlProcessor.detectLanguage(html);
            
            return {
                path: chapter.path,
                filename: chapter.filename,
                size: html.length,
                stats: stats,
                language: language,
                hasImages: stats.images > 0,
                isEmpty: stats.characters < 10,
                isCjk: ['zh', 'ja', 'ko'].indexOf(language) !== -1,
                estimatedTokens: this._estimateTokens(html, language)
            };
        },

        /**
         * Оценка количества токенов
         */
        _estimateTokens: function(html, language) {
            var text = HtmlProcessor.extractText(html);
            var chars = text.length;
            
            // Разные коэффициенты для разных языков
            if (['zh', 'ja', 'ko'].indexOf(language) !== -1) {
                return Math.ceil(chars / 1.5); // CJK - примерно 1.5 символа на токен
            } else if (language === 'ru') {
                return Math.ceil(chars / 2.2); // Кириллица - примерно 2.2 символа
            } else {
                return Math.ceil(chars / 4); // Латиница - примерно 4 символа
            }
        },

        /**
         * Группирует главы по размеру
         */
        groupBySize: function(chapters, thresholds) {
            thresholds = thresholds || { small: 5000, medium: 30000 };
            
            var groups = {
                small: [],
                medium: [],
                large: []
            };
            
            chapters.forEach(function(ch) {
                var size = ch.size || ch.content.length;
                
                if (size < thresholds.small) {
                    groups.small.push(ch);
                } else if (size < thresholds.medium) {
                    groups.medium.push(ch);
                } else {
                    groups.large.push(ch);
                }
            });
            
            return groups;
        },

        /**
         * Сортирует главы естественным порядком
         */
        sortNatural: function(chapters) {
            return chapters.slice().sort(function(a, b) {
                var pathA = a.path || a.filename || '';
                var pathB = b.path || b.filename || '';
                
                // Извлекаем числа для сравнения
                var numA = parseInt((pathA.match(/\d+/) || ['0'])[0], 10);
                var numB = parseInt((pathB.match(/\d+/) || ['0'])[0], 10);
                
                if (numA !== numB) return numA - numB;
                
                return pathA.localeCompare(pathB);
            });
        }
    };

    // Экспорт
    global.EpubParser = EpubParser;
    global.HtmlProcessor = HtmlProcessor;
    global.ContentExtractor = ContentExtractor;
    global.ChapterAnalyzer = ChapterAnalyzer;

})(typeof window !== 'undefined' ? window : this);
