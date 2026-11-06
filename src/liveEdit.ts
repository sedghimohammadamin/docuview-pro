import { App, Notice, TFile, MarkdownRenderer } from "obsidian";

const ARABIC_DIACRITICS_GLOBAL = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

interface BvHighlightable extends HTMLElement {
	__bvEditable?: boolean;
}

interface BvPluginComponent {
	registerEvent?: (e: unknown) => void;
}

function normalize(s: string): string {
	return s
		.replace(/\\\./g, ".")
		.replace(/\\\(/g, "(")
		.replace(/\\\)/g, ")")
		.replace(/\\\[/g, "[")
		.replace(/\\\]/g, "]")
		.replace(/\\_/g, "_")
		.replace(/\\\*/g, "*")
		.replace(/\\-/g, "-")
		.replace(/\\#/g, "#")
		.replace(/\\\([0-9۰-۹]+\\\)/g, "")
		.replace(/\[[0-9۰-۹]+\]/g, "")
		.replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "")
		.replace(/\u200c/g, "")
		.replace(/[*_~`#>|]/g, "")
		.replace(/[.،؛:؟!«»"'()[]{}-_ـ,;?!]/g, "")
		.replace(ARABIC_DIACRITICS_GLOBAL, "")
		.replace(/\s+/g, "")
		.replace(/[يى]/g, "ی")
		.replace(/ك/g, "ک")
		.replace(/ۀ/g, "ه")
		.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
		.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
		.toLowerCase()
		.trim();
}

function normalizeChar(ch: string): string | null {
	const result = normalize(ch);
	return result.length > 0 ? result : null;
}

export class LiveEditor {
	private app: App;
	private editingEl: HTMLElement | null = null;
	private originalText = "";
	private sourcePath = "";
	private plugin: BvPluginComponent | null = null;

	constructor(app: App, plugin?: BvPluginComponent) {
		this.app = app;
		this.plugin = plugin ?? null;
	}

	enableEditOnParagraph(
		p: HTMLElement,
		_sourcePath: string,
		_onSave: () => void
	) {
		const el = p as BvHighlightable;
		if (el.__bvEditable) return;
		el.__bvEditable = true;
		p.addClass("bv-editable");
		p.setAttribute("title", "کلیک برای ویرایش");

		p.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleHighlight(p);
		});

		p.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			if (target.closest("a, button, textarea, input")) return;
			if (this.editingEl) return;
			if (p.hasClass("bv-highlighted")) return;

			e.preventDefault();
			e.stopPropagation();
			void this.startEdit(p);
		});
	}

	private toggleHighlight(p: HTMLElement) {
		if (p.hasClass("bv-highlighted")) {
			p.removeClass("bv-highlighted");
			p.removeClass("bv-highlighted-active");
		} else {
			p.addClass("bv-highlighted");
			p.addClass("bv-highlighted-active");
		}
	}

	private async startEdit(p: HTMLElement) {
		const wrapper = p.closest<HTMLElement>(".book-view-root");
		if (!wrapper) return;
		const sourcePath = wrapper.dataset.source;
		if (!sourcePath) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		// متن کل body کارت (نه فقط پاراگراف)
		const bodyEl = p.closest<HTMLElement>(".book-view-page-body");
		if (!bodyEl) return;

		const clone = bodyEl.cloneNode(true) as HTMLElement;
		clone.querySelectorAll("sup, a.footnote-link, .footnote-link, a[href^='#fn-'], .bv-footnotes, .bv-footnotes-slot").forEach((el) => el.remove());
		const renderedText = clone.textContent || "";

		const raw = await this.app.vault.read(file);

		const found = this.findOriginalMarkdown(raw, renderedText);
		if (!found) {
			new Notice("❌ متن صفحه توی Markdown پیدا نشد");
			return;
		}

		const { startRaw, endRaw } = found;
		const originalText = raw.slice(startRaw, endRaw);

		this.editingEl = p;
		this.originalText = originalText;
		this.sourcePath = sourcePath;

		// 🔑 textarea به اندازه‌ی کل body
		const bodyHeight = bodyEl.offsetHeight;

		const textarea = document.createElement("textarea");
		textarea.className = "bv-live-edit-textarea";
		textarea.value = originalText;
		textarea.setAttribute("dir", "rtl");
		textarea.setCssProps({ "--bv-live-edit-min-height": bodyHeight + "px" });

		// کل body رو خالی کن و textarea بذار
		const originalFragment = bodyEl.cloneNode(true) as HTMLElement;
		bodyEl.empty();

		const placeholder = document.createElement("div");
		placeholder.className = "bv-live-edit-wrapper";
		placeholder.appendChild(textarea);

		const buttons = document.createElement("div");
		buttons.className = "bv-live-edit-buttons";

		const saveBtn = document.createElement("button");
		saveBtn.className = "bv-live-edit-save";
		saveBtn.textContent = "✓";
		saveBtn.type = "button";
		saveBtn.title = "ذخیره (Cmd+Enter)";

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "bv-live-edit-cancel";
		cancelBtn.textContent = "✕";
		cancelBtn.type = "button";
		cancelBtn.title = "لغو (Esc)";

		buttons.appendChild(saveBtn);
		buttons.appendChild(cancelBtn);
		placeholder.appendChild(buttons);
		bodyEl.appendChild(placeholder);

		textarea.focus();
		textarea.setSelectionRange(0, 0);

		let isSaving = false;
		let isCancelling = false;

		const save = async () => {
			if (isSaving) return;
			isSaving = true;
			const newText = textarea.value;

			try {
				const currentRaw = await this.app.vault.read(file);

				const newContent = currentRaw.slice(0, startRaw) + newText + currentRaw.slice(endRaw);

				await this.app.vault.modify(file, newContent);
				new Notice("✅ ذخیره شد");

				// re-render فقط همون body
				bodyEl.empty();
				const md = this.injectFootnoteSyntax(newText);
				await MarkdownRenderer.render(this.app, md, bodyEl, sourcePath, this.getRenderComponent());
				this.reattach(bodyEl, sourcePath);
			} catch (e) {
				const err = e as Error;
				new Notice("❌ خطا: " + err.message);
				bodyEl.empty();
				while (originalFragment.firstChild) {
					bodyEl.appendChild(originalFragment.firstChild);
				}
			}

			this.editingEl = null;
		};

		const cancel = () => {
			if (isCancelling) return;
			isCancelling = true;
			bodyEl.empty();
			while (originalFragment.firstChild) {
				bodyEl.appendChild(originalFragment.firstChild);
			}
			this.reattach(bodyEl, sourcePath);
			this.editingEl = null;
		};

		saveBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); void save(); });
		cancelBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); cancel(); });
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
			else if (e.key === "Escape") { e.preventDefault(); cancel(); }
		});
	}

	private getRenderComponent(): import("obsidian").Component {
		return (this.plugin as unknown as import("obsidian").Component) ?? (this as unknown as import("obsidian").Component);
	}

	private injectFootnoteSyntax(markdown: string): string {
		return markdown;
	}

	private reattach(bodyEl: HTMLElement, sourcePath: string) {
		const paragraphs = Array.from(bodyEl.querySelectorAll("p")) as HTMLElement[];
		paragraphs.forEach((p) => {
			this.enableEditOnParagraph(p, sourcePath, () => {});
		});
	}

	private findOriginalMarkdown(
		raw: string,
		renderedText: string
	): { startRaw: number; endRaw: number } | null {
		const needle = normalize(renderedText);
		if (!needle) return null;

		const flat: string[] = [];
		const map: number[] = [];
		for (let i = 0; i < raw.length; i++) {
			const norm = normalizeChar(raw[i]);
			if (norm === null) continue;
			flat.push(norm);
			map.push(i);
		}
		const flatStr = flat.join("");
		let idx = flatStr.indexOf(needle);
		let matchedLen = needle.length;

		if (idx === -1) {
			for (let len = needle.length - 5; len >= 50; len -= 5) {
				const sub = needle.slice(0, len);
				const i = flatStr.indexOf(sub);
				if (i !== -1) {
					idx = i;
					matchedLen = len;
					break;
				}
			}
		}

		if (idx === -1) return null;

		let startRaw = map[idx];
		let endRaw = map[idx + matchedLen - 1] + 1;

		// گسترش به عقب و جلو تا مرز پاراگراف
		while (startRaw > 0) {
			const prev = raw[startRaw - 1];
			if (prev === "\n" && raw[startRaw - 2] === "\n") break;
			if (normalizeChar(prev) === null) startRaw--;
			else break;
		}
		while (endRaw < raw.length) {
			const curr = raw[endRaw];
			if (curr === "\n" && raw[endRaw + 1] === "\n") break;
			if (normalizeChar(curr) === null) endRaw++;
			else break;
		}

		return { startRaw, endRaw };
	}
}
