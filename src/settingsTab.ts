import { App, PluginSettingTab, Setting } from "obsidian";
import type BookViewPlugin from "./main";
import {
	BookTheme, FONT_OPTIONS, SHADOW_LABELS, ALIGN_LABELS,
	THEME_LABELS, TextAlign,
} from "./settings";

export class BookViewSettingTab extends PluginSettingTab {
	plugin: BookViewPlugin;
	constructor(app: App, plugin: BookViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("book-view-settings");

		// ═══════ هدر ═══════
		const header = containerEl.createDiv({ cls: "bv-settings-header" });
		new Setting(header)
			.setName("📖 Book view")
			.setHeading();
		header.createEl("p", {
			text: "نمایش یادداشت‌ها به شکل کتاب صفحه‌بندی‌شده",
			cls: "bv-settings-subtitle",
		});

		// ═══════ ظاهر ═══════
		this.section(containerEl, "🎨 ظاهر", "رنگ و استایل کارت‌ها", (box) => {
			new Setting(box).setName("تم رنگ").setDesc("رنگ پس‌زمینه کارت صفحه‌ها")
				.addDropdown((dd) => {
					for (const k of Object.keys(THEME_LABELS) as BookTheme[])
						dd.addOption(k, THEME_LABELS[k]);
					dd.setValue(this.plugin.settings.theme);
					dd.onChange((v) => {
						this.plugin.settings.theme = v as BookTheme;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					});
				});
			new Setting(box).setName("گردی گوشه‌ها").addSlider((s) =>
				s.setLimits(0, 32, 1).setValue(this.plugin.settings.borderRadius)
					.onChange((v) => {
						this.plugin.settings.borderRadius = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("شدت سایه").addDropdown((dd) => {
				for (const k of Object.keys(SHADOW_LABELS))
					dd.addOption(k, SHADOW_LABELS[Number(k)]);
				dd.setValue(String(this.plugin.settings.shadowLevel));
				dd.onChange((v) => {
					this.plugin.settings.shadowLevel = Number(v);
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				});
			});
			new Setting(box).setName("نمایش قاب").addToggle((t) =>
				t.setValue(this.plugin.settings.showBorder).onChange((v) => {
					this.plugin.settings.showBorder = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				}));
		});

		// ═══════ چیدمان ═══════
		this.section(containerEl, "📐 چیدمان", "ابعاد و فاصله‌ها", (box) => {
			new Setting(box).setName("عرض کارت (px)").addSlider((s) =>
				s.setLimits(500, 1400, 20).setValue(this.plugin.settings.pageMaxWidth)
					.onChange((v) => {
						this.plugin.settings.pageMaxWidth = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("حداقل ارتفاع کارت (px)").addSlider((s) =>
				s.setLimits(300, 1500, 50).setValue(this.plugin.settings.pageMinHeight)
					.onChange((v) => {
						this.plugin.settings.pageMinHeight = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("فاصله داخلی کارت (px)").addSlider((s) =>
				s.setLimits(10, 60, 2).setValue(this.plugin.settings.pagePadding)
					.onChange((v) => {
						this.plugin.settings.pagePadding = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("فاصله بین کارت‌ها (px)").addSlider((s) =>
				s.setLimits(0, 80, 4).setValue(this.plugin.settings.pageGap)
					.onChange((v) => {
						this.plugin.settings.pageGap = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
		});

		// ═══════ فونت متن ═══════
		this.section(containerEl, "✍️ فونت متن", "فونت و اندازه متن صفحه‌ها", (box) => {
			new Setting(box).setName("فونت متن").addDropdown((dd) => {
				for (const [key, label] of Object.entries(FONT_OPTIONS))
					dd.addOption(key, label);
				dd.setValue(this.plugin.settings.bodyFont);
				dd.onChange((v) => {
					this.plugin.settings.bodyFont = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				});
			});
			new Setting(box).setName("اندازه فونت متن (px)").addSlider((s) =>
				s.setLimits(12, 26, 1).setValue(this.plugin.settings.bodyFontSize)
					.onChange((v) => {
						this.plugin.settings.bodyFontSize = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("ارتفاع خط").addSlider((s) =>
				s.setLimits(1.4, 2.6, 0.05).setValue(this.plugin.settings.bodyLineHeight)
					.onChange((v) => {
						this.plugin.settings.bodyLineHeight = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("فاصله بین پاراگراف‌ها").addSlider((s) =>
				s.setLimits(0, 2, 0.1).setValue(this.plugin.settings.bodyParagraphSpacing)
					.onChange((v) => {
						this.plugin.settings.bodyParagraphSpacing = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
			new Setting(box).setName("ترازبندی متن").addDropdown((dd) => {
				for (const [k, label] of Object.entries(ALIGN_LABELS))
					dd.addOption(k, label);
				dd.setValue(this.plugin.settings.bodyTextAlign);
				dd.onChange((v) => {
					this.plugin.settings.bodyTextAlign = v as TextAlign;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				});
			});
		});

		// ═══════ فونت هدر ═══════
		this.section(containerEl, "📋 فونت هدر", "فونت هدر و شماره صفحه", (box) => {
			new Setting(box).setName("فونت هدر").addDropdown((dd) => {
				for (const [key, label] of Object.entries(FONT_OPTIONS))
					dd.addOption(key, label);
				dd.setValue(this.plugin.settings.headerFont);
				dd.onChange((v) => {
					this.plugin.settings.headerFont = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				});
			});
			new Setting(box).setName("اندازه فونت هدر (px)").addSlider((s) =>
				s.setLimits(9, 20, 1).setValue(this.plugin.settings.headerFontSize)
					.onChange((v) => {
						this.plugin.settings.headerFontSize = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
					}));
		});

		// ═══════ پاورقی ═══════
		this.section(containerEl, "📌 پاورقی", "رنگ‌های پاورقی و هایلایت", (box) => {
			// رنگ متن پاورقی
			const s1 = new Setting(box)
				.setName("رنگ متن پاورقی")
				.setDesc("خالی = پیش‌فرض تم");
			const w1 = s1.controlEl.createDiv({ cls: "bv-color-row" });
			const c1 = w1.createEl("input", { attr: { type: "color" } });
			c1.value = this.plugin.settings.footnoteTextColor || "#888888";
			c1.addEventListener("input", () => {
				this.plugin.settings.footnoteTextColor = c1.value;
				void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
			});
			const r1 = w1.createEl("button", {
				text: "ریست",
				cls: "bv-color-reset",
			});
			r1.addEventListener("click", () => {
				this.plugin.settings.footnoteTextColor = "";
				void this.plugin.saveSettings().then(() => {
					this.plugin.refreshAll();
					this.display();
				});
			});

			// رنگ هایلایت
			const s2 = new Setting(box)
				.setName("رنگ پس‌زمینه هایلایت")
				.setDesc("رنگ پس‌زمینه وقتی روی شماره کلیک می‌کنی");
			const w2 = s2.controlEl.createDiv({ cls: "bv-color-row" });
			const c2 = w2.createEl("input", { attr: { type: "color" } });
			c2.value = this.plugin.settings.footnoteHighlightColor || "#ffcc00";
			c2.addEventListener("input", () => {
				this.plugin.settings.footnoteHighlightColor = c2.value;
				void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
			});
			const r2 = w2.createEl("button", {
				text: "ریست",
				cls: "bv-color-reset",
			});
			r2.addEventListener("click", () => {
				this.plugin.settings.footnoteHighlightColor = "";
				void this.plugin.saveSettings().then(() => {
					this.plugin.refreshAll();
					this.display();
				});
			});

			// رنگ متن هایلایت
			const s3 = new Setting(box)
				.setName("رنگ متن هایلایت")
				.setDesc("رنگ متن داخل پاورقی وقتی هایلایت شده");
			const w3 = s3.controlEl.createDiv({ cls: "bv-color-row" });
			const c3 = w3.createEl("input", { attr: { type: "color" } });
			c3.value = this.plugin.settings.footnoteHighlightTextColor || "#000000";
			c3.addEventListener("input", () => {
				this.plugin.settings.footnoteHighlightTextColor = c3.value;
				void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
			});
			const r3 = w3.createEl("button", {
				text: "ریست",
				cls: "bv-color-reset",
			});
			r3.addEventListener("click", () => {
				this.plugin.settings.footnoteHighlightTextColor = "";
				void this.plugin.saveSettings().then(() => {
					this.plugin.refreshAll();
					this.display();
				});
			});
		});

		// ═══════ محتوای هدر ═══════
		this.section(containerEl, "🎯 محتوای هدر", "چی نشون داده بشه", (box) => {
			new Setting(box).setName("نمایش عنوان درس").addToggle((t) =>
				t.setValue(this.plugin.settings.showLessonInHeader).onChange((v) => {
					this.plugin.settings.showLessonInHeader = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				}));
			new Setting(box).setName("نمایش شماره صفحه").addToggle((t) =>
				t.setValue(this.plugin.settings.showPageNumber).onChange((v) => {
					this.plugin.settings.showPageNumber = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
				}));
			new Setting(box).setName("شروع شماره صفحه از")
				.setDesc("اگه شماره‌ها با Word نمی‌خونه، اینجا عدد درست رو بذار")
				.addText((t) =>
					t.setPlaceholder("۱")
						.setValue(String(this.plugin.settings.startPageNumber))
						.onChange((v) => {
							const n = parseInt(v, 10);
							if (!isNaN(n) && n >= 0) {
								this.plugin.settings.startPageNumber = n;
								void this.plugin.saveSettings().then(() => this.plugin.refreshAll());
							}
						}));
		});

		// ═══════ ایمپورت Word ═══════
		const importSection = containerEl.createDiv({ cls: "bv-settings-section" });
		const head = importSection.createDiv({ cls: "bv-section-head" });
		new Setting(head)
			.setName("📄 ایمپورت از Word")
			.setHeading();
		head.createEl("p", {
			text: "فایل .docx را به یادداشت Book View تبدیل کن",
			cls: "bv-section-desc",
		});

		const box = importSection.createDiv({ cls: "bv-section-box" });
		const note = box.createDiv({ cls: "bv-import-note" });
		note.createEl("p", {
			text: "فایل Word خود را انتخاب کنید. متن استخراج می‌شود و یادداشت جدیدی در vault ساخته می‌شود.",
		});

		const fileInput = box.createEl("input", {
			attr: { type: "file", accept: ".docx" },
		});
		fileInput.addClass("bv-hidden-input");
		fileInput.addEventListener("change", () => {
			const f = fileInput.files?.[0];
			if (!f) return;
			void this.plugin.importWordFile(f).finally(() => {
				fileInput.value = "";
			});
		});

		const btn = box.createEl("button", {
			text: "📂 انتخاب فایل Word",
			cls: "mod-cta bv-import-btn",
		});
		btn.addEventListener("click", () => fileInput.click());
	}

	private section(
		parent: HTMLElement, title: string, desc: string,
		builder: (box: HTMLElement) => void
	) {
		const section = parent.createDiv({ cls: "bv-settings-section" });
		const head = section.createDiv({ cls: "bv-section-head" });
		new Setting(head)
			.setName(title)
			.setHeading();
		head.createEl("p", { text: desc, cls: "bv-section-desc" });
		const box = section.createDiv({ cls: "bv-section-box" });
		builder(box);
	}
}
