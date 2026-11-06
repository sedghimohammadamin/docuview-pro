import { App, Notice, TFile } from "obsidian";

const DEFAULT_COLOR = "#fbbf24";

interface ParsedComment {
	id: string;
	text: string;
	note: string;
	color: string;
	occurrence: number;
	paraHash: string;
}

interface BvElement extends HTMLElement {
	__bvHasHover?: boolean;
	__bvHasSelectionHandler?: boolean;
}

export class CommentManager {
	private app: App;
	private popover: HTMLElement | null = null;
	private floatingBtn: HTMLElement | null = null;
	private globalHandler: ((e: MouseEvent) => void) | null = null;
	private tooltip: HTMLElement | null = null;
	private lastSelectedPara: HTMLElement | null = null;
	private lastSelectedOccurrence = 0;
	private lastSelectedParaHash = "";

	constructor(app: App) {
		this.app = app;
	}

	private hexToRgba(hex: string, alpha: number): string {
		if (!/^#[0-9a-f]{6}$/i.test(hex)) return `rgba(251,191,36,${alpha})`;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r},${g},${b},${alpha})`;
	}

	async applyCommentsToBody(body: HTMLElement, sourcePath: string, onUpdate: () => void) {
		if (body.querySelector(".bv-placeholder")) return;
		if (!(body.textContent || "").trim()) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		if (!fmMatch) return;

		const comments = this.parseComments(fmMatch[1]);

		for (const c of comments) {
			if (!c.text) continue;
			if (body.querySelector(`.bv-comment-mark[data-comment-id="${c.id}"]`)) continue;
			const needle = this.normalize(c.text);
			if (!needle) continue;
			this.wrapInBody(body, c.id, needle, c.color, c.occurrence, c.paraHash);
		}

		this.enableEvents(body, sourcePath, onUpdate);
	}

	private parseComments(fmText: string): ParsedComment[] {
		const commentsMatch = fmText.match(/\ncomments:\r?\n((?:\s+[^\n]+\r?\n?)*)/);
		if (!commentsMatch) return [];

		const lines = commentsMatch[1].split("\n");
		const comments: ParsedComment[] = [];
		let current: ParsedComment | null = null;

		for (const line of lines) {
			const newFormatId = line.match(/^\s{2}(c\d+):\s*$/);
			if (newFormatId) {
				if (current) comments.push(current);
				current = { id: newFormatId[1], text: "", note: "", color: DEFAULT_COLOR, occurrence: 0, paraHash: "" };
				continue;
			}
			const fieldMatch = line.match(/^\s{4}(text|note|color|occurrence|paraHash):\s*(.*)$/);
			if (fieldMatch && current) {
				const key = fieldMatch[1];
				const val = fieldMatch[2].trim().replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
				if (key === "occurrence") current.occurrence = parseInt(val, 10) || 0;
				else if (key === "color" && val) current.color = val;
				else if (key === "text") current.text = val;
				else if (key === "note") current.note = val;
				else if (key === "paraHash") current.paraHash = val;
			}
		}
		if (current) comments.push(current);
		return comments;
	}

	private findParaByHash(body: HTMLElement, paraHash: string): HTMLElement | null {
		if (!paraHash) return null;
		const paragraphs = body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6");
		for (const p of Array.from(paragraphs)) {
			const clone = p.cloneNode(true) as HTMLElement;
			clone.querySelectorAll("sup, .footnote-ref, .footnote-link, a[href^='#fn-'], a[data-href^='#fn-']").forEach((el) => el.remove());
			const text = (clone.textContent || "").slice(0, 50);
			const hash = this.hashString(text);
			if (hash === paraHash) return p as HTMLElement;
		}
		return null;
	}

	private hashString(s: string): string {
		let hash = 0;
		for (let i = 0; i < s.length; i++) {
			const chr = s.charCodeAt(i);
			hash = (hash << 5) - hash + chr;
			hash |= 0;
		}
		return Math.abs(hash).toString(36);
	}

	private wrapInBody(body: HTMLElement, commentId: string, needle: string, color: string, occurrence: number, paraHash: string): boolean {
		if (paraHash) {
			const para = this.findParaByHash(body, paraHash);
			if (para) {
				return this.wrapInElement(para, commentId, needle, color, occurrence, false);
			}
		}
		return this.wrapInElement(body, commentId, needle, color, occurrence, false);
	}

	private wrapInElement(parent: HTMLElement, commentId: string, needle: string, color: string, occurrence: number, skipFootnotes: boolean): boolean {
		const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
		const flat: string[] = [];
		const map: { node: Text; rawIndex: number }[] = [];

		let node: Node | null;
		while ((node = walker.nextNode())) {
			const t = node as Text;
			if (skipFootnotes) {
				const parentEl = t.parentElement;
				if (parentEl) {
					const skipSel = "sup, .footnote-ref, .footnote-link, a[href^='#fn-'], a[data-href^='#fn-']";
					if (parentEl.closest(skipSel)) continue;
				}
			}
			const raw = t.textContent || "";
			for (let i = 0; i < raw.length; i++) {
				const norm = this.normalizeChar(raw[i]);
				if (norm === null) continue;
				flat.push(norm);
				map.push({ node: t, rawIndex: i });
			}
		}

		const flatStr = flat.join("");
		const occurrences: number[] = [];
		let start = 0;
		while (true) {
			const j = flatStr.indexOf(needle, start);
			if (j === -1) break;
			occurrences.push(j);
			start = j + 1;
		}
		if (occurrences.length === 0) return false;

		const idx = occurrences[Math.min(occurrence, occurrences.length - 1)];

		const startEntry = map[idx];
		const endEntry = map[idx + needle.length - 1];
		if (!startEntry || !endEntry) return false;

		const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;

		const applyStyles = (span: HTMLElement) => {
			span.className = "bv-comment-mark";
			span.dataset.commentId = commentId;
			span.setCssProps({ "--bv-comment-bg": this.hexToRgba(safeColor, 0.35) });
		};

		const involvedNodes: { node: Text; startFlat: number; endFlat: number }[] = [];
		const seen = new Set<Text>();

		for (let i = idx; i < idx + needle.length; i++) {
			const entry = map[i];
			if (!entry) continue;
			if (seen.has(entry.node)) continue;
			seen.add(entry.node);

			let s = -1;
			let e = -1;
			for (let j = 0; j < map.length; j++) {
				if (map[j].node !== entry.node) continue;
				if (s === -1) s = j;
				e = j;
			}
			involvedNodes.push({ node: entry.node, startFlat: s, endFlat: e });
		}

		for (let ni = involvedNodes.length - 1; ni >= 0; ni--) {
			const info = involvedNodes[ni];
			const t = info.node;
			const raw = t.textContent || "";

			const overlapStart = Math.max(idx, info.startFlat);
			const overlapEnd = Math.min(idx + needle.length - 1, info.endFlat);
			if (overlapStart > overlapEnd) continue;

			const rawStart = map[overlapStart].rawIndex;
			const rawEnd = map[overlapEnd].rawIndex + 1;

			const before = raw.slice(0, rawStart);
			const middle = raw.slice(rawStart, rawEnd);
			const after = raw.slice(rawEnd);

			const parentNode = t.parentNode;
			if (!parentNode) continue;

			const frag = createFragment();
			if (before) frag.appendChild(document.createTextNode(before));

			const span = document.createElement("span");
			applyStyles(span);
			span.textContent = middle;
			frag.appendChild(span);

			if (after) frag.appendChild(document.createTextNode(after));
			parentNode.replaceChild(frag, t);
		}
		return true;
	}

	private enableEvents(container: HTMLElement, sourcePath: string, onUpdate: () => void) {
		container.querySelectorAll(".bv-comment-mark").forEach((mark) => {
			const el = mark as BvElement;
			if (el.__bvHasHover) return;
			el.__bvHasHover = true;

			el.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.showCommentPopover(el, sourcePath, onUpdate);
			});

			el.addEventListener("mouseenter", (e) => {
				e.stopPropagation();
				void this.showTooltip(el, sourcePath);
			});
			el.addEventListener("mouseleave", () => {
				this.hideTooltip();
			});
		});

