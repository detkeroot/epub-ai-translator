/**
 * EPUB AI Translator - EPUB Tools
 * Инструменты для работы с EPUB файлами
 */

var EpubTools = (function() {
    'use strict';

    /**
     * EPUB Reader - Чтение EPUB файлов
     */
    var EpubReader = {
        /**
         * Читает EPUB файл и извлекает главы
         * @param {File|ArrayBuffer} file
         * @returns {Promise<Object>}
         */
        read: function(file) {
            var self = this;

            return new Promise(function(resolve, reject) {
                var loadPromise;

                if (file instanceof File) {
                    loadPromise = Helpers.readFileAsArrayBuffer(file);
                } else if (file instanceof ArrayBuffer) {
                    loadPromise = Promise.resolve(file);
                } else {
                    reject(new Error('Invalid input: expected File or ArrayBuffer'));
                    return;
                }

                loadPromise
                    .then(function(arrayBuffer) {
                        if (typeof JSZip === 'undefined') {
                            throw new Error('JSZip library not loaded');
                        }
                        return JSZip.loadAsync(arrayBuffer);
                    })
                    .then(function(zip) {
                        return self._parseEpub(zip);
                    })
                    .then(resolve)
                    .catch(function(err) {
                        console.error('EPUB read error:', err);
                        reject(err);
                    });
            });
        },

        /**
         * Парсит содержимое EPUB
         * @private
         */
        _parseEpub: function(zip) {
            var self = this;

            return this._findOpfPath(zip)
                .then(function(opfPath) {
                    return self._parseOpf(zip, opfPath);
                })
                .then(function(opfData) {
                    return self._extractChapters(zip, opfData);
                });
        },

        /**
         * Находит путь к OPF файлу
         * @private
         */
        _findOpfPath: function(zip) {
            var containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) {
                return Promise.reject(new Error('container.xml not found - invalid EPUB'));
            }
            
            return containerFile.async('string')
                .then(function(content) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(content, 'application/xml');
                    var rootfile = doc.querySelector('rootfile');

                    if (!rootfile) {
                        throw new Error('Could not find rootfile in container.xml');
                    }

                    return rootfile.getAttribute('full-path');
                });
        },

        /**
         * Парсит OPF файл
         * @private
         */
        _parseOpf: function(zip, opfPath) {
            var opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
            var opfFile = zip.file(opfPath);
            
            if (!opfFile) {
                return Promise.reject(new Error('OPF file not found: ' + opfPath));
            }

            return opfFile.async('string')
                .then(function(content) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(content, 'application/xml');

                    // Извлекаем метаданные
                    var metadata = {
                        title: '',
                        author: '',
                        language: ''
                    };

                    var titleEl = doc.querySelector('title');
                    var creatorEl = doc.querySelector('creator');
                    var languageEl = doc.querySelector('language');

                    if (titleEl) metadata.title = titleEl.textContent;
                    if (creatorEl) metadata.author = creatorEl.textContent;
                    if (languageEl) metadata.language = languageEl.textContent;

                    // Извлекаем manifest
                    var manifest = {};
                    var manifestItems = doc.querySelectorAll('manifest item');

                    manifestItems.forEach(function(item) {
                        var id = item.getAttribute('id');
                        var href = item.getAttribute('href');
                        var mediaType = item.getAttribute('media-type');

                        // Правильно соединяем пути
                        var fullHref = href;
                        if (opfDir && !href.startsWith('/')) {
                            fullHref = opfDir + href;
                        }

                        manifest[id] = {
                            id: id,
                            href: fullHref,
                            mediaType: mediaType
                        };
                    });

                    // Извлекаем spine (порядок глав)
                    var spine = [];
                    var spineItems = doc.querySelectorAll('spine itemref');

                    spineItems.forEach(function(item) {
                        var idref = item.getAttribute('idref');
                        if (manifest[idref]) {
                            spine.push(manifest[idref]);
                        }
                    });

                    return {
                        opfPath: opfPath,
                        opfDir: opfDir,
                        metadata: metadata,
                        manifest: manifest,
                        spine: spine
                    };
                });
        },

        /**
         * Извлекает главы
         * @private
         */
        _extractChapters: function(zip, opfData) {
            var promises = [];
            var validItems = [];

            opfData.spine.forEach(function(item, index) {
                if (item.mediaType === 'application/xhtml+xml' || 
                    item.mediaType === 'text/html' ||
                    (item.href && item.href.match(/\.(x?html?)$/i))) {

                    var zipFile = zip.file(item.href);
                    if (zipFile) {
                        validItems.push({ item: item, index: index });
                        var promise = zipFile.async('string')
                            .then(function(content) {
                                return {
                                    index: index,
                                    path: item.href,
                                    filename: Helpers.getFileName(item.href),
                                    content: content,
                                    size: content.length
                                };
                            })
                            .catch(function(err) {
                                console.warn('Failed to read chapter:', item.href, err);
                                return null;
                            });
                        promises.push(promise);
                    }
                }
            });

            return Promise.all(promises)
                .then(function(results) {
                    // Фильтруем null результаты и сортируем по индексу
                    var validResults = results.filter(function(r) { return r !== null; });
                    validResults.sort(function(a, b) { return a.index - b.index; });

                    return {
                        metadata: opfData.metadata,
                        chapters: validResults,
                        zip: zip,
                        opfData: opfData
                    };
                });
        }
    };

    /**
     * EPUB Creator - Создание EPUB файлов
     */
    var EpubCreator = {
        /**
         * Создает EPUB из глав
         * @param {Object} options
         * @returns {Promise<Blob>}
         */
        create: function(options) {
            var self = this;
            var title = options.title || 'Untitled';
            var author = options.author || 'Unknown';
            var language = options.language || 'ru';
            var chapters = options.chapters || [];
            var uuid = Helpers.generateUUID();

            var zip = new JSZip();

            // mimetype (без сжатия)
            zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

            // META-INF/container.xml
            zip.file('META-INF/container.xml', this._createContainer());

            // OEBPS/content.opf
            zip.file('OEBPS/content.opf', this._createOpf(title, author, language, uuid, chapters));

            // OEBPS/toc.ncx
            zip.file('OEBPS/toc.ncx', this._createNcx(title, uuid, chapters));

            // OEBPS/styles.css
            zip.file('OEBPS/styles.css', this._createStyles());

            // Добавляем главы
            chapters.forEach(function(chapter) {
                var filename = chapter.filename || ('chapter_' + (chapter.index + 1) + '.xhtml');
                zip.file('OEBPS/' + filename, chapter.content);
            });

            return zip.generateAsync({ 
                type: 'blob',
                mimeType: 'application/epub+zip',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 }
            });
        },

        _createContainer: function() {
            return [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
                '  <rootfiles>',
                '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
                '  </rootfiles>',
                '</container>'
            ].join('\n');
        },

        _createOpf: function(title, author, language, uuid, chapters) {
            var manifestItems = chapters.map(function(ch, i) {
                var filename = ch.filename || ('chapter_' + (i + 1) + '.xhtml');
                var id = 'chapter' + (i + 1);
                return '    <item id="' + id + '" href="' + filename + '" media-type="application/xhtml+xml"/>';
            }).join('\n');

            var spineItems = chapters.map(function(ch, i) {
                var id = 'chapter' + (i + 1);
                return '    <itemref idref="' + id + '"/>';
            }).join('\n');

            return [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="2.0">',
                '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">',
                '    <dc:title>' + Helpers.escapeHtml(title) + '</dc:title>',
                '    <dc:creator>' + Helpers.escapeHtml(author) + '</dc:creator>',
                '    <dc:language>' + language + '</dc:language>',
                '    <dc:identifier id="BookID">urn:uuid:' + uuid + '</dc:identifier>',
                '  </metadata>',
                '  <manifest>',
                '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '    <item id="styles" href="styles.css" media-type="text/css"/>',
                manifestItems,
                '  </manifest>',
                '  <spine toc="ncx">',
                spineItems,
                '  </spine>',
                '</package>'
            ].join('\n');
        },

        _createNcx: function(title, uuid, chapters) {
            var navPoints = chapters.map(function(ch, i) {
                var filename = ch.filename || ('chapter_' + (i + 1) + '.xhtml');
                var chTitle = ch.title || ('Chapter ' + (i + 1));
                return [
                    '    <navPoint id="navPoint-' + (i + 1) + '" playOrder="' + (i + 1) + '">',
                    '      <navLabel><text>' + Helpers.escapeHtml(chTitle) + '</text></navLabel>',
                    '      <content src="' + filename + '"/>',
                    '    </navPoint>'
                ].join('\n');
            }).join('\n');

            return [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">',
                '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
                '  <head>',
                '    <meta name="dtb:uid" content="urn:uuid:' + uuid + '"/>',
                '    <meta name="dtb:depth" content="1"/>',
                '    <meta name="dtb:totalPageCount" content="0"/>',
                '    <meta name="dtb:maxPageNumber" content="0"/>',
                '  </head>',
                '  <docTitle><text>' + Helpers.escapeHtml(title) + '</text></docTitle>',
                '  <navMap>',
                navPoints,
                '  </navMap>',
                '</ncx>'
            ].join('\n');
        },

        _createStyles: function() {
            return [
                'body { font-family: Georgia, serif; margin: 1em; }',
                'p { text-indent: 1.5em; margin: 0; line-height: 1.6; }',
                'h1, h2, h3 { margin: 1em 0 0.5em; }',
                '.glossary-term { color: #0066cc; border-bottom: 1px dotted #0066cc; cursor: help; }'
            ].join('\n');
        }
    };

    /**
     * EPUB Updater - Обновление EPUB файлов
     */
    var EpubUpdater = {
        /**
         * Обновляет EPUB с переведенными главами
         * @param {Object} originalEpub - Результат EpubReader.read()
         * @param {Object} translations - { originalPath: translatedContent }
         * @param {Object} options
         * @returns {Promise<Blob>}
         */
        update: function(originalEpub, translations, options) {
            options = options || {};
            var fileSuffix = options.fileSuffix || '_translated';

            var zip = originalEpub.zip;
            if (!zip) {
                // Если ZIP не сохранен (например, TXT импорт), используем EpubCreator
                return Promise.reject(new Error('Original EPUB ZIP data not available'));
            }

            var newZip = new JSZip();

            // Карта замен имен файлов и путей
            var pathMap = {};
            var filenameMap = {};

            var allSuffixes = AppConfig.getAllTranslatedSuffixes();

            Object.keys(translations).forEach(function(originalPath) {
                var oldFilename = Helpers.getFileName(originalPath);
                var ext = Helpers.getFileExtension(oldFilename);
                var baseName = Helpers.removeExtension(oldFilename);
                
                // Проверяем, нет ли уже суффикса (чтобы не плодить _translated_translated)
                allSuffixes.forEach(function(s) {
                    if (baseName.endsWith(s.replace('.' + ext, ''))) {
                        baseName = baseName.replace(s.replace('.' + ext, ''), '');
                    }
                });

                var newFilename = baseName + fileSuffix.replace('.' + ext, '') + '.' + ext;
                
                filenameMap[oldFilename] = newFilename;
                pathMap[originalPath] = originalPath.replace(oldFilename, newFilename);
            });

            // Копируем и модифицируем файлы
            var promises = [];

            zip.forEach(function(relativePath, zipEntry) {
                if (zipEntry.dir) return;

                var promise;
                
                // Если это файл, который мы перевели (или его оригинальный путь)
                var translationContent = translations[relativePath];
                
                if (translationContent) {
                    var newPath = pathMap[relativePath] || relativePath;
                    newZip.file(newPath, translationContent);
                    // Если мы изменили путь, старый файл в новом архиве не нужен
                    promise = Promise.resolve();
                } else {
                    // Проверяем, не является ли этот файл одним из тех, что мы заменили (по пути)
                    var isReplaced = false;
                    for(var p in pathMap) { if(p === relativePath) isReplaced = true; }
                    if (isReplaced) return;

                    var ext = Helpers.getFileExtension(relativePath);
                    var isText = ['opf', 'ncx', 'html', 'xhtml', 'htm', 'css', 'nav'].indexOf(ext) !== -1;

                    if (isText) {
                        promise = zipEntry.async('string')
                            .then(function(content) {
                                var modifiedContent = content;
                                for (var oldFile in filenameMap) {
                                    var newFile = filenameMap[oldFile];
                                    // Используем Regex для замены только в атрибутах href/src/etc
                                    var regex = new RegExp('([="\'\\(])' + oldFile.replace('.', '\\.') + '([?"\'\\)])', 'g');
                                    modifiedContent = modifiedContent.replace(regex, '$1' + newFile + '$2');
                                }
                                newZip.file(relativePath, modifiedContent);
                            });
                    } else {
                        promise = zipEntry.async('uint8array')
                            .then(function(data) {
                                newZip.file(relativePath, data);
                            });
                    }
                }

                promises.push(promise);
            });

            return Promise.all(promises)
                .then(function() {
                    return newZip.generateAsync({
                        type: 'blob',
                        mimeType: 'application/epub+zip',
                        compression: 'DEFLATE',
                        compressionOptions: { level: 9 }
                    });
                });
        }
    };

    // Helper to fix JSZip uint8array set
    JSZip.prototype.setFile = function(name, data) {
        this.file(name, data);
    };

    /**
     * Вспомогательные функции
     */
    function extractNumberFromPath(path) {
        if (!path) return Infinity;

        var filename = '';
        if (Array.isArray(path)) {
            filename = Helpers.getFileName(path[0] || '');
        } else {
            filename = Helpers.getFileName(path);
        }

        var match = filename.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : Infinity;
    }

    function sortChaptersByNumber(chapters) {
        return chapters.slice().sort(function(a, b) {
            var numA = extractNumberFromPath(a.path || a);
            var numB = extractNumberFromPath(b.path || b);
            return numA - numB;
        });
    }

    // Публичный API
    return {
        EpubReader: EpubReader,
        EpubCreator: EpubCreator,
        EpubUpdater: EpubUpdater,
        extractNumberFromPath: extractNumberFromPath,
        sortChaptersByNumber: sortChaptersByNumber
    };
})();
