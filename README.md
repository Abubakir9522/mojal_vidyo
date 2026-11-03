# Vodiy Vidyo Edit

Android uchun vidyo muharrir, server bazasi va veb admin panel.

| Papka | Nima bor |
|---|---|
| `app/` | Ilova: TypeScript, Preact, WebGL2, WebCodecs, three.js, Capacitor |
| `app/android/` | Android loyihasi va galereyaga saqlash plagini |
| `server/` | Server: Node.js va SQLite. Tashqi paketsiz ishlaydi |
| `server/public/` | Admin panel |
| `.github/workflows/android.yml` | GitHub'da APK yig'ish va emulyatorda sinash |

## APK olish

1. Kodni GitHub repoga joylang.
2. Actions bo'limida `Android APK` ishga tushadi.
3. Sinovlar o'tgach, tayyor APK Releases bo'limida chiqadi. Oxirgi versiya har doim shu manzilda:
   `https://github.com/Abubakir9522/mojal_vidyo/releases/latest/download/VodiyVidyoEdit.apk`

Ilovaga server manzili kiritilishi uchun repo sozlamalarida `SERVER_URL` o'zgaruvchisini qo'shing
(Settings, Secrets and variables, Actions, Variables). Manzilni ilovaning Hisobim bo'limida ham kiritsa bo'ladi.

## Serverni ishga tushirish

Node.js 22.13 yoki yangisi kerak.

```
cd server
ADMIN_PASSWORD=parolingiz node server.js
```

Admin panel: `http://server-manzili:8080/admin/`

VPS uchun Docker bilan:

```
cd server
cp .env.example .env     # ichiga parol yozing
docker compose up -d --build
```

Telefon ilovasi faqat HTTPS manzilga ulanadi, shuning uchun server oldiga nginx va SSL sertifikat qo'ying.

Render.com'ning bepul tarifi faqat sinash uchun: u yerda disk yo'q, server qayta ishga tushganda foydalanuvchilar va musiqalar o'chib ketadi.

## Play Market'ga chiqarishdan oldin

`app/android/app/mojal-test.keystore` faqat sinov kaliti. Play Market uchun o'z kalitingizni yarating va `MOJAL_KEYSTORE`,
`MOJAL_KEYSTORE_PASSWORD`, `MOJAL_KEY_ALIAS`, `MOJAL_KEY_PASSWORD` muhit o'zgaruvchilari orqali bering.

## Ishlab chiqish

```
cd app
npm install
npx vite                 # brauzerda ochiladi: http://127.0.0.1:5199
npx tsc --noEmit         # turlarni tekshirish
node tests/fx.mjs        # barcha effekt va o'tishlarni sinash
node tests/export.mjs    # haqiqiy MP4 eksportini sinash
node tests/ui2.mjs       # avto montaj va eksportni ekran orqali sinash
node scripts/make-thumbs.mjs   # effekt va shablon rasmlarini qayta chizish
node scripts/make-seed.mjs     # server uchun katalog ro'yxatini yangilash
cd ../server && npm test
```

Effekt yoki shablon qo'shgandan keyin `make-thumbs` va `make-seed` ni ishga tushiring.
