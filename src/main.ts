import {
	MarkdownRenderer, MarkdownView, Notice, Plugin, TFile, setIcon,
	WorkspaceLeaf,
} from "obsidian";
import { BookViewSettingTab } from "./settingsTab";
import { BookViewSettings, DEFAULT_SETTINGS } from "./settings";
import { CommentManager } from "./comments";
import { parseBook, parsePersianNumber, toPersianDigits, PageWithLines } from "./parser";

export default class BookViewPlugin extends Plugin {
	settings: BookViewSettings = DEFAULT_SETTINGS;
	private timer: number | null = null;
	private processing = false;
	private commentManager: CommentManager;
	private currentSourcePath: string = "";

	async onload() {
		await this.loadSettings();
		this.commentManager = new CommentManager(this.app);
		this.addSettingTab(new BookViewSettingTab(this.app, this));

		this.setupPageLinks();

		this.addBookViewCommand();
		
		this.addCommand({
			id: "recalculate-page-links",
			name: "Recalculate page links (current book)",
			callback: () => this.recalculatePageLinks(),
		});

		const schedule = () => {
			if (this.timer !== null) window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.handleActive();
			}, 200);
		};

		this.registerEvent(this.app.workspace.on("file-open", schedule));
		this.registerEvent(this.app.workspace.on("layout-change", schedule));
		this.registerEvent(this.app.workspace.on("active-leaf-change", schedule));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	refreshAll() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) return;
			this.cleanupView(view);
		});
		this.handleActive();
	}

	/**
	 * 🔑 کامند پالت برای افزودن کال‌اوت کتاب
	 */
	private addBookViewCommand() {
		this.addCommand({
			id: "add-book-view-callout",
			name: "افزودن کال‌اوت از کتاب",
			callback: () => this.startBookCalloutWizard(),
		});
	}

	private async startBookCalloutWizard() {
		// ۱. لیست کتاب‌ها
		const books = this.app.vault.getMarkdownFiles().filter((f) => {
			const fm = this.app.metadataCache.getCache(f.path)?.frontmatter;
			return fm?.["book-view"] === true;
		});
		
		if (books.length === 0) {
			new Notice("❌ هیچ فایل book-view پیدا نشد");
			return;
		}
		
		const bookNames = books.map((b) => b.basename);
		const bookChoice = await this.promptSelection("📖 انتخاب کتاب", bookNames);
		if (bookChoice === null) return;
		
		const selectedBook = books[bookChoice];
		
		// ۲. خواندن فایل و پیدا کردن صفحات
		const raw = await this.app.vault.cachedRead(selectedBook);
		const pages = parseBook(raw, selectedBook.path, (p) => this.app.metadataCache.getCache(p)?.frontmatter, this.settings.startPageNumber);
		
		if (pages.length === 0) {
			new Notice("❌ صفحه‌ای پیدا نشد");
			return;
		}
		
		const pageLabels = pages.map((p, i) => `صفحه ${p.number}${p.lesson ? " — " + p.lesson.slice(0, 40) : ""}`);
		const pageChoice = await this.promptSelection("📄 انتخاب صفحه", pageLabels);
		if (pageChoice === null) return;
		
		const selectedPage = pages[pageChoice];
		
		// ۳. انتخاب متن از صفحه
		const pageText = selectedPage.markdown;
		const textChoice = await this.promptTextSelection("✂️ انتخاب متن", pageText, selectedPage.footnotes);
		if (textChoice === null) return;
		
		// ۴. ساخت کال‌اوت
		const calloutMarkdown = `> [!quote]- [[${selectedBook.basename}#${selectedPage.number}]]\n> ${textChoice.split("\n").join("\n> ")}`;
		
		// ۵. درج در فایل فعال
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file) {
			const editor = activeView.editor;
			const cursor = editor.getCursor();
			editor.replaceRange(calloutMarkdown + "\n\n", cursor);
		} else {
			await navigator.clipboard.writeText(calloutMarkdown);
			new Notice("📋 کال‌اوت کپی شد (فایل فعالی نبود)");
		}
		
		new Notice("✅ کال‌اوت اضافه شد");
		
		// ۶. باز کردن کتاب + اسکرول + هایلایت
		await this.navigateToTarget(selectedBook.basename, selectedPage.number, textChoice);
	}

	/**
	 * 🔑 دیالوگ انتخاب از لیست
	 */
	private promptSelection(title: string, options: string[]): Promise<number | null> {
		return new Promise((resolve) => {
			const overlay = document.createElement("div");
			overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;direction:rtl;";
			
			const modal = document.createElement("div");
			modal.style.cssText = "background:var(--background-primary);border-radius:12px;padding:20px;min-width:400px;max-width:600px;max-height:70vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);";
			
			const header = document.createElement("h3");
			header.textContent = title;
			header.style.cssText = "margin:0 0 16px 0;color:var(--text-normal);";
			modal.appendChild(header);
			
			const list = document.createElement("div");
			list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
			
			options.forEach((opt, i) => {
				const btn = document.createElement("button");
				btn.textContent = opt;
				btn.style.cssText = "padding:10px 14px;text-align:right;background:var(--background-secondary);border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer;color:var(--text-normal);font-family:inherit;font-size:14px;transition:all 0.15s;";
				btn.addEventListener("mouseenter", () => {
					btn.style.background = "var(--background-modifier-hover)";
					btn.style.borderColor = "var(--interactive-accent)";
				});
				btn.addEventListener("mouseleave", () => {
					btn.style.background = "var(--background-secondary)";
					btn.style.borderColor = "var(--background-modifier-border)";
				});
				btn.addEventListener("click", () => {
					overlay.remove();
					resolve(i);
				});
				list.appendChild(btn);
			});
			
			modal.appendChild(list);
			overlay.appendChild(modal);
			document.body.appendChild(overlay);
			
			overlay.addEventListener("click", (e) => {
				if (e.target === overlay) {
					overlay.remove();
					resolve(null);
				}
			});
		});
	}

	/**
	 * 🔑 دیالوگ انتخاب متن از صفحه
	 */
	private promptTextSelection(title: string, text: string, footnotes: any[]): Promise<string | null> {
		return new Promise((resolve) => {
			const overlay = document.createElement("div");
			overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;direction:rtl;";
			
			const modal = document.createElement("div");
			modal.style.cssText = "background:var(--background-primary);border-radius:12px;padding:20px;min-width:500px;max-width:700px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.4);";
			
			const header = document.createElement("h3");
			header.textContent = title;
			header.style.cssText = "margin:0 0 8px 0;color:var(--text-normal);";
			modal.appendChild(header);
			
			const hint = document.createElement("p");
			hint.textContent = "متن مورد نظر را انتخاب کنید:";
			hint.style.cssText = "margin:0 0 12px 0;color:var(--text-muted);font-size:0.9em;";
			modal.appendChild(hint);
			
			const content = document.createElement("div");
			content.style.cssText = "flex:1;overflow:auto;padding:12px;background:var(--background-secondary);border-radius:8px;font-family:inherit;font-size:14px;line-height:1.8;direction:rtl;text-align:justify;white-space:pre-wrap;user-select:text;";
			content.textContent = text;
			modal.appendChild(content);
			
			const actions = document.createElement("div");
			actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;";
			
			const cancelBtn = document.createElement("button");
			cancelBtn.textContent = "✕ لغو";
			cancelBtn.style.cssText = "padding:8px 16px;background:transparent;border:1px solid var(--background-modifier-border);border-radius:8px;cursor:pointer;color:var(--text-normal);font-family:inherit;";
			cancelBtn.addEventListener("click", () => {
				overlay.remove();
				resolve(null);
			});
			
			const confirmBtn = document.createElement("button");
			confirmBtn.textContent = "✓ تأیید";
			confirmBtn.style.cssText = "padding:8px 16px;background:var(--interactive-accent);border:none;border-radius:8px;cursor:pointer;color:var(--text-on-accent);font-weight:600;font-family:inherit;";
			confirmBtn.addEventListener("click", () => {
				const sel = window.getSelection();
				const selected = sel?.toString().trim();
				if (!selected) {
					new Notice("❌ متنی انتخاب نشده");
					return;
				}
				overlay.remove();
				resolve(selected);
			});
			
			actions.appendChild(cancelBtn);
			actions.appendChild(confirmBtn);
			modal.appendChild(actions);
			overlay.appendChild(modal);
			document.body.appendChild(overlay);
		});
	}

	private async recalculatePageLinks() {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.file) { new Notice("❌ هیچ فایلی باز نیست"); return; }
		const bookFile = activeView.file;
		const fm = this.app.metadataCache.getFileCache(bookFile)?.frontmatter;
		if (fm?.["book-view"] !== true) { new Notice("❌ فایل book-view نیست"); return; }
		const newStart = parseInt(String(fm["start-page"] ?? "1"), 10);
		const oldStart = parseInt(String(fm["start-page-old"] ?? "1"), 10);
		if (isNaN(newStart) || isNaN(oldStart)) { new Notice("❌ start-page نامعتبر"); return; }
		const delta = newStart - oldStart;
		if (delta === 0) { new Notice("⚠️ delta صفره"); return; }
		new Notice(`⏳ delta = ${delta > 0 ? "+" : ""}${delta}`);

		const allFiles = this.app.vault.getMarkdownFiles();
		const bookBasename = bookFile.basename;
		const bookPath = bookFile.path.replace(/\.md$/i, "");
		let updatedFiles = 0;
		let updatedLinks = 0;

		for (const file of allFiles) {
			if (file.path === bookFile.path) continue;
			const content = await this.app.vault.read(file);
			const newContent = this.shiftPageLinks(content, bookBasename, bookPath, delta);
			if (newContent !== content) {
				updatedFiles++;
				updatedLinks += this.countShiftedLinks(content, bookBasename, bookPath);
				await this.app.vault.modify(file, newContent);
			}
		}

		await this.app.fileManager.processFrontMatter(bookFile, (fmm: any) => {
			fmm["start-page-old"] = newStart;
		});

		this.refreshAll();
		new Notice(`✅ ${updatedLinks} لینک در ${updatedFiles} فایل`);
	}

	private shiftPageLinks(content: string, basename: string, path: string, delta: number): string {
		const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`\\[\\[(?:${esc(basename)}|${esc(path)})#([0-9۰-۹]+)\\]\\]`, "g");
		return content.replace(re, (match, pageNum: string) => {
			const num = parsePersianNumber(pageNum);
			const newNum = num + delta;
			if (newNum < 1) return match;
			return match.replace(pageNum, /[۰-۹]/.test(pageNum) ? toPersianDigits(newNum) : String(newNum));
		});
	}

	private countShiftedLinks(content: string, basename: string, path: string): number {
		const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`\\[\\[(?:${esc(basename)}|${esc(path)})#([0-9۰-۹]+)\\]\\]`, "g");
		let c = 0; while (re.exec(content) !== null) c++; return c;
	}

	private setupPageLinks() {
		this.registerMarkdownPostProcessor((el) => {
			const links = el.querySelectorAll("a.internal-link, a[data-href]");
			links.forEach((a) => {
				const href = (a as HTMLElement).getAttribute("data-href") ||
					(a as HTMLAnchorElement).getAttribute("href") || "";
				const match = href.match(/^([^#]+)#(.+)$/);
				if (!match) return;
				const filePath = match[1];
				const target = match[2].trim();
				if (!target) return;
				a.classList.add("bv-page-link");
				a.addEventListener("click", (e) => {
					e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
					const callout = a.closest(".callout");
					let calloutText = "";
					if (callout) {
						const content = callout.querySelector(".callout-content");
						if (content) calloutText = (content.textContent || "").trim();
					}
					this.navigateToTarget(filePath, target, calloutText);
				}, true);
			});
		});
	}

	private findFile(filePath: string): TFile | null {
		const direct = this.app.vault.getAbstractFileByPath(filePath);
		if (direct instanceof TFile) return direct;
		if (!filePath.endsWith(".md")) {
			const withMd = this.app.vault.getAbstractFileByPath(filePath + ".md");
			if (withMd instanceof TFile) return withMd;
		}
		const allFiles = this.app.vault.getMarkdownFiles();
		const needle = filePath.replace(/\.md$/i, "").trim().toLowerCase();
		const exact = allFiles.filter((f) => f.basename.toLowerCase() === needle);
		if (exact.length === 1) return exact[0];
		if (exact.length > 1) { new Notice(`⚠️ چند فایل: ${needle}`); return exact[0]; }
		return null;
	}

	private isBookView(view: MarkdownView): boolean {
		const file = view.file;
		if (!file) return false;
		return this.app.metadataCache.getCache(file.path)?.frontmatter?.["book-view"] === true;
	}

	private findBookLeaves(): WorkspaceLeaf[] {
		const leaves: WorkspaceLeaf[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && this.isBookView(leaf.view)) leaves.push(leaf);
		});
		return leaves;
	}

	private async navigateToTarget(filePath: string, target: string, calloutText: string) {
		const file = this.findFile(filePath);
		if (!file) { new Notice(`❌ فایل پیدا نشد: ${filePath}`); return; }

		let existingLeaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (existingLeaf) return;
			const v = leaf.view;
			if (v instanceof MarkdownView && v.file?.path === file.path) {
				existingLeaf = leaf;
			}
		});

		let targetLeaf: WorkspaceLeaf;

		if (existingLeaf) {
			targetLeaf = existingLeaf;
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
		} else {
			targetLeaf = this.app.workspace.getLeaf("split", "vertical");
			await targetLeaf.openFile(file, { state: { mode: "preview" } });
		}

		const targetView = targetLeaf.view;
		if (targetView instanceof MarkdownView && targetView.getMode() !== "preview") {
			await targetView.setState({ mode: "preview" }, { history: false });
		}

		// 🔑 صبر کن view رندر بشه
		await new Promise((r) => setTimeout(r, 500));

		// 🔑 force transform اگه هنوز book-view-root نداره
		const freshView = targetLeaf.view;
		if (freshView instanceof MarkdownView) {
			const containerEl = freshView.previewMode?.containerEl;
			if (containerEl) {
				const existingRoot = containerEl.querySelector(".book-view-root");
				const sizer = containerEl.querySelector(".markdown-preview-sizer");
				// اگه root نیست، transform رو صدا بزن
				if (!existingRoot && sizer) {
					console.log("[BookView] forcing transform after split open");
					await this.transform(freshView, file.path, containerEl);
				}
			}
		}

		// 🔑 حالا صبر کن تا book-view-root ساخته بشه
		let attempts = 0;
		const waitForRoot = async (): Promise<boolean> => {
			attempts++;
			const freshView2 = targetLeaf.view;
			if (!(freshView2 instanceof MarkdownView)) return false;
			const containerEl = freshView2.previewMode?.containerEl;
			if (!containerEl) return false;
			const root = containerEl.querySelector(".book-view-root");
			if (root) return true;
			if (attempts < 30) {
				await new Promise((r) => setTimeout(r, 100));
				return waitForRoot();
			}
			return false;
		};
		
		const ready = await waitForRoot();
		console.log("[BookView] root ready:", ready);

		const finalView = targetLeaf.view;
		if (finalView instanceof MarkdownView) {
			const isNumeric = /^[0-9۰-۹]+$/.test(target);
			if (isNumeric) {
				if (calloutText) this.scrollToPageAndHighlight(target, calloutText, finalView);
				else this.scrollToPage(target, finalView);
			} else {
				this.scrollToText(target, finalView);
			}
		}
	}

	private scrollToPage(pageNum: string, view: MarkdownView) {
		const normalized = pageNum.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
		let attempts = 0;
		const tryScroll = () => {
			attempts++;
			const containerEl = view.previewMode?.containerEl;
			if (!containerEl) { if (attempts < 30) setTimeout(tryScroll, 200); return; }
			const cards = Array.from(containerEl.querySelectorAll(".book-view-page")) as HTMLElement[];
			if (cards.length === 0) { if (attempts < 30) setTimeout(tryScroll, 200); return; }
			let target: HTMLElement | null = null;
			for (const card of cards) {
				const n = (card.dataset.page || "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
				if (n === normalized) { target = card; break; }
			}
			if (!target) { if (attempts < 30) setTimeout(tryScroll, 200); else new Notice(`⚠️ صفحه ${pageNum} پیدا نشد`); return; }

			// 🔑 اسکرول ساده
			target.scrollIntoView({ behavior: "smooth", block: "start" });
			target.classList.add("bv-page-flash");
			setTimeout(() => target!.classList.remove("bv-page-flash"), 2000);
		};
		tryScroll();
	}

	private scrollToPageAndHighlight(pageNum: string, text: string, view: MarkdownView) {
		const np = pageNum.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
		let attempts = 0;
		const maxAttempts = 40;
		
		const tryScroll = () => {
			attempts++;
			const containerEl = view.previewMode?.containerEl;
			if (!containerEl) { if (attempts < maxAttempts) setTimeout(tryScroll, 150); return; }
			const cards = Array.from(containerEl.querySelectorAll(".book-view-page")) as HTMLElement[];
			if (cards.length === 0) { if (attempts < maxAttempts) setTimeout(tryScroll, 150); return; }
			
			let targetCard: HTMLElement | null = null;
			for (const card of cards) {
				const n = (card.dataset.page || "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
				if (n === np) { targetCard = card; break; }
			}
			if (!targetCard) { if (attempts < maxAttempts) setTimeout(tryScroll, 150); else new Notice(`⚠️ صفحه ${pageNum} پیدا نشد`); return; }

			// 🔑 اسکرول نرم
			targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
			
			setTimeout(() => {
				const body = targetCard!.querySelector(".book-view-page-body") as HTMLElement;
				const hasPlaceholder = body?.querySelector(".bv-placeholder");
				const textLen = (body?.textContent || "").trim().length;
				
				if (hasPlaceholder || textLen < 10) {
					if (attempts < maxAttempts) setTimeout(tryScroll, 150);
					return;
				}
				
				const highlight = this.findAndHighlight(targetCard!, text);
				if (highlight) {
					setTimeout(() => {
						highlight.scrollIntoView({ behavior: "smooth", block: "center" });
					}, 150);
				}
				
				targetCard!.classList.add("bv-page-flash");
				setTimeout(() => targetCard!.classList.remove("bv-page-flash"), 2000);
			}, 300);
		};
		tryScroll();
	}

	/**
	 * 🔑 متن رو توی یه کارت پیدا و هایلایت کن
	 */
	private findAndHighlight(card: HTMLElement, text: string): HTMLElement | null {
		const normalize = (s: string) => s
			.replace(/\\\./g, ".").replace(/\\\(/g, "(").replace(/\\\)/g, ")")
			.replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "")
			.replace(/\u200c/g, "")
			.replace(/[*_~`#>|]/g, "")
			// 🔑 حذف پاورقی‌های Word: (1), (۲۳), ( 4 )
			.replace(/\(\s*[0-9۰-۹]+\s*\)/g, "")
			// 🔑 حذف پاورقی‌های Obsidian: [1], [۲۳]
			.replace(/\[\s*[0-9۰-۹]+\s*\]/g, "")
			// 🔑 حذف پاورقی‌های escaped: \(1\)
			.replace(/\\\(\s*[0-9۰-۹]+\s*\\\)/g, "")
			.replace(/[.،؛:؟!«»"'()\[\]{}\-ـ,;?!]/g, "")
			.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
			.replace(/\s+/g, "")
			.replace(/[ةۀ]/g, "ه")
			.replace(/[أإآا]/g, "ا")
			.replace(/[يى]/g, "ی").replace(/ك/g, "ک")
			.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
			.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
			.toLowerCase().trim();

		const normalizeChar = (ch: string): string | null => {
			const r = normalize(ch);
			return r.length > 0 ? r : null;
		};

		// 🔑 نرمالایز متن کال‌اوت قبل از جستجو
		const normalizedText = text
			.replace(/\(\s*[0-9۰-۹]+\s*\)/g, "")
			.replace(/\[\s*[0-9۰-۹]+\s*\]/g, "");
		
		const needle = normalize(normalizedText);
		if (!needle) return null;

		const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
		const flat: string[] = [];
		const map: { node: Text; rawIndex: number }[] = [];

		let node: Node | null;
		while ((node = walker.nextNode())) {
			const t = node as Text;
			const parent = t.parentElement;
			if (parent) {
				// 🔑 skip sup و footnote-ref و هایلایت‌های قبلی
				if (parent.closest("sup")) continue;
				if (parent.closest(".footnote-ref")) continue;
				if (parent.closest(".footnote-link")) continue;
				if (parent.closest("a[href^='#fn-']")) continue;
				if (parent.closest("a[data-href^='#fn-']")) continue;
				if (parent.closest(".bv-text-highlight")) continue;
			}
			const raw = t.textContent || "";
			for (let i = 0; i < raw.length; i++) {
				const norm = normalizeChar(raw[i]);
				if (norm === null) continue;
				flat.push(norm);
				map.push({ node: t, rawIndex: i });
			}
		}

		const flatStr = flat.join("");
		console.log("[Highlight] needle len:", needle.length, "| flatStr len:", flatStr.length);

		let idx = flatStr.indexOf(needle);
		let matchedLen = needle.length;

		if (idx === -1) {
			// کلمه به کلمه
			const words = normalizedText.split(/\s+/).filter(w => w.trim().length > 0);
			for (let endWord = words.length - 1; endWord >= 3; endWord--) {
				const partial = words.slice(0, endWord).join(" ");
				const partialNormalized = normalize(partial);
				if (!partialNormalized) continue;
				const j = flatStr.indexOf(partialNormalized);
				if (j !== -1) {
					idx = j;
					matchedLen = partialNormalized.length;
					console.log("[Highlight] matched", endWord, "/", words.length, "words");
					break;
				}
			}
		}

		if (idx === -1) {
			console.log("[Highlight] ✗ not found");
			return null;
		}

		const startEntry = map[idx];
		const endEntry = map[idx + matchedLen - 1];
		if (!startEntry || !endEntry) return null;

		const involvedNodes: { node: Text; startFlat: number; endFlat: number }[] = [];
		const seen = new Set<Text>();
		for (let i = idx; i < idx + matchedLen; i++) {
			const entry = map[i];
			if (!entry) continue;
			if (seen.has(entry.node)) continue;
			seen.add(entry.node);
			let s = -1, e = -1;
			for (let j = 0; j < map.length; j++) {
				if (map[j].node !== entry.node) continue;
				if (s === -1) s = j;
				e = j;
			}
			involvedNodes.push({ node: entry.node, startFlat: s, endFlat: e });
		}

		const spans: HTMLElement[] = [];
		for (let ni = involvedNodes.length - 1; ni >= 0; ni--) {
			const info = involvedNodes[ni];
			const t = info.node;
			const raw = t.textContent || "";
			const overlapStart = Math.max(idx, info.startFlat);
			const overlapEnd = Math.min(idx + matchedLen - 1, info.endFlat);
			if (overlapStart > overlapEnd) continue;
			const rawStart = map[overlapStart].rawIndex;
			const rawEnd = map[overlapEnd].rawIndex + 1;
			const before = raw.slice(0, rawStart);
			const middle = raw.slice(rawStart, rawEnd);
			const after = raw.slice(rawEnd);
			const parent = t.parentNode;
			if (!parent) continue;
			const frag = document.createDocumentFragment();
			if (before) frag.appendChild(document.createTextNode(before));
			const span = document.createElement("span");
			span.className = "bv-text-highlight";
			span.textContent = middle;
			spans.push(span);
			frag.appendChild(span);
			if (after) frag.appendChild(document.createTextNode(after));
			parent.replaceChild(frag, t);
		}

		if (spans.length === 0) return null;
		console.log("[Highlight] ✓ created", spans.length, "spans");

		setTimeout(() => {
			spans.forEach((span) => {
				const parent = span.parentNode;
				if (!parent) return;
				parent.replaceChild(document.createTextNode(span.textContent || ""), span);
				parent.normalize();
			});
		}, 3100);

		return spans[spans.length - 1];
	}

	private scrollToText(text: string, view: MarkdownView) {
		let attempts = 0;
		const normalizeSimple = (s: string) => s.replace(/[\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, "").replace(/\u200c/g, "").replace(/[.،؛:؟!«»"'()\[\]{}\-_ـ,;?!]/g, "").replace(/\s+/g, "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").toLowerCase().trim();
		const needle = normalizeSimple(text);
		if (!needle) return;
		const tryScroll = () => {
			attempts++;
			const containerEl = view.previewMode?.containerEl;
			if (!containerEl) { if (attempts < 30) setTimeout(tryScroll, 200); return; }
			const cards = Array.from(containerEl.querySelectorAll(".book-view-page")) as HTMLElement[];
			if (cards.length === 0) { if (attempts < 30) setTimeout(tryScroll, 200); return; }
			cards.forEach((c) => c.style.contentVisibility = "visible");
			setTimeout(() => {
				for (const card of cards) {
					const cardText = card.textContent || "";
					if (normalizeSimple(cardText).includes(needle)) {
						card.scrollIntoView({ behavior: "auto", block: "center" });
						return;
					}
				}
				if (attempts < 30) setTimeout(tryScroll, 300);
				else new Notice(`⚠️ پیدا نشد: ${text.slice(0, 40)}`);
			}, 200);
		};
		tryScroll();
	}

	private addBookViewButton(view: MarkdownView) {
		const existing = view.containerEl.querySelector(".book-view-toggle-btn") as HTMLElement | null;
		if (existing) {
			const isActive = !!view.previewMode?.containerEl?.querySelector(".book-view-root");
			setIcon(existing, isActive ? "book-open-check" : "book-open");
			existing.toggleClass("is-active", isActive);
			return;
		}
		const actions = view.containerEl.querySelector(".view-actions") as HTMLElement | null;
		if (!actions) return;
		const btn = document.createElement("a");
		btn.className = "clickable-icon view-action book-view-toggle-btn";
		btn.setAttribute("aria-label", "Book View");
		const isActive = !!view.previewMode?.containerEl?.querySelector(".book-view-root");
		setIcon(btn, isActive ? "book-open-check" : "book-open");
		if (isActive) btn.classList.add("is-active");
		actions.insertBefore(btn, actions.firstChild);
		btn.addEventListener("click", (e) => {
			e.preventDefault(); e.stopPropagation();
			const containerEl = view.previewMode?.containerEl;
			if (!containerEl) return;
			const wrapper = containerEl.querySelector(".book-view-root");
			if (wrapper) {
				this.destroyWrapper(wrapper as HTMLElement);
				setIcon(btn, "book-open");
				btn.classList.remove("is-active");
			} else {
				this.handleActive();
				setIcon(btn, "book-open-check");
				btn.classList.add("is-active");
			}
		});
	}

	private destroyWrapper(wrapper: HTMLElement) {
		const observer = (wrapper as any).__bvObserver as IntersectionObserver | undefined;
		if (observer) observer.disconnect();
		const sizer = wrapper.parentElement?.querySelector(".markdown-preview-sizer") as HTMLElement | null;
		if (sizer) sizer.style.display = "";
		wrapper.remove();
	}

	private async handleActive() {
		if (this.processing) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		this.addBookViewButton(view);
		if (view.getMode() !== "preview") return;
		const file = view.file;
		if (!file) return;
		const isBook = this.app.metadataCache.getCache(file.path)?.frontmatter?.["book-view"] === true;
		if (!isBook) {
			const existing = view.previewMode?.containerEl?.querySelector(".book-view-root") as HTMLElement | null;
			if (existing) this.destroyWrapper(existing);
			return;
		}
		const containerEl = view.previewMode?.containerEl;
		if (!containerEl) return;
		const existing = containerEl.querySelector(".book-view-root") as HTMLElement | null;
		if (existing) {
			if (existing.dataset.source === file.path) return;
			this.destroyWrapper(existing);
		}
		await this.transform(view, file.path, containerEl);
	}

	private cleanupView(view: MarkdownView) {
		const containerEl = view.previewMode?.containerEl;
		if (!containerEl) return;
		containerEl.querySelectorAll(".book-view-root").forEach((w) => this.destroyWrapper(w as HTMLElement));
	}

	async importWordFile(file: File): Promise<void> {
		try {
			new Notice("⏳ در حال تبدیل...");
			const buf = await file.arrayBuffer();
			const title = file.name.replace(/\.docx$/i, "");
			const { wordToPages } = await import("./importer");
			const body = await wordToPages(buf, title);
			if (!body.includes("book-view: true")) { new Notice("❌ تبدیل ناموفق"); return; }
			let path = `${title}.md`;
			let n = 1;
			while (this.app.vault.getAbstractFileByPath(path)) { path = `${title} ${n}.md`; n++; }
			const newFile = await this.app.vault.create(path, body);
			await this.app.workspace.getLeaf().openFile(newFile);
			const pageCount = Math.max(1, (body.match(/^---\s*$/gm) || []).length - 1);
			new Notice(`✅ ${path} (${pageCount} صفحه)`);
		} catch (e: any) {
			console.error(e);
			new Notice("❌ خطا: " + (e?.message ?? "?"));
		}
	}

	private async transform(_view: MarkdownView, sourcePath: string, containerEl: HTMLElement) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.cachedRead(file);
		const pages = parseBook(raw, sourcePath, (p) => this.app.metadataCache.getCache(p)?.frontmatter, this.settings.startPageNumber);
		if (pages.length === 0) return;

		this.processing = true;

		const wrapper = document.createElement("div");
		wrapper.className = "book-view-root";
		wrapper.dataset.source = sourcePath;
		this.applySettings(wrapper);

		const pagesBox = document.createElement("div");
		pagesBox.className = "book-view-pages";
		wrapper.appendChild(pagesBox);

		let lastLesson = "";
		for (let i = 0; i < pages.length; i++) {
			const page = pages[i];
			if (this.settings.showLessonInHeader && page.lesson && page.lesson !== lastLesson) {
				const h = document.createElement("h2");
				h.className = "book-view-lesson-title";
				h.textContent = page.lesson;
				pagesBox.appendChild(h);
				lastLesson = page.lesson;
			}
			const article = document.createElement("article");
			article.className = "book-view-page";
			if (page.number) article.dataset.page = page.number;
			article.dataset.index = String(i);

			const header = document.createElement("div");
			header.className = "book-view-page-header";
			const lessonEl = document.createElement("span");
			lessonEl.className = "book-view-page-lesson";
			lessonEl.textContent = this.settings.showLessonInHeader ? page.lesson : "";
			header.appendChild(lessonEl);

			const editBtn = document.createElement("button");
			editBtn.className = "bv-page-edit-btn";
			editBtn.textContent = "✎";
			editBtn.title = "ویرایش این صفحه";
			editBtn.addEventListener("mouseenter", () => {
				editBtn.style.opacity = "1";
				editBtn.style.background = "var(--background-modifier-hover)";
				editBtn.style.borderColor = "var(--interactive-accent)";
			});
			editBtn.addEventListener("mouseleave", () => {
				editBtn.style.opacity = "0.7";
				editBtn.style.background = "transparent";
				editBtn.style.borderColor = "var(--background-modifier-border)";
			});
			editBtn.addEventListener("click", (e) => {
				e.preventDefault(); e.stopPropagation();
				this.editPage(article, page, sourcePath);
			});
			header.appendChild(editBtn);

			const numEl = document.createElement("span");
			numEl.className = "book-view-page-number";
			numEl.textContent = this.settings.showPageNumber ? page.number : "";
			header.appendChild(numEl);

			article.appendChild(header);

			const bodyWrapper = document.createElement("div");
			bodyWrapper.className = "book-view-page-body-wrapper";
			const body = document.createElement("div");
			body.className = "book-view-page-body";
			body.innerHTML = `<div class="bv-placeholder">…</div>`;
			bodyWrapper.appendChild(body);
			const fnBox = document.createElement("div");
			fnBox.className = "bv-footnotes-slot";
			bodyWrapper.appendChild(fnBox);
			article.appendChild(bodyWrapper);
			pagesBox.appendChild(article);
		}

		const sizer = containerEl.querySelector(".markdown-preview-sizer") as HTMLElement | null;
		if (sizer) {
			sizer.style.display = "none";
			sizer.parentElement!.insertBefore(wrapper, sizer);
		}
		this.processing = false;
		this.setupLazyRender(wrapper, pages, sourcePath);
	}

	/**
	 * 🔑 رنگ متن و پس‌زمینه برای textarea ویرایش بر اساس تم
	 */
	private getEditColors(article: HTMLElement): { text: string; bg: string; caret: string; border: string } {
		// 🔑 اول از data-theme کارت بگیر، اگه نبود از تنظیمات
		const pageRoot = article.closest?.(".book-view-root") as HTMLElement | null;
		const theme = pageRoot?.dataset?.theme || this.settings.theme || "white";

		console.log("[EditColors] theme:", theme);

		switch (theme) {
			case "white":
				return { text: "#1a1a1a", bg: "#ffffff", caret: "#7c3aed", border: "#7c3aed" };
			case "milky":
				return { text: "#2a2a2a", bg: "#faf9f6", caret: "#7c3aed", border: "#7c3aed" };
			case "cream":
				return { text: "#2b2118", bg: "#f5ecd9", caret: "#7c3aed", border: "#7c3aed" };
			case "black":
				return { text: "#e0e0e0", bg: "#1e1e1e", caret: "#a78bfa", border: "#a78bfa" };
			default:
				return { text: "#1a1a1a", bg: "#ffffff", caret: "#7c3aed", border: "#7c3aed" };
		}
	}

	private async editPage(article: HTMLElement, page: PageWithLines, sourcePath: string) {
		const body = article.querySelector(".book-view-page-body") as HTMLElement;
		if (!body) return;
		if (body.querySelector(".bv-live-edit-wrapper")) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const lines = raw.split(/\r?\n/);

		let startLine = page.startLine;
		let endLine = page.endLine;

		// 🔑 فقط تا قبل از خط جداکننده پاورقی (___) رو بگیر
		let actualEndLine = endLine;
		for (let i = startLine; i < endLine; i++) {
			if (lines[i] && lines[i].trim().match(/^[\\_ ]{3,}$/)) {
				actualEndLine = i;
				break;
			}
		}
		const originalText = lines.slice(startLine, actualEndLine).join("\n");

		const bodyHeight = body.offsetHeight;
		const bodyWidth = body.offsetWidth;
		const lineCount = originalText.split("\n").length;

		const mainContent = Array.from(body.children).filter(
			(child) => !child.classList.contains("bv-footnotes") && !child.classList.contains("bv-live-edit-wrapper")
		);
		const originalHTML = mainContent.map((el) => el.outerHTML).join("");

		// 🔑 فقط بچه‌های قبل از پاورقی رو حذف کن
		const fnBoxOriginal = body.querySelector(".bv-footnotes") as HTMLElement | null;
		while (body.firstChild) {
			const first = body.firstChild;
			if (first === fnBoxOriginal) break;
			body.removeChild(first);
		}

		const colors = this.getEditColors(article);

		const textarea = document.createElement("textarea");
		textarea.className = "bv-live-edit-textarea";
		textarea.value = originalText;
		textarea.rows = Math.max(lineCount, 10);
		textarea.setAttribute("dir", "rtl");
		textarea.style.setProperty("background", colors.bg, "important");
		textarea.style.setProperty("color", colors.text, "important");
		textarea.style.setProperty("caret-color", colors.caret, "important");
		textarea.style.setProperty("border", "none", "important");
		textarea.style.setProperty("outline", "none", "important");
		textarea.style.setProperty("box-shadow", "inset 0 0 0 2px " + colors.border, "important");
		textarea.style.setProperty("border-radius", "6px", "important");
		textarea.style.setProperty("padding", "12px", "important");
		textarea.style.setProperty("margin", "0", "important");
		textarea.style.setProperty("width", bodyWidth + "px", "important");
		textarea.style.setProperty("min-height", bodyHeight + "px", "important");
		textarea.style.setProperty("box-sizing", "border-box", "important");
		textarea.style.setProperty("resize", "none", "important");
		textarea.style.setProperty("overflow", "auto", "important");
		textarea.style.setProperty("direction", "rtl", "important");
		textarea.style.setProperty("font-size", "var(--bv-body-font-size, 16px)", "important");
		textarea.style.setProperty("line-height", "var(--bv-body-line-height, 1.9)", "important");
		textarea.style.setProperty("font-family", "var(--bv-body-font, inherit)", "important");
		textarea.style.setProperty("text-align", "justify", "important");
		textarea.style.setProperty("white-space", "pre-wrap", "important");

		const wrapper = document.createElement("div");
		wrapper.className = "bv-live-edit-wrapper";
		wrapper.style.setProperty("position", "relative", "important");
		wrapper.appendChild(textarea);

		const buttons = document.createElement("div");
		buttons.className = "bv-live-edit-buttons";
		buttons.style.cssText = "position:absolute;top:-46px;left:0;display:flex;gap:6px;background:var(--background-primary);padding:4px 8px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);z-index:1000";

		const saveBtn = document.createElement("button");
		saveBtn.textContent = "✓";
		saveBtn.type = "button";
		saveBtn.title = "ذخیره (Cmd+Enter)";
		saveBtn.style.cssText = "background:#22c55e;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px;font-weight:700";

		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "✕";
		cancelBtn.type = "button";
		cancelBtn.title = "لغو (Esc)";
		cancelBtn.style.cssText = "background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px;font-weight:700";

		buttons.appendChild(saveBtn);
		buttons.appendChild(cancelBtn);
		wrapper.appendChild(buttons);

		if (fnBoxOriginal) {
			body.insertBefore(wrapper, fnBoxOriginal);
		} else {
			body.appendChild(wrapper);
		}

		textarea.focus();
		textarea.setSelectionRange(0, 0);

		const save = async () => {
			const newText = textarea.value;
			
			// 🔑 اگه تغییر نکرده
			if (newText.trim() === originalText.trim()) {
				wrapper.remove();
				const newMainDiv = document.createElement("div");
				newMainDiv.innerHTML = originalHTML;
				const fnBox = body.querySelector(".bv-footnotes");
				const nodes = Array.from(newMainDiv.childNodes);
				for (const node of nodes) {
					if (fnBox) body.insertBefore(node, fnBox);
					else body.appendChild(node);
				}
				await this.reattach(body, sourcePath);
				return;
			}

			try {
				const currentRaw = await this.app.vault.read(file);
				const currentLines = currentRaw.split(/\r?\n/);
				
				// 🔑 محاسبه‌ی endline واقعی روی فایل فعلی
				let currentActualEnd = endLine;
				for (let i = startLine; i < endLine; i++) {
					if (currentLines[i] && currentLines[i].trim().match(/^[\\_ ]{3,}$/)) {
						currentActualEnd = i;
						break;
					}
				}

				console.log("[EditPage] startLine:", startLine, "currentActualEnd:", currentActualEnd, "page.endLine:", endLine);

				// 🔑 فقط تا currentActualEnd رو جایگزین کن (نه endLine)
				const before = currentLines.slice(0, startLine);
				const after = currentLines.slice(currentActualEnd);
				const newLines = newText.split("\n");
				const newContent = [...before, ...newLines, ...after].join("\n");

				await this.app.vault.modify(file, newContent);
				console.log("[EditPage] ✓ SAVED");

				// آپدیت page.endLine
				const delta = newLines.length - (currentActualEnd - startLine);
				page.endLine = endLine + delta;

				// 🔑 پاک کردن wrapper
				wrapper.remove();

				// 🔑 پاک کردن همه‌ی محتوای قبلی (به جز پاورقی)
				const fnBox = body.querySelector(".bv-footnotes") as HTMLElement | null;
				while (body.firstChild) {
					const first = body.firstChild;
					if (first === fnBox) break;
					body.removeChild(first);
				}

				// 🔑 رندر محتوای جدید
				const renderedDiv = document.createElement("div");
				const md = this.injectFootnoteSyntax(newText, page.footnotes);
				await MarkdownRenderer.render(this.app, md, renderedDiv, sourcePath, this);
				
				// 🔑 اضافه کردن قبل از پاورقی
				const nodes = Array.from(renderedDiv.childNodes);
				for (const node of nodes) {
					if (fnBox) body.insertBefore(node, fnBox);
					else body.appendChild(node);
				}
				
				await this.reattach(body, sourcePath);
				new Notice("✅ ذخیره شد");
			} catch (e) {
				console.error("[EditPage] ERROR:", e);
				new Notice("❌ خطا: " + (e as Error).message);
			}
		};

		const cancel = async () => {
			wrapper.remove();
			// 🔑 پاک کردن همه‌ی محتوای قبلی (به جز پاورقی)
			const fnBox = body.querySelector(".bv-footnotes") as HTMLElement | null;
			while (body.firstChild) {
				const first = body.firstChild;
				if (first === fnBox) break;
				body.removeChild(first);
			}
			const newMainDiv = document.createElement("div");
			newMainDiv.innerHTML = originalHTML;
			const nodes = Array.from(newMainDiv.childNodes);
			for (const node of nodes) {
				if (fnBox) body.insertBefore(node, fnBox);
				else body.appendChild(node);
			}
			await this.reattach(body, sourcePath);
		};

		saveBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); save(); };
		cancelBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); cancel(); };
		textarea.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
			else if (e.key === "Escape") { e.preventDefault(); cancel(); }
		});
	}

	private async reattach(body: HTMLElement, sourcePath: string) {
		const onUpdate = async () => {
			await this.commentManager.applyCommentsToBody(body, sourcePath, onUpdate);
		};
		await this.commentManager.applyCommentsToBody(body, sourcePath, onUpdate);
	}

	private setupLazyRender(wrapper: HTMLElement, pages: PageWithLines[], sourcePath: string) {
		const rendered = new Set<number>();
		const queue: HTMLElement[] = [];
		let isProcessing = false;

		const processQueue = async () => {
			if (isProcessing) return;
			isProcessing = true;
			while (queue.length > 0) {
				if (!wrapper.isConnected) break;
				const article = queue.shift()!;
				await renderPage(article);
				await new Promise((r) => requestAnimationFrame(() => r(null)));
			}
			isProcessing = false;
		};

		const renderPage = async (article: HTMLElement) => {
			const idx = parseInt(article.dataset.index || "-1", 10);
			if (idx < 0 || rendered.has(idx)) return;
			rendered.add(idx);

			const page = pages[idx];
			const body = article.querySelector(".book-view-page-body") as HTMLElement;
			if (!body) return;

			body.innerHTML = "";
			this.currentSourcePath = sourcePath;
			const md = this.injectFootnoteSyntax(page.markdown, page.footnotes);
			await MarkdownRenderer.render(this.app, md, body, sourcePath, this);
			this.wrapFootnotes(article, page);
			// 🔑 باکس backlinks
			this.buildBacklinksBox(article, sourcePath, page.number);
			await this.reattach(body, sourcePath);
		};

		const enqueue = (article: HTMLElement) => {
			const idx = parseInt(article.dataset.index || "-1", 10);
			if (rendered.has(idx)) return;
			if (queue.includes(article)) return;
			if (queue.length >= 3) return;
			queue.push(article);
			processQueue();
		};

		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) enqueue(entry.target as HTMLElement);
			}
		}, { root: null, rootMargin: "0px 0px", threshold: 0 });

		wrapper.querySelectorAll(".book-view-page").forEach((el) => observer.observe(el));
		const all = wrapper.querySelectorAll(".book-view-page");
		for (let i = 0; i < Math.min(3, all.length); i++) enqueue(all[i] as HTMLElement);
		(wrapper as any).__bvObserver = observer;
	}

	private injectFootnoteSyntax(markdown: string, footnotes: { num: string; text: string }[]): string {
		if (footnotes.length === 0) return markdown;
		let result = markdown;
		for (const fn of footnotes) {
			const refStr = "\\(" + fn.num + "\\)";
			result = result.split(refStr).join(`[^fn${fn.num}]`);
		}
		const defs = footnotes.map((fn) => {
			const lines = fn.text.split("\n");
			const first = lines[0];
			const rest = lines.slice(1).map((l) => "    " + l).join("\n");
			return `[^fn${fn.num}]: ${first}${rest ? "\n" + rest : ""}`;
		}).join("\n\n");
		return result + "\n\n" + defs;
	}

	private wrapFootnotes(article: HTMLElement, page: PageWithLines) {
		const slot = article.querySelector(".bv-footnotes-slot") as HTMLElement;
		if (!slot) return;
		const body = article.querySelector(".book-view-page-body") as HTMLElement;
		if (!body) return;
		const fnSection = body.querySelector("section.footnotes, .footnotes") as HTMLElement | null;
		if (!fnSection || page.footnotes.length === 0) { slot.remove(); return; }
		
		const box = document.createElement("div");
		box.className = "bv-footnotes";
		const inner = document.createElement("div");
		inner.className = "bv-footnotes-body";
		const items = fnSection.querySelectorAll("li, .footnote-item");
		
		let i = 0;
		items.forEach((li) => {
			const item = document.createElement("div");
			item.className = "bv-footnote-item";
			const fn = page.footnotes[i];
			if (fn) item.dataset.fn = fn.num;

			const num = document.createElement("span");
			num.className = "bv-footnote-num";
			num.textContent = fn?.num ?? String(i + 1);
			item.appendChild(num);

			const content = document.createElement("span");
			content.className = "bv-footnote-content";
			while (li.firstChild) content.appendChild(li.firstChild);
			
			// 🔑 حذف فلش برگشت (↩︎) از انتهای پاورقی
			content.querySelectorAll("a.footnote-backref, .footnote-backref, .footnote-back-link, a[href^='#fnref-']").forEach((el) => el.remove());
			// حذف هر ↩︎ باقی‌مانده در متن
			content.querySelectorAll("a").forEach((a) => {
				if ((a.textContent || "").includes("↩")) a.remove();
			});
			
			item.appendChild(content);

			const editBtn = document.createElement("button");
			editBtn.textContent = "✎";
			editBtn.title = "ویرایش این پاورقی";
			editBtn.style.cssText = "background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;padding:0 4px;margin-right:4px;opacity:0.4;transition:opacity 0.2s";
			editBtn.addEventListener("mouseenter", () => editBtn.style.opacity = "1");
			editBtn.addEventListener("mouseleave", () => editBtn.style.opacity = "0.4");
			editBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.editFootnote(article, page, i, content, this.currentSourcePath);
			};
			item.appendChild(editBtn);

			inner.appendChild(item);
			i++;
		});
		box.appendChild(inner);
		fnSection.remove();
		slot.appendChild(box);
	}

	/**
	 * 🔑 ویرایش پاورقی
	 */
	private async editFootnote(
		article: HTMLElement,
		page: PageWithLines,
		index: number,
		contentEl: HTMLElement,
		sourcePath: string
	) {
		if (contentEl.querySelector(".bv-fn-edit")) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		
		// متن پاورقی بدون فلش برگشت
		const cloneForText = contentEl.cloneNode(true) as HTMLElement;
		cloneForText.querySelectorAll("a.footnote-backref, .footnote-backref, .footnote-back-link, a[href^='#fnref-']").forEach((el) => el.remove());
		cloneForText.querySelectorAll("a").forEach((a) => {
			if ((a.textContent || "").includes("↩")) a.remove();
		});
		const originalText = (cloneForText.textContent || "").trim();
		const num = page.footnotes[index]?.num || String(index + 1);

		const originalHTML = contentEl.innerHTML;
		contentEl.innerHTML = "";

		// 🔑 استایل از خود محتوا (body) بگیر، نه از span.p
		const bodyEl = article.querySelector(".book-view-page-body") as HTMLElement;
		const computed = bodyEl ? getComputedStyle(bodyEl) : getComputedStyle(contentEl);
		const bodyFontSize = computed.fontSize || "16px";
		const bodyLineHeight = computed.lineHeight || "1.9";
		const bodyFontFamily = computed.fontFamily || "inherit";
		const bodyColor = computed.color || "#1a1a1a";

		console.log("[FnEdit] num:", num, "| text:", JSON.stringify(originalText.slice(0, 50)), "| fs:", bodyFontSize);

		const ta = document.createElement("textarea");
		ta.value = originalText;
		ta.className = "bv-fn-edit";
		ta.setAttribute("dir", "rtl");
		ta.style.setProperty("width", "100%", "important");
		ta.style.setProperty("min-height", "60px", "important");
		ta.style.setProperty("padding", "0", "important");
		ta.style.setProperty("border", "none", "important");
		ta.style.setProperty("outline", "none", "important");
		ta.style.setProperty("box-shadow", "none", "important");
		const colors = this.getEditColors(article);
		ta.style.setProperty("background", colors.bg, "important");
		ta.style.setProperty("color", colors.text, "important");
		ta.style.setProperty("caret-color", colors.caret, "important");
		ta.style.setProperty("box-shadow", "inset 0 0 0 2px " + colors.border, "important");
		ta.style.setProperty("border-radius", "4px", "important");
		ta.style.setProperty("padding", "6px 8px", "important");
		ta.style.setProperty("font-family", bodyFontFamily, "important");
		ta.style.setProperty("font-size", bodyFontSize, "important");
		ta.style.setProperty("line-height", bodyLineHeight, "important");
		ta.style.setProperty("resize", "none", "important");
		ta.style.setProperty("box-sizing", "border-box", "important");
		ta.style.setProperty("direction", "rtl", "important");
		ta.style.setProperty("text-align", "justify", "important");
		contentEl.appendChild(ta);
		ta.focus();
		ta.setSelectionRange(ta.value.length, ta.value.length);

		const autoResize = () => {
			ta.style.setProperty("height", "auto", "important");
			ta.style.setProperty("height", ta.scrollHeight + "px", "important");
		};
		autoResize();
		ta.addEventListener("input", autoResize);

		const save = async () => {
			const newText = ta.value.trim();
			if (newText === originalText) {
				contentEl.innerHTML = originalHTML;
				return;
			}

			const lines2 = raw.split(/\r?\n/);
			let fnLineIdx = -1;
			for (let i = 0; i < lines2.length; i++) {
				const t = lines2[i].trim();
				const m = t.match(new RegExp("^(" + num + ")\\)\\s*(.*)$"));
				if (m) {
					fnLineIdx = i;
					break;
				}
			}

			if (fnLineIdx === -1) {
				new Notice("❌ پاورقی توی فایل پیدا نشد");
				contentEl.innerHTML = originalHTML;
				return;
			}

			let endIdx = fnLineIdx + 1;
			while (endIdx < lines2.length) {
				const t = lines2[endIdx].trim();
				const nextFn = t.match(/^(\d+)\)/);
				if (nextFn) break;
				if (/^[\\_ ]{3,}$/.test(t)) break;
				endIdx++;
			}

			const beforeLines = lines2.slice(0, fnLineIdx);
			const afterLines = lines2.slice(endIdx);
			const newFnLines = [`${num}) ${newText}`];

			const newContent = [...beforeLines, ...newFnLines, ...afterLines].join("\n");
			await this.app.vault.modify(file, newContent);

			contentEl.innerHTML = "";
			const clone = document.createElement("span");
			clone.textContent = newText;
			contentEl.appendChild(clone);

			new Notice("✅ پاورقی ذخیره شد");
		};

		const cancel = () => {
			contentEl.innerHTML = originalHTML;
		};

		ta.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				save();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cancel();
			}
		});

		ta.addEventListener("blur", () => {
			setTimeout(() => {
				if (contentEl.querySelector(".bv-fn-edit")) save();
			}, 150);
		});
	}

	/**
	 * 🔑 پیدا کردن فایل‌هایی که به این صفحه لینک دارن
	 */
	private findBacklinks(sourcePath: string, pageNum: string): { file: TFile; label: string; anchor: string }[] {
		const results: { file: TFile; label: string; anchor: string }[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();
		const sourceBasename = sourcePath.replace(/\.md$/i, "").split("/").pop() || "";
		const sourceFullPath = sourcePath.replace(/\.md$/i, "");
		
		const pageNumPattern = pageNum.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
		
		for (const f of allFiles) {
			if (f.path === sourcePath) continue;
			const cache = this.app.metadataCache.getCache(f.path);
			if (!cache) continue;
			
			const links = cache.links || [];
			for (const link of links) {
				const linkPath = link.link;
				if (!linkPath) continue;
				
				const linkBase = linkPath.split("#")[0];
				const linkAnchor = linkPath.split("#")[1] || "";
				
				const matchesFile = 
					linkBase === sourceBasename ||
					linkBase === sourceFullPath ||
					linkBase.endsWith("/" + sourceBasename) ||
					linkBase.toLowerCase() === sourceBasename.toLowerCase();
				
				if (!matchesFile) continue;
				
				// 🔑 اگه anchor داره و به این صفحه اشاره می‌کنه → جدا نشون بده
				if (linkAnchor) {
					const linkAnchorNorm = linkAnchor.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
					if (linkAnchorNorm === pageNumPattern) {
						results.push({ file: f, label: linkPath, anchor: linkAnchor });
					}
				} else {
					// 🔑 لینک بدون anchor → نشون بده (ولی بدون شماره صفحه)
					results.push({ file: f, label: linkPath, anchor: "" });
				}
			}
		}
		
		// حذف تکراری‌ها (با file.path)
		const seen = new Set<string>();
		return results.filter((r) => {
			if (seen.has(r.file.path)) return false;
			seen.add(r.file.path);
			return true;
		});
	}

	/**
	 * 🔑 ساخت باکس backlinks پایین پاورقی
	 */
	private buildBacklinksBox(article: HTMLElement, sourcePath: string, pageNum: string) {
		const backlinks = this.findBacklinks(sourcePath, pageNum);
		if (backlinks.length === 0) return;
		
		const existing = article.querySelector(".bv-backlinks");
		if (existing) existing.remove();
		
		const wrapper = article.querySelector(".book-view-page-body-wrapper");
		if (!wrapper) return;
		
		const box = document.createElement("div");
		box.className = "bv-backlinks";
		box.style.cssText = `
			margin-top: 20px;
			padding: 14px 16px;
			background: var(--background-secondary);
			border-radius: 10px;
			font-size: 0.95em;
			font-family: var(--bv-body-font, inherit);
			direction: rtl;
			line-height: 1.7;
		`;
		
		const root = article.closest(".book-view-root") as HTMLElement;
		const theme = root?.dataset?.theme || "white";
		if (theme === "black") box.style.background = "#262626";
		else if (theme === "cream") box.style.background = "#ece0c6";
		else if (theme === "milky") box.style.background = "#f2f0ea";
		else box.style.background = "#f7f7f7";
		
		const title = document.createElement("div");
		title.textContent = `🔗 لینک‌های ورودی (${backlinks.length})`;
		title.style.cssText = "font-weight:700;margin-bottom:12px;font-size:1em;";
		box.appendChild(title);
		
		const list = document.createElement("div");
		list.style.cssText = "display:flex;flex-direction:column;";
		
		backlinks.forEach((bl, idx) => {
			const item = document.createElement("div");
			item.style.cssText = `
				display:flex;flex-direction:column;gap:4px;padding:10px 6px;
				${idx < backlinks.length - 1 ? "border-bottom: 1px solid var(--background-modifier-border);" : ""}
			`;
			
			// 🔑 آدرس کامل فایل
			const fullPath = bl.file.path.replace(/\.md$/, "");
			const anchor = bl.anchor ? `#${bl.anchor}` : "";
			const displayPath = fullPath + anchor;
			
			const link = document.createElement("a");
			link.textContent = displayPath;
			link.className = "internal-link";
			link.dataset.href = bl.file.path;
			link.href = "#";
			link.style.cssText = "color:var(--text-accent);cursor:pointer;text-decoration:none;font-size:1em;word-break:break-all;";
			link.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openBacklink(bl.file, bl.label);
			});
			item.appendChild(link);
			
			// تعداد خط
			const meta = document.createElement("div");
			meta.style.cssText = "color:var(--text-muted);font-size:0.85em;";
			const lineCount = (bl.label || "").split("\n").length;
			if (bl.anchor) {
				meta.textContent = `صفحه ${bl.anchor}`;
			} else {
				meta.textContent = "کل فایل";
			}
			item.appendChild(meta);
			
			list.appendChild(item);
		});
		
		box.appendChild(list);
		wrapper.appendChild(box);
	}

	/**
	 * 🔑 باز کردن backlink: اگه بازه فعال، اگه نه split جدید
	 */
	private async openBacklink(file: TFile, label: string) {
		// ببین فایل از قبل توی یه leaf بازه
		let existingLeaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (existingLeaf) return;
			const v = leaf.view;
			if (v instanceof MarkdownView && v.file?.path === file.path) {
				existingLeaf = leaf;
			}
		});

		let targetLeaf: WorkspaceLeaf;
		if (existingLeaf) {
			targetLeaf = existingLeaf;
			this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
		} else {
			// 🔑 split جدید
			targetLeaf = this.app.workspace.getLeaf("split", "vertical");
			await targetLeaf.openFile(file);
		}

		// اگه anchor داره (مثلاً #58)، برو به اون صفحه
		const anchor = label.includes("#") ? label.split("#")[1] : "";
		if (anchor) {
			await new Promise((r) => setTimeout(r, 500));
			const view = targetLeaf.view;
			if (view instanceof MarkdownView) {
				// اگه book-view هست، scrollToPage
				const containerEl = view.previewMode?.containerEl;
				if (containerEl?.querySelector(".book-view-root")) {
					this.scrollToPage(anchor, view);
				} else {
					// اگه note معمولیه، از openLinkText استفاده کن
					this.app.workspace.openLinkText(file.path + "#" + anchor, "", false);
				}
			}
		}
	}

	private applySettings(root: HTMLElement) {
		const s = this.settings;
		const bodyFont = s.bodyFont === "inherit" ? "var(--font-text, inherit)" : s.bodyFont;
		const headerFont = s.headerFont === "inherit" ? bodyFont : s.headerFont;
		root.style.setProperty("--bv-page-max-width", s.pageMaxWidth + "px");
		root.style.setProperty("--bv-page-min-height", s.pageMinHeight + "px");
		root.style.setProperty("--bv-page-padding", s.pagePadding + "px");
		root.style.setProperty("--bv-page-gap", s.pageGap + "px");
		root.style.setProperty("--bv-border-radius", s.borderRadius + "px");
		root.style.setProperty("--bv-body-font", bodyFont);
		root.style.setProperty("--bv-body-font-size", s.bodyFontSize + "px");
		root.style.setProperty("--bv-body-line-height", String(s.bodyLineHeight));
		root.style.setProperty("--bv-body-para-spacing", s.bodyParagraphSpacing + "em");
		root.style.setProperty("--bv-body-text-align", s.bodyTextAlign);
		root.style.setProperty("--bv-header-font", headerFont);
		root.style.setProperty("--bv-header-font-size", s.headerFontSize + "px");
		if (s.footnoteTextColor) root.style.setProperty("--bv-fn-text-color", s.footnoteTextColor);
		else root.style.removeProperty("--bv-fn-text-color");
		if (s.footnoteHighlightColor) root.style.setProperty("--bv-fn-highlight-color", s.footnoteHighlightColor);
		else root.style.removeProperty("--bv-fn-highlight-color");
		if (s.footnoteHighlightTextColor) root.style.setProperty("--bv-fn-highlight-text", s.footnoteHighlightTextColor);
		else root.style.removeProperty("--bv-fn-highlight-text");
		root.setAttribute("data-theme", s.theme);
		root.setAttribute("data-shadow", String(s.shadowLevel));
		root.setAttribute("data-border", s.showBorder ? "1" : "0");
	}
}
