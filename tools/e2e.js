/* Клієнт майстра в браузері: вхід за PIN, ролі, склад payload, черга. */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8732';
const EXE = process.env.CHROME || '/opt/pw-browsers/chromium';  // браузер пісочниці
let fails = 0;
const t = (n, c) => { console.log((c ? '  ✅ ' : '  ❌ ') + n); if (!c) fails++; };

(async () => {
  await fetch(BASE + '/reset');
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  const shown = () => page.locator('#authOverlay').evaluate(e => !e.classList.contains('hidden'));
  const err = () => page.locator('#authError').textContent();
  const dlgOpen = () => page.locator('#customDialogOverlay').evaluate(e => !e.classList.contains('hidden'));
  const dlgText = () => page.locator('#customDialogMessage').textContent();
  const closeDlg = async () => { if (await dlgOpen()) {
    await page.locator('#customDialogButtons button').last().click(); await page.waitForTimeout(200); } };
  const left = () => page.locator('#currentStatus').textContent();
  const queueLen = () => page.evaluate(() =>
    JSON.parse(localStorage.getItem('offlineMasterReportsQueue') || '[]').length);
  const fill = () => page.evaluate(() => {
    document.querySelectorAll('#startShiftSection .checklist-item')
      .forEach(el => el.querySelector('.option-btn').click());
  });
  const send = async () => {
    await page.click('#mainSubmitBtn'); await page.waitForTimeout(300);
    await page.click('#submitReportBtn'); await page.waitForTimeout(1700);
  };

  console.log('\n── екран входу ──');
  await page.goto(BASE + '/app'); await page.waitForTimeout(700);
  t('без сесії показано вхід', await shown());
  t('панелі зміни PIN немає', (await page.locator('#authChangePane').count()) === 0);

  await page.fill('#authPin', '0000'); await page.click('#authLoginBtn'); await page.waitForTimeout(400);
  t('невірний PIN → повідомлення', (await err()).includes('Невірний PIN'));

  await page.fill('#authPin', '1111'); await page.click('#authLoginBtn'); await page.waitForTimeout(400);
  t('спільний PIN не пускає', (await err()).includes('кількома працівниками'));

  await page.fill('#authPin', '2468'); await page.click('#authLoginBtn'); await page.waitForTimeout(500);
  t('механіка в чек-лист майстра не пускає', (await err()).includes('не дає доступу до чек-листа майстра'));

  console.log('\n── успішний вхід ──');
  await page.fill('#authPin', '8294'); await page.click('#authLoginBtn'); await page.waitForTimeout(900);
  t('оверлей закрито', !(await shown()));
  const sel = page.locator('#employeeSelect');
  t('прізвище з входу', (await sel.inputValue()) === 'Шута Олександра Сергіівна');
  t('список заблоковано', await sel.isDisabled());
  t('PIN ніде не збережено',
    !(await page.evaluate(() => JSON.stringify(localStorage).includes('8294'))));
  t('офлайн-перевірник збережено',
    await page.evaluate(() => !!localStorage.getItem('masterOfflineUnlockV1')));

  console.log('\n── пункт 3: хто не на зміні ──');
  const absBtn = page.locator('#start-s1-3 .absence-btn');
  await page.waitForTimeout(500);
  t('кнопка біля пункту 3 видна', await absBtn.isVisible());
  t('  червона, блимає і каже скільки', (await absBtn.textContent()).includes('Не на зміні: 3') &&
    await absBtn.evaluate(e => e.classList.contains('blink') && getComputedStyle(e).animationName === 'absenceBlink'));
  t('  в інших пунктах такої кнопки немає', (await page.locator('.absence-btn').count()) === 1);
  await absBtn.click(); await page.waitForTimeout(400);
  const absTxt = await dlgText();
  t('натискання показує список: прогули, поза графіком, відпустка',
    /Козило Василь/.test(absTxt) && /Кораблін Дмитро/.test(absTxt) && /Поза графіком \(1\)/.test(absTxt) &&
    /Загура Іван/.test(absTxt) && /прийшов о 8:32/.test(absTxt) && /Відпустка/.test(absTxt) && /звіт на 27\.10\.2026 08:31/.test(absTxt));
  await closeDlg();
  t('після перегляду не блимає, але лишається червоною', !(await absBtn.evaluate(e => e.classList.contains('blink'))) && await absBtn.isVisible());
  t('натискання не ставить відповідь пункту', !(await page.locator('#start-s1-3').evaluate(e => e.classList.contains('completed'))));
  await fetch(BASE + '/attendance?n=0');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(600);
  t('усі зареєструвались — кнопка лишається, зелена «Усі на зміні»', await absBtn.isVisible() &&
    (await absBtn.textContent()).includes('Усі на зміні') &&
    await absBtn.evaluate(e => e.classList.contains('ok') && !e.classList.contains('blink') && getComputedStyle(e).backgroundColor === 'rgb(22, 163, 74)'));
  await absBtn.click(); await page.waitForTimeout(400);
  t('  натискання показує «Усі, хто мав вийти, на зміні» і відпустки', /Усі, хто мав вийти, на зміні/.test(await dlgText()));
  await closeDlg();
  await fetch(BASE + '/attendance');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(600);
  t('знову хтось відсутній — кнопка блимає знову', await absBtn.evaluate(e => e.classList.contains('blink')));
  await page.click('#endShiftBtn'); await page.waitForTimeout(300);
  t('на «Кінці зміни» кнопки немає', (await page.locator('.absence-bt').count()) === 0 && (await page.locator('.absence-btn').count()) === 0);
  await page.click('#startShiftBtn'); await page.waitForTimeout(300);
  t('повернулись на «Початок» — кнопка на місці', await absBtn.isVisible());
  await fetch(BASE + '/attendance?noschedule');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(600);
  t('графіка немає («Поза графіком» у всіх 18) — рахує лише прогул', (await absBtn.textContent()).includes('Не на зміні: 1'));
  await absBtn.click(); await page.waitForTimeout(400);
  const nsTxt = await dlgText();
  t('  у списку — попередження про графік, а не 18 імен', /Графік на сьогодні не завантажено/.test(nsTxt) &&
    !/Працівник 5/.test(nsTxt) && /Козило/.test(nsTxt));
  await closeDlg();
  await fetch(BASE + '/attendance?fail');
  const p2 = await ctx.newPage(); await p2.goto(BASE + '/app'); await p2.waitForTimeout(900);
  const abs2 = p2.locator('#start-s1-3 .absence-btn');
  t('таблиця не відповіла — кнопка сіра «немає даних», а не зникає', await abs2.isVisible() &&
    (await abs2.textContent()).includes('немає даних') && await abs2.evaluate(e => e.classList.contains('nodata')));
  await abs2.click(); await p2.waitForTimeout(400);
  t('  натискання пояснює, що даних немає', /Не вдалося отримати дані/.test(await p2.locator('#customDialogMessage').textContent()));
  await p2.close();
  await fetch(BASE + '/attendance');

  console.log('\n── час натискання і перемикання вкладок ──');
  await page.locator('#start-s1-1 .option-btn').first().click();
  await page.locator('#start-s1-2 .option-btn').first().click();
  await page.click('#endShiftBtn'); await page.waitForTimeout(300);
  await page.locator('#endShiftSection .checklist-item .option-btn').first().click();
  await page.click('#startShiftBtn'); await page.waitForTimeout(300);
  t('відповіді «Початку» пережили перехід на «Кінець» і назад',
    await page.locator('#start-s1-1').evaluate(e => e.classList.contains('completed')) &&
    await page.locator('#start-s1-2').evaluate(e => e.classList.contains('completed')));
  t('  і час натискання теж', await page.locator('#start-s1-1').evaluate(e => !!e.dataset.at));

  console.log('\n── відправка ──');
  await fill();
  t('усі пункти заповнено', (await left()).includes(': 0'));
  await send();
  t('повідомлення про успіх', (await dlgText()).includes('успішно відправлено'));
  await closeDlg();
  const nStart = await page.locator('#startShiftSection .checklist-item').count();
  t('форму очищено після ok', (await left()).includes('Залишилось завдань: ' + nStart));

  const got = await (await fetch(BASE + '/received')).json();
  t('сервер отримав рівно один звіт', got.length === 1);
  const p = got[0];
  t('кожна відповідь майстра має час натискання (ISO, не старший 15 хв)', p.items.filter(i => i.value)
    .every(i => /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(i.answered_at) && Math.abs(Date.parse(i.answered_at) - Date.now()) < 15 * 60000));
  console.log('   report_id: ' + p.report_id + ' · дата: ' + p.business_date + ' · пунктів: ' + p.items.length);
  t('роль і стадія', p.role === 'Майстер' && p.stage === 'Початок зміни');
  t('автора визначив сервер', p._author === 'Шута Олександра Сергіівна');
  t('клієнт імені автора не надсилає', p.user_name === undefined && p.user_id === undefined);
  t('усі пункти з item_id master.*', p.items.every(i => /^master\.(s|e)\d+-\d+$/.test(i.item_id)));
  t('ід збігаються з довідником',
    p.items.map(i => i.item_id).includes('master.s1-1') &&
    p.items.map(i => i.item_id).includes('master.s4-1'));
  t('тексту пунктів більше не шлемо', p.items.every(i => i.text === undefined));
  t('одержувачів клієнт більше не диктує', p.recipients === undefined);
  t('report_id за київською датою',
    new RegExp('^' + new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv' }).format(new Date()) +
               '_master_start_[0-9a-f]{6}$').test(p.report_id));
  t('токен і пристрій надіслані', !!p.token && !!p.deviceId);

  console.log('\n── кінець зміни ──');
  await page.click('#endShiftBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll('#endShiftSection .checklist-item')
      .forEach(el => el.querySelector('.option-btn').click());
  });
  await send(); await closeDlg();
  const got2 = await (await fetch(BASE + '/received')).json();
  t('другий звіт прийнято', got2.length === 2);
  t('стадія «Кінець зміни»', got2[1].stage === 'Кінець зміни');
  t('ід кінця зміни — e*', got2[1].items.every(i => /^master\.e\d+-\d+$/.test(i.item_id)));

  console.log('\n── зв\'язок зник ──');
  await fetch(BASE + '/reset');
  await page.click('#startShiftBtn'); await page.waitForTimeout(400);
  await fill();
  await ctx.setOffline(true);
  await send();
  t('звіт збережено локально', (await dlgText()).includes('збережено'));
  await closeDlg();
  t('звіт у черзі', (await queueLen()) === 1);
  t('на сервер нічого не пішло', (await (await fetch(BASE + '/received')).json()).length === 0);

  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(2200); await closeDlg();
  t('черга спорожніла', (await queueLen()) === 0);
  t('сервер отримав рівно один звіт', (await (await fetch(BASE + '/received')).json()).length === 1);

  console.log('\n── сесія протухла ──');
  await fetch(BASE + '/reset');
  await fill();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('masterSessionV1'));
    s.token = 'ЗІПСОВАНИЙ'; localStorage.setItem('masterSessionV1', JSON.stringify(s));
    session.token = 'ЗІПСОВАНИЙ';
  });
  await send();
  t('показано помилку сервера', (await page.locator('#submitStatus').textContent()).includes('Сесію завершено'));
  await closeDlg(); await page.waitForTimeout(400);
  t('форму НЕ очищено', (await left()).includes(': 0'));
  t('знову просять PIN', await shown());
  await page.fill('#authPin', '8294'); await page.click('#authLoginBtn'); await page.waitForTimeout(1000);
  await send(); await closeDlg();
  t('звіт нарешті прийнято', (await (await fetch(BASE + '/received')).json()).length === 1);

  console.log('\n── будиночок веде на головну порталу ──');
  await page.goto(BASE + '/app'); await page.waitForTimeout(800);
  t('кнопка-будиночок веде на index.html', (await page.locator('#homeBtn').getAttribute('onclick')).includes("index.html"));

  console.log('\n── портал: графік роботи (лише перегляд) ──');
  await page.goto(BASE + '/schedule.html'); await page.waitForTimeout(1200);
  t('графік показано з тим самим входом за PIN', (await page.locator('#sched-body tr').count()) === 3);
  t('  1-го в Рашидова «1 / 2 (н)»', (await page.locator('#sched-body tr').first().locator('td').nth(1).textContent()).trim() === '1 / 2 (н)');
  t('  відпустка «В» жовта', await page.locator('#sched-body tr').nth(2).locator('td').nth(15).evaluate(e => e.className.includes('bg-amber-100')));
  t('  групи посад розділені товстою лінією', await page.locator('#sched-body tr').first().evaluate(e => e.className.includes('border-b-[4px]')));
  t('  місяці зі списку сервера', (await page.locator('#month option').allTextContents()).join() === 'Жовтень 2026,Листопад 2026');
  t('  нічого не можна редагувати: ні полів, ні кнопок у таблиці',
    (await page.locator('#sched input, #sched button, #sched select, [contenteditable]').count()) === 0);
  await page.selectOption('#month', 'Жовтень 2026'); await page.waitForTimeout(800);
  t('інший місяць — 31 день', (await page.locator('#sched-head th').count()) === 1 + 31 + 1);
  await page.evaluate(() => localStorage.removeItem('masterSessionV1'));
  await page.reload(); await page.waitForTimeout(800);
  t('без входу — пропонує увійти через чек-лист', /увійдіть за PIN/.test(await page.locator('#msg').textContent()) &&
    (await page.locator('#sched-body tr').count()) === 0);

  if (errors.length) { console.log('\n⚠️ помилки JS:'); errors.forEach(e => console.log('   ' + e)); fails += errors.length; }
  await browser.close();
  console.log('\n' + (fails ? '❌ ПОМИЛОК: ' + fails : '✅ Усі перевірки пройдено'));
  process.exit(fails ? 1 : 0);
})();
