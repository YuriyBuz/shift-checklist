# Перевірка клієнта майстра без Google

    node tools/mock_server.js                       # підробний бекенд, 127.0.0.1:8732
    node tools/e2e.js                               # прогін у Chromium

`mock_server.js` віддає справжній `check-list-master.html`, підмінивши в ньому
`GOOGLE_SCRIPT_URL` на себе, і відповідає так само, як `Code.gs` проєкту
`mechanic-checklist`. Стан скидається через `GET /reset`.

Перевіряється: вхід за PIN, відмова на спільному «1111», відмова механікові
(роль `mech.use` не має права на чек-лист майстра), склад payload
(`item_id` = `master.s1-1`…, без текстів пунктів і без списку одержувачів),
дата за Києвом, черга при втраті зв'язку, поведінка на протухлій сесії.
Також: кнопка «Не на зміні» біля пункту 3 (дія `attendance`), час натискання
в payload (`answered_at`) і сторінка графіка `schedule.html` (`/schedule.html`,
дія `getSchedule`) — лише перегляд, той самий вхід за PIN, жодних полів для змін.

Tailwind вантажиться з CDN. Якщо його немає (пісочниця без інтернету), сервер
підставляє `.hidden{display:none}`. Щоб знімати екрани з реальним оформленням:

    npx tailwindcss@3 -i tw.css -o tw.out.css --content check-list-master.html --minify
    TW_CSS=$PWD/tw.out.css node tools/mock_server.js
