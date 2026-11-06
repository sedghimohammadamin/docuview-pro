# DocuView Pro

Display your Obsidian notes as paginated book pages — with page cards, footnotes, colorful comments, highlights, and Word import.

## Features

- **Paginated view** — each note is split into page cards by `---`
- **Four themes** — white, milky, cream, black
- **Comments** — add colorful comments on any text, with tooltip and editing
- **Word import** — convert `.docx` files directly to notes
- **Page links** — `[[file#58]]` opens and scrolls to page 58 with highlight
- **Footnote editing** — footnotes are editable separately from main text
- **Page editing** — edit the whole page, footnotes stay intact
- **Backlinks** — files that link to this page are shown at the bottom
- **Text highlight** — right-click on a paragraph to highlight

## Usage

1. Create a note with this frontmatter:

    ---
    book-view: true
    ---

2. Separate pages with `---`:

    ---
    book-view: true
    ---

    # Lesson title

    (page 1)

    First page text...

    ---

    (page 2)

    Second page text...

3. Open the note in Preview mode — it renders as a book automatically.

## Word Import

1. Settings → DocuView Pro → Import from Word
2. Select a `.docx` file
3. A new note with auto-pagination is created

## Shortcuts

- **Right-click** on a paragraph → highlight
- **Cmd/Ctrl + Enter** in edit mode → save
- **Esc** in edit mode → cancel

## Settings

| Setting | Description |
|---------|-------------|
| Theme | White, milky, cream, black |
| Card width | Page card width (px) |
| Body font | Body text font and size |
| Header font | Header font and size |
| Footnote color | Footnote text and highlight color |
| Start page number | If numbers don't match Word |
| Show lesson title | Show H1 at top of each page |
| Show page number | Show number in header |

## Installation

### From Obsidian Community Plugins

Settings → Community Plugins → Browse → search: **DocuView Pro**

### Manual

1. Download from [Releases](https://github.com/sedghimohammadamin/docuview-pro/releases)
2. Place `main.js`, `manifest.json`, `styles.css` in `.obsidian/plugins/docuview-pro/`
3. Restart Obsidian
4. Settings → Community Plugins → DocuView Pro → Enable

### BRAT

1. Install BRAT
2. Add Beta Plugin → `sedghimohammadamin/docuview-pro`

## License

MIT — [LICENSE](LICENSE)

## Author

Mohammad Amin Sedghi

---

<div dir="rtl">

## 📖 نسخه فارسی

نمایش صفحه‌بندی‌شده یادداشت‌های Obsidian به شکل کتاب — با کارت‌های صفحه، پاورقی، کامنت رنگی، هایلایت و ایمپورت از Word.

### ✨ امکانات

- **نمایش صفحه‌ای** — هر یادداشت با `---` به کارت‌های صفحه تقسیم می‌شود
- **چهار تم** — سفید، شیری، کرمی، سیاه
- **کامنت** — روی هر متن کامنت رنگی بگذار، با tooltip و ویرایش
- **ایمپورت Word** — فایل `.docx` را مستقیم به یادداشت تبدیل کن
- **لینک به صفحه** — `[[file#58]]` باز می‌کند و اسکرول می‌کند به صفحه ۵۸ با هایلایت
- **ویرایش پاورقی** — پاورقی‌ها جدا از متن اصلی قابل ویرایش‌اند
- **ویرایش صفحه** — کل صفحه را ویرایش کن، پاورقی‌ها دست‌نخورده می‌مانند
- **بک‌لینک** — فایل‌هایی که به این صفحه لینک دارند، ته کارت نمایش داده می‌شوند
- **هایلایت متن** — راست‌کلیک روی پاراگراف برای هایلایت

### 🚀 استفاده

۱. یک یادداشت با frontmatter زیر بساز:

    ---
    book-view: true
    ---

۲. صفحات را با `---` از هم جدا کن:

    ---
    book-view: true
    ---

    # عنوان درس

    (صفحه ۱)

    متن صفحه اول...

    ---

    (صفحه ۲)

    متن صفحه دوم...

۳. یادداشت را در حالت Preview باز کن — خودکار به شکل کتاب نمایش داده می‌شود.

### 📄 ایمپورت از Word

۱. Settings → DocuView Pro → ایمپورت از Word
۲. فایل `.docx` را انتخاب کن
۳. یادداشت جدید با صفحه‌بندی خودکار ساخته می‌شود

### ⌨️ میان‌برها

- **راست‌کلیک** روی پاراگراف → هایلایت
- **Cmd/Ctrl + Enter** در ویرایش → ذخیره
- **Esc** در ویرایش → لغو

### ⚙️ تنظیمات

| تنظیم | توضیح |
|--------|-------|
| تم رنگ | سفید، شیری، کرمی، سیاه |
| عرض کارت | عرض کارت صفحه (px) |
| فونت متن | فونت و اندازه متن صفحه |
| فونت هدر | فونت و اندازه هدر |
| رنگ پاورقی | رنگ متن و هایلایت پاورقی |
| شروع شماره صفحه | اگر شماره‌ها با Word نمی‌خواند |
| نمایش عنوان درس | نمایش H1 بالای هر صفحه |
| نمایش شماره صفحه | نمایش شماره در هدر |

### 🛠 نصب

#### از فروشگاه Obsidian

Settings → Community Plugins → Browse → جستجو: **DocuView Pro**

#### دستی

۱. از [Releases](https://github.com/sedghimohammadamin/docuview-pro/releases) دانلود کن
۲. سه فایل `main.js`، `manifest.json`، `styles.css` را در `.obsidian/plugins/docuview-pro/` بگذار
۳. Obsidian را ری‌استارت کن
۴. Settings → Community Plugins → DocuView Pro → Enable

### 📝 مجوز

MIT — [LICENSE](LICENSE)

### 👤 نویسنده

Mohammad Amin Sedghi

</div>
