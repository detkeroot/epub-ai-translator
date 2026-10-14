/**
 * EPUB AI Translator - Task Manager
 * Управление очередью задач перевода
 */

var TaskManager = (function() {
    'use strict';

    /**
     * Создает новый менеджер задач
     */
    function create(allTasks) {
        var pending = allTasks ? allTasks.slice() : [];
        var priority = [];
        var inProgress = {};
        var completed = new Set();
        var failed = new Set();
        var failureTracker = {};
        var sessionId = null;

        /**
         * Получает отображаемое имя задачи
         */
        function getTaskDisplayName(task) {
            if (!task) return 'Неизвестная задача';

            var taskType = task[0];

            try {
                switch (taskType) {
                    case 'epub':
                        return 'Глава "' + Helpers.getFileName(task[2]) + '"';
                    case 'epub_chunk':
                        return 'Часть #' + (task[4] + 1) + ' из "' + Helpers.getFileName(task[2]) + '"';
                    case 'epub_batch':
                        return 'Пакет из ' + task[2].length + ' глав';
                    case 'glossary_batch_task':
                        return 'Пакет глоссария из ' + task[2].length + ' глав';
                    case 'raw_text_translation':
                        return task[3] ? '✨ ' + task[3] : 'Прямой перевод';
                    default:
                        return 'Задача типа "' + taskType + '"';
                }
            } catch (e) {
                return 'Задача';
            }
        }

        /**
         * Получает следующую задачу для воркера
         */
        function getNextTask(workerId) {
            // Сначала из приоритетной очереди
            var task = priority.shift();
            if (!task) {
                task = pending.shift();
            }

            if (task) {
                if (!inProgress[workerId]) {
                    inProgress[workerId] = new Set();
                }
                inProgress[workerId].add(task);

                log('[TASK] Задача "' + getTaskDisplayName(task) + '" передана воркеру …' + workerId.slice(-4));
            }

            return task;
        }

        /**
         * Добавляет приоритетные задачи
         */
        function addPriorityTasks(tasks, parentHistory) {
            priority = tasks.concat(priority);

            if (parentHistory) {
                tasks.forEach(function(task) {
                    failureTracker[taskKey(task)] = Helpers.deepClone(parentHistory);
                });
            }
        }

        /**
         * Генерирует ключ для задачи
         */
        function taskKey(task) {
            return JSON.stringify(task);
        }

        /**
         * Получает историю ошибок для задачи
         */
        function getFailureHistory(task) {
            var key = taskKey(task);
            return failureTracker[key] ? Helpers.deepClone(failureTracker[key]) : { totalCount: 0, errors: {} };
        }

        /**
         * Регистрирует ошибку
         */
        function recordFailure(task, errorType) {
            var key = taskKey(task);
            var history = failureTracker[key] || { totalCount: 0, errors: {} };

            history.totalCount++;
            history.errors[errorType] = (history.errors[errorType] || 0) + 1;
            failureTracker[key] = history;

            log('[TASK] Зарегистрирована ошибка для "' + getTaskDisplayName(task) + 
                '" (тип: ' + errorType + ', всего: ' + history.totalCount + ')');
        }

        /**
         * Отмечает задачу как выполненную
         */
        function taskDone(workerId, task) {
            if (inProgress[workerId]) {
                inProgress[workerId].delete(task);
                if (inProgress[workerId].size === 0) {
                    delete inProgress[workerId];
                }
            }

            completed.add(taskKey(task));
            delete failureTracker[taskKey(task)];

            log('[TASK] ✅ Задача "' + getTaskDisplayName(task) + '" успешно выполнена.');
        }

        /**
         * Отмечает задачу как провалившуюся окончательно
         */
        function taskFailedPermanently(workerId, task) {
            if (inProgress[workerId]) {
                inProgress[workerId].delete(task);
                if (inProgress[workerId].size === 0) {
                    delete inProgress[workerId];
                }
            }

            failed.add(taskKey(task));
            log('[TASK] ❌ Задача "' + getTaskDisplayName(task) + '" провалена окончательно.');
        }

        /**
         * Возвращает задачу в очередь
         */
        function taskRequeued(workerId, task) {
            if (inProgress[workerId]) {
                inProgress[workerId].delete(task);
                if (inProgress[workerId].size === 0) {
                    delete inProgress[workerId];
                }
            }

            pending.unshift(task);
            log('[TASK] 🔄 Задача "' + getTaskDisplayName(task) + '" возвращена в очередь.');
        }

        /**
         * Возвращает задачу для повторной попытки
         */
        function taskRequeuedForRetry(workerId, task) {
            taskRequeued(workerId, task);
        }

        /**
         * Возвращает все задачи воркера в очередь
         */
        function requeueTasksForWorker(workerId) {
            if (inProgress[workerId]) {
                var tasks = Array.from(inProgress[workerId]);
                pending = tasks.concat(pending);
                delete inProgress[workerId];
                log('[TASK] 🔄 Возвращено в очередь ' + tasks.length + ' задач от воркера …' + workerId.slice(-4));
            }
        }

        /**
         * Проверяет, есть ли ожидающие задачи
         */
        function hasPendingTasks() {
            return pending.length > 0 || priority.length > 0;
        }

        /**
         * Проверяет, завершена ли вся работа
         */
        function isFinished() {
            return !hasPendingTasks() && Object.keys(inProgress).length === 0;
        }

        /**
         * Получает прогресс
         */
        function getProgress() {
            var processedCount = completed.size + failed.size;
            var inProgressCount = 0;

            for (var workerId in inProgress) {
                inProgressCount += inProgress[workerId].size;
            }

            var total = pending.length + priority.length + inProgressCount + processedCount;

            return { done: processedCount, total: total };
        }

        /**
         * Очищает очереди
         */
        function clearPendingQueues() {
            var count = pending.length + priority.length;
            pending = [];
            priority = [];
            log('[TASK] ⏹️ Очереди очищены. Удалено ' + count + ' задач.');
            return count;
        }

        /**
         * Очищает состояние
         */
        function clearState() {
            failureTracker = {};
            log('[TASK] Трекер ошибок очищен.');
        }

        /**
         * Количество ожидающих задач
         */
        function getPendingCount() {
            return pending.length + priority.length;
        }

        /**
         * Логирование
         */
        function log(message) {
            EventBus.emit(EventBus.EVENTS.LOG_MESSAGE, {
                message: message,
                level: 'info'
            }, { source: 'TaskManager', sessionId: sessionId });
        }

        // Публичный API экземпляра
        return {
            getNextTask: getNextTask,
            addPriorityTasks: addPriorityTasks,
            getFailureHistory: getFailureHistory,
            recordFailure: recordFailure,
            taskDone: taskDone,
            taskFailedPermanently: taskFailedPermanently,
            taskRequeued: taskRequeued,
            taskRequeuedForRetry: taskRequeuedForRetry,
            requeueTasksForWorker: requeueTasksForWorker,
            hasPendingTasks: hasPendingTasks,
            isFinished: isFinished,
            getProgress: getProgress,
            clearPendingQueues: clearPendingQueues,
            clearState: clearState,
            getPendingCount: getPendingCount,
            getTaskDisplayName: getTaskDisplayName,

            get sessionId() { return sessionId; },
            set sessionId(value) { sessionId = value; }
        };
    }

    /**
     * Подготовщик задач
     */
    var TaskPreparer = {
        /**
         * Подготавливает задачи из глав EPUB
         * @param {Object} settings
         * @param {Array} chapters
         * @returns {Array}
         */
        prepareTasks: function(settings, chapters) {
            var useBatching = settings.useBatching || false;
            var useChunking = settings.chunking !== false;
            var taskSizeLimit = settings.chunkSize || AppConfig.CHUNKING.defaultTargetSize;
            var epubData = settings.epubData;

            if (!chapters || chapters.length === 0) {
                console.warn('TaskPreparer: no chapters provided');
                return [];
            }

            if (useBatching) {
                return this._prepareBatchTasks(settings, chapters, taskSizeLimit, epubData);
            } else {
                return this._prepareIndividualTasks(settings, chapters, useChunking, taskSizeLimit, epubData);
            }
        },

        _prepareBatchTasks: function(settings, chapters, taskSizeLimit, epubData) {
            var tasks = [];
            var currentBatch = [];
            var currentBatchSize = 0;

            chapters.forEach(function(chapter) {
                var size = chapter.size || (chapter.content ? chapter.content.length : 0);

                if (size > taskSizeLimit) {
                    // Слишком большая глава - отправляем батч и добавляем отдельно
                    if (currentBatch.length > 0) {
                        tasks.push(['epub_batch', epubData, currentBatch.slice()]);
                        currentBatch = [];
                        currentBatchSize = 0;
                    }
                    tasks.push(['epub', epubData, chapter.path, chapter]);
                    return;
                }

                if (currentBatchSize + size > taskSizeLimit && currentBatch.length > 0) {
                    tasks.push(['epub_batch', epubData, currentBatch.slice()]);
                    currentBatch = [];
                    currentBatchSize = 0;
                }

                currentBatch.push(chapter.path);
                currentBatchSize += size;
            });

            if (currentBatch.length > 0) {
                tasks.push(['epub_batch', epubData, currentBatch]);
            }

            return tasks;
        },

        _prepareIndividualTasks: function(settings, chapters, useChunking, taskSizeLimit, epubData) {
            var tasks = [];

            chapters.forEach(function(chapter) {
                var size = chapter.size || (chapter.content ? chapter.content.length : 0);
                var content = chapter.content || '';

                if (!useChunking || size <= taskSizeLimit) {
                    // Передаем chapter целиком для доступа к content
                    tasks.push(['epub', epubData, chapter.path, chapter]);
                } else {
                    // Нужно разбить на чанки
                    var bodyParts = TextProcessing.extractBody(content);
                    var chunks = TextProcessing.splitTextIntoChunks(
                        bodyParts.body,
                        taskSizeLimit,
                        AppConfig.CHUNKING.searchWindow,
                        AppConfig.CHUNKING.minChunkSize
                    );

                    chunks.forEach(function(chunkContent, i) {
                        tasks.push([
                            'epub_chunk',
                            epubData,
                            chapter.path,
                            chunkContent,
                            i,
                            chunks.length,
                            bodyParts.prefix,
                            bodyParts.suffix
                        ]);
                    });
                }
            });

            return tasks;
        },

        /**
         * Подготавливает задачи для генерации глоссария
         * @param {Array} chapters
         * @param {number} batchSize
         * @returns {Array}
         */
        prepareGlossaryTasks: function(chapters, batchSize) {
            batchSize = batchSize || 5;
            var tasks = [];

            for (var i = 0; i < chapters.length; i += batchSize) {
                var batch = chapters.slice(i, i + batchSize);
                var paths = batch.map(function(ch) { return ch.path; });
                tasks.push(['glossary_batch_task', null, paths]);
            }

            return tasks;
        }
    };

    // Публичный API
    return {
        create: create,
        TaskPreparer: TaskPreparer
    };
})();
