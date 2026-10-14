/**
 * EPUB AI Translator - Translation Engine
 * Главный движок перевода
 */

var TranslationEngine = (function() {
    'use strict';

    var LONG_PAUSE_THRESHOLD = 60;
    var MAX_REPEATED_WARNINGS = 5;

    /**
     * Класс воркера для обработки задач
     */
    function TranslationWorker(config) {
        this.workerId = config.workerId;
        this.apiKey = config.apiKey;
        this.sessionId = config.sessionId;
        this.provider = config.provider;
        this.modelConfig = config.modelConfig;
        this.modelId = this.modelConfig.id;
        this.temperature = config.temperature || 1.0;
        this.customPrompt = config.customPrompt || '';
        this.systemInstruction = config.useSystemInstruction ? this.customPrompt : null;
        this.thinkingEnabled = config.thinkingEnabled || false;
        this.thinkingBudget = config.thinkingBudget || -1;
        this.outputFolder = config.outputFolder;
        this.chunkOnError = config.chunking !== false;

        this.isCancelled = false;
        this.apiHandler = null;

        this.init();
    }

    TranslationWorker.prototype = {
        init: function() {
            var providerConfig = AppConfig.getProvider(this.provider);
            if (!providerConfig) {
                throw new Error('Provider not found: ' + this.provider);
            }

            var handlerName = providerConfig.handlerClass;
            this.apiHandler = ApiHandlers.createHandler(handlerName, this);
            this.apiHandler.setup(this.apiKey);
            this.fileSuffix = providerConfig.fileSuffix;
        },

        /**
         * Обработка одной задачи
         */
        processTask: function(task, glossaryData, contextManager) {
            var self = this;

            if (this.isCancelled) {
                return Promise.reject({ type: AppConfig.ERROR_TYPES.CANCEL, message: 'Cancelled' });
            }

            var taskType = task[0];

            switch (taskType) {
                case 'epub':
                    return this.processEpubChapter(task, glossaryData, contextManager);
                case 'epub_batch':
                    return this.processBatch(task, glossaryData);
                case 'epub_chunk':
                    return this.processEpubChunk(task, glossaryData, contextManager);
                case 'glossary_batch_task':
                    return this.processGlossaryBatch(task, glossaryData);
                case 'raw_text_translation':
                    return this.processRawText(task);
                default:
                    return Promise.reject(new Error('Unknown task type: ' + taskType));
            }
        },

        /**
         * Обработка пакета глав
         */
        processBatch: function(task, glossaryData) {
            var self = this;
            var epubData = task[1];
            var chapterPaths = task[2];

            EventBus.log('Обработка пакета из ' + chapterPaths.length + ' глав', 'info');

            // Подготавливаем комбинированный текст с маркерами
            var combinedWithMarkers = "";
            chapterPaths.forEach(function(path, i) {
                combinedWithMarkers += "\n<!-- " + i + " -->\n";
                // Мы получаем контент синхронно для простоты батчинга здесь, 
                // предполагая что он уже загружен в epubData.chapters
                var chapter = epubData.chapters.find(function(ch) { return ch.path === path; });
                combinedWithMarkers += (chapter ? chapter.content : "");
            });
            combinedWithMarkers += "\n<!-- " + chapterPaths.length + " -->\n";

            var prompt = self.buildPrompt(combinedWithMarkers, glossaryData, null);
            // Добавляем инструкцию по батчингу
            prompt += "\n\nIMPORTANT: Return each chapter separated by the same markers <!-- N -->.";

            return self.apiHandler.execute(prompt, {})
                .then(function(response) {
                    var cleaned = TextProcessing.cleanApiResponse(response, true);
                    
                    // Пробуем разделить ответ по маркерам
                    var parts = [];
                    for (var i = 0; i < chapterPaths.length; i++) {
                        var startMarker = "<!-- " + i + " -->";
                        var endMarker = "<!-- " + (i + 1) + " -->";
                        var startIdx = cleaned.indexOf(startMarker);
                        var endIdx = cleaned.indexOf(endMarker);
                        
                        if (startIdx !== -1 && endIdx !== -1) {
                            parts.push(cleaned.substring(startIdx + startMarker.length, endIdx).trim());
                        } else {
                            // Если маркеры потеряны, это ошибка батчинга
                            throw new Error("Ошибка разделения пакета: потеряны маркеры для главы " + i);
                        }
                    }
                    
                    return {
                        task: task,
                        results: parts, // Массив результатов
                        chapterPaths: chapterPaths,
                        success: true
                    };
                });
        },

        /**
         * Обработка главы EPUB
         */
        processEpubChapter: function(task, glossaryData, contextManager) {
            var self = this;
            var epubData = task[1];
            var chapterPath = task[2];
            var chapterData = task[3];

            return this.getChapterContent(epubData, chapterPath, chapterData)
                .then(function(content) {
                    if (!content || !content.trim()) {
                        return { task: task, result: content, success: true };
                    }

                    // 1. Извлекаем body
                    var parts = TextProcessing.extractBody(content);
                    var prefix = parts.prefix;
                    var body = parts.body;
                    var suffix = parts.suffix;

                    if (!body.trim()) {
                        return { task: task, result: content, success: true };
                    }

                    // 2. Защита медиа (img, svg и т.д.)
                    var protectedData = TextProcessing.replaceMediaWithPlaceholders(body);
                    var bodyForAi = protectedData.html;
                    var mediaMap = protectedData.mediaMap;

                    // 3. Подготовка промпта
                    var prompt = self.buildPrompt(bodyForAi, glossaryData, contextManager);

                    return self.apiHandler.execute(prompt, {})
                        .then(function(translatedBody) {
                            var cleaned = TextProcessing.cleanApiResponse(translatedBody, true);
                            
                            // 4. Валидация
                            var validated = ResponseValidator.validateResponse(bodyForAi, cleaned, {
                                expectsCyrillic: true 
                            });

                            if (!validated.isValid) {
                                throw new Error('Валидация не пройдена: ' + validated.reason);
                            }
                            
                            if (validated.warnings && validated.warnings.length > 0) {
                                EventBus.log('Предупреждения валидатора для "' + Helpers.getFileName(chapterPath) + '": ' + validated.warnings.join('; '), 'warning');
                            }

                            // 5. Восстановление медиа
                            var restoredBody = TextProcessing.restoreMediaFromPlaceholders(cleaned, mediaMap);

                            var finalContent = prefix + restoredBody + suffix;
                            var prettified = TextProcessing.prettifyHtml(finalContent);

                            return {
                                task: task,
                                result: prettified,
                                originalPath: chapterPath,
                                success: true
                            };
                        });
                });
        },

        /**
         * Обработка чанка главы
         */
        processEpubChunk: function(task, glossaryData, contextManager) {
            var self = this;
            var chunkContent = task[3];
            var chunkIndex = task[4];
            var totalChunks = task[5];

            // Оборачиваем в body если нужно
            var contentToTranslate = '<body>' + chunkContent + '</body>';

            var prompt = this.buildPrompt(contentToTranslate, glossaryData, contextManager);

            return this.apiHandler.execute(prompt, {})
                .then(function(translatedChunk) {
                    var cleaned = TextProcessing.cleanApiResponse(translatedChunk, true);

                    return {
                        task: task,
                        result: cleaned,
                        chunkIndex: chunkIndex,
                        totalChunks: totalChunks,
                        success: true
                    };
                });
        },

        /**
         * Обработка пакета для глоссария
         */
        processGlossaryBatch: function(task, glossaryData) {
            var self = this;
            var epubData = task[1];
            var textToAnalyze = task[3]; // Текст передается в задаче

            var prompt = self.buildGlossaryPrompt(textToAnalyze);

            return self.apiHandler.execute(prompt, { allowIncomplete: true })
                .then(function(response) {
                    var cleaned = TextProcessing.cleanApiResponse(response, false);
                    var glossaryTerms = self.parseGlossaryResponse(cleaned);

                    return {
                        task: task,
                        result: glossaryTerms,
                        success: true
                    };
                });
        },

        /**
         * Обработка сырого текста
         */
        processRawText: function(task) {
            var textContent = task[1];
            var customPrompt = task[2];

            var prompt = customPrompt 
                ? customPrompt.replace('{text}', textContent)
                : this.buildPrompt(textContent, {}, null);

            return this.apiHandler.execute(prompt, {})
                .then(function(response) {
                    var cleaned = TextProcessing.cleanApiResponse(response, true);

                    return {
                        task: task,
                        result: cleaned,
                        success: true
                    };
                });
        },

        /**
         * Получение контента главы
         */
        getChapterContent: function(epubData, chapterPath, chapterData) {
            // Если данные главы переданы напрямую
            if (chapterData && chapterData.content) {
                return Promise.resolve(chapterData.content);
            }
            
            // Ищем в массиве глав
            if (epubData && epubData.chapters) {
                var chapter = epubData.chapters.find(function(ch) {
                    return ch.path === chapterPath;
                });
                if (chapter && chapter.content) {
                    return Promise.resolve(chapter.content);
                }
            }

            // Если передан ZIP
            if (epubData && epubData.zip) {
                var file = epubData.zip.file(chapterPath);
                if (file) {
                    return file.async('string');
                }
            }

            console.warn('Could not find content for chapter:', chapterPath);
            return Promise.resolve('');
        },

        /**
         * Получение объединенного контента глав
         */
        getCombinedChaptersContent: function(epubData, chapterPaths) {
            var self = this;
            var promises = chapterPaths.map(function(path) {
                return self.getChapterContent(epubData, path);
            });

            return Promise.all(promises).then(function(contents) {
                return contents.join('\n\n');
            });
        },

        /**
         * Построение промпта
         */
        buildPrompt: function(textContent, glossaryData, contextManager) {
            var glossaryString = 'Глоссарий пуст.';
            var contextString = 'Контекст не предоставлен.';

            if (glossaryData && Object.keys(glossaryData).length > 0) {
                var formatted = GlossaryManager.formatForPrompt(textContent, true);
                glossaryString = formatted.glossaryString;
                contextString = formatted.contextString;
            }

            var prompt = this.customPrompt || AppConfig.DEFAULT_PROMPT;

            if (this.systemInstruction) {
                // Системная инструкция отдельно, здесь только текст
                var parts = [];
                if (glossaryString !== 'Глоссарий пуст.') {
                    parts.push('--- ТЕРМИНЫ ---\n' + glossaryString);
                }
                if (contextString !== 'Контекст не предоставлен.') {
                    parts.push('--- КОНТЕКСТ ---\n' + contextString);
                }
                parts.push('--- ТЕКСТ ДЛЯ ОБРАБОТКИ ---\n```html\n' + textContent + '\n```');

                return parts.join('\n\n');
            }

            // Классический режим
            prompt = prompt.replace('{text}', '```html\n' + textContent + '\n```');
            prompt = prompt.replace('{glossary}', glossaryString);
            prompt = prompt.replace('{context}', contextString);

            return prompt;
        },

        /**
         * Построение промпта для глоссария
         */
        buildGlossaryPrompt: function(textContent) {
            var template = AppConfig.DEFAULT_GLOSSARY_PROMPT;
            return template.replace('{text}', textContent);
        },

        /**
         * Парсинг ответа глоссария
         */
        parseGlossaryResponse: function(response) {
            try {
                var parsed = JSON.parse(response);
                var terms = [];

                for (var key in parsed) {
                    if (parsed.hasOwnProperty(key)) {
                        var value = parsed[key];
                        terms.push({
                            original: key,
                            translation: typeof value === 'string' ? value : (value.translation || ''),
                            note: typeof value === 'object' ? (value.note || '') : ''
                        });
                    }
                }

                return terms;
            } catch (e) {
                // Пытаемся восстановить JSON
                var repaired = TextProcessing.repairJsonString(response);
                if (repaired) {
                    return this.parseGlossaryResponse(repaired);
                }
                return [];
            }
        },

        /**
         * Валидация ответа
         */
        validateResponse: function(original, translated) {
            return ResponseValidator.validateResponse(original, translated, {
                expectsCyrillic: true
            });
        },

        /**
         * Отмена
         */
        cancel: function() {
            this.isCancelled = true;
            if (this.apiHandler) {
                this.apiHandler.cancel();
            }
        }
    };

    /**
     * Главный движок перевода
     */
    function Engine() {
        this.sessionId = null;
        this.isRunning = false;
        this.isCancelled = false;
        this.isPaused = false;

        this.workers = {};
        this.taskManager = null;
        this.settings = {};

        this.totalTasks = 0;
        this.completedTasks = 0;
        this.failedTasks = 0;

        this.keyWarningCounters = {};
        this.pausedKeys = new Set();

        this.epubData = null;
        this.glossaryData = {};
        this.sessionGlossary = []; // Глоссарий, накопленный за сессию

        this.init();
    }

    /**
     * RPM Limiter - Простой ограничитель частоты запросов
     */
    function RPMLimiter(rpm) {
        this.rpm = rpm || 10;
        this.interval = 60000 / this.rpm;
        this.lastRequestTime = 0;
    }

    RPMLimiter.prototype.canProceed = function() {
        var now = Date.now();
        if (now - this.lastRequestTime >= this.interval) {
            this.lastRequestTime = now;
            return true;
        }
        return false;
    };

    RPMLimiter.prototype.getRemainingWait = function() {
        var now = Date.now();
        return Math.max(0, this.interval - (now - this.lastRequestTime));
    };

    Engine.prototype = {
        init: function() {
            var self = this;
            this.rpmLimiters = {};
            this.assemblyBay = {}; // Для сборки чанков

            // Подписка на события
            EventBus.on(EventBus.EVENTS.STOP_SESSION_REQUESTED, function() {
                self.stop('Остановлено пользователем');
            });
        },

        /**
         * Запуск сессии перевода
         */
        start: function(settings) {
            if (this.isRunning) {
                EventBus.log('Сессия уже запущена', 'warning');
                return;
            }

            // Валидация входных данных
            if (!settings.epubData && !settings.isGlossaryOnly) {
                EventBus.log('Ошибка: EPUB данные не загружены', 'error');
                return;
            }

            if ((!settings.selectedChapters || settings.selectedChapters.length === 0) && !settings.isGlossaryOnly) {
                EventBus.log('Ошибка: не выбраны главы для перевода', 'error');
                return;
            }

            if (!settings.apiKeys || settings.apiKeys.length === 0) {
                EventBus.log('Ошибка: не указаны API ключи', 'error');
                return;
            }

            this.sessionId = Helpers.generateUUID();
            this.isRunning = true;
            this.isCancelled = false;
            this.isPaused = false;

            this.settings = settings;
            this.workers = {};
            this.keyWarningCounters = {};
            this.pausedKeys = new Set();
            this.rpmLimiters = {};
            this.assemblyBay = {};

            // Инициализация RPM лимитеров для каждого ключа
            var self = this;
            settings.apiKeys.forEach(function(key) {
                self.rpmLimiters[key] = new RPMLimiter(settings.rpmLimit || 10);
            });

            this.completedTasks = 0;
            this.failedTasks = 0;

            this.epubData = settings.epubData;
            this.glossaryData = settings.glossaryData || {};

            // Создаем задачи
            var tasks = settings.tasks || this.prepareTasks(settings);
            this.totalTasks = tasks.length;

            if (this.totalTasks === 0) {
                this.finish('Нет задач для выполнения');
                return;
            }

            // Создаем менеджер задач
            this.taskManager = TaskManager.create(tasks);
            this.taskManager.sessionId = this.sessionId;

            EventBus.emit(EventBus.EVENTS.SESSION_STARTED, {
                sessionId: this.sessionId,
                totalTasks: this.totalTasks
            }, { source: 'TranslationEngine' });

            EventBus.log('▶▶▶ Начало сессии: ' + this.sessionId.substring(0, 8), 'success');
            EventBus.log('Задач в очереди: ' + this.totalTasks, 'info');

            // Запускаем воркеров
            this.startWorkers(settings);
        },

        /**
         * Подготовка задач
         */
        prepareTasks: function(settings) {
            var chapters = settings.selectedChapters || [];
            var useChunking = settings.chunking !== false;
            var chunkSize = settings.chunkSize || AppConfig.CHUNKING.defaultTargetSize;

            if (!chapters || chapters.length === 0) {
                EventBus.log('Нет глав для перевода', 'warning');
                return [];
            }

            return TaskManager.TaskPreparer.prepareTasks({
                chunking: useChunking,
                chunkSize: chunkSize,
                epubData: settings.epubData
            }, chapters);
        },

        /**
         * Запуск воркеров (с плавным стартом)
         */
        startWorkers: function(settings) {
            var self = this;
            var apiKeys = settings.apiKeys || [];
            var numInstances = Math.min(settings.numInstances || 1, apiKeys.length * 5); // Ограничение на количество инстансов

            EventBus.log('Запуск воркеров: ' + numInstances, 'info');

            var currentWorker = 0;
            
            function launchNext() {
                if (currentWorker >= numInstances || self.isCancelled) {
                    EventBus.log('Все воркеры (' + currentWorker + ') запущены', 'success');
                    return;
                }

                var apiKey = apiKeys[currentWorker % apiKeys.length];
                self.launchWorker(apiKey, settings);
                currentWorker++;

                // Задержка между запусками воркеров (Ramp-up)
                var delay = numInstances > 1 ? 1500 : 0;
                setTimeout(launchNext, delay);
            }

            launchNext();

            // Начинаем периодическую проверку задач
            this.monitorInterval = setInterval(function() {
                self.processNextTasks();
            }, 1000);
        },

        /**
         * Запуск одного воркера
         */
        launchWorker: function(apiKey, settings) {
            var workerConfig = {
                workerId: apiKey,
                apiKey: apiKey,
                sessionId: this.sessionId,
                provider: settings.provider,
                modelConfig: settings.modelConfig,
                temperature: settings.temperature,
                customPrompt: settings.customPrompt,
                useSystemInstruction: settings.useSystemInstruction,
                thinkingEnabled: settings.thinkingEnabled,
                thinkingBudget: settings.thinkingBudget,
                outputFolder: settings.outputFolder,
                chunking: settings.chunking
            };

            try {
                var worker = new TranslationWorker(workerConfig);
                this.workers[apiKey] = worker;

                EventBus.log('Воркер для ключа …' + apiKey.slice(-4) + ' запущен', 'info');
            } catch (e) {
                EventBus.log('Ошибка создания воркера: ' + e.message, 'error');
            }
        },

        /**
         * Обработка следующих задач
         */
        processNextTasks: function() {
            var self = this;

            if (this.isCancelled || !this.taskManager || this.isPaused) {
                this.checkFinished();
                return;
            }

            // Проверяем завершение
            if (this.taskManager.isFinished()) {
                this.checkFinished();
                return;
            }

            // Для каждого воркера пробуем запустить задачу
            Object.keys(this.workers).forEach(function(workerId) {
                // Если воркер уже занят, пропускаем
                if (self.workers[workerId].isBusy) return;
                
                // Если ключ на паузе, пропускаем
                if (self.pausedKeys.has(workerId)) return;

                // Проверяем RPM лимитер
                var limiter = self.rpmLimiters[workerId];
                if (limiter && !limiter.canProceed()) {
                    // Пробуем запустить позже
                    setTimeout(function() { self.processNextTasks(); }, limiter.getRemainingWait() + 100);
                    return;
                }

                var task = self.taskManager.getNextTask(workerId);
                if (task) {
                    self.executeTask(workerId, task);
                }
            });
        },

        /**
         * Выполнение задачи
         */
        executeTask: function(workerId, task) {
            var self = this;
            var worker = this.workers[workerId];

            if (!worker || worker.isCancelled) {
                this.taskManager.taskRequeued(workerId, task);
                return;
            }

            worker.isBusy = true;
            var taskName = this.taskManager.getTaskDisplayName(task);
            EventBus.log('Обработка: ' + taskName, 'info');

            EventBus.emit(EventBus.EVENTS.TASK_STATUS_UPDATED, {
                task_info: task,
                status: 'processing'
            }, { source: 'TranslationEngine' });

            // Увеличиваем счетчик запросов для ключа
            SettingsManager.incrementRequestCount(workerId, this.settings.modelConfig.id);

            worker.processTask(task, this.glossaryData, null)
                .then(function(result) {
                    worker.isBusy = false;
                    self.handleTaskSuccess(workerId, task, result);
                })
                .catch(function(error) {
                    worker.isBusy = false;
                    self.handleTaskError(workerId, task, error);
                });
        },

        /**
         * Обработка успешного завершения задачи
         */
        handleTaskSuccess: function(workerId, task, result) {
            var self = this;
            this.taskManager.taskDone(workerId, task);
            
            // Сбрасываем счетчик предупреждений
            this.keyWarningCounters[workerId] = 0;

            var taskType = task[0];

            if (taskType === 'epub_batch' && result.results) {
                // Обработка пакета глав
                result.results.forEach(function(content, i) {
                    var path = result.chapterPaths[i];
                    self.completedTasks++;
                    
                    self.saveResult(task, {
                        result: content,
                        originalPath: path
                    });
                });
            } 
            else if (taskType === 'epub_chunk') {
                var path = task[2];
                var chunkIndex = task[4];
                var totalChunks = task[5];
                var prefix = task[6] || '';
                var suffix = task[7] || '';

                if (!this.assemblyBay[path]) {
                    this.assemblyBay[path] = {
                        chunks: {},
                        count: 0,
                        total: totalChunks,
                        prefix: prefix,
                        suffix: suffix
                    };
                }

                this.assemblyBay[path].chunks[chunkIndex] = result.result;
                this.assemblyBay[path].count++;

                if (this.assemblyBay[path].count === totalChunks) {
                    // Все чанки собраны
                    var assembly = this.assemblyBay[path];
                    var combinedContent = '';
                    for (var i = 0; i < totalChunks; i++) {
                        var chunkText = assembly.chunks[i] || '';
                        // Убираем body wrapper если есть
                        chunkText = chunkText.replace(/<\/?body[^>]*>/gi, '');
                        combinedContent += chunkText;
                    }

                    var finalContent = assembly.prefix + combinedContent + assembly.suffix;
                    var prettified = TextProcessing.prettifyHtml(finalContent);

                    this.completedTasks++;
                    this.saveResult(task, {
                        result: prettified,
                        originalPath: path
                    });

                    EventBus.emit(EventBus.EVENTS.ASSEMBLY_FINISHED, {
                        originalPath: path,
                        chunkCount: totalChunks
                    });

                    delete this.assemblyBay[path];
                }
            }
            else {
                this.completedTasks++;
                // Сохраняем результат для одиночной задачи
                this.saveResult(task, result);
            }

            EventBus.emit(EventBus.EVENTS.TASK_FINISHED, {
                task: task,
                result: result,
                success: true
            }, { source: 'TranslationEngine', sessionId: this.sessionId });

            EventBus.emit(EventBus.EVENTS.TASK_STATUS_UPDATED, {
                task_info: task,
                status: 'success'
            }, { source: 'TranslationEngine' });

            EventBus.emit(EventBus.EVENTS.PROGRESS_UPDATED, {
                current: this.completedTasks + this.failedTasks,
                total: this.totalTasks
            }, { source: 'TranslationEngine' });

            // Следующая задача
            this.processNextTasks();
        },

        /**
         * Обработка ошибки задачи
         */
        handleTaskError: function(workerId, task, error) {
            var self = this;
            var errorType = error.type || AppConfig.ERROR_TYPES.API_ERROR;

            // Если ошибка временного лимита - вызываем специальный обработчик
            if (errorType === AppConfig.ERROR_TYPES.TEMPORARY_LIMIT) {
                this.handleTemporaryLimit(workerId, task, error.delay || 60);
                return;
            }

            // Уменьшаем счетчик запросов если произошла ошибка, не связанная с лимитом
            if (errorType !== AppConfig.ERROR_TYPES.QUOTA_EXCEEDED) {
                SettingsManager.decrementRequestCount(workerId, this.settings.modelConfig.id);
            }

            EventBus.log('Ошибка при обработке: ' + (error.message || 'Неизвестная ошибка'), 'error');

            // Фатальные ошибки
            if (errorType === AppConfig.ERROR_TYPES.GEOBLOCK) {
                this.stop('Блокировка по геолокации');
                EventBus.emit(EventBus.EVENTS.GEOBLOCK_DETECTED, {}, { source: 'TranslationEngine' });
                return;
            }

            if (errorType === AppConfig.ERROR_TYPES.MODEL_NOT_FOUND) {
                this.stop('Модель не найдена');
                return;
            }

            if (errorType === AppConfig.ERROR_TYPES.QUOTA_EXCEEDED) {
                this.handleQuotaExceeded(workerId, task);
                return;
            }

            if (errorType === 'DRY_RUN') {
                this.taskManager.taskDone(workerId, task);
                this.stop('Предпросмотр завершен');
                return;
            }

            // Анализ истории ошибок для задачи
            var history = this.taskManager.getFailureHistory(task);
            var totalErrors = history.totalCount || 0;

            // Если это обычная ошибка и попыток мало - повторяем
            if (totalErrors < 2) {
                this.taskManager.recordFailure(task, errorType);
                this.taskManager.taskRequeuedForRetry(workerId, task);
                
                setTimeout(function() {
                    self.processNextTasks();
                }, 2000);
            } 
            // ПЛАН Б: Если попытки перевода главы (epub) исчерпаны, пробуем разбить её на части (chunking)
            else if (task[0] === 'epub' && !history.force_chunked && this.settings.chunking) {
                EventBus.log('❗ Провал попыток для "' + Helpers.getFileName(task[2]) + '". Запуск ПЛАНА Б (разделение на части)...', 'warning');
                
                this.taskManager.recordFailure(task, errorType);
                
                var worker = this.workers[workerId];
                worker.getChapterContent(this.epubData, task[2], task[3])
                    .then(function(content) {
                        var bodyParts = TextProcessing.extractBody(content);
                        var chunks = TextProcessing.splitTextIntoChunks(
                            bodyParts.body,
                            self.settings.chunkSize / 2, // Пробуем меньший размер
                            AppConfig.CHUNKING.searchWindow,
                            AppConfig.CHUNKING.minChunkSize
                        );

                        var newTasks = chunks.map(function(chunkContent, i) {
                            return [
                                'epub_chunk',
                                self.epubData,
                                task[2],
                                chunkContent,
                                i,
                                chunks.length,
                                bodyParts.prefix,
                                bodyParts.suffix
                            ];
                        });

                        history.force_chunked = true;
                        self.taskManager.addPriorityTasks(newTasks, history);
                        
                        // Удаляем старую задачу из общего счетчика (она заменится на несколько новых)
                        self.totalTasks = self.totalTasks - 1 + newTasks.length;
                        
                        EventBus.emit(EventBus.EVENTS.TASKS_ADDED, { count: newTasks.length });
                        self.processNextTasks();
                    });
            }
            else {
                // Окончательный провал
                this.taskManager.taskFailedPermanently(workerId, task);
                this.failedTasks++;

                EventBus.emit(EventBus.EVENTS.TASK_FINISHED, {
                    task: task,
                    success: false,
                    error: error
                }, { source: 'TranslationEngine', sessionId: this.sessionId });

                EventBus.emit(EventBus.EVENTS.TASK_STATUS_UPDATED, {
                    task_info: task,
                    status: 'error'
                }, { source: 'TranslationEngine' });

                EventBus.emit(EventBus.EVENTS.PROGRESS_UPDATED, {
                    current: this.completedTasks + this.failedTasks,
                    total: this.totalTasks
                }, { source: 'TranslationEngine' });

                this.processNextTasks();
            }
        },

        /**
         * Обработка исчерпания квоты
         */
        handleQuotaExceeded: function(workerId, task) {
            var self = this;

            EventBus.log('Ключ …' + workerId.slice(-4) + ' исчерпан', 'warning');

            // Помечаем ключ как исчерпанный
            SettingsManager.markKeyExhausted(workerId, this.settings.modelConfig.id);

            // Возвращаем задачу в очередь
            this.taskManager.taskRequeued(workerId, task);

            // Удаляем воркера
            if (this.workers[workerId]) {
                this.workers[workerId].cancel();
                delete this.workers[workerId];
            }

            // Пытаемся найти замену
            var availableKeys = this.settings.apiKeys.filter(function(key) {
                return !self.workers[key] && !self.pausedKeys.has(key);
            });

            if (availableKeys.length > 0) {
                var nextKey = availableKeys[0];
                EventBus.log('[MANAGER] 🚀 Ротация: Ключ …' + workerId.slice(-4) + ' ⮕ …' + nextKey.slice(-4), 'warning');
                this.launchWorker(nextKey, this.settings);
                EventBus.emit(EventBus.EVENTS.WORKER_ROTATED, {
                    oldWorkerId: workerId,
                    newWorkerId: nextKey
                }, { source: 'TranslationEngine' });
            } else {
                EventBus.log('[MANAGER] ⛔ Нет доступных ключей для замены …' + workerId.slice(-4), 'error');
            }

            this.processNextTasks();
        },

        /**
         * Обработка временного лимита
         */
        handleTemporaryLimit: function(workerId, task, delay) {
            var self = this;

            EventBus.log('Ключ …' + workerId.slice(-4) + ' на паузе на ' + delay + ' сек', 'warning');

            // Увеличиваем счетчик предупреждений
            this.keyWarningCounters[workerId] = (this.keyWarningCounters[workerId] || 0) + 1;

            if (this.keyWarningCounters[workerId] >= MAX_REPEATED_WARNINGS) {
                this.handleQuotaExceeded(workerId, task);
                return;
            }

            // Ставим ключ на паузу
            this.pausedKeys.add(workerId);
            this.taskManager.taskRequeued(workerId, task);

            EventBus.emit(EventBus.EVENTS.TEMPORARY_LIMIT_WARNING, {
                workerId: workerId,
                delay: delay
            }, { source: 'TranslationEngine' });

            // Снимаем паузу через delay секунд
            setTimeout(function() {
                self.pausedKeys.delete(workerId);
                EventBus.log('Ключ …' + workerId.slice(-4) + ' снят с паузы', 'info');
                self.processNextTasks();
            }, delay * 1000);
        },

        /**
         * Сохранение результата
         */
        saveResult: function(task, result) {
            if (!result) return;

            var taskType = task[0];

            if ((taskType === 'epub' || taskType === 'epub_chunk') && result.result) {
                EventBus.emit(EventBus.EVENTS.TRANSLATION_SAVED, {
                    task: task,
                    content: result.result,
                    originalPath: result.originalPath || task[2]
                }, { source: 'TranslationEngine', sessionId: this.sessionId });
            }

            if (taskType === 'glossary_batch_task' && result.result) {
                // Слияние новых терминов
                var mode = this.settings.glossaryAiMode || 'supplement';
                this.sessionGlossary = GlossaryManager.Aggregator.merge(this.sessionGlossary, result.result, mode);
                
                EventBus.log('Обработан пакет глоссария. Накоплено терминов: ' + this.sessionGlossary.length, 'info');
            }
        },

        /**
         * Проверка завершения
         */
        checkFinished: function() {
            if (!this.taskManager) return;

            if (this.taskManager.isFinished() || this.isCancelled) {
                this.finish(this.isCancelled ? 'Отменено' : 'Завершено');
            }
        },

        /**
         * Завершение сессии
         */
        finish: function(reason) {
            if (!this.isRunning) return;

            this.isRunning = false;

            // Останавливаем мониторинг
            if (this.monitorInterval) {
                clearInterval(this.monitorInterval);
                this.monitorInterval = null;
            }

            // Останавливаем всех воркеров
            Object.values(this.workers).forEach(function(worker) {
                worker.cancel();
            });
            this.workers = {};

            var summary = {
                completed: this.completedTasks,
                failed: this.failedTasks,
                total: this.totalTasks
            };

            EventBus.log('◀◀◀ Сессия завершена: ' + reason, 'success');
            EventBus.log('Выполнено: ' + summary.completed + '/' + summary.total + 
                        (summary.failed > 0 ? ' (ошибок: ' + summary.failed + ')' : ''), 'info');

            // Если за сессию был сгенерирован глоссарий, отправляем его
            if (this.sessionGlossary && this.sessionGlossary.length > 0) {
                EventBus.emit(EventBus.EVENTS.GLOSSARY_GENERATION_FINISHED, {
                    glossary: this.sessionGlossary
                }, { source: 'TranslationEngine', sessionId: this.sessionId });
            }

            EventBus.emit(EventBus.EVENTS.SESSION_FINISHED, {
                sessionId: this.sessionId,
                reason: reason,
                summary: summary
            }, { source: 'TranslationEngine' });

            this.sessionId = null;
            this.taskManager = null;
            this.sessionGlossary = [];
        },

        /**
         * Остановка сессии
         */
        stop: function(reason) {
            this.isCancelled = true;
            reason = reason || 'Остановлено';

            if (this.taskManager) {
                this.taskManager.clearPendingQueues();
            }

            this.finish(reason);
        },

        /**
         * Пауза/Возобновление
         */
        togglePause: function() {
            this.isPaused = !this.isPaused;

            if (!this.isPaused) {
                this.processNextTasks();
            }

            return this.isPaused;
        },

        /**
         * Получение статуса
         */
        getStatus: function() {
            return {
                isRunning: this.isRunning,
                isPaused: this.isPaused,
                sessionId: this.sessionId,
                completed: this.completedTasks,
                failed: this.failedTasks,
                total: this.totalTasks,
                pending: this.taskManager ? this.taskManager.getPendingCount() : 0
            };
        }
    };

    // Синглтон
    var engineInstance = null;

    function getEngine() {
        if (!engineInstance) {
            engineInstance = new Engine();
        }
        return engineInstance;
    }

    // Публичный API
    return {
        getEngine: getEngine,
        TranslationWorker: TranslationWorker
    };
})();
