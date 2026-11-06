#!/usr/bin/env node
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const CACHE = "/tmp/plugins.json";
const PLUGINS_URL =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";

const c = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m",
};
const ok = (s) => console.log(`${c.green}✅ ${s}${c.reset}`);
const err = (s) => console.log(`${c.red}❌ ${s}${c.reset}`);
const info = (s) => console.log(`${c.cyan}ℹ️  ${s}${c.reset}`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8"));
} catch (e) {
  err("نمی‌توان manifest.json را خواند: " + e.message);
  process.exit(1);
}

console.log(`${c.bold}\n📦 پلاگین: ${manifest.name} (id: ${manifest.id})${c.reset}\n`);

console.log(`${c.bold}── اعتبارسنجی محلی ──${c.reset}`);
let localErrors = 0;

if (!manifest.id) { err("فیلد id وجود ندارد."); localErrors++; }
else if (!/^[a-z0-9-]+$/.test(manifest.id)) { err(`id «${manifest.id}» نامعتبر.`); localErrors++; }
else if (manifest.id.endsWith("plugin")) { err(`id نباید به «plugin» ختم شود.`); localErrors++; }
else if (manifest.id.includes("obsidian")) { err(`id نباید شامل «obsidian» باشد.`); localErrors++; }
else ok(`id «${manifest.id}» معتبر است.`);

if (!manifest.name) { err("فیلد name وجود ندارد."); localErrors++; }
else if (/obsidian/i.test(manifest.name)) { err(`name نباید شامل «Obsidian» باشد.`); localErrors++; }
else if (/plugin$/i.test(manifest.name)) { err(`name نباید به «Plugin» ختم شود.`); localErrors++; }
else ok(`name «${manifest.name}» معتبر است.`);

if (!manifest.version) { err("فیلد version وجود ندارد."); localErrors++; }
else if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) { err(`version «${manifest.version}» نامعتبر.`); localErrors++; }
else ok(`version «${manifest.version}» معتبر است.`);

for (const field of ["minAppVersion", "description", "author"]) {
  if (!manifest[field]) { err(`فیلد ${field} وجود ندارد.`); localErrors++; }
}
if (localErrors === 0) ok("همه‌ی فیلدهای محلی معتبرند.\n");
else console.log();

console.log(`${c.bold}── بررسی تداخل با فروشگاه Obsidian ──${c.reset}`);

let plugins;
if (existsSync(CACHE)) {
  info(`استفاده از کش ${CACHE}`);
  plugins = JSON.parse(readFileSync(CACHE, "utf8"));
} else {
  info("در حال دریافت لیست پلاگین‌ها از GitHub...");
  try {
    const res = await fetch(PLUGINS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    plugins = await res.json();
  } catch (e) {
    err("دریافت لیست ناموفق: " + e.message);
    err("اتصال اینترنت را چک کنید یا فایل کش را دستی بسازید.");
    process.exit(2);
  }
}
ok(`لیست ${plugins.length} پلاگین بررسی شد.\n`);

const conflictId = plugins.find((p) => p.id === manifest.id);
const conflictName = plugins.find(
  (p) => p.name.toLowerCase() === manifest.name.toLowerCase()
);

let conflicts = 0;
if (conflictId) {
  err(`تداخل id! «${conflictId.name}» از قبل id «${manifest.id}» را دارد.`);
  info(`   مخزن: https://github.com/${conflictId.repo}`);
  conflicts++;
} else ok(`id «${manifest.id}» یکتاست.`);

if (conflictName) {
  err(`تداخل name! «${conflictName.name}» از قبل همین نام را دارد.`);
  info(`   id موجود: «${conflictName.id}»`);
  info(`   مخزن: https://github.com/${conflictName.repo}`);
  conflicts++;
} else ok(`name «${manifest.name}» یکتاست.`);

console.log(`\n${c.bold}── جمع‌بندی ──${c.reset}`);
if (localErrors === 0 && conflicts === 0) {
  console.log(`${c.green}${c.bold}🎉 آماده ارسال!${c.reset}\n`);
  process.exit(0);
} else {
  console.log(
    `${c.red}${c.bold}❌ ${localErrors} خطای محلی، ${conflicts} تداخل.${c.reset}\n`
  );
  process.exit(1);
}
