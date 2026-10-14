/**
 * EPUB AI Translator - UI Manager
 * Управление пользовательским интерфейсом
 */

var UIManager = (function() {
    'use strict';

    var elements = {};
    var currentEpub = null;
    var chapters = [];
    var isTranslating = false;
    var translationResults = {};

    /**
     * Инициализация UI
     */
    function init() {
        cacheElements();
        
        // Сначала загружаем настройки
        try {
            populateProviders();
            loadSavedSettings();
            updateProviderModels();
            updateGlossaryList();
            
            // Проверка наличия функции перед вызовом
            if (typeof SettingsManager.getPromptPresets === 'function') {
                updatePromptPresets();
            } else {
                console.error('SettingsManager.getPromptPresets is not a function');
            }
        } catch (e) {
            console.error('Error during settings initialization:', e);
        }

        // Загружаем сохраненный промпт
        var savedPrompt = SettingsManager.getCustomPrompt();
        if (savedPrompt && elements.customPrompt) {
            elements.customPrompt.value = savedPrompt;
        } else if (elements.customPrompt) {
            elements.customPrompt.value = AppConfig.DEFAULT_PROMPT;
        }

        // Инициализируем мобильное отображение
        if (window.innerWidth <= 768) {
            switchMobilePanel('left');
        }

        // Привязываем события в конце
        bindEvents();

        EventBus.log('Приложение готово к работе', 'success');
    }

    /**
     * Кэширование DOM элементов
     */
    function cacheElements() {
        elements = {
            // File
            fileDropZone: document.getElementById('file-drop-zone'),
            fileInput: document.getElementById('file-input'),
            btnSelectFile: document.getElementById('btn-select-file'),
            fileInfo: document.getElementById('file-info'),
            fileName: document.getElementById('file-name'),
            btnClearFile: document.getElementById('btn-clear-file'),

            // Chapters
            chapterCount: document.getElementById('chapter-count'),
            chapterList: document.getElementById('chapter-list'),
            btnSelectAll: document.getElementById('btn-select-all'),
            btnDeselectAll: document.getElementById('btn-deselect-all'),
            btnInvertSelection: document.getElementById('btn-invert-selection'),

            // API Settings
            apiProvider: document.getElementById('api-provider'),
            apiModel: document.getElementById('api-model'),
            apiKeys: document.getElementById('api-keys'),
            temperature: document.getElementById('temperature'),
            temperatureValue: document.getElementById('temperature-value'),
            rpmLimit: document.getElementById('rpm-limit'),
            numInstances: document.getElementById('num-instances'),

            // Thinking Mode
            thinkingOptions: document.getElementById('thinking-options'),
            thinkingEnabled: document.getElementById('thinking-enabled'),
            thinkingBudgetWrapper: document.getElementById('thinking-budget-wrapper'),
            thinkingBudget: document.getElementById('thinking-budget'),

            // Mobile
            mobilePanelTabs: document.querySelectorAll('.mobile-panel-tab'),
            panelLeft: document.querySelector('.panel-left'),
            panelCenter: document.querySelector('.panel-center'),
            panelRight: document.querySelector('.panel-right'),

            // Prompt
            promptPreset: document.getElementById('prompt-preset'),
            customPrompt: document.getElementById('custom-prompt'),
            btnSavePrompt: document.getElementById('btn-save-prompt'),
            btnDeletePrompt: document.getElementById('btn-delete-prompt'),
            useSystemInstruction: document.getElementById('use-system-instruction'),

            // Options
            optChunking: document.getElementById('opt-chunking'),
            optDynamicGlossary: document.getElementById('opt-dynamic-glossary'),
            optUseJieba: document.getElementById('opt-use-jieba'),
            optSegmentCjk: document.getElementById('opt-segment-cjk'),
            chunkSize: document.getElementById('chunk-size'),
            glossaryAiMode: document.getElementById('glossary-ai-mode'),
            fuzzyThreshold: document.getElementById('fuzzy-threshold'),
            fuzzyThresholdValue: document.getElementById('fuzzy-threshold-value'),

            // Control
            btnStartTranslation: document.getElementById('btn-start-translation'),
            btnDryRun: document.getElementById('btn-dry-run'),
            btnPauseTranslation: document.getElementById('btn-pause-translation'),
            btnStopTranslation: document.getElementById('btn-stop-translation'),

            // Progress
            progressSection: document.getElementById('progress-section'),
            progressFill: document.getElementById('progress-fill'),
            progressCurrent: document.getElementById('progress-current'),
            progressTotal: document.getElementById('progress-total'),

            // Tabs
            tabButtons: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content'),

            // Glossary
            btnAddTerm: document.getElementById('btn-add-term'),
            btnImportGlossary: document.getElementById('btn-import-glossary'),
            btnExportGlossary: document.getElementById('btn-export-glossary'),
            btnClearGlossary: document.getElementById('btn-clear-glossary'),
            btnGenerateGlossary: document.getElementById('btn-generate-glossary'),
            glossarySearch: document.getElementById('glossary-search'),
            glossaryList: document.getElementById('glossary-list'),
            glossaryCount: document.getElementById('glossary-count'),

            // Logs
            btnClearLogs: document.getElementById('btn-clear-logs'),
            btnCopyLogs: document.getElementById('btn-copy-logs'),
            autoScrollLogs: document.getElementById('auto-scroll-logs'),
            logContainer: document.getElementById('log-container'),

            // Results
            btnDownloadAll: document.getElementById('btn-download-all'),
            btnDownloadEpub: document.getElementById('btn-download-epub'),
            resultsList: document.getElementById('results-list'),

            // Modals
            modalOverlay: document.getElementById('modal-overlay'),
            modalSettings: document.getElementById('modal-settings'),
            modalAddTerm: document.getElementById('modal-add-term'),
            modalDryRun: document.getElementById('modal-dry-run'),

            // Modal inputs
            termOriginal: document.getElementById('term-original'),
            termTranslation: document.getElementById('term-translation'),
            termNote: document.getElementById('term-note'),
            btnSaveTerm: document.getElementById('btn-save-term'),
            dryRunContent: document.getElementById('dry-run-content'),
            btnCopyDryRun: document.getElementById('btn-copy-dry-run'),

            // Settings modal
            btnSettings: document.getElementById('btn-settings'),
            btnHelp: document.getElementById('btn-help'),
            btnExportSettings: document.getElementById('btn-export-settings'),
            btnImportSettings: document.getElementById('btn-import-settings'),
            btnClearStorage: document.getElementById('btn-clear-storage'),

            // Footer
            statusText: document.getElementById('status-text'),
            sessionInfo: document.getElementById('session-info')
        };
    }

    /**
     * Привязка событий
     */
    function bindEvents() {
        if (!elements.btnSelectFile) return;

        // File handling
        elements.btnSelectFile.addEventListener('click', function() {
            elements.fileInput.click();
        });

        if (elements.fileInput) {
            elements.fileInput.addEventListener('change', function(e) { handleFileSelect(e); });
        }

        if (elements.fileDropZone) {
            elements.fileDropZone.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.add('drag-over');
            });

            elements.fileDropZone.addEventListener('dragleave', function(e) {
                e.preventDefault();
                e.stopPropagation();
                this.classList.remove('drag-over');
            });

            elements.fileDropZone.addEventListener('drop', function(e) { handleFileDrop(e); });
        }

        if (elements.btnClearFile) {
            elements.btnClearFile.addEventListener('click', function() { clearFile(); });
        }

        // Chapter selection
        if (elements.btnSelectAll) {
            elements.btnSelectAll.addEventListener('click', function() { selectChapters('all'); });
        }
        if (elements.btnDeselectAll) {
            elements.btnDeselectAll.addEventListener('click', function() { selectChapters('none'); });
        }
        if (elements.btnInvertSelection) {
            elements.btnInvertSelection.addEventListener('click', function() { selectChapters('invert'); });
        }

        // API settings
        if (elements.apiProvider) {
            elements.apiProvider.addEventListener('change', function() { updateProviderModels(); });
        }
        if (elements.apiModel) {
            elements.apiModel.addEventListener('change', function() { updateThinkingOptions(); });
        }

        if (elements.temperature) {
            elements.temperature.addEventListener('input', function() {
                elements.temperatureValue.textContent = parseFloat(this.value).toFixed(1);
            });
        }

        if (elements.fuzzyThreshold) {
            elements.fuzzyThreshold.addEventListener('input', function() {
                elements.fuzzyThresholdValue.textContent = this.value;
            });
        }

        // Thinking mode
        if (elements.thinkingEnabled) {
            elements.thinkingEnabled.addEventListener('change', function() {
                if (elements.thinkingBudgetWrapper) {
                    elements.thinkingBudgetWrapper.style.display = this.checked ? 'block' : 'none';
                }
            });
        }

        // Mobile panel tabs
        if (elements.mobilePanelTabs) {
            elements.mobilePanelTabs.forEach(function(tab) {
                tab.addEventListener('click', function() {
                    switchMobilePanel(this.dataset.panel);
                });
            });
        }

        // Prompt
        if (elements.promptPreset) {
            elements.promptPreset.addEventListener('change', function() { loadPromptPreset(); });
        }
        if (elements.btnSavePrompt) {
            elements.btnSavePrompt.addEventListener('click', function() { savePromptPreset(); });
        }
        if (elements.btnDeletePrompt) {
            elements.btnDeletePrompt.addEventListener('click', function() { deletePromptPreset(); });
        }

        // Translation control
        if (elements.btnStartTranslation) {
            elements.btnStartTranslation.addEventListener('click', function() { startTranslation(); });
        }
        if (elements.btnDryRun) {
            elements.btnDryRun.addEventListener('click', function() { runDryRun(); });
        }

        if (elements.btnHelp) {
            elements.btnHelp.addEventListener('click', function() {
                alert('EPUB AI Translator\n\n1. Загрузите файл EPUB или TXT.\n2. Выберите главы.\n3. Введите API ключи (один на строку).\n4. Настройте промпт.\n5. Нажмите "Начать перевод".\n\nПоддерживаются Gemini, OpenRouter и GLM-4.');
            });
        }
        if (elements.btnPauseTranslation) {
            elements.btnPauseTranslation.addEventListener('click', function() { togglePause(); });
        }
        if (elements.btnStopTranslation) {
            elements.btnStopTranslation.addEventListener('click', function() { stopTranslation(); });
        }

        // Tabs
        if (elements.tabButtons) {
            elements.tabButtons.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    switchTab(this.dataset.tab);
                });
            });
        }

        // Glossary
        if (elements.btnAddTerm) {
            elements.btnAddTerm.addEventListener('click', function() { showModal('modal-add-term'); });
        }
        if (elements.btnImportGlossary) {
            elements.btnImportGlossary.addEventListener('click', function() { importGlossary(); });
        }
        if (elements.btnExportGlossary) {
            elements.btnExportGlossary.addEventListener('click', function() { exportGlossary(); });
        }
        if (elements.btnClearGlossary) {
            elements.btnClearGlossary.addEventListener('click', function() { clearGlossary(); });
        }
        if (elements.btnGenerateGlossary) {
            elements.btnGenerateGlossary.addEventListener('click', function() { generateGlossary(); });
        }
        if (elements.glossarySearch) {
            elements.glossarySearch.addEventListener('input', Helpers.debounce(function() { filterGlossary(); }, 300));
        }
        if (elements.btnSaveTerm) {
            elements.btnSaveTerm.addEventListener('click', function() { saveTerm(); });
        }

        // Logs
        if (elements.btnClearLogs) {
            elements.btnClearLogs.addEventListener('click', function() { clearLogs(); });
        }
        if (elements.btnCopyLogs) {
            elements.btnCopyLogs.addEventListener('click', function() { copyLogs(); });
        }

        // Results
        if (elements.btnDownloadAll) {
            elements.btnDownloadAll.addEventListener('click', function() { downloadAllResults(); });
        }
        if (elements.btnDownloadEpub) {
            elements.btnDownloadEpub.addEventListener('click', function() { downloadEpub(); });
        }

        // Settings
        if (elements.btnSettings) {
            elements.btnSettings.addEventListener('click', function() { showModal('modal-settings'); });
        }
        if (elements.btnExportSettings) {
            elements.btnExportSettings.addEventListener('click', function() { exportSettings(); });
        }
        if (elements.btnImportSettings) {
            elements.btnImportSettings.addEventListener('click', function() { importSettings(); });
        }
        if (elements.btnClearStorage) {
            elements.btnClearStorage.addEventListener('click', function() { clearStorage(); });
        }

        // Modal close buttons
        document.querySelectorAll('[data-close-modal]').forEach(function(btn) {
            btn.addEventListener('click', function() { hideModals(); });
        });

        if (elements.modalOverlay) {
            elements.modalOverlay.addEventListener('click', function(e) {
                if (e.target === elements.modalOverlay) {
                    hideModals();
                }
            });
        }

        // Dry run copy
        if (elements.btnCopyDryRun) {
            elements.btnCopyDryRun.addEventListener('click', function() {
                var content = elements.dryRunContent.textContent;
                Helpers.copyToClipboard(content)
                    .then(function() { EventBus.log('Промпт скопирован', 'success'); });
            });
        }

        // Event Bus subscriptions
        subscribeToEvents();
    }

    /**
     * Подписка на события EventBus
     */
    function subscribeToEvents() {
        EventBus.on(EventBus.EVENTS.LOG_MESSAGE, function(event) {
            addLogEntry(event.data.message, event.data.level);
        });

        EventBus.on(EventBus.EVENTS.PROGRESS_UPDATED, function(event) {
            updateProgress(event.data.current, event.data.total);
        });

        EventBus.on(EventBus.EVENTS.SESSION_STARTED, function(event) {
            setTranslatingState(true);
            elements.sessionInfo.textContent = 'Сессия: ' + event.data.sessionId.substring(0, 8);
        });

        EventBus.on(EventBus.EVENTS.SESSION_FINISHED, function(event) {
            setTranslatingState(false);
            elements.sessionInfo.textContent = '';
            setStatus('Сессия завершена: ' + event.data.reason);
        });

        EventBus.on(EventBus.EVENTS.TASK_STATUS_UPDATED, function(event) {
            updateChapterStatus(event.data.task_info, event.data.status);
        });

        EventBus.on(EventBus.EVENTS.GLOSSARY_UPDATED, function(event) {
            updateGlossaryList();
        });

        EventBus.on(EventBus.EVENTS.GLOSSARY_GENERATION_FINISHED, function(event) {
            if (event.data.glossary) {
                event.data.glossary.forEach(function(term) {
                    GlossaryManager.addTerm(term);
                });
                EventBus.log('Генерация глоссария завершена. Добавлено терминов: ' + event.data.glossary.length, 'success');
            }
        });

        EventBus.on(EventBus.EVENTS.TRANSLATION_SAVED, function(event) {
            addResultItem(event.data);
        });

        EventBus.on(EventBus.EVENTS.DRY_RUN_PROMPT_READY, function(event) {
            showDryRunModal(event.data.promptText);
        });

        EventBus.on(EventBus.EVENTS.GEOBLOCK_DETECTED, function() {
            alert('Обнаружена блокировка по геолокации. Используйте VPN.');
        });
    }

    /**
     * Загрузка сохраненных настроек
     */
    function loadSavedSettings() {
        var settings = SettingsManager.getLastSettings();

        if (settings.model) {
            // Найдем провайдера для модели
            var providers = AppConfig.getVisibleProviders();
            for (var providerId in providers) {
                var models = providers[providerId].models;
                if (models[settings.model]) {
                    elements.apiProvider.value = providerId;
                    updateProviderModels();
                    elements.apiModel.value = settings.model;
                    break;
                }
            }
        }

        if (settings.temperature !== undefined) {
            elements.temperature.value = settings.temperature;
            elements.temperatureValue.textContent = parseFloat(settings.temperature).toFixed(1);
        }

        if (settings.rpmLimit) {
            elements.rpmLimit.value = settings.rpmLimit;
        }

        if (settings.numInstances) {
            elements.numInstances.value = settings.numInstances;
        }

        elements.optChunking.checked = settings.chunking !== false;
        elements.optDynamicGlossary.checked = settings.dynamicGlossary !== false;
        elements.optUseJieba.checked = settings.useJieba === true;
        elements.optSegmentCjk.checked = settings.segmentCjk === true;
        elements.useSystemInstruction.checked = settings.systemInstruction === true;
        elements.chunkSize.value = settings.chunkSize || 30000;
        elements.fuzzyThreshold.value = settings.fuzzyThreshold || 100;
        elements.fuzzyThresholdValue.textContent = elements.fuzzyThreshold.value;
        
        if (elements.glossaryAiMode) {
            elements.glossaryAiMode.value = settings.glossaryAiMode || 'supplement';
        }

        if (settings.thinkingEnabled && elements.thinkingEnabled) {
            elements.thinkingEnabled.checked = true;
            elements.thinkingBudgetWrapper.style.display = 'block';
            elements.thinkingBudget.value = settings.thinkingBudget || -1;
        }

        // Загрузка промпта
        var customPrompt = SettingsManager.getCustomPrompt();
        if (customPrompt) {
            elements.customPrompt.value = customPrompt;
        } else {
            elements.customPrompt.value = AppConfig.DEFAULT_PROMPT;
        }

        // Загрузка API ключей
        var apiKeys = SettingsManager.loadApiKeys();
        if (apiKeys.length > 0) {
            elements.apiKeys.value = apiKeys.map(function(k) { return k.key; }).join('\n');
        }
    }

    /**
     * Обновление списка моделей провайдера
     */
    function populateProviders() {
        if (!elements.apiProvider) return;
        var providers = AppConfig.getVisibleProviders();
        var currentVal = elements.apiProvider.value;
        elements.apiProvider.innerHTML = '';
        for (var id in providers) {
            var opt = document.createElement('option');
            opt.value = id;
            opt.textContent = providers[id].displayName || id;
            elements.apiProvider.appendChild(opt);
        }
        if (currentVal && providers[currentVal]) {
            elements.apiProvider.value = currentVal;
        } else {
            elements.apiProvider.value = AppConfig.getDefaultProvider();
        }
    }

    function updateProviderModels() {
        var providerId = elements.apiProvider.value;
        var models = AppConfig.getModelsForProvider(providerId);

        elements.apiModel.innerHTML = '';

        for (var modelName in models) {
            var option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            elements.apiModel.appendChild(option);
        }

        // Обновляем опции thinking после смены провайдера
        updateThinkingOptions();
    }

    /**
     * Обновление опций Thinking Mode в зависимости от модели
     */
    function updateThinkingOptions() {
        if (!elements.thinkingOptions) return;

        var providerId = elements.apiProvider.value;
        var modelName = elements.apiModel.value;
        var modelConfig = AppConfig.getModelConfig(providerId, modelName);

        // Показываем опции thinking только для моделей, которые это поддерживают
        var supportsThinking = Boolean(modelConfig && modelConfig.minThinkingBudget !== false && modelConfig.minThinkingBudget !== undefined);

        elements.thinkingOptions.style.display = supportsThinking ? 'block' : 'none';

        if (!supportsThinking && elements.thinkingEnabled) {
            elements.thinkingEnabled.checked = false;
            if (elements.thinkingBudgetWrapper) {
                elements.thinkingBudgetWrapper.style.display = 'none';
            }
        }
    }

    /**
     * Переключение мобильных панелей
     */
    function switchMobilePanel(panelName) {
        // Обновляем активные табы
        elements.mobilePanelTabs.forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.panel === panelName);
        });

        // Скрываем/показываем панели
        var panels = {
            'left': elements.panelLeft,
            'center': elements.panelCenter,
            'right': elements.panelRight
        };

        for (var name in panels) {
            if (panels[name]) {
                if (name === panelName) {
                    panels[name].style.display = 'flex';
                    panels[name].classList.remove('mobile-hidden');
                } else {
                    panels[name].style.display = 'none';
                    panels[name].classList.add('mobile-hidden');
                }
            }
        }
    }

    /**
     * Обработка выбора файла
     */
    function handleFileSelect(e) {
        var file = e.target.files[0];
        if (file) {
            loadFile(file);
        }
    }

    /**
     * Обработка drop файла
     */
    function handleFileDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.remove('drag-over');

        var files = e.dataTransfer.files;
        if (files.length > 0) {
            loadFile(files[0]);
        }
    }

    /**
     * Загрузка файла
     */
    function loadFile(file) {
        var extension = Helpers.getFileExtension(file.name);

        if (extension !== 'epub' && extension !== 'txt') {
            EventBus.log('Неподдерживаемый формат файла. Используйте EPUB или TXT.', 'error');
            return;
        }

        setStatus('Загрузка файла...');

        if (extension === 'epub') {
            loadEpubFile(file);
        } else {
            loadTxtFile(file);
        }
    }

    /**
     * Загрузка EPUB файла
     */
    function loadEpubFile(file) {
        setStatus('Загрузка EPUB...');
        EventBus.log('Начинаю загрузку: ' + file.name, 'info');
        
        EpubTools.EpubReader.read(file)
            .then(function(epub) {
                if (!epub || !epub.chapters) {
                    throw new Error('Не удалось извлечь главы из EPUB');
                }
                
                currentEpub = epub;
                chapters = epub.chapters;

                elements.fileInfo.classList.remove('hidden');
                elements.fileDropZone.classList.add('hidden');
                elements.fileName.textContent = file.name;

                renderChapterList();
                updateStartButton();

                EventBus.emit(EventBus.EVENTS.FILE_LOADED, {
                    filename: file.name,
                    chapters: chapters.length
                }, { source: 'UIManager' });

                setStatus('Файл загружен: ' + chapters.length + ' глав');
                EventBus.log('Загружен файл: ' + file.name + ' (' + chapters.length + ' глав)', 'success');
                
                if (epub.metadata && epub.metadata.title) {
                    EventBus.log('Название книги: ' + epub.metadata.title, 'info');
                }
            })
            .catch(function(error) {
                console.error('EPUB load error:', error);
                EventBus.log('Ошибка загрузки EPUB: ' + error.message, 'error');
                setStatus('Ошибка загрузки файла');
                clearFile();
            });
    }

    /**
     * Загрузка TXT файла
     */
    function loadTxtFile(file) {
        Helpers.readFileAsText(file)
            .then(function(text) {
                // Простое разбиение на главы по пустым строкам или маркерам
                var chapterTexts = text.split(/\n{3,}|\r\n{3,}/);

                chapters = chapterTexts.map(function(content, index) {
                    return {
                        path: 'chapter_' + (index + 1) + '.html',
                        filename: 'chapter_' + (index + 1) + '.html',
                        content: '<html><body><p>' + content.replace(/\n/g, '</p><p>') + '</p></body></html>',
                        size: content.length,
                        index: index
                    };
                }).filter(function(ch) { return ch.content.length > 50; });

                currentEpub = {
                    metadata: { title: Helpers.removeExtension(file.name) },
                    chapters: chapters
                };

                elements.fileInfo.classList.remove('hidden');
                elements.fileDropZone.classList.add('hidden');
                elements.fileName.textContent = file.name;

                renderChapterList();
                updateStartButton();

                setStatus('Файл загружен: ' + chapters.length + ' частей');
                EventBus.log('Загружен TXT файл: ' + file.name, 'success');
            })
            .catch(function(error) {
                EventBus.log('Ошибка загрузки TXT: ' + error.message, 'error');
            });
    }

    /**
     * Очистка файла
     */
    function clearFile() {
        currentEpub = null;
        chapters = [];
        translationResults = {};

        elements.fileInfo.classList.add('hidden');
        elements.fileDropZone.classList.remove('hidden');
        elements.fileInput.value = '';
        elements.chapterList.innerHTML = '';
        elements.chapterCount.textContent = '(0)';
        elements.resultsList.innerHTML = '';

        updateStartButton();
        setStatus('Готов к работе');
    }

    /**
     * Рендеринг списка глав
     */
    function renderChapterList() {
        elements.chapterList.innerHTML = '';

        chapters.forEach(function(chapter, index) {
            var item = document.createElement('div');
            item.className = 'chapter-item selected';
            item.dataset.index = index;
            item.dataset.path = chapter.path;

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;

            var name = document.createElement('span');
            name.className = 'chapter-name';
            name.textContent = chapter.filename || ('Глава ' + (index + 1));

            var size = document.createElement('span');
            size.className = 'chapter-size';
            size.textContent = Helpers.formatSize(chapter.size || chapter.content.length);

            var status = document.createElement('span');
            status.className = 'chapter-status';
            status.dataset.path = chapter.path;

            item.appendChild(checkbox);
            item.appendChild(name);
            item.appendChild(size);
            item.appendChild(status);

            item.addEventListener('click', function(e) {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
                item.classList.toggle('selected', checkbox.checked);
                updateStartButton();
            });

            elements.chapterList.appendChild(item);
        });

        elements.chapterCount.textContent = '(' + chapters.length + ')';
    }

    /**
     * Выбор глав
     */
    function selectChapters(mode) {
        var items = elements.chapterList.querySelectorAll('.chapter-item');

        items.forEach(function(item) {
            var checkbox = item.querySelector('input[type="checkbox"]');

            switch (mode) {
                case 'all':
                    checkbox.checked = true;
                    item.classList.add('selected');
                    break;
                case 'none':
                    checkbox.checked = false;
                    item.classList.remove('selected');
                    break;
                case 'invert':
                    checkbox.checked = !checkbox.checked;
                    item.classList.toggle('selected', checkbox.checked);
                    break;
            }
        });

        updateStartButton();
    }

    /**
     * Получение выбранных глав
     */
    function getSelectedChapters() {
        var selected = [];

        elements.chapterList.querySelectorAll('.chapter-item').forEach(function(item) {
            if (item.querySelector('input[type="checkbox"]').checked) {
                var index = parseInt(item.dataset.index, 10);
                selected.push(chapters[index]);
            }
        });

        return selected;
    }

    /**
     * Обновление статуса главы
     */
    function updateChapterStatus(taskInfo, status) {
        var path = taskInfo[2];
        var statusEl = elements.chapterList.querySelector('.chapter-status[data-path="' + path + '"]');

        if (statusEl) {
            statusEl.className = 'chapter-status ' + status;

            switch (status) {
                case 'success':
                    statusEl.textContent = '✓';
                    break;
                case 'error':
                    statusEl.textContent = '✗';
                    break;
                case 'processing':
                    statusEl.textContent = '⟳';
                    break;
                case 'filtered':
                    statusEl.textContent = '🛡️';
                    break;
                default:
                    statusEl.textContent = '';
            }
        }
    }

    /**
     * Обновление кнопки запуска
     */
    function updateStartButton() {
        var selectedChapters = getSelectedChapters();
        var hasKeys = elements.apiKeys.value.trim().length > 0;

        elements.btnStartTranslation.disabled = selectedChapters.length === 0 || !hasKeys || isTranslating;
        elements.btnDryRun.disabled = selectedChapters.length === 0 || isTranslating;
    }

    /**
     * Запуск режима предпросмотра
     */
    function runDryRun() {
        var selectedChapters = getSelectedChapters();
        if (selectedChapters.length === 0) return;

        var settings = {
            epubData: currentEpub,
            selectedChapters: [selectedChapters[0]],
            apiKeys: ["DRY_RUN"],
            provider: "dry_run",
            modelConfig: AppConfig.getModelConfig("dry_run", "Предпросмотр"),
            temperature: 1.0,
            customPrompt: elements.customPrompt.value,
            useSystemInstruction: elements.useSystemInstruction.checked,
            chunking: false,
            numInstances: 1
        };

        EventBus.log('Запуск предпросмотра...', 'info');
        TranslationEngine.getEngine().start(settings);
    }

    /**
     * Запуск перевода
     */
    function startTranslation() {
        var selectedChapters = getSelectedChapters();

        if (selectedChapters.length === 0) {
            EventBus.log('Выберите главы для перевода', 'warning');
            return;
        }

        if (!currentEpub || !currentEpub.chapters) {
            EventBus.log('Сначала загрузите EPUB файл', 'warning');
            return;
        }

        // Сбор настроек
        var apiKeysText = elements.apiKeys.value.trim();
        var apiKeys = apiKeysText.split('\n').filter(function(k) { return k.trim(); });

        if (apiKeys.length === 0) {
            EventBus.log('Введите API ключи', 'warning');
            return;
        }

        var providerId = elements.apiProvider.value;
        var modelName = elements.apiModel.value;
        var modelConfig = AppConfig.getModelConfig(providerId, modelName);

        if (!modelConfig) {
            EventBus.log('Модель не найдена', 'error');
            return;
        }

        var settings = {
            epubData: currentEpub,
            selectedChapters: selectedChapters,
            apiKeys: apiKeys,
            provider: providerId,
            modelConfig: modelConfig,
            temperature: parseFloat(elements.temperature.value),
            rpmLimit: parseInt(elements.rpmLimit.value, 10),
            numInstances: parseInt(elements.numInstances.value, 10),
            customPrompt: elements.customPrompt.value,
            useSystemInstruction: elements.useSystemInstruction.checked,
            chunking: elements.optChunking.checked,
            chunkSize: parseInt(elements.chunkSize.value, 10),
            dynamicGlossary: elements.optDynamicGlossary.checked,
            fuzzyThreshold: parseInt(elements.fuzzyThreshold.value, 10),
            glossaryAiMode: elements.glossaryAiMode ? elements.glossaryAiMode.value : 'supplement',
            glossaryData: GlossaryManager.toObject(),
            // Thinking options
            thinkingEnabled: elements.thinkingEnabled ? elements.thinkingEnabled.checked : false,
            thinkingBudget: elements.thinkingBudget ? parseInt(elements.thinkingBudget.value, 10) : -1
        };

        // Сохранение настроек
        SettingsManager.saveLastSettings({
            model: modelName,
            provider: providerId,
            temperature: settings.temperature,
            rpmLimit: settings.rpmLimit,
            chunking: settings.chunking,
            dynamicGlossary: settings.dynamicGlossary,
            systemInstruction: settings.useSystemInstruction,
            numInstances: settings.numInstances,
            thinkingEnabled: settings.thinkingEnabled,
            thinkingBudget: settings.thinkingBudget,
            chunkSize: settings.chunkSize,
            fuzzyThreshold: settings.fuzzyThreshold
        });

        SettingsManager.saveCustomPrompt(settings.customPrompt);

        // Сохранение API ключей
        var keysData = apiKeys.map(function(key) {
            return { key: key, provider: providerId };
        });
        SettingsManager.saveApiKeys(keysData);

        EventBus.log('Запуск перевода: ' + selectedChapters.length + ' глав', 'info');

        // Запуск движка
        try {
            TranslationEngine.getEngine().start(settings);
            // Если на мобилке, переключаемся на табы логов/результатов
            if (window.innerWidth <= 768) {
                switchMobilePanel('right');
                switchTab('logs');
            }
        } catch (e) {
            EventBus.log('Ошибка запуска перевода: ' + e.message, 'error');
            console.error('Translation start error:', e);
        }
    }

    /**
     * Установка состояния перевода
     */
    function setTranslatingState(translating) {
        isTranslating = translating;

        elements.btnStartTranslation.classList.toggle('hidden', translating);
        elements.btnPauseTranslation.classList.toggle('hidden', !translating);
        elements.btnStopTranslation.classList.toggle('hidden', !translating);
        elements.progressSection.classList.toggle('hidden', !translating);

        if (translating) {
            updateProgress(0, 0);
        }

        updateStartButton();
    }

    /**
     * Переключение паузы
     */
    function togglePause() {
        var engine = TranslationEngine.getEngine();
        var isPaused = engine.togglePause();

        elements.btnPauseTranslation.textContent = isPaused ? '▶️ Продолжить' : '⏸️ Пауза';
    }

    /**
     * Остановка перевода
     */
    function stopTranslation() {
        if (confirm('Остановить перевод?')) {
            EventBus.emit(EventBus.EVENTS.STOP_SESSION_REQUESTED, {}, { source: 'UIManager' });
        }
    }

    /**
     * Обновление прогресса
     */
    function updateProgress(current, total) {
        elements.progressCurrent.textContent = current;
        elements.progressTotal.textContent = total;

        var percent = total > 0 ? (current / total * 100) : 0;
        elements.progressFill.style.width = percent + '%';
    }

    /**
     * Переключение вкладки
     */
    function switchTab(tabId) {
        elements.tabButtons.forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        elements.tabContents.forEach(function(content) {
            content.classList.toggle('active', content.id === 'tab-' + tabId);
        });
    }

    /**
     * Обновление списка глоссария
     */
    function updateGlossaryList() {
        var terms = GlossaryManager.getAll();
        var searchQuery = elements.glossarySearch.value.toLowerCase();

        if (searchQuery) {
            terms = terms.filter(function(term) {
                return term.original.toLowerCase().indexOf(searchQuery) !== -1 ||
                       (term.translation && term.translation.toLowerCase().indexOf(searchQuery) !== -1);
            });
        }

        elements.glossaryList.innerHTML = '';

        terms.forEach(function(term) {
            var item = document.createElement('div');
            item.className = 'glossary-item';

            var content = document.createElement('div');
            content.className = 'glossary-item-content';

            var original = document.createElement('div');
            original.className = 'glossary-original';
            original.textContent = term.original;

            var translation = document.createElement('div');
            translation.className = 'glossary-translation';
            translation.textContent = term.translation || '';

            content.appendChild(original);
            content.appendChild(translation);

            if (term.note) {
                var note = document.createElement('div');
                note.className = 'glossary-note';
                note.textContent = term.note;
                content.appendChild(note);
            }

            var actions = document.createElement('div');
            actions.className = 'glossary-item-actions';

            var editBtn = document.createElement('button');
            editBtn.className = 'btn btn-small';
            editBtn.textContent = '✏️';
            editBtn.onclick = function() { editTerm(term.original); };

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-small btn-danger';
            deleteBtn.textContent = '🗑️';
            deleteBtn.onclick = function() { deleteTerm(term.original); };

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(content);
            item.appendChild(actions);

            elements.glossaryList.appendChild(item);
        });

        elements.glossaryCount.textContent = GlossaryManager.count();
    }

    /**
     * Фильтрация глоссария
     */
    function filterGlossary() {
        updateGlossaryList();
    }

    /**
     * Сохранение термина
     */
    function saveTerm() {
        var original = elements.termOriginal.value.trim();
        var translation = elements.termTranslation.value.trim();
        var note = elements.termNote.value.trim();

        if (!original) {
            alert('Введите оригинальный термин');
            return;
        }

        GlossaryManager.addTerm({
            original: original,
            translation: translation,
            note: note
        });

        hideModals();
        elements.termOriginal.value = '';
        elements.termTranslation.value = '';
        elements.termNote.value = '';

        EventBus.log('Термин добавлен: ' + original, 'success');
    }

    /**
     * Редактирование термина
     */
    function editTerm(original) {
        var terms = GlossaryManager.getAll();
        var term = terms.find(function(t) { return t.original === original; });

        if (term) {
            elements.termOriginal.value = term.original;
            elements.termTranslation.value = term.translation || '';
            elements.termNote.value = term.note || '';
            showModal('modal-add-term');
        }
    }

    /**
     * Удаление термина
     */
    function deleteTerm(original) {
        if (confirm('Удалить термин "' + original + '"?')) {
            GlossaryManager.removeTerm(original);
            EventBus.log('Термин удален: ' + original, 'info');
        }
    }

    /**
     * Импорт глоссария
     */
    function importGlossary() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv';

        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;

            Helpers.readFileAsText(file)
                .then(function(content) {
                    var ext = Helpers.getFileExtension(file.name);
                    var result;

                    if (ext === 'json') {
                        result = GlossaryManager.importFromJson(content, 'merge');
                    } else {
                        result = GlossaryManager.importFromCsv(content, 'merge');
                    }

                    if (result.success) {
                        EventBus.log('Импортировано терминов: ' + result.count, 'success');
                    } else {
                        EventBus.log('Ошибка импорта: ' + result.errors.join(', '), 'error');
                    }
                });
        };

        input.click();
    }

    /**
     * Экспорт глоссария
     */
    function exportGlossary() {
        var json = GlossaryManager.exportToJson();
        var filename = 'glossary_' + new Date().toISOString().slice(0, 10) + '.json';

        Helpers.downloadFile(json, filename, 'application/json');
        EventBus.log('Глоссарий экспортирован', 'success');
    }

    /**
     * Очистка глоссария
     */
    function clearGlossary() {
        if (confirm('Очистить весь глоссарий?')) {
            GlossaryManager.clear();
            EventBus.log('Глоссарий очищен', 'info');
        }
    }

    /**
     * Генерация глоссария с помощью AI
     */
    function generateGlossary() {
        var selectedChapters = getSelectedChapters();
        if (selectedChapters.length === 0) {
            EventBus.log('Выберите главы для анализа (рекомендуется 1-3 главы)', 'warning');
            return;
        }

        var apiKeysText = elements.apiKeys.value.trim();
        var apiKeys = apiKeysText.split('\n').filter(function(k) { return k.trim(); });

        if (apiKeys.length === 0) {
            EventBus.log('Введите API ключи для генерации', 'warning');
            return;
        }

        if (confirm('Запустить AI генерацию глоссария для ' + selectedChapters.length + ' выбранных глав? Это создаст начальный список терминов.')) {
            var textToAnalyze = GlossaryGenerator.extractTextForAnalysis(selectedChapters);
            
            // Подготавливаем задачу
            var task = ['glossary_batch_task', currentEpub, selectedChapters.map(function(ch) { return ch.path; }), textToAnalyze];
            
            var providerId = elements.apiProvider.value;
            var modelName = elements.apiModel.value;
            var modelConfig = AppConfig.getModelConfig(providerId, modelName);

            var settings = {
                epubData: currentEpub,
                apiKeys: apiKeys,
                provider: providerId,
                modelConfig: modelConfig,
                temperature: 0.2, // Низкая температура для точности в JSON
                customPrompt: AppConfig.DEFAULT_GLOSSARY_PROMPT,
                useSystemInstruction: false,
                numInstances: 1,
                isGlossaryOnly: true,
                tasks: [task]
            };

            EventBus.log('Запуск AI анализа терминов...', 'info');

            try {
                TranslationEngine.getEngine().start(settings);
                
                if (window.innerWidth <= 768) {
                    switchMobilePanel('right');
                    switchTab('logs');
                }
            } catch (e) {
                EventBus.log('Ошибка запуска генерации глоссария: ' + e.message, 'error');
            }
        }
    }

    /**
     * Обновление пресетов промптов
     */
    function updatePromptPresets() {
        var presets = SettingsManager.getPromptPresets();
        elements.promptPreset.innerHTML = '<option value="">-- Пресеты --</option>';

        for (var name in presets) {
            var option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            elements.promptPreset.appendChild(option);
        }

        var lastPreset = SettingsManager.getLastPromptPreset();
        if (lastPreset && presets[lastPreset]) {
            elements.promptPreset.value = lastPreset;
        }
    }

    /**
     * Загрузка пресета промпта
     */
    function loadPromptPreset() {
        var presetName = elements.promptPreset.value;
        if (!presetName) return;

        var presets = SettingsManager.loadNamedPrompts();
        if (presets[presetName]) {
            elements.customPrompt.value = presets[presetName];
            SettingsManager.saveLastPromptPreset(presetName);
        }
    }

    /**
     * Сохранение пресета промпта
     */
    function savePromptPreset() {
        var name = prompt('Название пресета:');
        if (!name) return;

        var promptText = elements.customPrompt.value;
        SettingsManager.savePrompt(name, promptText);
        updatePromptPresets();
        elements.promptPreset.value = name;

        EventBus.log('Пресет сохранен: ' + name, 'success');
    }

    /**
     * Удаление пресета промпта
     */
    function deletePromptPreset() {
        var presetName = elements.promptPreset.value;
        if (!presetName) return;

        if (confirm('Удалить пресет "' + presetName + '"?')) {
            SettingsManager.deletePrompt(presetName);
            updatePromptPresets();
            EventBus.log('Пресет удален: ' + presetName, 'info');
        }
    }

    /**
     * Добавление записи в лог
     */
    function addLogEntry(message, level) {
        level = level || 'info';

        if (message === '---SEPARATOR---') {
            var separator = document.createElement('div');
            separator.className = 'log-separator';
            elements.logContainer.appendChild(separator);
        } else {
            var entry = document.createElement('div');
            entry.className = 'log-entry ' + level;
            entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
            elements.logContainer.appendChild(entry);
        }

        if (elements.autoScrollLogs.checked) {
            elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
        }
    }

    /**
     * Очистка логов
     */
    function clearLogs() {
        elements.logContainer.innerHTML = '';
    }

    /**
     * Копирование логов
     */
    function copyLogs() {
        var logs = elements.logContainer.innerText;
        Helpers.copyToClipboard(logs)
            .then(function() { EventBus.log('Логи скопированы', 'success'); });
    }

    /**
     * Добавление результата
     */
    function addResultItem(data) {
        var path = data.originalPath;

        translationResults[path] = data;

        // Обновляем UI
        var existing = elements.resultsList.querySelector('[data-path="' + path + '"]');
        if (existing) {
            existing.remove();
        }

        var item = document.createElement('div');
        item.className = 'result-item';
        item.dataset.path = path;

        var name = document.createElement('span');
        name.className = 'result-item-name';
        name.textContent = Helpers.getFileName(path);

        var actions = document.createElement('div');
        actions.className = 'result-item-actions';

        var downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn btn-small';
        downloadBtn.textContent = '📥';
        downloadBtn.onclick = function() {
            downloadSingleResult(path);
        };

        var viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-small';
        viewBtn.textContent = '👁️';
        viewBtn.onclick = function() {
            viewResult(path);
        };

        actions.appendChild(viewBtn);
        actions.appendChild(downloadBtn);

        item.appendChild(name);
        item.appendChild(actions);

        elements.resultsList.appendChild(item);

        elements.btnDownloadAll.disabled = false;
        elements.btnDownloadEpub.disabled = false;
    }

    /**
     * Скачивание одного результата
     */
    function downloadSingleResult(path) {
        var data = translationResults[path];
        if (!data) return;

        var filename = Helpers.getFileName(path);
        Helpers.downloadFile(data.content, filename, 'text/html');
    }

    /**
     * Просмотр результата
     */
    function viewResult(path) {
        var data = translationResults[path];
        if (!data) return;

        var win = window.open('', '_blank');
        win.document.write(data.content);
        win.document.close();
    }

    /**
     * Скачивание всех результатов
     */
    function downloadAllResults() {
        if (Object.keys(translationResults).length === 0) {
            EventBus.log('Нет результатов для скачивания', 'warning');
            return;
        }

        var zip = new JSZip();

        for (var path in translationResults) {
            var data = translationResults[path];
            var filename = Helpers.getFileName(path);
            zip.file(filename, data.content);
        }

        zip.generateAsync({ type: 'blob' })
            .then(function(blob) {
                var name = currentEpub && currentEpub.metadata ? currentEpub.metadata.title : 'translations';
                Helpers.downloadFile(blob, name + '_translated.zip');
                EventBus.log('Архив скачан', 'success');
            });
    }

    /**
     * Скачивание EPUB
     */
    function downloadEpub() {
        if (!currentEpub) {
            EventBus.log('Файл не загружен', 'warning');
            return;
        }

        if (Object.keys(translationResults).length === 0) {
            EventBus.log('Нет переведенных глав для экспорта', 'warning');
            return;
        }

        var title = currentEpub.metadata ? (currentEpub.metadata.title || 'Untitled') : 'Untitled';
        
        if (currentEpub.zip) {
            EventBus.log('Сборка EPUB: замена глав в оригинальном архиве...', 'info');
            
            var translationsMap = {};
            for (var path in translationResults) {
                translationsMap[path] = translationResults[path].content;
            }

            var providerId = elements.apiProvider.value;
            var provider = AppConfig.getProvider(providerId);
            var suffix = (provider && provider.fileSuffix) ? provider.fileSuffix : '_translated.html';

            EpubTools.EpubUpdater.update(currentEpub, translationsMap, { fileSuffix: suffix })
                .then(function(blob) {
                    var safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');
                    Helpers.downloadFile(blob, safeTitle + '_translated.epub', 'application/epub+zip');
                    EventBus.log('EPUB успешно собран и скачан', 'success');
                })
                .catch(function(error) {
                    console.error('EPUB rebuild error:', error);
                    EventBus.log('Ошибка сборки EPUB: ' + error.message, 'error');
                    fallbackEpubExport();
                });
        } else {
            EventBus.log('Оригинальный EPUB недоступен. Создание нового архива только из глав...', 'warning');
            fallbackEpubExport();
        }
    }

    /**
     * Запасной вариант экспорта EPUB (только текст)
     */
    function fallbackEpubExport() {
        var title = currentEpub.metadata ? currentEpub.metadata.title : 'Translated Book';
        var author = currentEpub.metadata ? currentEpub.metadata.author : 'Unknown';

        var chaptersForEpub = [];
        chapters.forEach(function(chapter, index) {
            var result = translationResults[chapter.path];
            var content = result ? result.content : chapter.content;
            chaptersForEpub.push({
                filename: chapter.filename || ('chapter_' + (index + 1) + '.xhtml'),
                content: content,
                title: chapter.filename || ('Chapter ' + (index + 1)),
                index: index
            });
        });

        EpubTools.EpubCreator.create({
            title: title + ' (Translated)',
            author: author,
            chapters: chaptersForEpub
        })
        .then(function(blob) {
            Helpers.downloadFile(blob, title + '_translated_text.epub');
            EventBus.log('EPUB с текстом скачан', 'success');
        });
    }

    /**
     * Показ модального окна
     */
    function showModal(modalId) {
        elements.modalOverlay.classList.remove('hidden');

        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.classList.add('hidden');
        });

        document.getElementById(modalId).classList.remove('hidden');
    }

    /**
     * Скрытие модальных окон
     */
    function hideModals() {
        elements.modalOverlay.classList.add('hidden');
        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.classList.add('hidden');
        });
    }

    /**
     * Показ dry run модального окна
     */
    function showDryRunModal(promptText) {
        elements.dryRunContent.textContent = promptText;
        showModal('modal-dry-run');
    }

    /**
     * Экспорт настроек
     */
    function exportSettings() {
        var settings = SettingsManager.exportAllSettings();
        var json = JSON.stringify(settings, null, 2);
        Helpers.downloadFile(json, 'epub_translator_settings.json', 'application/json');
        EventBus.log('Настройки экспортированы', 'success');
    }

    /**
     * Импорт настроек
     */
    function importSettings() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;

            Helpers.readFileAsText(file)
                .then(function(content) {
                    var data = JSON.parse(content);
                    if (SettingsManager.importAllSettings(data)) {
                        loadSavedSettings();
                        updateGlossaryList();
                        updatePromptPresets();
                        EventBus.log('Настройки импортированы', 'success');
                    } else {
                        EventBus.log('Ошибка импорта настроек', 'error');
                    }
                })
                .catch(function(error) {
                    EventBus.log('Ошибка чтения файла: ' + error.message, 'error');
                });
        };

        input.click();
    }

    /**
     * Очистка хранилища
     */
    function clearStorage() {
        if (confirm('Удалить все сохраненные данные?')) {
            SettingsManager.clearAllStorage();
            location.reload();
        }
    }

    /**
     * Установка статуса
     */
    function setStatus(text) {
        elements.statusText.textContent = text;
    }

    // Публичный API
    return {
        init: init,
        updateGlossaryList: updateGlossaryList,
        addLogEntry: addLogEntry,
        setStatus: setStatus,
        showModal: showModal,
        hideModals: hideModals
    };
})();
