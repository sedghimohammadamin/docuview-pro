import { App, Notice, TFile, MarkdownRenderer } from "obsidian";

const ARABIC_DIACRITICS_GLOBAL = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

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
		.replace(/[.،؛:؟!«»"'()\[\]{}\-ـ,;?!]/g, "")
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
	private plugin: any = null;

	constructor(app: App, plugin?: any) {
		this.app = app;
		this.plugin = plugin;
	}

	enableEditOnParagraph(
		p: HTMLElement,
		_sourcePath: string,
		_onSave: () => void
	) {
		if (p.classList.contains("bv-editable")) return;
		p.classList.add("bv-editable");
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
			if (p.classList.contains("bv-highlighted")) return;

			e.preventDefault();
			e.stopPropagation();
			this.startEdit(p);
		});
	}

	private toggleHighlight(p: HTMLElement) {
		if (p.classList.contains("bv-highlighted")) {
			p.classList.remove("bv-highlighted");
			p.style.removeProperty("background-color");
			p.style.removeProperty("box-shadow");
		} else {
			p.classList.add("bv-highlighted");
			p.style.setProperty("background-color", "rgba(255, 220, 0, 0.35)", "important");
			p.style.setProperty("box-shadow", "0 0 0 3px rgba(255, 220, 0, 0.2)", "important");
			p.style.setProperty("border-radius", "4px", "important");
		}
	}

	private async startEdit(p: HTMLElement) {
		const wrapper = p.closest(".book-view-root") as HTMLElement | null;
		if (!wrapper) return;
		const sourcePath = wrapper.dataset.source;
		if (!sourcePath) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		// متن کل body کارت (نه فقط پاراگراف)
		const bodyEl = p.closest(".book-view-page-body") as HTMLElement;
		if (!bodyEl) return;

		const clone = bodyEl.cloneNode(true) as HTMLElement;
		clone.querySelectorAll("sup, a.footnote-link, .footnote-link, a[href^='#fn-'], .bv-footnotes, .bv-footnotes-slot").forEach((el) => el.remove());
		const renderedText = clone.textContent || "";

		const raw = await this.app.vault.read(file);

		const found = this.findOriginalMarkdown(raw, renderedText);
		if (!found) {
			new Notice("❌ متن صفحه توی markdown پیدا نشد");
			return;
		}

		const { startRaw, endRaw } = found;
		const originalText = raw.slice(startRaw, endRaw);

		console.log("[LiveEdit] found range:", startRaw, "-", endRaw);
		console.log("[LiveEdit] originalText:", JSON.stringify(originalText.slice(0, 150)));
		console.log("[LiveEdit] length:", originalText.length);

		this.editingEl = p;
		this.originalText = originalText;
		this.sourcePath = sourcePath;

		// 🔑 textarea به اندازه‌ی کل body
		const bodyWidth = bodyEl.offsetWidth;
		const bodyHeight = bodyEl.offsetHeight;

		const textarea = document.createElement("textarea");
		textarea.className = "bv-live-edit-textarea";
		textarea.value = originalText;
		textarea.setAttribute("dir", "rtl");
		textarea.style.setProperty("background-color", "transparent", "important");
		textarea.style.setProperty("border", "none", "important");
		textarea.style.setProperty("outline", "none", "important");
		textarea.style.setProperty("box-shadow", "none", "important");
		textarea.style.setProperty("padding", "0", "important");
		textarea.style.setProperty("margin", "0", "important");
		textarea.style.setProperty("width", "100%", "important");
		textarea.style.setProperty("min-height", bodyHeight + "px", "important");
		textarea.style.setProperty("box-sizing", "border-box", "important");
		textarea.style.setProperty("resize", "vertical", "important");
		textarea.style.setProperty("overflow", "auto", "important");
		textarea.style.setProperty("direction", "rtl", "important");
		textarea.style.setProperty("font-size", "var(--bv-body-font-size, 16px)", "important");
		textarea.style.setProperty("line-height", "var(--bv-body-line-height, 1.9)", "important");
		textarea.style.setProperty("font-family", "var(--bv-body-font, inherit)", "important");
		textarea.style.setProperty("text-align", "justify", "important");

		// کل body رو خالی کن و textarea بذار
		const originalHTML = bodyEl.innerHTML;
		bodyEl.innerHTML = "";

		const placeholder = document.createElement("div");
		placeholder.className = "bv-live-edit-wrapper";
		placeholder.style.setProperty("position", "relative", "important");
		placeholder.appendChild(textarea);

		const buttons = document.createElement("div");
		buttons.className = "bv-live-edit-buttons";
		buttons.style.setProperty("position", "absolute", "important");
		buttons.style.setProperty("top", "-42px", "important");
		buttons.style.setProperty("left", "0", "important");
		buttons.style.setProperty("display", "flex", "important");
		buttons.style.setProperty("gap", "6px", "important");
		buttons.style.setProperty("background", "var(--background-primary)", "important");
		buttons.style.setProperty("padding", "4px 8px", "important");
		buttons.style.setProperty("border-radius", "8px", "important");
		buttons.style.setProperty("box-shadow", "0 2px 8px rgba(0,0,0,0.3)", "important");
		buttons.style.setProperty("z-index", "1000", "important");

		const saveBtn = document.createElement("button");
		saveBtn.className = "bv-live-edit-save";
		saveBtn.textContent = "✓";
		saveBtn.type = "button";
		saveBtn.title = "ذخیره (Cmd+Enter)";
		saveBtn.style.setProperty("background", "#22c55e", "important");
		saveBtn.style.setProperty("color", "#fff", "important");
		saveBtn.style.setProperty("border", "none", "important");
		saveBtn.style.setProperty("border-radius", "6px", "important");
		saveBtn.style.setProperty("padding", "4px 10px", "important");
		saveBtn.style.setProperty("cursor", "pointer", "important");
		saveBtn.style.setProperty("font-size", "14px", "important");
		saveBtn.style.setProperty("font-weight", "700", "important");

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "bv-live-edit-cancel";
		cancelBtn.textContent = "✕";
		cancelBtn.type = "button";
		cancelBtn.title = "لغو (Esc)";
		cancelBtn.style.setProperty("background", "#ef4444", "important");
		cancelBtn.style.setProperty("color", "#fff", "important");
		cancelBtn.style.setProperty("border", "none", "important");
		cancelBtn.style.setProperty("border-radius", "6px", "important");
		cancelBtn.style.setProperty("padding", "4px 10px", "important");
		cancelBtn.style.setProperty("cursor", "pointer", "important");
		cancelBtn.style.setProperty("font-size", "14px", "important");
		cancelBtn.style.setProperty("font-weight", "700", "important");

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
			console.log("[LiveEdit] save clicked, newText length:", newText.length);
			console.log("[LiveEdit] originalText length:", this.originalText.length);

			try {
				const currentRaw = await this.app.vault.read(file);
				console.log("[LiveEdit] currentRaw length:", currentRaw.length);
				console.log("[LiveEdit] startRaw:", startRaw, "endRaw:", endRaw);
				console.log("[LiveEdit] slice before:", JSON.stringify(currentRaw.slice(0, 100)));
				console.log("[LiveEdit] slice at startRaw:", JSON.stringify(currentRaw.slice(startRaw, startRaw + 100)));

				const newContent = currentRaw.slice(0, startRaw) + newText + currentRaw.slice(endRaw);
				console.log("[LiveEdit] newContent length:", newContent.length);

				await this.app.vault.modify(file, newContent);
				console.log("[LiveEdit] ✓ FILE MODIFIED");
				new Notice("✅ ذخیره شد");

				// re-render فقط همون body
				bodyEl.innerHTML = "";
				const md = this.injectFootnoteSyntax(newText);
				await MarkdownRenderer.render(this.app, md, bodyEl, sourcePath, this.plugin || this);
				this.reattach(bodyEl, sourcePath);
			} catch (e) {
				console.error("[LiveEdit] ERROR:", e);
				new Notice("❌ خطا: " + (e as Error).message);
				bodyEl.innerHTML = originalHTML;
			}

			this.editingEl = null;
		};

		const cancel = () => {
			if (isCancelling) return;
			isCancelling = true;
			bodyEl.innerHTML = originalHTML;
			this.reattach(bodyEl, sourcePath);
			this.editingEl = null;
		};

		saveBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); save(); };
		cancelBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); cancel(); };
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
			else if (e.key === "Escape") { e.preventDefault(); cancel(); }
		});
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
