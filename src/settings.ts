export type BookTheme = "white" | "milky" | "cream" | "black";
export type TextAlign = "justify" | "right" | "center";

export interface BookViewSettings {
	theme: BookTheme;
	borderRadius: number;
	shadowLevel: number;
	showBorder: boolean;
	pageMaxWidth: number;
	pageMinHeight: number;
	pagePadding: number;
	pageGap: number;

	bodyFont: string;
	bodyFontSize: number;
	bodyLineHeight: number;
	bodyParagraphSpacing: number;
	bodyTextAlign: TextAlign;

	headerFont: string;
	headerFontSize: number;

	footnoteTextColor: string;
	footnoteHighlightColor: string;
	footnoteHighlightTextColor: string;

	showLessonInHeader: boolean;
	showPageNumber: boolean;
	startPageNumber: number;
}

export const DEFAULT_SETTINGS: BookViewSettings = {
	theme: "white",
	borderRadius: 16,
	shadowLevel: 1,
	showBorder: true,
	pageMaxWidth: 900,
	pageMinHeight: 700,
	pagePadding: 26,
	pageGap: 24,

	bodyFont: "inherit",
	bodyFontSize: 16,
	bodyLineHeight: 1.9,
	bodyParagraphSpacing: 0.9,
	bodyTextAlign: "justify",

	headerFont: "inherit",
	headerFontSize: 13,

	footnoteTextColor: "",
	footnoteHighlightColor: "",
	footnoteHighlightTextColor: "",

	showLessonInHeader: true,
	showPageNumber: true,
	startPageNumber: 1,
};

export const THEME_LABELS: Record<BookTheme, string> = {
	white: "سفید", milky: "شیری", cream: "کرمی", black: "سیاه",
};

export const FONT_OPTIONS: Record<string, string> = {
	inherit: "پیش‌فرض Obsidian",
	"Vazirmatn, sans-serif": "وزیرمتن",
	"Sahel, sans-serif": "ساحل",
	"Shabnam, sans-serif": "شبنم",
	"Estedad, sans-serif": "استعداد",
	"IRANSans, sans-serif": "ایران‌سنس",
	"Tahoma, sans-serif": "Tahoma",
	"Georgia, serif": "Georgia",
};

export const SHADOW_LABELS: Record<number, string> = {
	0: "بدون سایه", 1: "ملایم", 2: "متوسط", 3: "برجسته",
};

export const ALIGN_LABELS: Record<TextAlign, string> = {
	justify: "هم‌تراز (Justify)", right: "راست", center: "وسط",
};
