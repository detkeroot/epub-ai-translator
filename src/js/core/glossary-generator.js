/**
 * EPUB AI Translator - Glossary Generator
 * Генерация глоссария с помощью AI
 */

var GlossaryGenerator = (function() {
    'use strict';

    /**
     * Извлекает текст из глав для анализа
     * Берет по небольшому кусочку из каждой главы, чтобы не превысить лимиты
     */
    function extractTextForAnalysis(selectedChapters) {
        var combinedText = "";
        var limitPerChapter = 2000;
        
        selectedChapters.forEach(function(chapter) {
            if (chapter.content) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = chapter.content;
                var text = tempDiv.textContent || tempDiv.innerText || "";
                combinedText += text.substring(0, limitPerChapter) + "\n\n";
            }
        });

        return combinedText.substring(0, 15000); // Глобальный лимит для промпта
    }

    /**
     * Подготавливает задачу для AI
     */
    function createGlossaryTask(chapters, epubData) {
        var text = extractTextForAnalysis(chapters);
        var paths = chapters.map(function(ch) { return ch.path; });
        
        // Формат задачи: [тип, epubData, пути_глав, текст_для_анализа]
        return ['glossary_batch_task', epubData, paths, text];
    }

    return {
        extractTextForAnalysis: extractTextForAnalysis,
        createGlossaryTask: createGlossaryTask
    };
})();