		const containerEl = container as BvElement;
		if (!containerEl.__bvHasSelectionHandler) {
			containerEl.__bvHasSelectionHandler = true;
			container.addEventListener("mouseup", () => {
				window.setTimeout(() => this.handleSelection(container, sourcePath, onUpdate), 10);
			});
		}
	}

	enable(container: HTMLElement, sourcePath: string, onUpdate: () => void) {
		this.enableEvents(container, sourcePath, onUpdate);
	}

	private async showTooltip(mark: HTMLElement, sourcePath: string) {
		this.hideTooltip();
		const commentId = mark.dataset.commentId;
		if (!commentId) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		if (!fmMatch) return;

		const comments = this.parseComments(fmMatch[1]);
		const c = comments.find((x) => x.id === commentId);
		if (!c) return;
		const commentText = c.note || c.text || "";
		const color = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : DEFAULT_COLOR;

		const tooltip = document.createElement("div");
		tooltip.className = "bv-comment-tooltip";
		tooltip.textContent = commentText;
		tooltip.setCssProps({ "--bv-tooltip-border": color });

		const rect = mark.getBoundingClientRect();
		tooltip.setCssProps({
			"--bv-tooltip-left": `${Math.max(10, rect.left)}px`,
			"--bv-tooltip-top": `${rect.bottom + 8}px`,
		});

		document.body.appendChild(tooltip);
		this.tooltip = tooltip;
	}

	private hideTooltip() {
		if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; }
	}

	private attachGlobalHandler() {
		if (this.globalHandler) return;
		this.globalHandler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (this.popover && this.popover.contains(target)) return;
			if (this.floatingBtn && this.floatingBtn.contains(target)) return;
			const el = target as HTMLElement;
			if (el.closest?.(".bv-live-edit-wrapper, .bv-live-edit-textarea, .bv-live-edit-buttons")) return;
			this.closePopover();
			this.removeFloatingBtn();
		};
		window.setTimeout(() => {
			if (this.globalHandler) {
				document.addEventListener("mousedown", this.globalHandler, true);
			}
		}, 100);
	}

	private detachGlobalHandler() {
		if (this.globalHandler) {
			document.removeEventListener("mousedown", this.globalHandler, true);
			this.globalHandler = null;
		}
	}

	private extractTextFromRange(range: Range): string {
		try {
			const clone = range.cloneContents();
			const div = document.createElement("div");
			div.appendChild(clone);
			div.querySelectorAll("sup, .footnote-ref, .footnote-link, a[href^='#fn-'], a[data-href^='#fn-']").forEach((el) => el.remove());
			return (div.textContent || "").replace(/\s+/g, " ").trim();
		} catch {
			return range.toString().replace(/\s+/g, " ").trim();
		}
	}

	private handleSelection(container: HTMLElement, sourcePath: string, onUpdate: () => void) {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) { this.removeFloatingBtn(); return; }
		const range = sel.getRangeAt(0);
		if (!container.contains(range.commonAncestorContainer)) { this.removeFloatingBtn(); return; }
		const commonEl = range.commonAncestorContainer as HTMLElement;
		if (commonEl.closest?.(".bv-live-edit-wrapper, .bv-live-edit-textarea")) return;

		const text = this.extractTextFromRange(range);
		if (!text) { this.removeFloatingBtn(); return; }

		const body = (commonEl.nodeType === Node.TEXT_NODE
			? (commonEl.parentElement)
			: commonEl
		)?.closest(".book-view-page-body") as HTMLElement | null;

		if (!body) { this.removeFloatingBtn(); return; }

		const para = (commonEl.nodeType === Node.TEXT_NODE
			? (commonEl.parentElement)
			: commonEl
		)?.closest("p, li, h1, h2, h3, h4, h5, h6") as HTMLElement | null;

		this.lastSelectedPara = para;
		this.lastSelectedParaHash = "";

		if (para) {
			const clone = para.cloneNode(true) as HTMLElement;
			clone.querySelectorAll("sup, .footnote-ref, .footnote-link, a[href^='#fn-'], a[data-href^='#fn-']").forEach((el) => el.remove());
			const paraText = (clone.textContent || "").slice(0, 50);
			this.lastSelectedParaHash = this.hashString(paraText);
		}

		this.lastSelectedOccurrence = 0;
		const needle = this.normalize(text);
		if (needle && range.startContainer && para) {
			try {
				const prefixRange = document.createRange();
				prefixRange.selectNodeContents(para);
				prefixRange.setEnd(range.startContainer, range.startOffset);

				const prefixDiv = document.createElement("div");
				prefixDiv.appendChild(prefixRange.cloneContents());
				prefixDiv.querySelectorAll("sup, .footnote-ref, .footnote-link, a[href^='#fn-'], a[data-href^='#fn-']").forEach((el) => el.remove());

				let normalizedPrefix = "";
				for (const ch of (prefixDiv.textContent || "")) {
					const n = this.normalizeChar(ch);
					if (n !== null) normalizedPrefix += n;
				}

				let occCount = 0;
				let start = 0;
				while (true) {
					const j = normalizedPrefix.indexOf(needle, start);
					if (j === -1) break;
					occCount++;
					start = j + 1;
				}
				this.lastSelectedOccurrence = occCount;
			} catch {
				// ignore
			}
		}

		const rect = range.getBoundingClientRect();
		this.showFloatingBtn(rect, text, sourcePath, onUpdate);
	}

	private showFloatingBtn(rect: DOMRect, text: string, sourcePath: string, onUpdate: () => void) {
		this.removeFloatingBtn();
		const btn = document.createElement("button");
		btn.className = "bv-comment-floating-btn";
		btn.textContent = "💬 افزودن کامنت";
		btn.setCssProps({
			"--bv-fbtn-left": `${rect.left + rect.width / 2 - 80}px`,
			"--bv-fbtn-top": `${rect.top - 50}px`,
		});
		btn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.removeFloatingBtn();
			this.showInputPopover(rect, text, sourcePath, onUpdate);
			window.getSelection()?.removeAllRanges();
		});
		document.body.appendChild(btn);
		this.floatingBtn = btn;
		this.attachGlobalHandler();
	}

	private removeFloatingBtn() {
		if (this.floatingBtn) { this.floatingBtn.remove(); this.floatingBtn = null; }
		if (!this.popover) this.detachGlobalHandler();
	}

	private showInputPopover(rect: DOMRect, selectedText: string, sourcePath: string, onUpdate: () => void) {
		this.closePopover();
		const popover = document.createElement("div");
		popover.className = "bv-comment-popover";
		popover.setCssProps({
			"--bv-popover-left": `${Math.max(10, Math.min(rect.left, window.innerWidth - 400))}px`,
			"--bv-popover-top": `${Math.min(rect.bottom + 10, window.innerHeight - 400)}px`,
		});

		let selectedColor = "#fbbf24";

		const colorPalette = ["#fbbf24", "#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#f87171", "#fb923c", "#22d3ee"];
		const colorRow = document.createElement("div");
		colorRow.className = "bv-color-row";
		colorRow.appendChild(document.createTextNode("🎨 "));

		const swatches: HTMLElement[] = [];
		const updateSwatchStyles = () => {
			swatches.forEach((sw, idx) => {
				const isActive = colorPalette[idx] === selectedColor;
				sw.toggleClass("is-active", isActive);
			});
		};

		colorPalette.forEach((color) => {
			const sw = document.createElement("button");
			sw.type = "button";
			sw.className = "bv-color-swatch";
			sw.setCssProps({ "--bv-swatch-color": color });
			sw.addEventListener("click", (e) => {
				e.preventDefault(); e.stopPropagation();
				selectedColor = color; updateSwatchStyles();
			});
			swatches.push(sw);
			colorRow.appendChild(sw);
		});
		updateSwatchStyles();
		popover.appendChild(colorRow);

		const preview = document.createElement("div");
		preview.className = "bv-comment-preview";
		preview.setCssProps({ "--bv-preview-border": selectedColor });
		const updatePreview = () => {
			preview.textContent = `«${selectedText}»`;
			preview.setCssProps({ "--bv-preview-border": selectedColor });
		};
		updatePreview();
		popover.appendChild(preview);

		const ta = document.createElement("textarea");
		ta.className = "bv-comment-input";
		ta.placeholder = "متن کامنت...";
		ta.rows = 3;
		ta.setAttribute("dir", "rtl");
		popover.appendChild(ta);

		const actions = document.createElement("div");
		actions.className = "bv-comment-actions";

		const saveBtn = document.createElement("button");
		saveBtn.className = "bv-comment-save";
		saveBtn.textContent = "✓ ذخیره";
		saveBtn.addEventListener("click", (e) => {
			e.preventDefault(); e.stopPropagation();
			const commentText = ta.value.trim();
			if (!commentText) { new Notice("❌ کامنت خالی"); return; }
			void this.saveComment(selectedText, commentText, selectedColor, sourcePath, this.lastSelectedOccurrence, this.lastSelectedParaHash).then(() => {
				this.closePopover();
				new Notice("✅ کامنت ذخیره شد");
				onUpdate();
			});
		});

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "bv-comment-cancel";
		cancelBtn.textContent = "✕ لغو";
		cancelBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.closePopover(); });

		actions.appendChild(saveBtn);
		actions.appendChild(cancelBtn);
		popover.appendChild(actions);
		document.body.appendChild(popover);
		this.popover = popover;
		this.attachGlobalHandler();
		ta.focus();
	}

	private async saveComment(selectedText: string, commentText: string, color: string, sourcePath: string, occurrence: number, paraHash: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;
		const raw = await this.app.vault.read(file);
		const commentId = "c" + Date.now();

		const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		let finalContent: string;
		const escaped = commentText.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const escapedSelected = selectedText.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
		const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;

		if (fmMatch) {
			const fmLines = fmMatch[1].split("\n");
			const commentsKeyIdx = fmLines.findIndex((l) => l.trim() === "comments:");
			if (commentsKeyIdx >= 0) {
				fmLines.splice(commentsKeyIdx + 1, 0,
					`  ${commentId}:`,
					`    text: "${escapedSelected}"`,
					`    note: "${escaped}"`,
					`    color: "${safeColor}"`,
					`    occurrence: ${occurrence}`,
					`    paraHash: "${paraHash}"`
				);
			} else {
				fmLines.push("comments:");
				fmLines.push(`  ${commentId}:`);
				fmLines.push(`    text: "${escapedSelected}"`);
				fmLines.push(`    note: "${escaped}"`);
				fmLines.push(`    color: "${safeColor}"`);
				fmLines.push(`    occurrence: ${occurrence}`);
				fmLines.push(`    paraHash: "${paraHash}"`);
			}
			const newFm = fmLines.join("\n");
			finalContent = `---\n${newFm}\n---\n` + raw.slice(fmMatch[0].length);
		} else {
			finalContent = `---\nbook-view: true\ncomments:\n  ${commentId}:\n    text: "${escapedSelected}"\n    note: "${escaped}"\n    color: "${safeColor}"\n    occurrence: ${occurrence}\n    paraHash: "${paraHash}"\n---\n\n` + raw;
		}

		await this.app.vault.modify(file, finalContent);
	}

	private normalize(s: string): string {
		const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
		return s
			.replace(/\\\./g, ".").replace(/\\\(/g, "(").replace(/\\\)/g, ")")
			.replace(/\\\[/g, "[").replace(/\\\]/g, "]").replace(/\\_/g, "_")
			.replace(/\\\*/g, "*").replace(/\\-/g, "-").replace(/\\#/g, "#")
			.replace(/\\\([0-9۰-۹]+\\\)/g, "").replace(/\[[0-9۰-۹]+\]/g, "")
			.replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "")
			.replace(/\u200c/g, "")
			.replace(/[*_~`#>|]/g, "")
			.replace(/[.،؛:؟!«»"'()[]{}-ـ,;?!]/g, "")
			.replace(ARABIC_DIACRITICS, "")
			.replace(/\s+/g, "")
			.replace(/[ةۀ]/g, "ه")
			.replace(/[أإآا]/g, "ا")
			.replace(/[يى]/g, "ی").replace(/ك/g, "ک")
			.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
			.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
			.toLowerCase().trim();
	}

	private normalizeChar(ch: string): string | null {
		const r = this.normalize(ch);
		return r.length > 0 ? r : null;
	}

	private showCommentPopover(mark: HTMLElement, sourcePath: string, onUpdate: () => void) {
		this.closePopover();
		const commentId = mark.dataset.commentId;
		if (!commentId) return;
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		void this.app.vault.read(file).then((raw) => {
			const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
			if (!fmMatch) return;
			const comments = this.parseComments(fmMatch[1]);
			const c = comments.find((x) => x.id === commentId);
			if (!c) return;
			const commentText = c.note || "";
			const currentColor = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : DEFAULT_COLOR;

			const popover = document.createElement("div");
			popover.className = "bv-comment-popover";
			popover.setCssProps({
				"--bv-popover-left": `${Math.max(10, Math.min(mark.getBoundingClientRect().left, window.innerWidth - 400))}px`,
				"--bv-popover-top": `${Math.min(mark.getBoundingClientRect().bottom + 10, window.innerHeight - 300)}px`,
			});

			const colorRow = document.createElement("div");
			colorRow.className = "bv-color-row";
			colorRow.appendChild(document.createTextNode("🎨 "));

			const colorPalette = ["#fbbf24", "#f472b6", "#a78bfa", "#60a5fa", "#34d399", "#f87171", "#fb923c", "#22d3ee"];
			let selectedColor = currentColor;
			const swatches: HTMLElement[] = [];
			const updateSwatchStyles = () => {
				swatches.forEach((sw, idx) => {
					const isActive = colorPalette[idx] === selectedColor;
					sw.toggleClass("is-active", isActive);
				});
			};

			colorPalette.forEach((color) => {
				const sw = document.createElement("button");
				sw.type = "button";
				sw.className = "bv-color-swatch";
				sw.setCssProps({ "--bv-swatch-color": color });
				sw.addEventListener("click", (e) => {
					e.preventDefault(); e.stopPropagation();
					selectedColor = color; updateSwatchStyles();
					const allMarks = document.querySelectorAll(`.bv-comment-mark[data-comment-id="${commentId}"]`);
					allMarks.forEach((m) => {
						(m as HTMLElement).setCssProps({ "--bv-comment-bg": this.hexToRgba(color, 0.35) });
					});
					void this.updateCommentColor(file, commentId, color).then(() => {
						new Notice("🎨 رنگ تغییر کرد");
					});
				});
				swatches.push(sw);
				colorRow.appendChild(sw);
			});
			updateSwatchStyles();
			popover.appendChild(colorRow);

			const text = document.createElement("div");
			text.className = "bv-comment-view-text";
			text.textContent = commentText;
			text.setCssProps({ "--bv-preview-border": currentColor });
			popover.appendChild(text);

			text.addEventListener("click", () => {
				if (text.querySelector("textarea")) return;
				const ta = document.createElement("textarea");
				ta.className = "bv-comment-input";
				ta.value = commentText;
				ta.rows = 3;
				ta.setAttribute("dir", "rtl");
				ta.setCssProps({ "--bv-preview-border": currentColor });
				text.innerHTML = "";
				text.appendChild(ta);
				ta.focus();
				ta.setSelectionRange(ta.value.length, ta.value.length);

				const saveEdit = async () => {
					const newText = ta.value.trim();
					if (newText === commentText) {
						text.textContent = commentText;
						return;
					}
					await this.updateCommentNote(file, commentId, newText);
					text.textContent = newText;
					new Notice("✅ کامنت ویرایش شد");
					onUpdate();
				};

				const cancelEdit = () => {
					text.textContent = commentText;
				};

				ta.addEventListener("keydown", (ev) => {
					if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void saveEdit(); }
					else if (ev.key === "Escape") { ev.preventDefault(); cancelEdit(); }
				});
				ta.addEventListener("blur", () => {
					window.setTimeout(() => {
						if (text.querySelector("textarea")) void saveEdit();
					}, 150);
				});
			});

			const actions = document.createElement("div");
			actions.className = "bv-comment-actions";

			const deleteBtn = document.createElement("button");
			deleteBtn.className = "bv-comment-delete";
			deleteBtn.textContent = "🗑 حذف";
			deleteBtn.addEventListener("click", (e) => {
				e.preventDefault(); e.stopPropagation();
				void this.deleteComment(file, commentId).then(() => {
					this.closePopover();
					new Notice("🗑 کامنت حذف شد");
					onUpdate();
				});
			});

			const closeBtn = document.createElement("button");
			closeBtn.className = "bv-comment-close";
			closeBtn.textContent = "✕ بستن";
			closeBtn.addEventListener("click", () => this.closePopover());

			actions.appendChild(deleteBtn);
			actions.appendChild(closeBtn);
			popover.appendChild(actions);

			document.body.appendChild(popover);
			this.popover = popover;
			this.attachGlobalHandler();
		});
	}

	private async updateCommentNote(file: TFile, commentId: string, note: string) {
		const raw = await this.app.vault.read(file);
		const escaped = note.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const noteRegex = new RegExp(`(\\s*${commentId}:\\s*\\n(?:\\s+(?:text|color|occurrence|paraHash):[^\\n]*\\n?)*\\s+note:\\s*)"[^"]*"`);
		if (noteRegex.test(raw)) {
			const updated = raw.replace(noteRegex, `$1"${escaped}"`);
			await this.app.vault.modify(file, updated);
		}
	}

	private async deleteComment(file: TFile, commentId: string) {
		const raw = await this.app.vault.read(file);
		const lines = raw.split("\n");

		const fmEnd = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
		if (fmEnd === -1) return;

		const fmLines = lines.slice(0, fmEnd);
		const bodyLines = lines.slice(fmEnd);

		const idLineIdx = fmLines.findIndex((l) => l.match(new RegExp(`^\\s{2}${commentId}:`)));
		if (idLineIdx === -1) return;

		let endIdx = idLineIdx + 1;
		while (endIdx < fmLines.length) {
			const nextLine = fmLines[endIdx];
			const nextIdMatch = nextLine.match(/^\s{2}(c\d+):/);
			if (nextIdMatch) break;
			if (!nextLine.startsWith("  ") && nextLine.trim() !== "") break;
			endIdx++;
		}

		const newFmLines = [...fmLines.slice(0, idLineIdx), ...fmLines.slice(endIdx)];
		const newRaw = [...newFmLines, ...bodyLines].join("\n");
		await this.app.vault.modify(file, newRaw);

		const marks = document.querySelectorAll(`.bv-comment-mark[data-comment-id="${commentId}"]`);
		marks.forEach((m) => {
			const parent = m.parentNode;
			if (!parent) return;
			const t = m.textContent || "";
			const textNode = document.createTextNode(t);
			parent.replaceChild(textNode, m);
			parent.normalize();
		});
	}

	private async updateCommentColor(file: TFile, commentId: string, color: string) {
		const raw = await this.app.vault.read(file);
		const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;

		const colorRegex = new RegExp(`(\\s*${commentId}:\\s*\\n(?:\\s+(?:text|note):[^\\n]*\\n?)+\\s+color:\\s*)"[^"]*"`);
		if (colorRegex.test(raw)) {
			const updated = raw.replace(colorRegex, `$1"${safeColor}"`);
			await this.app.vault.modify(file, updated);
		} else {
			const idRegex = new RegExp(`(\\s*${commentId}:\\s*\\n(?:\\s+(?:text|note):[^\\n]*\\n?)+)`);
			const updated = raw.replace(idRegex, `$1    color: "${safeColor}"\n`);
			await this.app.vault.modify(file, updated);
		}
	}

	private closePopover() {
		if (this.popover) { this.popover.remove(); this.popover = null; }
		if (!this.floatingBtn) this.detachGlobalHandler();
	}
}
