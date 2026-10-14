#!/usr/bin/env python3
"""
EPUB AI Translator - Build & Bundle Tool
Собирает модульные файлы из src/ в единый самодостаточный HTML-файл для браузера и смартфонов.
"""

import sys
import re
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
DIST_DIR = ROOT_DIR / "dist"

def build(offline: bool = False, output_file: Path = None):
    index_html_path = SRC_DIR / "index.html"
    if not index_html_path.exists():
        print(f"❌ Ошибка: Не найден {index_html_path}")
        sys.exit(1)

    html = index_html_path.read_text(encoding="utf-8")

    # 1. Инлайнинг CSS
    css_link_pattern = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)">')
    def replace_css(match):
        css_rel = match.group(1)
        css_path = SRC_DIR / css_rel
        if css_path.exists():
            css_code = css_path.read_text(encoding="utf-8").strip()
            print(f"📦 Инлайнинг CSS: {css_rel} ({len(css_code)} байт)")
            return f"<style>\n/* Source: {css_rel} */\n{css_code}\n</style>"
        else:
            print(f"⚠️ Предупреждение: CSS файл {css_rel} не найден")
            return match.group(0)

    html = css_link_pattern.sub(replace_css, html)

    # 2. Обработка JSZip (CDN vs Offline)
    jszip_cdn_pattern = re.compile(r'<script\s+src="https://cdnjs\.cloudflare\.com/ajax/libs/jszip/[^"]+"></script>')
    if offline:
        local_jszip = SRC_DIR / "js" / "lib" / "jszip.min.js"
        if local_jszip.exists():
            jszip_code = local_jszip.read_text(encoding="utf-8").strip()
            print(f"📦 Инлайнинг локального JSZip для 100% офлайн-режима ({len(jszip_code)} байт)")
            html = jszip_cdn_pattern.sub(f"<script>\n/* Source: vendor/jszip.min.js (Offline Mode) */\n{jszip_code}\n</script>", html)
        else:
            print(f"⚠️ Предупреждение: Локальный JSZip не найден по пути {local_jszip}, оставлен CDN")
    else:
        print("🌐 Используется JSZip с CDN (cdnjs.cloudflare.com)")

    # 3. Инлайнинг локальных JS скриптов
    js_script_pattern = re.compile(r'<script\s+src="(js/[^"]+)"></script>')
    def replace_js(match):
        js_rel = match.group(1)
        js_path = SRC_DIR / js_rel
        if js_path.exists():
            js_code = js_path.read_text(encoding="utf-8").strip()
            print(f"📦 Инлайнинг JS: {js_rel} ({len(js_code)} байт)")
            return f"<script>\n// Source: {js_rel}\n{js_code}\n</script>"
        else:
            print(f"⚠️ Предупреждение: JS файл {js_rel} не найден")
            return match.group(0)

    html = js_script_pattern.sub(replace_js, html)

    # 4. Сохранение
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if not output_file:
        output_file = DIST_DIR / ("index_offline.html" if offline else "index.html")

    output_file.write_text(html, encoding="utf-8")
    print(f"\n✅ Сборка успешно завершена: {output_file} ({len(html)} байт, {len(html.splitlines())} строк)")
    return output_file

def main():
    parser = argparse.ArgumentParser(description="Сборка EPUB AI Translator в автономный HTML")
    parser.add_argument("--offline", action="store_true", help="Встроить JSZip внутрь файла для полной автономности без интернета")
    parser.add_argument("-o", "--output", type=Path, default=None, help="Путь к результирующему файлу")
    args = parser.parse_args()

    build(offline=args.offline, output_file=args.output)

if __name__ == "__main__":
    main()
