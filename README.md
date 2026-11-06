# DocuView Pro

<div dir="rtl">

## 📖 نماینده‌ی ورد

نمایش یادداشت‌ها به شکل کتاب صفحه‌بندی‌شده با کارت‌های صفحه، پاورقی، کامنت و ایمپورت از Word.

## ✨ امکانات

- **نمایش صفحه‌ای** — هر یادداشت با `---` به کارت‌های صفحه تقسیم می‌شه
- **چهار تم** — سفید، شیری، کرمی، سیاه
- **کامنت** — روی هر متن کامنت رنگی بذار، با tooltip و ویرایش
- **ایمپورت Word** — فایل `.docx` رو مستقیم به یادداشت تبدیل کن
- **لینک به صفحه** — `[[file#58]]` باز می‌کنه و اسکرول می‌کنه به صفحه ۵۸ با هایلایت
- **ویرایش پاورقی** — پاورقی‌ها جدا از متن اصلی قابل ویرایشن
- **ویرایش صفحه** — کل صفحه رو ویرایش کن، پاورقی‌ها دست‌نخورده می‌مونن
- **بک‌لینک** — فایل‌هایی که به این صفحه لینک دارن، ته کارت نمایش داده می‌شن

## 🚀 استفاده

### فعال‌سازی روی یک یادداشت

به frontmatter یادداشت اضافه کن:

```yaml
---
book-view: true
---
بعد به Reading View برو. یادداشت به کارت‌های صفحه تبدیل می‌شه.

ساختار یادداشت

markdown
---
book-view: true
start-page: 58
start-page-old: 58
---

# درس چهارم

---

**(صفحه ۵۸)**

محتوای صفحه ۵۸...

---

**(صفحه ۵۹)**

محتوای صفحه ۵۹...
start-page — شماره‌ی صفحه‌ی اول (برای شماره‌گذاری خودکار وقتی (صفحه X) نیست)
start-page-old — برای بازمحاسبه‌ی لینک‌های صفحه بعد از تغییر start-page
لینک به یک صفحه

با [[file#58]] فایل باز می‌شه روی صفحه ۵۸.

اگه فایل از قبل توی split بازه → اسکرول و هایلایت
اگه نه → توی split جدید باز می‌شه
ایمپورت از Word

Settings → DocuView Pro
روی Import from Word کلیک کن
یه فایل .docx انتخاب کن
یادداشت جدید با book-view: true و جداکننده‌های صفحه ساخته می‌شه
⚙️ تنظیمات

تم — سفید / شیری / کرمی / سیاه
گردی گوشه‌ها — گردی کارت‌ها
شدت سایه — سایه‌ی کارت‌ها
عرض / ارتفاع / padding / فاصله‌ی کارت‌ها
فونت متن / اندازه / ارتفاع خط / فاصله‌ی پاراگراف / ترازبندی
فونت هدر / اندازه
رنگ‌های پاورقی — رنگ متن، پس‌زمینه‌ی هایلایت، متن هایلایت
شماره‌گذاری صفحه — نمایش/مخفی عنوان درس، نمایش/مخفی شماره صفحه، شروع شماره
📋 پیش‌نیازها

فقط دسکتاپ (برای ایمپورت Word از Node fs استفاده می‌کنه)
بدون وابستگی خارجی
📄 لایسنس

MIT

👤 نویسنده

محمدامین صدقی (Mohammad Amin Sedghi)

</div>
English

Display your notes as a paginated book with page cards, footnotes, comments, and Word import.

Features

Page-based rendering — Splits a note into visual page cards using --- as page separators
Four themes — White, milky, cream, and black
Comments — Select any text and add a colored comment with tooltip and inline editing
Word import — Convert .docx files into DocuView Pro notes automatically
Page links — Click [[file#58]] to open the file at page 58 with smooth scroll and highlight
Footnote editing — Edit footnotes independently from the main text
Page editing — Edit whole pages while keeping footnotes intact
Backlinks — See which files link to the current page at the bottom of each card
Usage

Enable DocuView Pro on a note

Add the following frontmatter to any note:

yaml
---
book-view: true
---
Then switch to Reading View. The note will render as a series of page cards.

Structure your note

markdown
---
book-view: true
start-page: 58
start-page-old: 58
---

# Lesson Four

---

**(صفحه ۵۸)**

Content of page 58...

---

**(صفحه ۵۹)**

Content of page 59...
start-page — The page number of the first page (used for auto-numbering when (صفحه X) is not present)
start-page-old — Used when recalculating page links after changing start-page
Link to a specific page

Use the syntax [[file#58]] to open file at page 58.

If the file is already open in a split, it scrolls to that page and highlights the text.
If not, it opens in a new split.
Import from Word

Open Settings → DocuView Pro
Click Import from Word
Select a .docx file
A new note is created with book-view: true and page separators
Settings

Theme — white / milky / cream / black
Border radius — card corner roundness
Shadow — card shadow intensity
Page width / height / padding / gap
Body font / size / line height / paragraph spacing / text align
Header font / size
Footnote colors — text color, highlight background, highlight text
Page numbering — show/hide lesson title, show/hide page number, start page
Requirements

Desktop only (uses Node fs for Word parsing)
No external dependencies
License

MIT

Author

Mohammad Amin Sedghi
