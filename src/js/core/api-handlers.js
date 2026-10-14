/**
 * EPUB AI Translator - API Handlers
 * Обработчики для различных AI API провайдеров
 */

var ApiHandlers = (function() {
    'use strict';

    /**
     * Базовый класс API обработчика
     */
    function BaseApiHandler(worker) {
        this.worker = worker;
        this.abortController = null;
    }

    BaseApiHandler.prototype = {
        /**
         * Настройка клиента
         */
        setup: function(apiKey) {
            this.worker.apiKey = apiKey;
            this.worker.modelId = this.worker.modelConfig.id;
            return true;
        },

        /**
         * Выполнение API вызова
         */
        execute: function(prompt, options) {
            var self = this;
            options = options || {};

            return new Promise(function(resolve, reject) {
                if (self.worker.isCancelled) {
                    reject({ type: 'CANCEL', message: 'Операция отменена' });
                    return;
                }

                self.abortController = new AbortController();

                self.callApi(prompt, options)
                    .then(resolve)
                    .catch(function(error) {
                        reject(self.classifyError(error));
                    });
            });
        },

        /**
         * Вызов API (переопределяется в наследниках)
         */
        callApi: function(prompt, options) {
            return Promise.reject(new Error('Not implemented'));
        },

        /**
         * Классификация ошибки
         */
        classifyError: function(error) {
            var message = error.message || String(error);
            var messageLower = message.toLowerCase();

            if (messageLower.indexOf('user location') !== -1 || 
                messageLower.indexOf('geo') !== -1) {
                return { type: AppConfig.ERROR_TYPES.GEOBLOCK, message: message, original: error };
            }

            if (messageLower.indexOf('quota') !== -1 || 
                messageLower.indexOf('exhausted') !== -1 ||
                messageLower.indexOf('api key not valid') !== -1 ||
                messageLower.indexOf('invalid api key') !== -1) {
                return { type: AppConfig.ERROR_TYPES.QUOTA_EXCEEDED, message: message, original: error };
            }

            if (messageLower.indexOf('rate limit') !== -1 || 
                error.status === 429) {
                var delay = this.extractRetryDelay(error) || 60;
                return { 
                    type: AppConfig.ERROR_TYPES.TEMPORARY_LIMIT, 
                    message: message, 
                    delay: delay,
                    original: error 
                };
            }

            if (messageLower.indexOf('model') !== -1 && 
                (messageLower.indexOf('not found') !== -1 || messageLower.indexOf('not exist') !== -1)) {
                return { type: AppConfig.ERROR_TYPES.MODEL_NOT_FOUND, message: message, original: error };
            }

            if (messageLower.indexOf('network') !== -1 || 
                messageLower.indexOf('fetch') !== -1 ||
                messageLower.indexOf('timeout') !== -1 ||
                error.name === 'TypeError') {
                return { type: AppConfig.ERROR_TYPES.NETWORK, message: message, original: error };
            }

            if (messageLower.indexOf('safety') !== -1 || 
                messageLower.indexOf('blocked') !== -1 ||
                messageLower.indexOf('content policy') !== -1) {
                return { type: AppConfig.ERROR_TYPES.CONTENT_FILTER, message: message, original: error };
            }

            return { type: AppConfig.ERROR_TYPES.API_ERROR, message: message, original: error };
        },

        /**
         * Извлечение времени задержки из ошибки
         */
        extractRetryDelay: function(error) {
            if (error.retryDelay) return error.retryDelay;

            var message = error.message || '';
            var match = message.match(/retry in (\d+)/i);
            if (match) return parseInt(match[1], 10);

            return null;
        },

        /**
         * Отмена запроса
         */
        cancel: function() {
            if (this.abortController) {
                this.abortController.abort();
            }
        }
    };

    /**
     * Gemini API Handler
     */
    function GeminiApiHandler(worker) {
        BaseApiHandler.call(this, worker);
    }

    GeminiApiHandler.prototype = Object.create(BaseApiHandler.prototype);
    GeminiApiHandler.prototype.constructor = GeminiApiHandler;

    GeminiApiHandler.prototype.callApi = function(prompt, options) {
        var self = this;
        var allowIncomplete = options.allowIncomplete || false;

        // Gemini 2.0+ models use generateContent
        var baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + 
                      this.worker.modelId + ':generateContent?key=' + this.worker.apiKey;

        var contents = [{ parts: [{ text: prompt }] }];

        var safetySettings = [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
        ];

        var generationConfig = {
            temperature: this.worker.temperature || 1.0
        };

        if (allowIncomplete) {
            var maxTokens = this.worker.modelConfig.maxOutputTokens || 8192;
            generationConfig.maxOutputTokens = Math.floor(maxTokens * 0.98);
        }

        // Thinking config for models that support it (Gemini 2.5 / 3.x Flash & Pro)
        var minBudgetCfg = this.worker.modelConfig.minThinkingBudget;
        if (minBudgetCfg !== false && minBudgetCfg !== undefined) {
            if (typeof minBudgetCfg === 'string') {
                var level = (this.worker.thinkingEnabled && this.worker.thinkingLevel) ? this.worker.thinkingLevel : minBudgetCfg;
                generationConfig.thinkingConfig = {
                    thinkingLevel: String(level).toUpperCase()
                };
            } else if (this.worker.thinkingEnabled) {
                var thinkingBudget = this.worker.thinkingBudget;
                if (thinkingBudget === -1 || thinkingBudget === undefined) {
                    thinkingBudget = typeof minBudgetCfg === 'number' && minBudgetCfg > 0 ? minBudgetCfg : 1024;
                }
                if (thinkingBudget > 0) {
                    generationConfig.thinkingConfig = {
                        thinkingBudget: thinkingBudget
                    };
                }
            }
        }

        var payload = {
            contents: contents,
            generationConfig: generationConfig,
            safetySettings: safetySettings
        };

        // System Instruction (available in v1beta)
        if (this.worker.systemInstruction) {
            payload.system_instruction = {
                parts: [{ text: this.worker.systemInstruction }]
            };
        }

        return fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        })
        .then(function(response) {
            return response.json().then(function(data) {
                return { status: response.status, data: data };
            });
        })
        .then(function(result) {
            var status = result.status;
            var data = result.data;

            if (status === 200) {
                if (data.promptFeedback && data.promptFeedback.blockReason) {
                    throw new Error('Блокировка промпта: ' + data.promptFeedback.blockReason);
                }

                if (data.candidates && data.candidates.length > 0) {
                    var candidate = data.candidates[0];
                    var finishReason = candidate.finishReason;

                    if (finishReason === 'STOP' || (finishReason === 'MAX_TOKENS' && allowIncomplete)) {
                        var parts = candidate.content && candidate.content.parts;
                        if (parts && parts.length > 0) {
                            // Concatenate all text parts, ignoring thinking parts if they appear in regular content
                            return parts.filter(function(p) { return p.text !== undefined; })
                                        .map(function(p) { return p.text; })
                                        .join('');
                        }
                    }

                    if (finishReason === 'SAFETY') {
                        throw new Error('Генерация остановлена: SAFETY');
                    }

                    throw new Error('Генерация остановлена: ' + finishReason);
                }

                throw new Error('Пустой ответ от API (200 OK)');
            }

            var errorMessage = data.error ? data.error.message : JSON.stringify(data);

            if (status === 429) {
                var error = new Error('Rate limit hit (429)');
                error.status = 429;
                error.retryDelay = self.extractRetryDelayFromResponse(data);
                throw error;
            }

            if (status >= 500) {
                throw new Error('Ошибка сервера Gemini (' + status + '): ' + errorMessage);
            }

            throw new Error('Ошибка API Gemini (' + status + '): ' + errorMessage);
        });
    };

    GeminiApiHandler.prototype.extractRetryDelayFromResponse = function(data) {
        try {
            if (data.error && data.error.details) {
                var details = data.error.details;
                if (details[0] && details[0].metadata && details[0].metadata.retryInfo) {
                    var seconds = details[0].metadata.retryInfo.retryDelay.seconds;
                    if (seconds) return parseInt(seconds, 10) + 5;
                }
            }
        } catch (e) {}
        return 60;
    };

    /**
     * OpenRouter API Handler
     */
    function OpenRouterApiHandler(worker) {
        BaseApiHandler.call(this, worker);
    }

    OpenRouterApiHandler.prototype = Object.create(BaseApiHandler.prototype);
    OpenRouterApiHandler.prototype.constructor = OpenRouterApiHandler;

    OpenRouterApiHandler.prototype.callApi = function(prompt, options) {
        var self = this;
        var allowIncomplete = options.allowIncomplete || false;

        var baseUrl = (this.worker.providerConfig && this.worker.providerConfig.baseUrl) || 'https://openrouter.ai/api/v1/chat/completions';

        var messages = [];
        if (this.worker.systemInstruction) {
            messages.push({ role: 'system', content: this.worker.systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        var payload = {
            model: this.worker.modelId,
            messages: messages,
            temperature: this.worker.temperature || 1.0
        };

        if (allowIncomplete) {
            var maxTokens = this.worker.modelConfig.maxOutputTokens || 8192;
            payload.max_tokens = Math.floor(maxTokens * 0.98);
        }

        return fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + this.worker.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        })
        .then(function(response) {
            return response.json().then(function(data) {
                return { status: response.status, data: data };
            });
        })
        .then(function(result) {
            var status = result.status;
            var data = result.data;

            if (status === 200) {
                if (data.choices && data.choices.length > 0) {
                    var choice = data.choices[0];
                    var finishReason = choice.finish_reason;

                    if (finishReason === 'stop' || (finishReason === 'length' && allowIncomplete)) {
                        return choice.message.content;
                    }

                    throw new Error('Генерация остановлена: ' + finishReason);
                }
                throw new Error('Пустой ответ от OpenRouter');
            }

            var errorText = JSON.stringify(data);

            if (status === 401 || status === 403) {
                throw new Error('Невалидный ключ OpenRouter: ' + errorText);
            }

            if (status === 402 || status === 429) {
                var error = new Error('Квота исчерпана: ' + errorText);
                error.status = status;
                throw error;
            }

            if (status === 404) {
                throw new Error('Модель не найдена: ' + self.worker.modelId);
            }

            throw new Error('Ошибка OpenRouter (' + status + '): ' + errorText);
        });
    };

    /**
     * GLM API Handler (ZhipuAI)
     */
    function GlmApiHandler(worker) {
        BaseApiHandler.call(this, worker);
    }

    GlmApiHandler.prototype = Object.create(BaseApiHandler.prototype);
    GlmApiHandler.prototype.constructor = GlmApiHandler;

    GlmApiHandler.prototype.callApi = function(prompt, options) {
        var self = this;
        var allowIncomplete = options.allowIncomplete || false;

        var baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

        // GLM требует JWT токен
        var token = this.generateToken();

        var messages = [];
        if (this.worker.systemInstruction) {
            messages.push({ role: 'system', content: this.worker.systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });

        var payload = {
            model: this.worker.modelId,
            messages: messages,
            temperature: this.worker.temperature || 1.0
        };

        if (allowIncomplete) {
            var maxTokens = this.worker.modelConfig.maxOutputTokens || 8192;
            payload.max_tokens = Math.floor(maxTokens * 0.98);
        }

        return fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: this.abortController.signal
        })
        .then(function(response) {
            return response.json().then(function(data) {
                return { status: response.status, data: data };
            });
        })
        .then(function(result) {
            var status = result.status;
            var data = result.data;

            if (status === 200) {
                if (data.choices && data.choices.length > 0) {
                    var choice = data.choices[0];
                    var finishReason = choice.finish_reason;

                    if (finishReason === 'stop' || (finishReason === 'length' && allowIncomplete)) {
                        return choice.message.content;
                    }

                    throw new Error('Генерация остановлена: ' + finishReason);
                }
                throw new Error('Пустой ответ от GLM');
            }

            var errorText = JSON.stringify(data);
            throw new Error('Ошибка GLM (' + status + '): ' + errorText);
        });
    };

    GlmApiHandler.prototype.generateToken = function() {
        // Упрощенная генерация токена для GLM
        // В реальном приложении нужна библиотека JWT
        // Здесь используем простой Base64
        try {
            var parts = this.worker.apiKey.split('.');
            if (parts.length !== 2) {
                throw new Error('Некорректный формат ключа GLM');
            }
            // Для браузера без JWT библиотеки возвращаем сам ключ
            // (GLM может принимать API key напрямую в некоторых случаях)
            return this.worker.apiKey;
        } catch (e) {
            return this.worker.apiKey;
        }
    };

    /**
     * Dry Run Handler (для тестирования)
     */
    function DryRunApiHandler(worker) {
        BaseApiHandler.call(this, worker);
    }

    DryRunApiHandler.prototype = Object.create(BaseApiHandler.prototype);
    DryRunApiHandler.prototype.constructor = DryRunApiHandler;

    DryRunApiHandler.prototype.setup = function(apiKey) {
        this.worker.apiKey = 'DRY_RUN_KEY';
        this.worker.modelId = 'dry-run-model';
        return true;
    };

    DryRunApiHandler.prototype.callApi = function(prompt, options) {
        var self = this;

        return new Promise(function(resolve, reject) {
            var output = [];

            if (self.worker.systemInstruction) {
                output.push('════════════════════════════════════════════════════');
                output.push('          SYSTEM INSTRUCTION');
                output.push('════════════════════════════════════════════════════');
                output.push(self.worker.systemInstruction);
                output.push('\n\n');
            }

            output.push('════════════════════════════════════════════════════');
            output.push('               USER PROMPT');
            output.push('════════════════════════════════════════════════════');
            output.push(prompt);

            var fullPrompt = output.join('\n');

            EventBus.emit(EventBus.EVENTS.DRY_RUN_PROMPT_READY, {
                promptText: fullPrompt
            }, { source: 'DryRunApiHandler' });

            // Dry run возвращает специальный результат
            reject({ type: 'DRY_RUN', message: 'Dry run completed', promptText: fullPrompt });
        });
    };

    /**
     * Фабрика для создания обработчиков
     */
    function createHandler(handlerName, worker) {
        switch (handlerName) {
            case 'GeminiApiHandler':
                return new GeminiApiHandler(worker);
            case 'OpenRouterApiHandler':
                return new OpenRouterApiHandler(worker);
            case 'GlmApiHandler':
                return new GlmApiHandler(worker);
            case 'DryRunApiHandler':
                return new DryRunApiHandler(worker);
            default:
                console.error('Unknown handler:', handlerName);
                return new GeminiApiHandler(worker);
        }
    }

    // Публичный API
    return {
        BaseApiHandler: BaseApiHandler,
        GeminiApiHandler: GeminiApiHandler,
        OpenRouterApiHandler: OpenRouterApiHandler,
        GlmApiHandler: GlmApiHandler,
        DryRunApiHandler: DryRunApiHandler,
        createHandler: createHandler
    };
})();
