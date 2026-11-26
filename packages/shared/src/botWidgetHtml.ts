// Вёрстка карточек в чате с ботом (виджеты Telegram, docs/WIDGETS.md). Каждая карточка это один HTML-документ со
// своими стилями и скриптом: до 32 КБ и до 4 КБ после сжатия (проверяет тест botWidgets.test.ts).
//
// Что важно для правки:
// - Код карточки фиксируется при отправке. Новая вёрстка видна только в карточках, отправленных после выкладки
//   (старые продолжают работать со старым кодом, поэтому формат данных меняем только добавлением полей).
// - Цвета берутся из темы Telegram (переменные --tg-theme-*), а не из токенов приложения: карточка живёт в чате.
// - Нет сети, полей ввода, звука; внутри нет прокрутки. Запрос к боту (TelegramWidget.request) можно сделать один раз
//   при появлении на экране и по нажатию; вызывать его надо прямо в обработчике нажатия, не после ожидания.
// - Подписи внутри карточек меняются здесь, а не в панели: им не хватило бы места в данных карточки (1 КБ).
//   Подписи под карточками (caption) и запасной текст меняются в панели, «Сообщения бота» → «Карточки в чате».
// - Внутри шаблонной строки нельзя использовать обратные кавычки и «доллар с фигурной скобкой».

const BASE_STYLE = `*{box-sizing:border-box;margin:0}
body{font:15px/1.35 -apple-system,system-ui,Roboto,sans-serif;color:var(--tg-theme-text-color,#111);padding:12px 14px 10px}
.t{font-weight:600;font-size:16px}
.m{color:var(--tg-theme-hint-color,#888);font-size:13px}
button{font:inherit;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.lnk{font-size:13px;padding:5px 10px;border-radius:8px;background:var(--tg-theme-secondary-bg-color,#eee);color:var(--tg-theme-link-color,#2a7ae2)}`;

/** Общие функции скриптов: склонение и экранирование. */
const BASE_SCRIPT = `var W=window.TelegramWidget,e=document.getElementById('c'),d=null,st='';
function pl(n,a,b,c){var x=n%10,y=n%100;return x==1&&y!=11?a:x>1&&x<5&&(y<12||y>14)?b:c}
function h(s){return String(s).replace(/[&<>"]/g,function(c){return '&#'+c.charCodeAt(0)+';'})}
function J(s){try{var o=JSON.parse(s);if(o&&o.v)d=o}catch(_){}}
function N(){var t=new Date();return t.getHours()+':'+('0'+t.getMinutes()).slice(-2)}
function E(r){return r&&r.code=='RATE_LIMITED'?'Слишком часто, подождите пару секунд':'Не получилось, попробуйте ещё раз'}`;

/**
 * «Мой прогресс» (/progress): фигура статуса, путь к следующей, очки, цель дня, неделя, слова к повторению.
 * Данные: ProgressCardData (botWidgets.ts). При появлении на экране и по «Обновить» карточка просит у бота свежие данные (`p`).
 */
export const PROGRESS_WIDGET_HTML = `<style>${BASE_STYLE}
.h{display:flex;align-items:center;gap:12px}
.fig{font-size:38px;line-height:1;width:52px;height:52px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--tg-theme-secondary-bg-color,#f0f0f0)}
.bar{height:6px;border-radius:3px;background:var(--tg-theme-secondary-bg-color,#eee);margin:12px 0 4px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px;background:var(--tg-theme-button-color,#2a9d6f)}
.row{display:flex;gap:8px;margin-top:12px}
.box{flex:1;padding:8px 10px;border-radius:12px;background:var(--tg-theme-secondary-bg-color,#f2f2f2)}
.wk{display:flex;gap:3px;margin-top:5px}
.wk b{flex:1;text-align:center;font-size:11px;font-weight:500;padding:3px 0;border-radius:6px;color:var(--tg-theme-hint-color,#888)}
.wk b.on{background:var(--tg-theme-button-color,#2a9d6f);color:var(--tg-theme-button-text-color,#fff)}
.wk b.td{box-shadow:inset 0 0 0 1.5px var(--tg-theme-button-color,#2a9d6f)}
.ft{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px}
</style><div id="c"></div><script>${BASE_SCRIPT}
function L(n){return n+' '+pl(n,'урок','урока','уроков')}
function R(){
if(!d){e.innerHTML='<p class="m">Загружаю прогресс…</p>';return}
var g=d.g,x='<div class="h"><div class="fig">'+h(d.s)+'</div><div><div class="t">'+h(d.sn)+'</div><div class="m">Сдано '+L(d.l)+' · ⭐ '+d.p+' '+pl(d.p,'очко','очка','очков')+'</div></div></div>';
x+='<div class="bar"><i style="width:'+Math.max(0,Math.min(100,d.f))+'%"></i></div><div class="m">'+(d.nx?'До фигуры '+h(d.nx.s)+' '+h(d.nx.n)+': ещё '+L(d.nx.left):'У вас высшая фигура 👑')+'</div>';
x+='<div class="row"><div class="box"><div class="m">Цель дня</div><div class="t">'+(g?(g[0]>=g[1]?'✅ ':'')+g[0]+' из '+g[1]:'—')+'</div></div>';
x+='<div class="box" style="flex:2"><div class="m">Неделя: '+d.wd+' из '+d.wt+' '+pl(d.wt,'дня','дней','дней')+(d.wd>=d.wt?' ✅':'')+'</div><div class="wk">';
for(var i=0;i<7;i++)x+='<b class="'+(d.w.charAt(i)=='1'?'on':'')+(i==d.t?' td':'')+'">'+'ВсПнВтСрЧтПтСб'.substr(i*2,2)+'</b>';
x+='</div></div></div>';
if(d.r)x+='<p class="m" style="margin-top:10px">🔁 Пора повторить '+d.r+' '+pl(d.r,'слово','слова','слов')+'</p>';
x+='<div class="ft"><span class="m">'+st+'</span><button class="lnk" data-q="p">↻ Обновить</button></div>';
e.innerHTML=x}
function A(a){J(a&&a.result);st='Обновлено в '+N();R()}
e.addEventListener('click',function(v){var b=v.target.closest('button');if(!b)return;st='Обновляю…';W.request('p').then(A,function(r){st=E(r);R()});R()});
J(W.chatData);R();
W.request('p').then(A,function(){});
if(W.ready)W.ready();
</script>`;

