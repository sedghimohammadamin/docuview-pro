export interface RawPage {
	number: string;
	lesson: string;
	markdown: string;
	footnotes: { num: string; text: string }[];
}
