/* 筋トレメニュー — 画面側 (GitHub Pages)。データは Apps Script の API に保存する。 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var LS = { conn: 'km.conn', data: 'km.data', outbox: 'km.outbox', draft: 'km.draft', settings: 'km.settings', demo: 'km.demo', ivl: 'km.ivl' };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var KIND_LABEL = { weight: '重量', bodyweight: '自重', time: '時間' };

  var TEMPLATES = [
    { name: '自重・全身', exercises: [
      ex('スクワット', 'bodyweight', 3, 15, 0, 60), ex('プッシュアップ', 'bodyweight', 3, 12, 0, 60),
      ex('ランジ', 'bodyweight', 3, 10, 0, 60), ex('ヒップリフト', 'bodyweight', 3, 15, 0, 45),
      ex('プランク', 'time', 3, 45, 0, 45)] },
    { name: 'ダンベル・上半身', exercises: [
      ex('ダンベルプレス', 'weight', 3, 10, 10, 90), ex('ワンハンドロウ', 'weight', 3, 10, 10, 90),
      ex('ショルダープレス', 'weight', 3, 10, 6, 90), ex('アームカール', 'weight', 3, 12, 6, 60),
      ex('トライセプスエクステンション', 'weight', 3, 12, 6, 60)] },
    { name: 'ダンベル・下半身＋体幹', exercises: [
      ex('ゴブレットスクワット', 'weight', 3, 12, 12, 90), ex('ルーマニアンデッドリフト', 'weight', 3, 10, 12, 90),
      ex('ブルガリアンスクワット', 'bodyweight', 3, 10, 0, 60), ex('カーフレイズ', 'bodyweight', 3, 20, 0, 45),
      ex('サイドプランク', 'time', 2, 30, 0, 30)] }
  ];
  function ex(name, kind, sets, reps, weight, rest) {
    return { name: name, kind: kind, sets: sets, reps: reps, weight: weight, rest: rest, video: '' };
  }

  // ---- 保存 ----
  function load(k, fb) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; }
  }
  function save(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 容量超過などは無視 */ }
  }

  var state = {
    conn: load(LS.conn, null),
    data: normalize(load(LS.data, null)),
    outbox: load(LS.outbox, []),
    settings: Object.assign({ weeklyGoal: 3, weightStep: 1, sound: true }, load(LS.settings, {})),
    tab: 'home',
    sync: 'idle',
    openSession: null,
    menuSort: false,
    statsEx: null,
    statsMetric: null
  };
  var draft = load(LS.draft, null);

  function normalize(d) {
    d = d || {};
    return { menus: d.menus || [], sessions: d.sessions || [], body: d.body || [] };
  }
  function persistData() { save(LS.data, state.data); }

  // ---- フォーム動画 ----
  function parseTime(t) {
    var m = String(t || '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return m && t ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }
  /** 貼られた URL を解釈する。空なら null、解釈できなければ {error}、できれば {type, ...}。 */
  function parseVideo(url) {
    url = String(url || '').trim();
    if (!url) return null;
    var u;
    try { u = new URL(url); } catch (e) { return { error: 'URLの形式が正しくありません' }; }
    if (u.protocol !== 'https:') return { error: 'https:// で始まるURLを貼ってください' };
    var host = u.hostname.replace(/^(www|m|music)\./, ''), id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { var m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/); if (m) id = m[2]; }
    }
    if (id !== null) {
      if (!/^[\w-]{11}$/.test(id)) return { error: 'YouTubeの動画URLを読み取れませんでした' };
      return { type: 'youtube', id: id, start: parseTime(u.searchParams.get('t') || u.searchParams.get('start')) };
    }
    var path = u.pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return { type: 'video', src: url };
    if (/\.(gif|webp|png|jpe?g|avif)$/.test(path)) return { type: 'image', src: url };
    return { error: 'YouTube、または .mp4 / .gif などの直接リンクに対応しています' };
  }
  function videoKindLabel(v) { return v.type === 'youtube' ? 'YouTube動画' : v.type === 'video' ? '動画ファイル' : 'アニメーション画像'; }

  /** ループ再生する動画の要素を作る（YouTube は loop+playlist、動画ファイルは loop 属性、音は消して自動再生）。 */
  function videoNode(v) {
    var box = document.createElement('div');
    box.className = 'vid';
    if (v.type === 'youtube') {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&mute=1&loop=1&playlist=' + v.id +
        '&playsinline=1&rel=0&modestbranding=1' + (v.start ? '&start=' + v.start : '');
      f.title = 'フォーム動画';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      box.appendChild(f);
    } else if (v.type === 'video') {
      var el = document.createElement('video');
      el.src = v.src; el.loop = true; el.muted = true; el.autoplay = true; el.controls = true; el.playsInline = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.preload = 'auto';
      el.addEventListener('error', function () { box.innerHTML = '<div class="vid-err">動画を読み込めませんでした。URLを確認してください。</div>'; });
      box.appendChild(el);
    } else {
      var img = document.createElement('img');
      img.src = v.src; img.alt = 'フォーム動画';
      img.addEventListener('error', function () { box.innerHTML = '<div class="vid-err">画像を読み込めませんでした。URLを確認してください。</div>'; });
      box.appendChild(img);
    }
    return box;
  }
  var openVid = {};

  // ---- 小物 ----
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dstr(new Date()); }
  function pdate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysAgo(s) { return Math.round((pdate(today()) - pdate(s)) / 864e5); }
  function weekStart(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); }
  function fmtMD(s) { var d = pdate(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WD[d.getDay()] + ')'; }
  function fmtShort(s) { var d = pdate(s); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function fmtAgo(s) {
    var n = daysAgo(s);
    return n <= 0 ? '今日' : n === 1 ? '昨日' : n < 7 ? n + '日前' : n < 30 ? Math.floor(n / 7) + '週間前' : Math.floor(n / 30) + 'か月前';
  }
  function fmtNum(n, digits) {
    if (n == null || isNaN(n)) return '–';
    var f = Math.pow(10, digits == null ? 1 : digits);
    return String(Math.round(n * f) / f);
  }
  function fmtBig(n) { return n >= 10000 ? fmtNum(n / 1000, 1) + 't' : Math.round(n).toLocaleString('ja-JP') + 'kg'; }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  function icon(name) {
    var p = {
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
      play: '<path d="M8 5.5v13l11-6.5z"/>',
      up: '<path d="m6 15 6-6 6 6"/>',
      down: '<path d="m6 9 6 6 6-6"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
      bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
      min: '<path d="m6 9 6 6 6-6"/>'
    }[name];
    return '<svg viewBox="0 0 24 24">' + p + '</svg>';
  }

  var toastTimer;
  function toast(msg, err) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (err ? ' err' : ''); }, err ? 4000 : 2400);
  }

  // ---- 通信 ----
  function api(action, payload) {
    if (state.conn && state.conn.demo) {
      return new Promise(function (res) { setTimeout(function () { res(JSON.parse(JSON.stringify(state.data))); }, 150); });
    }
    return fetch(state.conn.u, {
      method: 'POST',
      body: JSON.stringify({ key: state.conn.k, action: action, payload: payload || {} }),
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw netError('HTTP ' + r.status);
      return r.json().catch(function () { throw netError('応答を読めませんでした'); });
    }, function () { throw netError('オフラインです'); })
      .then(function (j) {
        if (!j.ok) { var e = new Error(j.error || 'エラー'); e.auth = !!j.auth; throw e; }
        return j.data;
      });
  }
  function netError(msg) { var e = new Error(msg); e.network = true; return e; }

  function setSync(s) {
    state.sync = s;
    var el = $('#sync');
    if (el) el.outerHTML = syncBadge();
  }
  function syncBadge() {
    var n = state.outbox.length;
    var cls = state.sync === 'busy' ? 'busy' : state.sync === 'off' ? 'off' : '';
    var label = state.conn && state.conn.demo ? 'デモ' : state.sync === 'busy' ? '同期中' : state.sync === 'off' ? (n ? '未送信 ' + n + '件' : 'オフライン') : '同期済み';
    return '<button class="sync ' + cls + '" id="sync" data-act="sync-now"><i></i>' + label + '</button>';
  }

  /** ローカルに即反映し、送信キューに積んでからサーバーへ送る（オフラインでも使える）。 */
  function mutate(action, payload, applyLocal) {
    applyLocal(state.data);
    persistData();
    if (!(state.conn && state.conn.demo)) {
      state.outbox.push({ action: action, payload: payload });
      save(LS.outbox, state.outbox);
    } else {
      save(LS.demo, state.data);
    }
    render();
    flush();
  }

  var flushing = false;
  function flush() {
    if (flushing || !state.conn || state.conn.demo) return Promise.resolve();
    flushing = true;
    setSync('busy');
    var last = null;
    function step() {
      if (!state.outbox.length) {
        return (last ? Promise.resolve(last) : api('getData')).then(function (data) {
          state.data = normalize(data);
          persistData();
          setSync('idle');
          render();
        });
      }
      var item = state.outbox[0];
      return api(item.action, item.payload).then(function (data) {
        last = data;
        state.outbox.shift();
        save(LS.outbox, state.outbox);
        return step();
      }, function (e) {
        if (e.network) throw e;
        if (e.auth) throw e;
        // 入力内容のエラーはこの1件だけ捨てて続ける（キューを詰まらせない）
        toast(e.message, true);
        state.outbox.shift();
        save(LS.outbox, state.outbox);
        last = null;
        return step();
      });
    }
    return step().catch(function (e) {
      setSync('off');
      if (e.auth) toast('接続コードが無効です。設定から入れ直してください', true);
    }).then(function () { flushing = false; });
  }

  // ---- 集計 ----
  function sessionsAsc() {
    return state.data.sessions.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function sessionsDesc() { return sessionsAsc().reverse(); }

  function e1rm(w, r) { return r <= 0 ? 0 : r === 1 ? w : w * (1 + r / 30); }

  /** その種目の1セッション分の指標。kind ごとに「主指標」を決めてベスト判定に使う。 */
  function sessionMetric(kind, sets) {
    var m = { kind: kind, sets: sets.length, best: 0, bestSet: null, maxW: 0, volume: 0, total: 0, maxR: 0 };
    sets.forEach(function (s) {
      var w = +s.weight || 0, r = +s.reps || 0;
      m.total += r;
      m.maxR = Math.max(m.maxR, r);
      m.maxW = Math.max(m.maxW, w);
      m.volume += w * r;
      var v = kind === 'weight' ? e1rm(w, r) : r;
      if (v > m.best) { m.best = v; m.bestSet = s; }
    });
    return m;
  }

  /** 種目ごとの履歴（古い順）。 */
  function exerciseHistory() {
    var h = {};
    sessionsAsc().forEach(function (s) {
      var by = {};
      s.sets.forEach(function (x) { (by[x.exercise] = by[x.exercise] || []).push(x); });
      Object.keys(by).forEach(function (name) {
        var kind = by[name][0].kind || 'weight';
        (h[name] = h[name] || []).push({ date: s.date, id: s.id, sets: by[name], m: sessionMetric(kind, by[name]) });
      });
    });
    return h;
  }

  /** 自己ベスト更新のイベント（初回は基準なので数えない）。 */
  function prEvents(hist) {
    var out = [];
    Object.keys(hist).forEach(function (name) {
      var best = 0;
      hist[name].forEach(function (e, i) {
        if (i > 0 && e.m.best > best + 1e-9) out.push({ name: name, date: e.date, id: e.id, m: e.m });
        best = Math.max(best, e.m.best);
      });
    });
    return out.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function setLabel(kind, s) {
    if (!s) return '–';
    if (kind === 'time') return s.reps + '秒';
    if (kind === 'bodyweight') return s.reps + '回';
    return fmtNum(s.weight) + 'kg×' + s.reps;
  }

  function sessionVolume(s) {
    return s.sets.reduce(function (a, x) { return a + (x.kind === 'weight' || !x.kind ? (+x.weight || 0) * (+x.reps || 0) : 0); }, 0);
  }

  function menuLastDone(menu) {
    var last = null;
    state.data.sessions.forEach(function (s) { if (s.menuName === menu.name && (!last || s.date > last)) last = s.date; });
    return last;
  }

  function estimateMin(menu) {
    var sec = 0;
    menu.exercises.forEach(function (e) {
      var work = e.kind === 'time' ? +e.reps : 40;
      sec += e.sets * (work + (+e.rest || 0));
    });
    return Math.max(5, Math.round(sec / 60 / 5) * 5);
  }

  /** 同じメニューの直近5回の平均（分）。実績がなければ null。 */
  function menuAvgMin(name) {
    var d = state.data.sessions.filter(function (s) { return s.menuName === name && s.duration > 0; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-5)
      .map(function (s) { return s.duration; });
    return d.length ? Math.round(d.reduce(function (a, b) { return a + b; }, 0) / d.length) : null;
  }
  function durLabel(menu) {
    var avg = menuAvgMin(menu.name);
    return avg ? '平均' + avg + '分' : '約' + estimateMin(menu) + '分';
  }
  /** 1セットあたりの実測ペース（秒、休憩込み）。実績がなければ null。 */
  function paceSec(name) {
    var xs = state.data.sessions.filter(function (s) { return s.menuName === name && s.duration > 0 && s.sets.length; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-5)
      .map(function (s) { return s.duration * 60 / s.sets.length; });
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
  }
  function remainingSec() {
    var sec = 0;
    draft.exercises.forEach(function (e) {
      e.sets.forEach(function (s) {
        if (s.done) return;
        sec += draft.pace || ((e.kind === 'time' ? +s.r : 40) + e.rest);
      });
    });
    return sec;
  }

  function suggestedMenu() {
    var menus = state.data.menus.slice();
    if (!menus.length) return null;
    menus.sort(function (a, b) {
      var la = menuLastDone(a), lb = menuLastDone(b);
      if (la === lb) return a.order - b.order;
      if (!la) return -1;
      if (!lb) return 1;
      return la < lb ? -1 : 1;
    });
    return menus[0];
  }

  function weekCounts() {
    var ws = dstr(weekStart(new Date()));
    var days = {};
    state.data.sessions.forEach(function (s) { if (s.date >= ws) days[s.date] = 1; });
    return Object.keys(days).length;
  }

  function streakWeeks() {
    var weeks = {};
    state.data.sessions.forEach(function (s) { weeks[dstr(weekStart(pdate(s.date)))] = 1; });
    var w = weekStart(new Date());
    if (!weeks[dstr(w)]) w = addDays(w, -7);
    var n = 0;
    while (weeks[dstr(w)]) { n++; w = addDays(w, -7); }
    return n;
  }

  function monthCount() {
    var m = today().slice(0, 7), days = {};
    state.data.sessions.forEach(function (s) { if (s.date.slice(0, 7) === m) days[s.date] = 1; });
    return Object.keys(days).length;
  }

  // ---- 描画 ----
  function render() {
    if (!state.conn) { renderSetup(); return; }
    $('#tabbar').hidden = false;
    var v = $('#view');
    var html = state.tab === 'home' ? viewHome() : state.tab === 'menus' ? viewMenus() : state.tab === 'history' ? viewHistory() : viewStats();
    v.innerHTML = html;
    Array.prototype.forEach.call($('#tabbar').children, function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    drawCharts();
    var on = $('.chips .on');
    if (on) on.parentNode.scrollLeft = on.offsetLeft - (on.parentNode.clientWidth - on.offsetWidth) / 2;
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 4 ? 'おつかれさまです' : h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは';
  }

  function viewHome() {
    var t = today();
    var head = '<div class="page-head"><div><div class="eyebrow">' + fmtMD(t) + '</div><h1>' + greeting() + '</h1></div>' +
      '<div class="row">' + syncBadge() + '<button class="icon-btn" data-act="settings" aria-label="設定">' + icon('gear') + '</button></div></div>';

    var hero;
    if (draft) {
      var done = 0, total = 0;
      draft.exercises.forEach(function (e) { e.sets.forEach(function (s) { total++; if (s.done) done++; }); });
      hero = '<section class="hero"><div class="label">トレーニング中</div><h2>' + esc(draft.menuName) + '</h2>' +
        '<div class="meta"><span>' + done + ' / ' + total + ' セット完了</span><span>' + fmtClock((Date.now() - draft.startedAt) / 1000) + ' 経過</span></div>' +
        '<div class="ex-chips"></div><div class="actions"><button class="btn lg start" data-act="resume">' + icon('play') + '再開する</button></div></section>';
    } else {
      var m = suggestedMenu();
      if (!m) {
        hero = '<section class="hero empty"><div class="label muted">はじめに</div><h2>メニューを作りましょう</h2>' +
          '<p class="muted small" style="margin:4px 0 16px">自宅向けのテンプレートからすぐに始められます。</p>' +
          '<div class="actions"><button class="btn primary lg grow" data-act="tab" data-tab="menus">テンプレートを見る</button></div></section>';
      } else {
        var last = menuLastDone(m);
        hero = '<section class="hero"><div class="label">今日のおすすめ</div><h2>' + esc(m.name) + '</h2>' +
          '<div class="meta"><span>' + m.exercises.length + '種目</span><span>' + durLabel(m) + '</span><span>' + (last ? '前回 ' + fmtAgo(last) : 'まだ未実施') + '</span></div>' +
          '<div class="ex-chips">' + m.exercises.slice(0, 6).map(function (e) { return '<span>' + esc(e.name) + '</span>'; }).join('') + '</div>' +
          '<div class="actions"><button class="btn lg start" data-act="start" data-id="' + esc(m.id) + '">' + icon('play') + 'トレーニング開始</button>' +
          (state.data.menus.length > 1 ? '<button class="btn lg alt" data-act="pick-menu">変更</button>' : '') + '</div></section>';
      }
    }

    var wk = weekCounts(), goal = state.settings.weeklyGoal;
    var stats = '<div class="stats3">' +
      '<div class="stat"><div class="v tnum">' + wk + '<small>/ ' + goal + '回</small></div><div class="k">今週</div><div class="progress"><i style="width:' + Math.min(100, wk / goal * 100) + '%"></i></div></div>' +
      '<div class="stat"><div class="v tnum">' + streakWeeks() + '<small>週</small></div><div class="k">連続で継続</div></div>' +
      '<div class="stat"><div class="v tnum">' + monthCount() + '<small>回</small></div><div class="k">今月</div></div></div>';

    var heat = '<div class="section-title">直近18週の記録</div><div class="card">' + heatmap() +
      '<div class="heat-legend">少<i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i>多</div></div>';

    var prs = prEvents(exerciseHistory()).slice(0, 4);
    var prHtml = prs.length ? '<div class="section-title">最近の自己ベスト</div><div class="card" style="padding:4px 16px">' +
      prs.map(function (p) {
        return '<div class="list-item"><span class="badge">' + icon('bolt').replace('<svg', '<svg style="width:20px;height:20px;fill:currentColor;stroke:none"') + '</span>' +
          '<div class="grow"><b>' + esc(p.name) + '</b><div class="muted small">' + fmtMD(p.date) + '</div></div>' +
          '<b class="tnum">' + setLabel(p.m.kind, p.m.bestSet) + '</b></div>';
      }).join('') + '</div>' : '';

    var body = state.data.body.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var lb = body[body.length - 1], pb = body[body.length - 2];
    var delta = lb && pb ? lb.weight - pb.weight : null;
    var bodyHtml = '<div class="section-title">体重</div><div class="card row"><div class="grow">' +
      (lb ? '<div class="hero-num tnum">' + fmtNum(lb.weight) + '<small>kg</small></div><div class="muted small">' + fmtMD(lb.date) +
        (delta != null ? ' ・ 前回比 <span class="delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') + '" style="color:var(--text-2)">' + (delta > 0 ? '+' : '') + fmtNum(delta) + 'kg</span>' : '') + '</div>'
        : '<b>まだ記録がありません</b><div class="muted small">体重も一緒に残すと変化が分かります</div>') +
      '</div><button class="btn primary sm" data-act="body">記録する</button></div>';

    var c = ivlCfg();
    var ivlCard = '<button class="card row ivl-entry" data-act="ivl-open"><span class="badge">' +
      '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/></svg></span>' +
      '<div class="grow"><b>インターバルタイマー</b><div class="muted small tnum">' + c.work + '秒運動 / ' + c.rest + '秒休憩 × ' + c.rounds + 'ラウンド ・ ' + fmtClock(ivlTotal(c)) + '</div></div>' +
      '<span class="muted">›</span></button>';
    return head + hero + '<div style="margin-top:12px">' + ivlCard + '</div>' + stats + heat + prHtml + bodyHtml;
  }

  function heatmap() {
    var setsByDay = {};
    state.data.sessions.forEach(function (s) { setsByDay[s.date] = (setsByDay[s.date] || 0) + s.sets.length; });
    var start = addDays(weekStart(new Date()), -7 * 17), t = today(), cells = '';
    for (var i = 0; i < 18 * 7; i++) {
      var d = dstr(addDays(start, i)), n = setsByDay[d] || 0;
      var l = n === 0 ? 0 : n <= 6 ? 1 : n <= 12 ? 2 : n <= 20 ? 3 : 4;
      if (d > t) { cells += '<i style="visibility:hidden"></i>'; continue; }
      cells += '<i data-l="' + l + '"' + (d === t ? ' class="today"' : '') + ' title="' + fmtShort(d) + (n ? ' ' + n + 'セット' : '') + '"></i>';
    }
    return '<div class="heat">' + cells + '</div>';
  }

  // メニュー一覧
  function viewMenus() {
    var menus = state.data.menus;
    var head = '<div class="page-head"><div><div class="eyebrow">' + menus.length + ' 件</div><h1>メニュー</h1></div>' +
      '<div class="row">' + (menus.length > 1 ? '<button class="btn sm" data-act="menu-sort">' + (state.menuSort ? '完了' : '並べ替え') + '</button>' : '') +
      '<button class="icon-btn" data-act="menu-new" aria-label="メニューを追加">' + icon('plus') + '</button></div></div>';
    var list = menus.map(function (m, i) {
      var last = menuLastDone(m);
      return '<div class="card row" ' + (state.menuSort ? '' : 'data-act="menu-edit" data-id="' + esc(m.id) + '" style="cursor:pointer"') + '>' +
        '<span class="badge">' + esc(m.name.slice(0, 1)) + '</span><div class="grow"><b>' + esc(m.name) + '</b>' +
        '<div class="muted small">' + m.exercises.length + '種目 ・ ' + durLabel(m) + ' ・ ' + (last ? fmtAgo(last) : '未実施') + '</div></div>' +
        (state.menuSort
          ? '<button class="icon-btn" data-act="menu-move" data-i="' + i + '" data-d="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="上へ">' + icon('up') + '</button>' +
            '<button class="icon-btn" data-act="menu-move" data-i="' + i + '" data-d="1" ' + (i === menus.length - 1 ? 'disabled' : '') + ' aria-label="下へ">' + icon('down') + '</button>'
          : '<button class="btn primary sm" data-act="start" data-id="' + esc(m.id) + '">開始</button>') + '</div>';
    }).join('');
    if (!menus.length) list = '<div class="card empty-state"><div class="ico">🏋️</div>まだメニューがありません。<br>下のテンプレートから追加するか、右上の＋で作成できます。</div>';
    var tpl = '<div class="section-title">自宅向けテンプレート</div>' + TEMPLATES.map(function (t, i) {
      return '<div class="card row"><div class="grow"><b>' + esc(t.name) + '</b><div class="muted small">' +
        t.exercises.map(function (e) { return esc(e.name); }).join('・') + '</div></div>' +
        '<button class="btn sm" data-act="tpl-add" data-i="' + i + '">追加</button></div>';
    }).join('');
    return head + '<div class="stack">' + list + '</div>' + tpl;
  }

  // 履歴
  function viewHistory() {
    var list = sessionsDesc();
    var head = '<div class="page-head"><div><div class="eyebrow">全 ' + list.length + ' 回</div><h1>履歴</h1></div>' + syncBadge() + '</div>';
    if (!list.length) return head + '<div class="card empty-state"><div class="ico">📅</div>トレーニングを完了するとここに記録されます。</div>';
    var html = '', month = '';
    list.forEach(function (s) {
      var m = s.date.slice(0, 7);
      if (m !== month) {
        month = m;
        html += '<div class="month">' + m.slice(0, 4) + '年' + (+m.slice(5)) + '月</div>';
      }
      var d = pdate(s.date), vol = sessionVolume(s), open = state.openSession === s.id;
      html += '<div class="session-card" data-act="session-toggle" data-id="' + esc(s.id) + '"><div class="top">' +
        '<div class="date-box"><b class="tnum">' + d.getDate() + '</b><span>' + WD[d.getDay()] + '</span></div>' +
        '<div class="grow"><b>' + esc(s.menuName || 'トレーニング') + '</b><div class="row small muted" style="gap:6px;flex-wrap:wrap;margin-top:2px">' +
        (s.duration ? '<span class="pill">' + s.duration + '分</span>' : '') + '<span class="pill">' + s.sets.length + 'セット</span>' +
        (vol ? '<span class="pill">' + fmtBig(vol) + '</span>' : '') + '</div></div></div>' +
        (open ? sessionDetail(s) : '') + '</div>';
    });
    return head + html;
  }

  function sessionDetail(s) {
    var by = {}, order = [];
    s.sets.forEach(function (x) { if (!by[x.exercise]) { by[x.exercise] = []; order.push(x.exercise); } by[x.exercise].push(x); });
    return '<div class="detail">' + order.map(function (n) {
      var kind = by[n][0].kind || 'weight';
      return '<div class="ex"><b>' + esc(n) + '</b><span class="tnum">' + by[n].map(function (x) { return setLabel(kind, x); }).join(' / ') + '</span></div>';
    }).join('') + (s.memo ? '<p class="muted" style="margin:10px 0 0">📝 ' + esc(s.memo) + '</p>' : '') +
      '<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn danger sm" data-act="session-delete" data-id="' + esc(s.id) + '">' + icon('trash') + '削除</button></div></div>';
  }

  // 分析
  var charts = {};
  function viewStats() {
    charts = {};
    var hist = exerciseHistory();
    var names = Object.keys(hist).sort(function (a, b) { return hist[b].length - hist[a].length; });
    var head = '<div class="page-head"><div><div class="eyebrow">成長の記録</div><h1>分析</h1></div></div>';
    var html = head;

    if (!names.length) {
      html += '<div class="card empty-state"><div class="ico">📈</div>記録がたまると、種目ごとの伸びがグラフで見られます。</div>';
    } else {
      if (names.indexOf(state.statsEx) < 0) { state.statsEx = names[0]; state.statsMetric = null; }
      var name = state.statsEx, h = hist[name], kind = h[0].m.kind;
      var metrics = kind === 'weight'
        ? [['e1rm', '推定1RM'], ['maxW', '最大重量'], ['volume', 'ボリューム']]
        : kind === 'time' ? [['maxR', '最長'], ['total', '合計']] : [['maxR', '最大回数'], ['total', '合計回数']];
      if (!metrics.some(function (m) { return m[0] === state.statsMetric; })) state.statsMetric = metrics[0][0];
      var key = state.statsMetric;
      var unit = kind === 'weight' ? 'kg' : kind === 'time' ? '秒' : '回';
      var val = function (e) { return key === 'e1rm' ? e.m.best : e.m[key]; };
      var pts = h.map(function (e) { return { x: e.date, y: val(e) }; });
      var best = Math.max.apply(null, pts.map(function (p) { return p.y; }));
      var first = pts[0].y, lastv = pts[pts.length - 1].y;
      var diff = lastv - first;
      charts.ex = { type: 'line', pts: pts, unit: unit };

      html += '<div class="chips">' + names.map(function (n) {
        return '<button class="' + (n === name ? 'on' : '') + '" data-act="stats-ex" data-name="' + esc(n) + '">' + esc(n) + '</button>';
      }).join('') + '</div>' +
        '<div class="card" style="margin-top:8px"><div class="row"><div class="grow"><div class="muted small">' + esc(name) + ' ・ ベスト</div>' +
        '<div class="hero-num tnum">' + fmtNum(best) + '<small>' + unit + '</small></div>' +
        (h.length > 1 ? '<div class="delta ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') + '">初回から ' + (diff > 0 ? '+' : '') + fmtNum(diff) + unit + '（' + h.length + '回）</div>' : '<div class="muted small">記録 1回</div>') +
        '</div></div><div class="seg" style="margin-top:14px">' + metrics.map(function (m) {
          return '<button class="' + (m[0] === key ? 'on' : '') + '" data-act="stats-metric" data-k="' + m[0] + '">' + m[1] + '</button>';
        }).join('') + '</div><div class="chart" data-chart="ex"></div></div>';

      var recent = h.slice(-5).reverse();
      html += '<div class="section-title">' + esc(name) + ' の最近の記録</div><div class="card" style="padding:4px 16px">' + recent.map(function (e) {
        return '<div class="list-item"><div class="grow"><b>' + fmtMD(e.date) + '</b><div class="muted small tnum">' +
          e.sets.map(function (x) { return setLabel(kind, x); }).join(' / ') + '</div></div>' +
          '<b class="tnum">' + setLabel(kind, e.m.bestSet) + '</b></div>';
      }).join('') + '</div>';
    }

    // 週ごとのセット数
    var weeks = [], ws = weekStart(new Date());
    for (var i = 11; i >= 0; i--) weeks.push({ x: dstr(addDays(ws, -7 * i)), y: 0 });
    state.data.sessions.forEach(function (s) {
      var k = dstr(weekStart(pdate(s.date)));
      weeks.forEach(function (w) { if (w.x === k) w.y += s.sets.length; });
    });
    charts.weeks = { type: 'bar', pts: weeks, unit: 'セット' };
    html += '<div class="section-title">週ごとのセット数</div><div class="card"><div class="chart" data-chart="weeks"></div></div>';

    // 体重
    var body = state.data.body.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    html += '<div class="section-title">体重<button data-act="body">＋ 記録</button></div><div class="card">';
    if (body.length >= 2) {
      charts.body = { type: 'line', pts: body.map(function (b) { return { x: b.date, y: b.weight }; }), unit: 'kg', zero: false };
      html += '<div class="chart" data-chart="body"></div>';
    } else {
      html += '<div class="muted small center" style="padding:12px 0">2回以上記録するとグラフになります</div>';
    }
    html += body.slice(-3).reverse().map(function (b) {
      return '<div class="list-item"><div class="grow">' + fmtMD(b.date) + '</div><b class="tnum">' + fmtNum(b.weight) + 'kg</b>' +
        '<button class="icon-btn" data-act="body-delete" data-date="' + b.date + '" aria-label="削除">' + icon('trash') + '</button></div>';
    }).join('') + '</div>';
    return html;
  }

  // ---- グラフ（単系列なので凡例なし、ホバー/タップでツールチップ） ----
  function drawCharts() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-chart]'), function (el) {
      var c = charts[el.getAttribute('data-chart')];
      if (!c) return;
      if (c.type === 'line') lineChart(el, c); else barChart(el, c);
    });
  }

  function niceScale(min, max, ticks) {
    if (min === max) { min = min - 1; max = max + 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / ticks)));
    var err = span / ticks / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  function lineChart(el, c) {
    var W = el.clientWidth || 320, H = 190, pl = 34, pr = 12, pt = 14, pb = 24;
    var pts = c.pts, ys = pts.map(function (p) { return p.y; });
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (c.zero !== false) lo = Math.min(lo, 0);
    else { var pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad; }
    var ticks = niceScale(lo, hi, 3), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    var t0 = pdate(pts[0].x).getTime(), t1 = pdate(pts[pts.length - 1].x).getTime();
    var X = function (p) { return pts.length === 1 ? (pl + W - pr) / 2 : pl + (pdate(p.x).getTime() - t0) / (t1 - t0) * (W - pl - pr); };
    var Y = function (v) { return pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb); };
    var grid = ticks.map(function (t) {
      return '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>';
    }).join('');
    var axis = ticks.map(function (t) { return '<text x="' + (pl - 6) + '" y="' + (Y(t) + 3.5) + '" text-anchor="end">' + fmtNum(t) + '</text>'; }).join('') +
      '<text x="' + pl + '" y="' + (H - 6) + '">' + fmtShort(pts[0].x) + '</text>' +
      (pts.length > 1 ? '<text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">' + fmtShort(pts[pts.length - 1].x) + '</text>' : '');
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = pts.length > 1 ? d + ' L' + X(pts[pts.length - 1]).toFixed(1) + ' ' + Y(y0) + ' L' + X(pts[0]).toFixed(1) + ' ' + Y(y0) + ' Z' : '';
    var dots = pts.length <= 20 ? pts.map(function (p) { return '<circle class="dot" r="4" cx="' + X(p) + '" cy="' + Y(p.y) + '"/>'; }).join('')
      : '<circle class="dot" r="4" cx="' + X(pts[pts.length - 1]) + '" cy="' + Y(pts[pts.length - 1].y) + '"/>';
    el.innerHTML = '<svg height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="推移グラフ">' +
      '<g class="grid">' + grid + '</g><g class="axis">' + axis + '</g><path class="area" d="' + area + '"/><path class="line" d="' + d + '"/>' + dots +
      '<line class="cross" y1="' + pt + '" y2="' + (H - pb) + '" x1="0" x2="0" visibility="hidden"/>' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent"/></svg><div class="tip" hidden></div>';
    hover(el, pts.map(function (p) { return { cx: X(p), cy: Y(p.y), p: p }; }), c.unit, true);
  }

  function barChart(el, c) {
    var W = el.clientWidth || 320, H = 170, pl = 28, pr = 4, pt = 14, pb = 24, gap = 2;
    var pts = c.pts, hi = Math.max.apply(null, pts.map(function (p) { return p.y; }).concat([1]));
    var ticks = niceScale(0, hi, 3), y1 = ticks[ticks.length - 1];
    var bw = (W - pl - pr) / pts.length;
    var Y = function (v) { return pt + (1 - v / y1) * (H - pt - pb); };
    var grid = ticks.map(function (t) { return '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>'; }).join('');
    var axis = ticks.map(function (t) { return '<text x="' + (pl - 6) + '" y="' + (Y(t) + 3.5) + '" text-anchor="end">' + t + '</text>'; }).join('') +
      '<text x="' + pl + '" y="' + (H - 6) + '">' + fmtShort(pts[0].x) + '</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">今週</text>';
    var bars = pts.map(function (p, i) {
      if (!p.y) return '';
      var x = pl + i * bw + gap / 2, w = Math.max(2, bw - gap - Math.min(10, bw * 0.3)), y = Y(p.y), b = Y(0), r = Math.min(4, w / 2, b - y);
      x += (bw - gap - w) / 2;
      return '<path class="bar" d="M' + x + ' ' + b + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + b + 'Z"/>';
    }).join('');
    el.innerHTML = '<svg height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="週ごとのセット数">' +
      '<g class="grid">' + grid + '</g><g class="axis">' + axis + '</g>' + bars +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent"/></svg><div class="tip" hidden></div>';
    hover(el, pts.map(function (p, i) { return { cx: pl + (i + 0.5) * bw, cy: Y(p.y), p: p, week: true }; }), c.unit, false);
  }

  function hover(el, targets, unit, cross) {
    var svg = el.querySelector('svg'), tip = el.querySelector('.tip'), line = el.querySelector('.cross');
    function show(ev) {
      var r = svg.getBoundingClientRect(), x = ev.clientX - r.left, best = null;
      targets.forEach(function (t) { if (!best || Math.abs(t.cx - x) < Math.abs(best.cx - x)) best = t; });
      if (!best) return;
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(best.cx, 50), r.width - 50) + 'px';
      tip.style.top = best.cy + 'px';
      tip.innerHTML = fmtNum(best.p.y) + unit + '<small>' + (best.week ? fmtShort(best.p.x) + ' の週' : fmtMD(best.p.x)) + '</small>';
      if (cross && line) { line.setAttribute('x1', best.cx); line.setAttribute('x2', best.cx); line.setAttribute('visibility', 'visible'); }
    }
    function hide() { tip.hidden = true; if (line) line.setAttribute('visibility', 'hidden'); }
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }

  // ---- シート（下から出るパネル） ----
  function openSheet(html, onMount) {
    closeSheet();
    var layer = $('#layer');
    layer.insertAdjacentHTML('beforeend', '<div class="backdrop" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>' + html + '</div>');
    if (onMount) onMount($('.sheet', layer));
  }
  function closeSheet() {
    var layer = $('#layer');
    Array.prototype.forEach.call(layer.querySelectorAll('.backdrop, .sheet'), function (n) { n.remove(); });
  }

  function pickMenuSheet() {
    openSheet('<h3>メニューを選ぶ</h3><div class="stack" style="margin-top:12px">' + state.data.menus.map(function (m) {
      var last = menuLastDone(m);
      return '<button class="card row" style="width:100%;border:0;text-align:left" data-act="start" data-id="' + esc(m.id) + '"><span class="badge">' + esc(m.name.slice(0, 1)) + '</span>' +
        '<div class="grow"><b>' + esc(m.name) + '</b><div class="muted small">' + m.exercises.length + '種目 ・ ' + (last ? fmtAgo(last) : '未実施') + '</div></div></button>';
    }).join('') + '</div>');
  }

  function bodySheet() {
    var body = state.data.body.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var last = body[body.length - 1];
    openSheet('<h3>体重を記録</h3><label class="field"><span>日付</span><input class="input" type="date" id="bDate" value="' + today() + '"></label>' +
      '<label class="field"><span>体重 (kg)</span><input class="input tnum" type="number" inputmode="decimal" step="0.1" id="bWeight" value="' + (last ? last.weight : '') + '" placeholder="65.0"></label>' +
      '<div class="foot"><button class="btn block lg" data-act="sheet-close">キャンセル</button><button class="btn primary block lg" data-act="body-save">保存</button></div>',
      function (s) { var i = $('#bWeight', s); i.focus(); i.select(); });
  }

  function settingsSheet() {
    var s = state.settings, c = state.conn;
    var host = c.demo ? 'デモモード（この端末だけに保存）' : 'Apps Script に接続中';
    openSheet('<h3>設定</h3>' +
      '<div class="field"><span>週の目標回数</span><div class="seg" id="sGoal">' + [1, 2, 3, 4, 5, 6, 7].map(function (n) {
        return '<button data-act="set-goal" data-v="' + n + '" class="' + (s.weeklyGoal === n ? 'on' : '') + '">' + n + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span>重さの刻み（＋／−ボタン）</span><div class="seg">' + [0.5, 1, 2, 2.5, 5].map(function (n) {
        return '<button data-act="set-step" data-v="' + n + '" class="' + (s.weightStep === n ? 'on' : '') + '">' + n + 'kg</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span>休憩・タイマー終了の音</span><div class="seg"><button data-act="set-sound" data-v="1" class="' + (s.sound ? 'on' : '') + '">鳴らす</button><button data-act="set-sound" data-v="0" class="' + (!s.sound ? 'on' : '') + '">鳴らさない</button></div></div>' +
      '<div class="section-title">接続</div><div class="card"><div class="row"><div class="grow"><b>' + host + '</b><div class="muted small">未送信 ' + state.outbox.length + ' 件</div></div>' +
      (c.demo ? '' : '<button class="btn sm" data-act="sync-now">今すぐ同期</button>') + '</div></div>' +
      '<div class="foot"><button class="btn danger block" data-act="disconnect">' + (c.demo ? 'デモを終了' : '接続コードを入れ直す') + '</button></div>' +
      '<p class="muted small center" style="margin-top:16px">筋トレメニュー v' + VERSION + '</p>');
  }

  // ---- メニュー編集 ----
  var editing = null;
  function menuEditor(menu) {
    editing = JSON.parse(JSON.stringify(menu));
    openSheet('<h3>' + (menu.id ? 'メニューを編集' : '新しいメニュー') + '</h3>' +
      '<label class="field"><span>メニュー名</span><input class="input" id="mName" value="' + esc(menu.name) + '" placeholder="例：胸と背中の日"></label>' +
      '<div class="section-title" style="margin-top:20px">種目</div><div id="exList" class="stack"></div>' +
      '<button class="btn block" style="margin-top:12px" data-act="ex-add">' + icon('plus') + '種目を追加</button>' +
      '<div class="foot"><button class="btn block lg" data-act="sheet-close">キャンセル</button><button class="btn primary block lg" data-act="menu-save">保存</button></div>' +
      (menu.id ? '<div class="foot"><button class="btn block" data-act="menu-dup">' + icon('copy') + '複製</button><button class="btn danger block" data-act="menu-delete">' + icon('trash') + '削除</button></div>' : ''),
      function () { renderExList(); if (!menu.id) $('#mName').focus(); });
  }

  function renderExList() {
    var list = $('#exList');
    if (!list) return;
    list.innerHTML = editing.exercises.map(function (e, i) {
      var isW = e.kind === 'weight';
      return '<div class="card" data-i="' + i + '" style="padding:12px">' +
        '<div class="row"><input class="input grow" data-f="name" value="' + esc(e.name) + '" placeholder="種目名（例：プッシュアップ）">' +
        '<button class="icon-btn" data-act="ex-move" data-d="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="上へ">' + icon('up') + '</button>' +
        '<button class="icon-btn" data-act="ex-del" aria-label="削除">' + icon('close') + '</button></div>' +
        '<div class="seg" style="margin-top:10px">' + ['weight', 'bodyweight', 'time'].map(function (k) {
          return '<button data-act="ex-kind" data-k="' + k + '" class="' + (e.kind === k ? 'on' : '') + '">' + KIND_LABEL[k] + '</button>';
        }).join('') + '</div>' +
        '<div class="grid3" style="margin-top:10px;grid-template-columns:repeat(' + (isW ? 4 : 3) + ',1fr)">' +
        mini('セット', 'sets', e.sets, 'numeric') + mini(e.kind === 'time' ? '秒' : '回数', 'reps', e.reps, 'numeric') +
        (isW ? mini('重さkg', 'weight', e.weight, 'decimal') : '') + mini('休憩秒', 'rest', e.rest, 'numeric') + '</div>' +
        '<div class="row" style="margin-top:10px"><input class="input grow" type="url" inputmode="url" data-f="video" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="フォーム動画のURL（YouTube・mp4・gif）" value="' + esc(e.video) + '">' +
        '<button class="btn sm" data-act="ex-paste">貼付</button><button class="btn sm" data-act="ex-find">探す</button></div>' +
        '<div class="vid-state small" data-vstate>' + videoStateHtml(e.video) + '</div></div>';
    }).join('');
  }
  function videoStateHtml(url) {
    var v = parseVideo(url);
    if (!v) return '<span class="muted">貼り付けると、トレーニング中にループ再生できます</span>';
    return v.error ? '<span style="color:var(--danger)">' + esc(v.error) + '</span>' : '<span style="color:var(--good)">✓ ' + videoKindLabel(v) + 'を認識しました</span>';
  }
  function mini(label, f, v, mode) {
    return '<label class="mini"><span>' + label + '</span><input class="input tnum" type="number" inputmode="' + mode + '" data-f="' + f + '" value="' + esc(v) + '"></label>';
  }
  function syncEditorFields() {
    var name = $('#mName');
    if (!name || !editing) return;
    editing.name = name.value;
    Array.prototype.forEach.call(document.querySelectorAll('#exList > .card'), function (card) {
      var e = editing.exercises[+card.getAttribute('data-i')];
      Array.prototype.forEach.call(card.querySelectorAll('[data-f]'), function (inp) {
        var f = inp.getAttribute('data-f');
        e[f] = f === 'name' || f === 'video' ? inp.value : inp.value === '' ? '' : +inp.value;
      });
    });
  }

  // ---- トレーニング ----
  var tick = null, wakeLock = null, audio = null;

  function startWorkout(menuId) {
    var menu = state.data.menus.filter(function (m) { return m.id === menuId; })[0];
    if (!menu) return;
    if (draft && !confirm('「' + draft.menuName + '」の途中の記録があります。破棄して新しく始めますか？')) { openWorkout(); return; }
    var hist = exerciseHistory();
    draft = {
      id: uid(), menuName: menu.name, startedAt: Date.now(), date: today(), memo: '', restEnd: null, restTotal: 0, pace: paceSec(menu.name),
      exercises: menu.exercises.map(function (e) {
        var h = hist[e.name], prev = h ? h[h.length - 1].sets : null;
        var sets = [];
        for (var i = 0; i < e.sets; i++) {
          var p = prev ? prev[Math.min(i, prev.length - 1)] : null;
          sets.push({
            w: e.kind === 'weight' ? (p ? +p.weight : +e.weight || 0) : 0,
            r: p ? +p.reps : +e.reps,
            done: false
          });
        }
        return {
          name: e.name, kind: e.kind || 'weight', video: e.video || '', rest: +e.rest || 0, target: { sets: e.sets, reps: e.reps, weight: e.weight },
          prev: prev ? prev.map(function (s) { return { w: +s.weight, r: +s.reps }; }) : null,
          best: h ? Math.max.apply(null, h.map(function (x) { return x.m.best; })) : 0,
          sets: sets
        };
      })
    };
    saveDraft();
    closeSheet();
    openWorkout();
  }

  function saveDraft() { save(LS.draft, draft); }

  function openWorkout() {
    if (!draft) return;
    var w = $('.workout');
    if (!w) {
      $('#layer').insertAdjacentHTML('afterbegin', '<div class="workout" role="dialog" aria-label="トレーニング"></div>');
      w = $('.workout');
    }
    openVid = {};
    w.innerHTML = workoutHtml();
    document.body.style.overflow = 'hidden';
    requestWake();
    clearInterval(tick);
    tick = setInterval(onTick, 500);
    onTick();
  }

  function closeWorkout() {
    var w = $('.workout');
    if (w) w.remove();
    document.body.style.overflow = '';
    clearInterval(tick);
    releaseWake();
    render();
  }

  function workoutHtml() {
    var html = '<div class="workout-head"><button class="icon-btn" data-act="w-minimize" aria-label="閉じる">' + icon('min') + '</button>' +
      '<div class="title"><b>' + esc(draft.menuName) + '</b><span class="tnum" id="wClock">0:00</span><span class="tnum" id="wRemain"></span></div>' +
      '<button class="btn sm" data-act="w-discard">破棄</button></div>' +
      '<div class="workout-progress"><i id="wProg"></i></div><div class="workout-body">';
    draft.exercises.forEach(function (e, ei) {
      html += exCardHtml(e, ei);
    });
    html += '<label class="field"><span>メモ</span><textarea class="input" id="wMemo" placeholder="体調・フォームの気づきなど">' + esc(draft.memo) + '</textarea></label></div>' +
      '<div class="dock"><div class="inner"><button class="btn primary block lg" data-act="w-finish">' + icon('check') + 'トレーニングを完了</button></div></div>' +
      '<div id="restSlot"></div>';
    return html;
  }

  function exCardHtml(e, ei) {
    var isW = e.kind === 'weight', allDone = e.sets.every(function (s) { return s.done; });
    var tgt = e.target.sets + '×' + e.target.reps + (e.kind === 'time' ? '秒' : '回') + (isW ? ' ・ ' + fmtNum(e.target.weight) + 'kg' : '');
    var bestTxt = e.best ? (isW ? '推定1RM ' + fmtNum(e.best) + 'kg' : fmtNum(e.best) + (e.kind === 'time' ? '秒' : '回')) : '';
    var h = '<div class="ex-card' + (allDone ? ' done' : '') + '" data-ei="' + ei + '"><div class="row"><div class="grow"><h4>' + esc(e.name) + '</h4>' +
      '<div class="sub">目標 ' + tgt + (bestTxt ? ' ・ ベスト ' + bestTxt : '') + ' ・ 休憩' + e.rest + '秒</div></div><span class="pill">' + KIND_LABEL[e.kind] + '</span></div>' +
      (hasVideo(e) ? '<button class="vid-toggle" data-act="w-video">' + (openVid[ei] ? '■ 動画を閉じる' : '▶ フォーム動画を見る（ループ再生）') + '</button>' : '') +
      '<div class="set-head' + (isW ? '' : ' no-w') + '"><span>SET</span>' + (isW ? '<span>KG</span>' : '') + '<span>' + (e.kind === 'time' ? '秒' : '回') + '</span><span></span></div>';
    e.sets.forEach(function (s, si) {
      var p = e.prev ? e.prev[si] : null;
      h += '<div class="set-row' + (isW ? '' : ' no-w') + (s.done ? ' done' : '') + '" data-si="' + si + '"><span class="n">' + (si + 1) + '</span>' +
        (isW ? stepper('w', s.w, 'decimal') : '') + stepper('r', s.r, 'numeric') +
        (e.kind === 'time' && !s.done
          ? '<button class="check play" data-act="w-hold" aria-label="タイマー開始">' + icon('play') + '</button>'
          : '<button class="check" data-act="w-check" aria-label="完了">' + icon('check') + '</button>') + '</div>';
      if (p) h += '<div class="prev' + (isW ? '' : ' no-w') + '">前回 ' + (isW ? fmtNum(p.w) + 'kg × ' + p.r : p.r + (e.kind === 'time' ? '秒' : '回')) + '</div>';
    });
    h += '<div class="ex-actions"><button data-act="w-addset">＋ セット追加</button>' +
      (e.sets.length > 1 ? '<button data-act="w-delset">− 最後のセットを削除</button>' : '') + '</div></div>';
    return h;
  }

  function stepper(f, v, mode) {
    return '<div class="stepper"><button data-act="w-step" data-f="' + f + '" data-d="-1" aria-label="減らす">−</button>' +
      '<input type="number" inputmode="' + mode + '" data-f="' + f + '" value="' + fmtNum(v, 2) + '">' +
      '<button data-act="w-step" data-f="' + f + '" data-d="1" aria-label="増やす">＋</button></div>';
  }

  function hasVideo(e) { var v = parseVideo(e.video); return !!v && !v.error; }

  /** セット完了などでカードを描き直しても、再生中の動画は同じ要素のまま残して頭出しに戻さない。 */
  function rerenderExCard(ei) {
    var card = document.querySelector('.ex-card[data-ei="' + ei + '"]');
    if (card) {
      var keep = card.querySelector('.vid');
      card.outerHTML = exCardHtml(draft.exercises[ei], ei);
      var fresh = document.querySelector('.ex-card[data-ei="' + ei + '"]');
      if (keep && fresh && fresh.querySelector('.vid-toggle')) fresh.querySelector('.vid-toggle').after(keep);
    }
    updateProgress();
  }

  function updateProgress() {
    var done = 0, total = 0;
    draft.exercises.forEach(function (e) { e.sets.forEach(function (s) { total++; if (s.done) done++; }); });
    var p = $('#wProg');
    if (p) p.style.width = (total ? done / total * 100 : 0) + '%';
  }

  function onTick() {
    if (!draft) return;
    var c = $('#wClock');
    if (c) c.textContent = '経過 ' + fmtClock((Date.now() - draft.startedAt) / 1000);
    var rm = $('#wRemain'), left = remainingSec();
    if (rm) rm.textContent = left > 0 ? ' ・ 残り約' + Math.max(1, Math.round(left / 60)) + '分' : ' ・ 全セット完了';
    renderRest();
    renderHold();
  }

  // 休憩タイマー（終了時刻で管理するので、画面を閉じても正しく進む）
  var restAlerted = false;
  function startRest(sec) {
    if (!sec) return;
    draft.restEnd = Date.now() + sec * 1000;
    draft.restTotal = sec;
    restAlerted = false;
    saveDraft();
    renderRest();
  }
  function renderRest() {
    var slot = $('#restSlot');
    if (!slot) return;
    if (!draft.restEnd) { slot.innerHTML = ''; slot.removeAttribute('data-mode'); return; }
    var left = (draft.restEnd - Date.now()) / 1000;
    if (left <= 0 && !restAlerted) { restAlerted = true; beep(3); }
    if (left < -4) { draft.restEnd = null; saveDraft(); slot.innerHTML = ''; slot.removeAttribute('data-mode'); return; }
    var C = 2 * Math.PI * 22, frac = Math.max(0, left) / (draft.restTotal || 1);
    var mode = left <= 0 ? 'over' : 'run';
    // ボタンを押している最中に作り直さないよう、表示モードが変わったときだけ組み立てる
    if (slot.getAttribute('data-mode') !== mode) {
      slot.setAttribute('data-mode', mode);
      slot.innerHTML = '<div class="rest' + (mode === 'over' ? ' over' : '') + '"><svg class="ring" viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22"/>' +
        '<circle class="fg" cx="26" cy="26" r="22" stroke-dasharray="' + C + '"/></svg>' +
        '<div class="grow"><div class="t"></div><div class="l">' + (mode === 'over' ? '次のセットへ' : '休憩中') + '</div></div>' +
        (mode === 'over' ? '' : '<button data-act="rest-add" data-d="-15">−15</button><button data-act="rest-add" data-d="15">+15</button>') +
        '<button data-act="rest-skip">' + (mode === 'over' ? '閉じる' : 'スキップ') + '</button></div>';
    }
    $('.t', slot).textContent = mode === 'over' ? '休憩終了' : fmtClock(Math.ceil(left));
    $('.fg', slot).setAttribute('stroke-dashoffset', C * (1 - frac));
  }

  // 時間種目（プランク等）のカウントダウン
  var hold = null;
  function startHold(ei, si) {
    unlockAudio();
    var e = draft.exercises[ei], target = +e.sets[si].r || 30;
    hold = { ei: ei, si: si, target: target, start: Date.now() + 3000 };
    openSheet('<div class="hold"><div class="muted" id="hLabel">' + esc(e.name) + ' ・ ' + (si + 1) + 'セット目</div><div class="big" id="hTime">3</div>' +
      '<div class="muted small" id="hSub">準備…</div></div>' +
      '<div class="foot"><button class="btn block lg" data-act="hold-cancel">やめる</button><button class="btn primary block lg" data-act="hold-done">ここで完了</button></div>');
  }
  function renderHold() {
    if (!hold) return;
    var t = $('#hTime'), sub = $('#hSub');
    if (!t) { hold = null; return; }
    var now = Date.now();
    if (now < hold.start) {
      var n = Math.ceil((hold.start - now) / 1000);
      if (t.textContent !== String(n)) { t.textContent = n; beep(1, 660, 0.08); }
      return;
    }
    if (!hold.go) { hold.go = true; beep(1, 990, 0.15); }
    var el = (now - hold.start) / 1000, left = hold.target - el;
    t.textContent = left > 0 ? Math.ceil(left) : '+' + Math.floor(-left);
    sub.textContent = left > 0 ? '目標 ' + hold.target + '秒' : '目標達成！ 続けてもOK';
    if (left <= 0 && !hold.alerted) { hold.alerted = true; beep(3); }
  }
  function finishHold(record) {
    if (!hold) return;
    var h = hold;
    hold = null;
    closeSheet();
    if (!record) return;
    var secs = Math.max(1, Math.round((Date.now() - h.start) / 1000));
    var s = draft.exercises[h.ei].sets[h.si];
    s.r = Date.now() < h.start ? s.r : secs;
    markDone(h.ei, h.si, true);
  }

  function markDone(ei, si, done) {
    var e = draft.exercises[ei], s = e.sets[si];
    s.done = done;
    saveDraft();
    rerenderExCard(ei);
    if (!done) return;
    var v = e.kind === 'weight' ? e1rm(+s.w, +s.r) : +s.r;
    if (e.best && v > e.best + 1e-9) {
      e.best = v;
      saveDraft();
      toast('🔥 自己ベスト更新！ ' + e.name);
    }
    var lastSet = draft.exercises.every(function (x) { return x.sets.every(function (y) { return y.done; }); });
    if (!lastSet) startRest(e.rest);
    else { draft.restEnd = null; saveDraft(); renderRest(); toast('全セット完了！ おつかれさまでした'); }
  }

  function finishWorkout() {
    var anyDone = draft.exercises.some(function (e) { return e.sets.some(function (s) { return s.done; }); });
    var useAll = false;
    if (!anyDone) {
      if (!confirm('完了チェックのついたセットがありません。入力されているセットをすべて記録しますか？')) return;
      useAll = true;
    }
    var sets = [], prs = [], volume = 0;
    draft.exercises.forEach(function (e) {
      var no = 0, best = 0, bestSet = null;
      e.sets.forEach(function (s) {
        if (!(useAll || s.done) || !(+s.r > 0)) return;
        no++;
        sets.push({ exercise: e.name, kind: e.kind, setNo: no, weight: e.kind === 'weight' ? +s.w : 0, reps: +s.r });
        if (e.kind === 'weight') volume += (+s.w) * (+s.r);
        var v = e.kind === 'weight' ? e1rm(+s.w, +s.r) : +s.r;
        if (v > best) { best = v; bestSet = { weight: +s.w, reps: +s.r }; }
      });
      var prevBest = prevBestFor(e.name);
      if (bestSet && prevBest > 0 && best > prevBest + 1e-9) prs.push({ name: e.name, kind: e.kind, set: bestSet });
    });
    if (!sets.length) { toast('記録できるセットがありません', true); return; }
    var minutes = Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000));
    var session = { id: draft.id, date: draft.date, menuName: draft.menuName, memo: draft.memo, duration: minutes, sets: sets };

    openSheet('<div class="summary-hero"><div class="emoji">' + (prs.length ? '🔥' : '💪') + '</div><h3>おつかれさまでした！</h3>' +
      '<div class="muted small">' + esc(draft.menuName) + '</div></div>' +
      '<div class="summary-grid"><div class="stat"><div class="v tnum">' + minutes + '<small>分</small></div><div class="k">時間' + paceNote(minutes) + '</div></div>' +
      '<div class="stat"><div class="v tnum">' + sets.length + '<small>セット</small></div><div class="k">完了</div></div>' +
      '<div class="stat"><div class="v tnum">' + (volume ? fmtBig(volume).replace(/(kg|t)$/, '<small>$1</small>') : '–') + '</div><div class="k">総重量</div></div>' +
      '<div class="stat"><div class="v tnum">' + prs.length + '<small>件</small></div><div class="k">自己ベスト更新</div></div></div>' +
      (prs.length ? '<div class="card" style="margin-top:12px;padding:4px 16px">' + prs.map(function (p) {
        return '<div class="list-item"><span class="badge">PR</span><div class="grow"><b>' + esc(p.name) + '</b></div><b class="tnum">' + setLabel(p.kind, p.set) + '</b></div>';
      }).join('') + '</div>' : '') +
      '<label class="field"><span>日付</span><input class="input" type="date" id="fDate" value="' + draft.date + '"></label>' +
      '<div class="foot"><button class="btn block lg" data-act="sheet-close">戻る</button><button class="btn primary block lg" data-act="w-save">保存する</button></div>',
      function () { pendingSession = session; });
  }
  var pendingSession = null;
  function paceNote(minutes) {
    var avg = menuAvgMin(draft.menuName);
    if (!avg) return '';
    var d = minutes - avg;
    return '（平均より' + (d === 0 ? '同じ' : Math.abs(d) + '分' + (d > 0 ? '長い' : '短い')) + '）';
  }

  function prevBestFor(name) {
    var h = exerciseHistory()[name];
    return h ? Math.max.apply(null, h.map(function (x) { return x.m.best; })) : 0;
  }

  function requestWake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
      }
    } catch (e) { /* 非対応 */ }
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }

  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep(times, freq, len) {
    if (navigator.vibrate) navigator.vibrate(times > 1 ? [180, 90, 180, 90, 180] : 60);
    if (!state.settings.sound || !audio) return;
    for (var i = 0; i < times; i++) {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.28;
      o.frequency.value = freq || 880;
      o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.2));
      o.start(t); o.stop(t + (len || 0.2) + 0.02);
    }
  }

  // ---- インターバルタイマー ----
  var IVL_PRESETS = [
    { name: 'タバタ', work: 20, rest: 10, rounds: 8 },
    { name: '30/15', work: 30, rest: 15, rounds: 8 },
    { name: '40/20', work: 40, rest: 20, rounds: 6 },
    { name: '45/15', work: 45, rest: 15, rounds: 10 },
    { name: '60/30', work: 60, rest: 30, rounds: 5 }
  ];
  var IVL_READY = 5;
  var ivl = null, ivlTick = null;

  function ivlCfg() {
    var c = Object.assign({ work: 30, rest: 15, rounds: 8 }, load(LS.ivl, {}));
    c.work = Math.min(600, Math.max(5, +c.work || 30));
    c.rest = Math.min(600, Math.max(0, isNaN(+c.rest) ? 15 : +c.rest));
    c.rounds = Math.min(50, Math.max(1, Math.round(+c.rounds) || 8));
    return c;
  }
  function ivlClamp(c) {
    c.work = Math.min(600, Math.max(5, +c.work || 5));
    c.rest = Math.min(600, Math.max(0, +c.rest || 0));
    c.rounds = Math.min(50, Math.max(1, Math.round(+c.rounds) || 1));
    return c;
  }
  function ivlTotal(c) { return IVL_READY + c.rounds * c.work + (c.rounds - 1) * c.rest; }
  function ivlSegments(c) {
    var seg = [{ t: 'ready', d: IVL_READY, r: 0 }];
    for (var r = 1; r <= c.rounds; r++) {
      seg.push({ t: 'work', d: c.work, r: r });
      if (r < c.rounds && c.rest > 0) seg.push({ t: 'rest', d: c.rest, r: r });
    }
    return seg;
  }

  function ivlSheet() {
    var c = ivlCfg();
    function row(label, f, v, unit, step) {
      return '<div class="field"><span>' + label + '</span><div class="stepper" style="height:52px">' +
        '<button data-act="ivl-step" data-f="' + f + '" data-d="-' + step + '" aria-label="減らす">−</button>' +
        '<input type="number" inputmode="numeric" data-ivl="' + f + '" value="' + v + '" style="font-size:20px">' +
        '<span class="muted small" style="flex:none">' + unit + '</span>' +
        '<button data-act="ivl-step" data-f="' + f + '" data-d="' + step + '" aria-label="増やす">＋</button></div></div>';
    }
    openSheet('<h3>インターバルタイマー</h3>' +
      '<div class="chips" style="margin-top:10px">' + IVL_PRESETS.map(function (p, i) {
        var on = p.work === c.work && p.rest === c.rest && p.rounds === c.rounds;
        return '<button class="' + (on ? 'on' : '') + '" data-act="ivl-preset" data-i="' + i + '">' + p.name + '</button>';
      }).join('') + '</div>' +
      row('運動', 'work', c.work, '秒', 5) + row('休憩', 'rest', c.rest, '秒', 5) + row('ラウンド数', 'rounds', c.rounds, '回', 1) +
      '<div class="foot"><button class="btn lg" data-act="sheet-close" style="flex:1">閉じる</button><button class="btn primary lg" data-act="ivl-start" style="flex:3;white-space:nowrap">' + icon('play') + 'スタート（' + fmtClock(ivlTotal(c)) + '）</button></div>');
  }

  function ivlStart() {
    var c = ivlCfg();
    unlockAudio();
    closeSheet();
    var segs = ivlSegments(c);
    ivl = { cfg: c, segs: segs, total: segs.reduce(function (a, x) { return a + x.d; }, 0), startAt: Date.now(), pausedAt: null, idx: -1, lastSec: null, finished: false };
    $('#layer').insertAdjacentHTML('afterbegin',
      '<div class="ivl" id="ivl"><div class="ivl-top"><button class="icon-btn" data-act="ivl-end" aria-label="終了">' + icon('close') + '</button>' +
      '<b id="ivlRound"></b><span style="width:40px"></span></div>' +
      '<div class="ivl-phase" id="ivlPhase"></div><div class="ivl-time tnum" id="ivlTime"></div><div class="ivl-next" id="ivlNext"></div>' +
      '<div class="ivl-bar"><i id="ivlBar"></i></div>' +
      '<div class="ivl-actions"><button class="btn lg" data-act="ivl-pause" id="ivlPause">一時停止</button><button class="btn lg" data-act="ivl-skip">スキップ</button></div></div>');
    document.body.style.overflow = 'hidden';
    requestWake();
    clearInterval(ivlTick);
    ivlTick = setInterval(ivlRender, 200);
    ivlRender();
  }

  /** 経過秒から、いま何番目の区間の何秒目かを求める（時刻で管理するので画面を閉じても狂わない）。 */
  function ivlPos() {
    var el = ((ivl.pausedAt || Date.now()) - ivl.startAt) / 1000, acc = 0;
    for (var i = 0; i < ivl.segs.length; i++) {
      if (el < acc + ivl.segs[i].d) return { i: i, left: acc + ivl.segs[i].d - el, el: el };
      acc += ivl.segs[i].d;
    }
    return { i: ivl.segs.length, left: 0, el: ivl.total };
  }

  function ivlRender() {
    if (!ivl || ivl.finished) return;
    var pos = ivlPos(), box = $('#ivl');
    if (!box) return;
    if (pos.i >= ivl.segs.length) { ivlComplete(); return; }
    var seg = ivl.segs[pos.i], c = ivl.cfg;
    if (pos.i !== ivl.idx) {
      var first = ivl.idx < 0;
      ivl.idx = pos.i; ivl.lastSec = null;
      box.className = 'ivl ' + seg.t;
      $('#ivlPhase').textContent = seg.t === 'work' ? '運動' : seg.t === 'rest' ? '休憩' : '準備';
      $('#ivlRound').textContent = seg.t === 'ready' ? c.rounds + 'ラウンド' : seg.r + ' / ' + c.rounds;
      var nxt = ivl.segs[pos.i + 1];
      $('#ivlNext').textContent = nxt ? '次：' + (nxt.t === 'work' ? '運動 ' + nxt.d + '秒（' + nxt.r + '/' + c.rounds + '）' : '休憩 ' + nxt.d + '秒') : '最後のラウンド！';
      if (!first) beep(1, seg.t === 'work' ? 990 : 660, seg.t === 'work' ? 0.3 : 0.2);
    }
    var sec = Math.ceil(pos.left);
    if (sec !== ivl.lastSec) {
      ivl.lastSec = sec;
      $('#ivlTime').textContent = sec;
      if (sec <= 3 && sec >= 1 && !ivl.pausedAt && seg.d > 3) beep(1, 780, 0.08);
    }
    $('#ivlBar').style.width = Math.min(100, pos.el / ivl.total * 100) + '%';
    $('#ivlPause').textContent = ivl.pausedAt ? '再開' : '一時停止';
  }

  function ivlRoundsDone() {
    var pos = ivlPos(), n = 0;
    for (var i = 0; i < Math.min(pos.i, ivl.segs.length); i++) if (ivl.segs[i].t === 'work') n++;
    return n;
  }

  function ivlComplete() {
    if (ivl.finished) return;
    ivl.finished = true;
    clearInterval(ivlTick);
    beep(3);
    ivlFinishSheet(true);
  }

  function ivlFinishSheet(completed) {
    var c = ivl.cfg, n = completed ? c.rounds : ivlRoundsDone();
    var minutes = Math.max(1, Math.round((completed ? ivl.total : ivlPos().el) / 60));
    if (n < 1) { ivlClose(); return; }
    ivl.save = { rounds: n, minutes: minutes };
    openSheet('<div class="summary-hero"><div class="emoji">' + (completed ? '🔥' : '💪') + '</div><h3>' + (completed ? '完走！' : 'おつかれさまでした') + '</h3>' +
      '<div class="muted small">' + c.work + '秒運動 / ' + c.rest + '秒休憩</div></div>' +
      '<div class="summary-grid"><div class="stat"><div class="v tnum">' + n + '<small>ラウンド</small></div><div class="k">完了</div></div>' +
      '<div class="stat"><div class="v tnum">' + minutes + '<small>分</small></div><div class="k">時間</div></div></div>' +
      '<label class="field"><span>日付</span><input class="input" type="date" id="fDate" value="' + today() + '"></label>' +
      '<div class="foot"><button class="btn block lg" data-act="ivl-discard">保存しない</button><button class="btn primary block lg" data-act="ivl-save">記録する</button></div>');
  }

  function ivlClose() {
    clearInterval(ivlTick);
    var b = $('#ivl'); if (b) b.remove();
    ivl = null;
    if (!draft || !$('.workout')) { document.body.style.overflow = ''; releaseWake(); }
  }

  // ---- セットアップ ----
  function renderSetup() {
    $('#tabbar').hidden = true;
    $('#view').innerHTML = '<div class="setup"><img class="logo" src="icons/icon-192.png" alt="">' +
      '<h1>筋トレメニュー</h1><p class="muted">自宅トレーニングのメニュー作成・記録・成長の見える化を、ひとつのアプリで。</p>' +
      '<div class="card" style="margin-top:20px"><b>はじめての接続</b><ol class="small">' +
      '<li>Apps Script の Web アプリ URL（/exec）をブラウザで開く</li>' +
      '<li>案内に出るスプレッドシートを開き、「設定」シートの B2（接続コード）をコピー</li>' +
      '<li>下に貼り付けて「接続」</li></ol>' +
      '<label class="field"><span>接続コード</span><textarea class="input" id="connCode" rows="3" placeholder="eyJ1Ijoi…" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></label>' +
      '<button class="btn primary block lg" style="margin-top:14px" data-act="connect">接続</button></div>' +
      '<button class="btn ghost block" style="margin-top:10px" data-act="demo">デモデータで試す</button>' +
      '<p class="muted small center" style="margin-top:18px">ホーム画面に追加してから接続すると、アプリとして全画面で使えます。</p></div>';
  }

  function decodeConn(code) {
    code = String(code || '').trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (code.length % 4) code += '=';
    var o = JSON.parse(atob(code));
    if (!o.u || !o.k || !/^https:\/\/script\.google\.com\//.test(o.u)) throw new Error('bad');
    return { u: o.u, k: o.k };
  }

  function connect(btn) {
    var conn;
    try { conn = decodeConn($('#connCode').value); } catch (e) { toast('接続コードの形式が正しくありません', true); return; }
    btn.disabled = true;
    btn.textContent = '接続中…';
    var prev = state.conn;
    state.conn = conn;
    api('getData').then(function (data) {
      save(LS.conn, conn);
      state.data = normalize(data);
      state.outbox = [];
      save(LS.outbox, []);
      persistData();
      state.tab = 'home';
      render();
      toast('接続しました');
    }, function (e) {
      state.conn = prev;
      btn.disabled = false;
      btn.textContent = '接続';
      toast(e.auth ? '接続コードが違います' : '接続できませんでした（' + e.message + '）', true);
    });
  }

  function startDemo() {
    state.conn = { demo: true };
    save(LS.conn, state.conn);
    state.data = normalize(load(LS.demo, null) || demoData());
    save(LS.demo, state.data);
    persistData();
    state.tab = 'home';
    render();
  }

  function demoData() {
    var menus = TEMPLATES.map(function (t, i) { return { id: uid(), name: t.name, order: i, exercises: JSON.parse(JSON.stringify(t.exercises)) }; });
    var sessions = [], start = addDays(new Date(), -60), k = 0;
    for (var d = 0; d <= 58; d++) {
      var date = addDays(start, d);
      if ([1, 3, 5].indexOf(date.getDay()) < 0 || Math.random() < 0.15) continue;
      var m = menus[k++ % menus.length], prog = d / 58, sets = [];
      m.exercises.forEach(function (e) {
        for (var i = 1; i <= e.sets; i++) {
          sets.push({
            exercise: e.name, kind: e.kind, setNo: i,
            weight: e.kind === 'weight' ? Math.round((e.weight * (1 + prog * 0.35)) * 2) / 2 : 0,
            reps: Math.max(1, Math.round(e.reps * (e.kind === 'weight' ? 1 : 1 + prog * 0.4)) - (i === e.sets ? 1 : 0))
          });
        }
      });
      sessions.push({ id: uid(), date: dstr(date), menuName: m.name, memo: '', duration: 25 + Math.round(Math.random() * 15), sets: sets });
    }
    var body = [];
    for (var b = 0; b < 9; b++) body.push({ date: dstr(addDays(start, b * 7)), weight: Math.round((68.4 - b * 0.25 + (Math.random() - 0.5) * 0.4) * 10) / 10 });
    return { menus: menus, sessions: sessions, body: body };
  }

  // ---- 操作 ----
  var actions = {
    tab: function (el) { state.tab = el.getAttribute('data-tab'); state.openSession = null; render(); window.scrollTo(0, 0); },
    settings: settingsSheet,
    'sheet-close': function () { if (hold) { finishHold(false); return; } closeSheet(); },
    'sync-now': function () { if (state.conn && !state.conn.demo) flush(); },
    'pick-menu': pickMenuSheet,
    start: function (el) { unlockAudio(); startWorkout(el.getAttribute('data-id')); },
    resume: function () { unlockAudio(); openWorkout(); },
    body: bodySheet,
    'body-save': function () {
      var date = $('#bDate').value, w = parseFloat($('#bWeight').value);
      if (!date || !(w > 0)) { toast('体重を入力してください', true); return; }
      closeSheet();
      mutate('saveBody', { date: date, weight: w }, function (d) {
        d.body = d.body.filter(function (b) { return b.date !== date; }).concat([{ date: date, weight: w }]);
      });
      toast('体重を記録しました');
    },
    'body-delete': function (el) {
      var date = el.getAttribute('data-date');
      if (!confirm(fmtMD(date) + ' の体重を削除しますか？')) return;
      mutate('deleteBody', { date: date }, function (d) { d.body = d.body.filter(function (b) { return b.date !== date; }); });
    },
    'set-goal': function (el) { state.settings.weeklyGoal = +el.getAttribute('data-v'); save(LS.settings, state.settings); settingsSheet(); render(); },
    'set-step': function (el) { state.settings.weightStep = +el.getAttribute('data-v'); save(LS.settings, state.settings); settingsSheet(); },
    'set-sound': function (el) { state.settings.sound = el.getAttribute('data-v') === '1'; save(LS.settings, state.settings); settingsSheet(); },
    disconnect: function () {
      var demo = state.conn.demo;
      if (!demo && state.outbox.length && !confirm('未送信の記録が ' + state.outbox.length + ' 件あります。接続を解除すると失われます。続けますか？')) return;
      if (!demo && !confirm('この端末の接続を解除します（スプレッドシートのデータは消えません）。')) return;
      state.conn = null; save(LS.conn, null);
      state.outbox = []; save(LS.outbox, []);
      state.data = normalize(null); save(LS.data, null);
      draft = null; save(LS.draft, null);
      closeSheet(); render();
    },
    connect: function (el) { connect(el); },
    demo: startDemo,

    // メニュー
    'menu-new': function () { menuEditor({ name: '', exercises: [ex('', 'bodyweight', 3, 10, 0, 60)] }); },
    'menu-edit': function (el, ev) {
      if (ev.target.closest('[data-act="start"]')) return;
      var m = state.data.menus.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
      if (m) menuEditor(m);
    },
    'menu-sort': function () { state.menuSort = !state.menuSort; render(); },
    'menu-move': function (el) {
      var i = +el.getAttribute('data-i'), j = i + +el.getAttribute('data-d'), menus = state.data.menus;
      if (j < 0 || j >= menus.length) return;
      var ids = menus.map(function (m) { return m.id; });
      ids.splice(j, 0, ids.splice(i, 1)[0]);
      mutate('reorderMenus', { ids: ids }, function (d) {
        d.menus.forEach(function (m) { m.order = ids.indexOf(m.id); });
        d.menus.sort(function (a, b) { return a.order - b.order; });
      });
    },
    'tpl-add': function (el) {
      var t = TEMPLATES[+el.getAttribute('data-i')];
      var name = t.name, n = 2;
      while (state.data.menus.some(function (m) { return m.name === name; })) name = t.name + ' ' + n++;
      saveMenu({ id: uid(), name: name, order: state.data.menus.length, exercises: JSON.parse(JSON.stringify(t.exercises)) });
      toast('「' + name + '」を追加しました');
    },
    'ex-paste': function (el) {
      var inp = el.closest('.row').querySelector('input');
      var hint = function () { toast('入力欄を長押しして「ペースト」してください'); inp.focus(); };
      if (!navigator.clipboard || !navigator.clipboard.readText) { hint(); return; }
      navigator.clipboard.readText().then(function (t) {
        inp.value = String(t || '').trim();
        inp.closest('.card').querySelector('[data-vstate]').innerHTML = videoStateHtml(inp.value);
      }, hint);
    },
    'ex-find': function (el) {
      var card = el.closest('.card'), name = card.querySelector('input[data-f="name"]').value.trim();
      if (!name) { toast('先に種目名を入力してください', true); return; }
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' やり方 フォーム'), '_blank', 'noopener');
    },
    'ex-add': function () { syncEditorFields(); editing.exercises.push(ex('', 'bodyweight', 3, 10, 0, 60)); renderExList(); var c = document.querySelectorAll('#exList input[data-f="name"]'); c[c.length - 1].focus(); },
    'ex-del': function (el) {
      syncEditorFields();
      if (editing.exercises.length <= 1) { toast('種目は1つ以上必要です', true); return; }
      editing.exercises.splice(+el.closest('[data-i]').getAttribute('data-i'), 1); renderExList();
    },
    'ex-move': function (el) {
      syncEditorFields();
      var i = +el.closest('[data-i]').getAttribute('data-i'), list = editing.exercises;
      if (i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); renderExList(); }
    },
    'ex-kind': function (el) {
      syncEditorFields();
      var e = editing.exercises[+el.closest('[data-i]').getAttribute('data-i')], k = el.getAttribute('data-k');
      if (e.kind !== k && k === 'time' && e.reps < 15) e.reps = 30;
      if (e.kind === 'time' && k !== 'time' && e.reps > 30) e.reps = 10;
      e.kind = k; renderExList();
    },
    'menu-save': function () {
      syncEditorFields();
      var m = editing;
      m.name = String(m.name || '').trim();
      m.exercises = m.exercises.filter(function (e) { return String(e.name).trim(); }).map(function (e) {
        return { name: String(e.name).trim(), kind: e.kind, sets: Math.max(1, +e.sets || 1), reps: Math.max(1, +e.reps || 1), weight: Math.max(0, +e.weight || 0), rest: Math.max(0, +e.rest || 0), video: String(e.video || '').trim() };
      });
      for (var vi = 0; vi < m.exercises.length; vi++) {
        var pv = parseVideo(m.exercises[vi].video);
        if (pv && pv.error) { toast('「' + m.exercises[vi].name + '」の動画：' + pv.error, true); return; }
      }
      if (!m.name) { toast('メニュー名を入力してください', true); return; }
      if (!m.exercises.length) { toast('種目名を入力してください', true); return; }
      if (!m.id) { m.id = uid(); m.order = state.data.menus.length; }
      closeSheet();
      saveMenu(m);
      toast('保存しました');
    },
    'menu-dup': function () {
      syncEditorFields();
      var m = JSON.parse(JSON.stringify(editing));
      m.id = uid(); m.name = m.name + ' のコピー'; m.order = state.data.menus.length;
      closeSheet(); saveMenu(m); toast('複製しました');
    },
    'menu-delete': function () {
      if (!confirm('「' + editing.name + '」を削除しますか？（過去の記録は残ります）')) return;
      var id = editing.id;
      closeSheet();
      mutate('deleteMenu', { id: id }, function (d) { d.menus = d.menus.filter(function (m) { return m.id !== id; }); });
    },

    // 履歴
    'session-toggle': function (el, ev) {
      if (ev.target.closest('[data-act="session-delete"]')) return;
      var id = el.getAttribute('data-id');
      state.openSession = state.openSession === id ? null : id;
      render();
    },
    'session-delete': function (el) {
      var id = el.getAttribute('data-id');
      if (!confirm('この記録を削除しますか？')) return;
      mutate('deleteSession', { id: id }, function (d) { d.sessions = d.sessions.filter(function (s) { return s.id !== id; }); });
      toast('削除しました');
    },

    // 分析
    'stats-ex': function (el) { state.statsEx = el.getAttribute('data-name'); state.statsMetric = null; render(); },
    'stats-metric': function (el) { state.statsMetric = el.getAttribute('data-k'); render(); },

    // インターバルタイマー
    'ivl-open': function () { unlockAudio(); ivlSheet(); },
    'ivl-preset': function (el) { save(LS.ivl, IVL_PRESETS[+el.getAttribute('data-i')]); ivlSheet(); render(); },
    'ivl-step': function (el) {
      var c = ivlCfg(), f = el.getAttribute('data-f');
      c[f] = +c[f] + +el.getAttribute('data-d');
      save(LS.ivl, ivlClamp(c)); ivlSheet(); render();
    },
    'ivl-start': ivlStart,
    'ivl-pause': function () {
      if (!ivl) return;
      if (ivl.pausedAt) { ivl.startAt += Date.now() - ivl.pausedAt; ivl.pausedAt = null; }
      else ivl.pausedAt = Date.now();
      ivlRender();
    },
    'ivl-skip': function () {
      if (!ivl) return;
      ivl.startAt -= ivlPos().left * 1000;
      ivlRender();
    },
    'ivl-end': function () {
      if (!ivl || ivl.finished) return;
      var wasPaused = !!ivl.pausedAt;
      if (!wasPaused) ivl.pausedAt = Date.now();
      if (!confirm('タイマーを終了しますか？')) {
        if (!wasPaused) { ivl.startAt += Date.now() - ivl.pausedAt; ivl.pausedAt = null; }
        return;
      }
      ivl.finished = true;
      clearInterval(ivlTick);
      ivlFinishSheet(false);
    },
    'ivl-save': function () {
      var sv = ivl.save, c = ivl.cfg, date = $('#fDate').value || today(), sets = [];
      for (var i = 1; i <= sv.rounds; i++) sets.push({ exercise: 'インターバル', kind: 'time', setNo: i, weight: 0, reps: c.work });
      var session = { id: uid(), date: date, menuName: 'インターバル ' + c.work + '/' + c.rest, memo: '', duration: sv.minutes, sets: sets };
      closeSheet(); ivlClose();
      mutate('saveSession', session, function (d) { d.sessions.push(session); });
      toast('記録しました 💪');
    },
    'ivl-discard': function () { closeSheet(); ivlClose(); },

    // トレーニング中
    'w-minimize': function () { saveDraft(); closeWorkout(); },
    'w-discard': function () {
      if (!confirm('このトレーニングを記録せずに終了しますか？')) return;
      draft = null; save(LS.draft, null); closeWorkout();
    },
    'w-step': function (el) {
      var ei = +el.closest('[data-ei]').getAttribute('data-ei'), si = +el.closest('[data-si]').getAttribute('data-si');
      var f = el.getAttribute('data-f'), d = +el.getAttribute('data-d'), s = draft.exercises[ei].sets[si];
      var step = f === 'w' ? state.settings.weightStep : draft.exercises[ei].kind === 'time' ? 5 : 1;
      s[f] = Math.max(0, Math.round(((+s[f] || 0) + d * step) * 100) / 100);
      el.parentNode.querySelector('input').value = fmtNum(s[f], 2);
      saveDraft();
    },
    'w-check': function (el) {
      unlockAudio();
      var ei = +el.closest('[data-ei]').getAttribute('data-ei'), si = +el.closest('[data-si]').getAttribute('data-si');
      markDone(ei, si, !draft.exercises[ei].sets[si].done);
    },
    'w-video': function (el) {
      var card = el.closest('[data-ei]'), ei = +card.getAttribute('data-ei');
      if (card.querySelector('.vid')) {
        card.querySelector('.vid').remove(); openVid[ei] = false;
        el.textContent = '▶ フォーム動画を見る（ループ再生）';
        return;
      }
      var v = parseVideo(draft.exercises[ei].video);
      if (!v || v.error) { toast('動画のURLを確認してください', true); return; }
      // 同時に何本も読み込まないよう、ほかの動画は閉じる
      Array.prototype.forEach.call(document.querySelectorAll('.workout .ex-card .vid'), function (n) {
        var c = n.closest('[data-ei]'); n.remove(); openVid[+c.getAttribute('data-ei')] = false;
        c.querySelector('.vid-toggle').textContent = '▶ フォーム動画を見る（ループ再生）';
      });
      el.after(videoNode(v));
      openVid[ei] = true;
      el.textContent = '■ 動画を閉じる';
    },
    'w-hold': function (el) {
      startHold(+el.closest('[data-ei]').getAttribute('data-ei'), +el.closest('[data-si]').getAttribute('data-si'));
    },
    'hold-done': function () { finishHold(true); },
    'hold-cancel': function () { finishHold(false); },
    'w-addset': function (el) {
      var ei = +el.closest('[data-ei]').getAttribute('data-ei'), e = draft.exercises[ei], last = e.sets[e.sets.length - 1];
      e.sets.push({ w: last.w, r: last.r, done: false });
      saveDraft(); rerenderExCard(ei);
    },
    'w-delset': function (el) {
      var ei = +el.closest('[data-ei]').getAttribute('data-ei'), e = draft.exercises[ei];
      if (e.sets.length > 1) { e.sets.pop(); saveDraft(); rerenderExCard(ei); }
    },
    'rest-add': function (el) {
      draft.restEnd += +el.getAttribute('data-d') * 1000;
      draft.restTotal = Math.max(draft.restTotal, (draft.restEnd - Date.now()) / 1000);
      saveDraft(); renderRest();
    },
    'rest-skip': function () { draft.restEnd = null; saveDraft(); renderRest(); },
    'w-finish': finishWorkout,
    'w-save': function () {
      var s = pendingSession;
      if (!s) return;
      var date = $('#fDate').value;
      if (date) s.date = date;
      pendingSession = null;
      closeSheet();
      draft = null; save(LS.draft, null);
      closeWorkout();
      state.tab = 'home';
      mutate('saveSession', s, function (d) { d.sessions = d.sessions.filter(function (x) { return x.id !== s.id; }).concat([s]); });
      toast('記録を保存しました 💪');
    }
  };

  function saveMenu(m) {
    mutate('saveMenu', m, function (d) {
      var i = d.menus.findIndex(function (x) { return x.id === m.id; });
      if (i >= 0) d.menus[i] = m; else d.menus.push(m);
    });
  }

  document.addEventListener('click', function (ev) {
    var tabBtn = ev.target.closest('#tabbar [data-tab]');
    if (tabBtn) { actions.tab(tabBtn); return; }
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-act')];
    if (fn) fn(el, ev);
  });

  // トレーニング中の数値入力・メモ
  document.addEventListener('change', function (ev) {
    var f = ev.target.getAttribute && ev.target.getAttribute('data-ivl');
    if (!f) return;
    var c = ivlCfg(); c[f] = +ev.target.value;
    save(LS.ivl, ivlClamp(c)); ivlSheet(); render();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!draft) return;
    if (t.id === 'wMemo') { draft.memo = t.value; saveDraft(); return; }
    var row = t.closest('.workout [data-si]');
    if (row && t.matches('input[data-f]')) {
      var ei = +t.closest('[data-ei]').getAttribute('data-ei'), si = +row.getAttribute('data-si');
      draft.exercises[ei].sets[+si][t.getAttribute('data-f')] = t.value === '' ? 0 : +t.value;
      saveDraft();
    }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.matches && t.matches('#exList input[data-f="video"]')) t.closest('.card').querySelector('[data-vstate]').innerHTML = videoStateHtml(t.value);
  });
  document.addEventListener('focusin', function (ev) {
    if (ev.target.matches('.stepper input')) setTimeout(function () { ev.target.select(); }, 0);
  });

  // 復帰時に同期
  window.addEventListener('online', function () { flush(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if ((draft && $('.workout')) || ivl) requestWake();
    if (draft && $('.workout')) onTick();
    if (ivl) ivlRender();
    if (state.conn && !state.conn.demo) flush();
  });
  setInterval(function () { if (state.sync === 'off' && navigator.onLine) flush(); }, 30000);

  // ---- 起動 ----
  render();
  if (state.conn && !state.conn.demo) flush();
  if (draft && state.conn) openWorkout();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