/**
 * «Напоминания» (/reminders): выключатель и время одним нажатием. Данные: RemindersCardData (botWidgets.ts).
 * Запросы: `r` (свежее состояние при появлении), `r:on`, `r:off`, `r:t:<минуты>` (выбор времени заодно включает).
 */
export const REMINDERS_WIDGET_HTML = `<style>${BASE_STYLE}
.hd{display:flex;justify-content:space-between;align-items:center;gap:10px}
.sw{width:50px;height:30px;flex:none;border-radius:15px;position:relative;padding:0;background:var(--tg-theme-hint-color,#bbb);transition:background .2s}
.sw i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:left .2s}
.sw.on{background:var(--tg-theme-button-color,#2a9d6f)}
.sw.on i{left:23px}
.tm{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 10px}
.tm button{flex:1;min-width:54px;padding:8px 0;border-radius:10px;font-size:15px;background:var(--tg-theme-secondary-bg-color,#f0f0f0);color:var(--tg-theme-text-color,#111)}
.tm button.sel{background:var(--tg-theme-button-color,#2a9d6f);color:var(--tg-theme-button-text-color,#fff);font-weight:600}
.dim{opacity:.55}
</style><div id="c"></div><script>${BASE_SCRIPT}
var busy=0;
function T(m){return Math.floor(m/60)+':'+('0'+m%60).slice(-2)}
function R(){
var x='<div class="hd"><div class="t">🔔 Напоминания</div>';
if(!d){e.innerHTML=x+'</div><p class="m" style="margin-top:6px">Загружаю…</p>';return}
if(!d.a){e.innerHTML=x+'</div><p class="m" style="margin-top:6px">Пока недоступны. Скоро включим!</p>';return}
x+='<button class="sw'+(d.on?' on':'')+'" data-q="r:'+(d.on?'off':'on')+'" aria-label="Вкл/выкл"><i></i></button></div>';
x+='<p class="m" style="margin-top:4px">'+(d.on?'Включены: каждый день в '+T(d.m):'Выключены. Выберите время, и я включу')+'</p>';
var o=d.o.slice();if(o.indexOf(d.m)<0){o.push(d.m);o.sort(function(a,b){return a-b})}
x+='<div class="tm'+(d.on?'':' dim')+'">';
for(var i=0;i<o.length;i++)x+='<button class="'+(o[i]==d.m&&d.on?'sel':'')+'" data-q="r:t:'+o[i]+'">'+T(o[i])+'</button>';
x+='</div><p class="m">Пишу, только если в этот день вы ещё не занимались'+(d.sh?', и не в шаббат':'')+'. Своё время: «Настройки» в приложении.</p>';
if(st)x+='<p class="m" style="margin-top:6px">'+st+'</p>';
e.innerHTML=x}
e.addEventListener('click',function(v){var b=v.target.closest('button');if(!b||busy)return;var q=b.getAttribute('data-q');if(!q)return;busy=1;st='Сохраняю…';
W.request(q).then(function(a){busy=0;J(a&&a.result);st='Сохранено ✓';R()},function(r){busy=0;st=E(r);R()});
if(W.HapticFeedback)W.HapticFeedback.selectionChanged();R()});
J(W.chatData);R();
W.request('r').then(function(a){J(a&&a.result);R()},function(){});
if(W.ready)W.ready();
</script>`;
