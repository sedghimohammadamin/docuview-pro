import { RawPage } from "./types";

export interface LineRange {
	startLine: number;
	endLine: number;
}

export interface ParsedPage extends RawPage {
	/** برای هر پاراگراف، محدوده‌ی خط markdown اصلی */
	paragraphLines: LineRange[];
}

/**
 * نرمالایز برای تطبیق.
 */
export function normalizeForSearch(s: string): string {
	return s
		.replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "")
		.replace(/\u200c/g, "")
		.replace(/[.،؛:؟!«»"'()\[\]{}\-_ـ,;?!]/g, "")
		.replace(/\s+/g, "")
		.replace(/[يى]/g, "ی")
		.replace(/ك/g, "ک")
		.replace(/ۀ/g, "ه")
		.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
		.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
		.toLowerCase()
		.trim();
}

export function normalizeChar(ch: string): string | null {
	if (/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/.test(ch)) return null;
	if (ch === "\u200c") return null;
	if (/[.،؛:؟!«»"'()\[\]{}\-_ـ,;?!]/.test(ch)) return null;
	if (/\s/.test(ch)) return null;
	if (ch === "ي" || ch === "ى") return "ی";
	if (ch === "ك") return "ک";
	if (ch === "ۀ") return "ه";
	const fa = "۰۱۲۳۴۵۶۷۸۹";
	const ar = "٠١٢٣٤٥٦٧٨٩";
	const idx1 = fa.indexOf(ch);
	if (idx1 >= 0) return String(idx1);
	const idx2 = ar.indexOf(ch);
	if (idx2 >= 0) return String(idx2);
	return ch.toLowerCase();
}

/**
 * یه صفحه رو با اطلاعات خط‌ها برمی‌گردونه.
 */
export interface PageWithLines {
	number: string;
	lesson: string;
	markdown: string;
	footnotes: { num: string; text: string }[];
	/** محدوده‌ی خط توی markdown اصلی (0-based) */
	startLine: number;
	endLine: number;
	/** برای هر پاراگراف (بلوک) توی این صفحه، محدوده‌ی خط */
	paragraphLines: LineRange[];
}

/**
 * markdown خام رو به صفحه‌ها با اطلاعات خط تقسیم می‌کنه.
 */
export function parseBook(
	raw: string,
	sourcePath: string,
	getFrontmatter: (path: string) => any,
	startPageFallback: number = 1
): PageWithLines[] {
	let content = raw;
	let contentOffset = 0;

	// frontmatter
	const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
	if (fmMatch) {
		contentOffset = fmMatch[0].split("\n").length - 1;
		content = content.slice(fmMatch[0].length);
	}

	// start-page
	let startPage = startPageFallback;
	const cache = getFrontmatter(sourcePath);
	if (cache?.["start-page"] !== undefined) {
		const sp = parseInt(String(cache["start-page"]), 10);
		if (!isNaN(sp) && sp >= 0) startPage = sp;
	}

	const lines = content.split(/\r?\n/);

	// پیدا کردن --- و chunkها با شماره خط
	const chunks: { lines: string[]; startLine: number }[] = [];
	let currentLines: string[] = [];
	let currentStartLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "---") {
			if (currentLines.length > 0) {
				chunks.push({
					lines: currentLines,
					startLine: currentStartLine + contentOffset,
				});
				currentLines = [];
			}
			currentStartLine = i + 1;
		} else {
			if (currentLines.length === 0) {
				currentStartLine = i;
			}
			currentLines.push(line);
		}
	}
	if (currentLines.length > 0) {
		chunks.push({
			lines: currentLines,
			startLine: currentStartLine + contentOffset,
		});
	}

	const pages: PageWithLines[] = [];
	let currentLesson = "";
	let lastNum: number | null = startPage - 1;

	for (let ci = 0; ci < chunks.length; ci++) {
		const chunk = chunks[ci];
		const text = chunk.lines.join("\n").trim();
		if (ci === 0 && !text) continue;

		const chunkStart = chunk.startLine;

		// H1 = مرز درس
		const h1Match = text.match(/^#\s+(.+)$/m);
		let restText = text;
		let lessonStartLine = chunkStart;
		let lessonLineCount = 0;

		if (h1Match) {
			currentLesson = h1Match[1].trim();
			const h1Index = chunk.lines.findIndex(
				(l) => l.trim().startsWith("# ")
			);
			if (h1Index >= 0) {
				lessonStartLine = chunkStart + h1Index;
				lessonLineCount = 1;
			}
			restText = text.replace(/^#\s+.+$/m, "").trim();
		}

		// جدا کردن پاورقی
		const parts = restText.split(/^[\\_ ]{3,}$/m);
		const mainPart = parts[0] || "";
		const footnotesPart = parts.slice(1).join("\n");

		// شماره صفحه
		const mainLines = mainPart.split("\n");
		let number = "";
		let startIdx = 0;
		const firstLine = mainLines[0]?.trim() || "";
		const m = firstLine.match(/\(?\s*صفحه\s*([۰-۹0-9]+)\s*\)?/);
		if (m) {
			number = m[1];
			startIdx = 1;
			while (
				startIdx < mainLines.length &&
				!mainLines[startIdx].trim()
			)
				startIdx++;
		}

		if (number) {
			lastNum = parsePersianNumber(number);
		} else {
			lastNum = (lastNum ?? 0) + 1;
			number = toPersianDigits(lastNum);
		}

		// متن محتوا (بدون شماره صفحه)
		const contentLines = mainLines.slice(startIdx);
		const markdown = contentLines.join("\n").trim();

		// محاسبه شماره خط شروع محتوا
		const contentStartLine =
			chunkStart + lessonLineCount + (m ? startIdx : 0);

		// 🔑 محدوده‌ی خط هر پاراگراف
		const paragraphLines: LineRange[] = [];
		let paraStart = -1;
		let paraLineCount = 0;

		for (let li = 0; li < contentLines.length; li++) {
			const line = contentLines[li];
			if (line.trim() === "") {
				if (paraStart !== -1) {
					paragraphLines.push({
						startLine: contentStartLine + paraStart,
						endLine: contentStartLine + paraStart + paraLineCount,
					});
					paraStart = -1;
					paraLineCount = 0;
				}
			} else {
				if (paraStart === -1) {
					paraStart = li;
					paraLineCount = 1;
				} else {
					paraLineCount++;
				}
			}
		}
		if (paraStart !== -1) {
			paragraphLines.push({
				startLine: contentStartLine + paraStart,
				endLine: contentStartLine + paraStart + paraLineCount,
			});
		}

		const footnotes = parseFootnotes(footnotesPart);

		pages.push({
			number,
			lesson: currentLesson,
			markdown,
			footnotes,
			startLine: chunkStart,
			endLine:
				ci < chunks.length - 1
					? chunks[ci + 1].startLine
					: raw.split("\n").length,
			paragraphLines,
		});
	}

	return pages;
}

export function parseFootnotes(
	text: string
): { num: string; text: string }[] {
	if (!text.trim()) return [];
	const result: { num: string; text: string }[] = [];
	let current: { num: string; text: string } | null = null;
	for (const line of text.split("\n")) {
		const m = line.match(/^(\d+)\\?\)\s*(.*)$/);
		if (m) {
			if (current) result.push(current);
			current = { num: m[1], text: m[2].trim() };
		} else if (current) {
			current.text += "\n" + line;
		}
	}
	if (current) result.push(current);
	return result;
}

export function parsePersianNumber(s: string): number {
	const fa = "۰۱۲۳۴۵۶۷۸۹";
	const en = "0123456789";
	let result = "";
	for (const ch of s) {
		const i = fa.indexOf(ch);
		if (i >= 0) result += en[i];
		else if (en.includes(ch)) result += ch;
	}
	return parseInt(result, 10) || 0;
}

export function toPersianDigits(n: number): string {
	const fa = "۰۱۲۳۴۵۶۷۸۹";
	return String(n).replace(/[0-9]/g, (d) => fa[parseInt(d, 10)]);
}
