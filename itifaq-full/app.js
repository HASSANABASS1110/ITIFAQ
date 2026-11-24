// اتفاق — النسخة الكاملة (SPA + Supabase)
/* global supabase, ITIFAQ_CONFIG */

var ANGLES = [
  { id: 'problem', ico: '🧩', name: 'مشكلة وحل', desc: 'بيبدأ من المشكلة اللي بتوجع العميل وبيقدّم منتجك كحل' },
  { id: 'beforeafter', ico: '↔️', name: 'قبل وبعد', desc: 'بيوّري الفرق قبل استخدام المنتج وبعده' },
  { id: 'compare', ico: '⚖️', name: 'مقارنة', desc: 'بيقارن منتجك بالبدائل الموجودة في السوق' },
  { id: 'proof', ico: '💬', name: 'إثبات اجتماعي', desc: 'آراء وتجارب عملاء حقيقيين بتبني ثقة' },
  { id: 'offer', ico: '🏷️', name: 'عرض أو خصم', desc: 'عرض محدود بيخلق إحساس بالاستعجال' },
  { id: 'story', ico: '📖', name: 'قصة شخصية', desc: 'قصة صاحب البراند أو عميل بتقرّب الناس من المنتج' },
  { id: 'educate', ico: '🎓', name: 'تعليمي', desc: 'محتوى بيعلّم حاجة مفيدة وبيبيع في نفس الوقت' },
  { id: 'trend', ico: '🔥', name: 'ترند', desc: 'ركوب ترند أو موضوع الناس بتتكلم عنه دلوقتي' }
];

var ASSET_DEFS = [
  { id: 'photos', ico: '🖼️', name: 'صور المنتج', hint: 'صور واضحة بخلفية نضيفة، ٥ صور على الأقل' },
  { id: 'videos', ico: '🎬', name: 'فيديوهات للمنتج', hint: 'أي فيديو حتى لو متصوّر بموبايل' },
  { id: 'logo', ico: '🔖', name: 'اللوجو', hint: 'بصيغة PNG بخلفية شفافة لو موجود' },
  { id: 'page', ico: '🔗', name: 'لينك صفحة الهبوط أو الموقع', hint: 'اكتب اللينك اللي الإعلان هيوّدي عليه' },
  { id: 'social', ico: '📱', name: 'لينكات السوشيال ميديا', hint: 'اكتب لينكات صفحات البراند على كل منصة' }
];
var LINK_ASSETS = ['page', 'social'];

var STATUS_META = {
  done: { label: 'مكتمل', cls: 'mg-chip--done' },
  filling: { label: 'قيد الملء', cls: 'mg-chip--filling' },
  new: { label: 'لم يبدأ', cls: 'mg-chip--new' }
};

var state = {
  route: '/',
  session: null,
  me: { name: '', email: '' },
  clients: [],
  clientsLoaded: false,
  detail: null,
  detailId: null,
  notifs: [],
  modal: null,
  notifOpen: false,
  toast: '',
  newClient: { name: '', brand: '', link: '', copied: false },
  commentDraft: { clientId: '', field: '', text: '' },
  summary: null,
  auth: { mode: 'login', name: '', email: '', pass: '', err: '', ok: '', busy: false },
  brief: null,
  briefMeta: null,
  briefErr: '',
  saving: false,
  rtChannel: null
};

var sb = null;
var containerEl = null;
var toastTimer = null;
var saveTimer = null;

/* ===================== Helpers ===================== */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function chip(status) {
  var m = STATUS_META[status] || STATUS_META['new'];
  return '<span class="mg-chip ' + m.cls + '"><i></i>' + m.label + '</span>';
}
function toAr(n) {
  return String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[+d]; });
}
function timeAgo(ts) {
  var s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 90) return 'دلوقتي';
  var m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? 'من دقيقة' : m === 2 ? 'من دقيقتين' : m <= 10 ? 'من ' + toAr(m) + ' دقايق' : 'من ' + toAr(m) + ' دقيقة';
  var h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'من ساعة' : h === 2 ? 'من ساعتين' : h <= 10 ? 'من ' + toAr(h) + ' ساعات' : 'من ' + toAr(h) + ' ساعة';
  var d = Math.floor(h / 24);
  if (d === 1) return 'امبارح';
  if (d === 2) return 'من يومين';
  if (d <= 10) return 'من ' + toAr(d) + ' أيام';
  return 'من ' + toAr(d) + ' يوم';
}
function angleName(id) {
  for (var i = 0; i < ANGLES.length; i++) if (ANGLES[i].id === id) return ANGLES[i].name;
  return id;
}
function briefLink(c) {
  return location.origin + '/b/' + c.link_token;
}
function briefData(c) {
  return (c.briefs && c.briefs.data) || {};
}
function briefAgreement(c) {
  return (c.briefs && c.briefs.agreement) || { client: false, buyer: false };
}
function readiness(b) {
  var items = [
    { label: 'اسم المنتج وسعره', has: !!(b.productName && b.price) },
    { label: 'نقطة التميز', has: !!b.edge },
    { label: 'الهدف والميزانية', has: !!(b.goal && b.budget) },
    { label: 'وصف الجمهور', has: !!(b.age && b.age.length && b.gender && b.geo) },
    { label: 'مين بيرد على الرسايل', has: !!b.responder },
    { label: 'الأنجلز المختارة', has: !!(b.angles && b.angles.length) },
    { label: 'صور المنتج', has: !!(b.assets && b.assets.photos) },
    { label: 'فيديوهات المنتج', has: !!(b.assets && b.assets.videos) },
    { label: 'اللوجو', has: !!(b.assets && b.assets.logo) },
    { label: 'لينك الصفحة', has: !!(b.assets && b.assets.page) },
    { label: 'لينكات السوشيال', has: !!(b.assets && b.assets.social) }
  ];
  var got = 0, missing = [];
  for (var i = 0; i < items.length; i++) { if (items[i].has) got++; else missing.push(items[i].label); }
  return { score: Math.round(100 * got / items.length), missing: missing };
}

/* ===================== Data layer ===================== */
function cfgOk() {
  return typeof ITIFAQ_CONFIG !== 'undefined' && ITIFAQ_CONFIG.SUPABASE_URL &&
    ITIFAQ_CONFIG.SUPABASE_URL.indexOf('https://') === 0 &&
    ITIFAQ_CONFIG.SUPABASE_URL.indexOf('PASTE') === -1 &&
    ITIFAQ_CONFIG.SUPABASE_ANON_KEY && ITIFAQ_CONFIG.SUPABASE_ANON_KEY.indexOf('PASTE') === -1;
}

async function loadClients() {
  var r = await sb.from('clients').select('*, briefs(*)').order('created_at', { ascending: false });
  if (!r.error) { state.clients = r.data || []; }
  state.clientsLoaded = true;
}

async function loadNotifs() {
  var r = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
  if (!r.error) state.notifs = r.data || [];
}

async function loadDetail(id) {
  state.detailId = id;
  state.detail = null;
  var c = null, i;
  for (i = 0; i < state.clients.length; i++) if (state.clients[i].id === id) c = state.clients[i];
  if (!c) {
    var r = await sb.from('clients').select('*, briefs(*)').eq('id', id).single();
    if (!r.error) c = r.data;
  }
  if (!c) { state.detailId = null; return; }
  var ev = await sb.from('events').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(50);
  var cm = await sb.from('comments').select('*').eq('client_id', id).order('created_at', { ascending: true });
  state.detail = {
    client: c,
    events: ev.error ? [] : ev.data,
    comments: cm.error ? [] : cm.data
  };
  render();
}

async function loadBriefByToken(token) {
  var r = await sb.rpc('get_brief_by_token', { p_token: token });
  if (r.error || !r.data) {
    state.briefErr = 'اللينك ده مش شغال. اتأكد إنك نسخته صح، أو كلم الميديا باير يبعتهولك تاني.';
    state.brief = null;
    render();
    return;
  }
  var d = r.data;
  state.briefMeta = d.client;
  var b = d.data || {};
  state.brief = {
    token: token,
    step: d.submitted ? 6 : (b.productName ? (d.step || 1) : 0),
    productName: b.productName || '', price: b.price || '', offer: b.offer || '', edge: b.edge || '',
    goal: b.goal || '', budget: b.budget || '', platforms: b.platforms || [],
    responder: b.responder || '', codConfirm: b.codConfirm || '', codReturns: b.codReturns || '',
    age: b.age || [], gender: b.gender || '', geo: b.geo || '', interests: b.interests || '',
    angles: b.angles || [], assets: b.assets || {}, assetPaths: b.assetPaths || {},
    submitted: !!d.submitted, readiness: d.readiness,
    agreement: d.agreement || { client: false, buyer: false },
    comments: d.comments || []
  };
  state.briefErr = '';
  render();
}

function briefPayload() {
  var br = state.brief;
  return {
    productName: br.productName, price: br.price, offer: br.offer, edge: br.edge,
    goal: br.goal, budget: br.budget, platforms: br.platforms,
    responder: br.responder, codConfirm: br.codConfirm, codReturns: br.codReturns,
    age: br.age, gender: br.gender, geo: br.geo, interests: br.interests,
    angles: br.angles, assets: br.assets, assetPaths: br.assetPaths
  };
}

function scheduleDraftSave() {
  if (!state.brief || state.brief.submitted || !state.brief.token) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async function () {
    if (!state.brief || state.brief.submitted) return;
    state.saving = true;
    await sb.rpc('save_brief_draft', { p_token: state.brief.token, p_data: briefPayload(), p_step: Math.max(1, Math.min(state.brief.step, 5)) });
    state.saving = false;
  }, 700);
}

function subscribeNotifs() {
  if (state.rtChannel || !state.session) return;
  var uid = state.session.user.id;
  state.rtChannel = sb.channel('notifs-' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + uid },
      function (payload) {
        state.notifs.unshift(payload.new);
        if (state.route === '/dashboard' || state.route.indexOf('/client/') === 0) {
          render();
          toast(payload.new.body);
        }
        loadClients();
      })
    .subscribe();
}
/* ===================== Chrome (topbar, modals) ===================== */
function topbar(extra) {
  return '<div class="mg-topbar"><div class="mg-topbar-in">' +
    '<a class="mg-logo" data-action="nav" data-to="/" style="cursor:pointer">اتفاق<small>بريف واضح من أول مرة</small></a>' +
    '<div class="mg-topbar-actions">' + (extra || '') + '</div></div></div>';
}
function bellBtn() {
  var unread = 0, i;
  for (i = 0; i < state.notifs.length; i++) if (!state.notifs[i].read) unread++;
  return '<button class="mg-btn mg-btn--ghost mg-btn--sm mg-bell" data-action="bell">🔔' +
    (unread ? '<span class="mg-bell-badge">' + toAr(unread) + '</span>' : '') + '</button>';
}
function notifPanel() {
  if (!state.notifOpen) return '';
  var rows = '', i;
  if (!state.notifs.length) rows = '<div class="mg-notif-row"><b>مفيش إشعارات لسه</b><small>أول ما عميل يبدأ أو يخلّص بريفه هيوصلك هنا</small></div>';
  for (i = 0; i < state.notifs.length; i++) {
    var n = state.notifs[i];
    rows += '<div class="mg-notif-row' + (!n.read ? ' is-unread' : '') + '"><b>' + esc(n.body) + '</b><small>' + timeAgo(n.created_at) + '</small></div>';
  }
  return '<div class="mg-notif-panel"><div class="mg-notif-head">الإشعارات</div>' + rows + '</div>';
}
function toastHtml() {
  return state.toast ? '<div class="mg-toast">' + esc(state.toast) + '</div>' : '';
}
function modalHtml() {
  var inner = '';
  if (state.modal === 'newClient') inner = newClientModal();
  else if (state.modal === 'comment') inner = commentModal();
  else if (state.modal === 'summary') inner = summaryModal();
  if (!inner) return '';
  return '<dialog class="mg-dialog">' + inner + toastHtml() + '</dialog>';
}

/* ===================== Landing ===================== */
function viewLanding() {
  return topbar('<a class="mg-btn mg-btn--ghost mg-btn--sm" data-action="nav" data-to="/auth">تسجيل الدخول</a>' +
    '<a class="mg-btn mg-btn--sm" data-action="nav" data-to="/auth?mode=signup">ابدأ مجاناً</a>') +
  '<div class="mg-wrap mg-wrap--wide">' +
    '<div class="mg-hero">' +
      '<span class="mg-badge">للميديا بايرز ووكالات التسويق</span>' +
      '<h1>بريف واضح<br><span>من أول مرة</span></h1>' +
      '<p>اتفاق بيحوّل أسئلة البداية المتكررة مع كل عميل لبريف واحد منظم، يوصلك جاهز قبل ما تصرف جنيه على الإعلانات.</p>' +
      '<div class="mg-hero-cta">' +
        '<a class="mg-btn" data-action="nav" data-to="/auth?mode=signup">ابدأ مجاناً</a>' +
        '<a class="mg-btn mg-btn--ghost" data-action="nav" data-to="/auth">تسجيل الدخول</a>' +
      '</div>' +
    '</div>' +
    '<div class="mg-section">' +
      '<h2 class="mg-section-title">إزاي بيشتغل؟</h2>' +
      '<p class="mg-section-sub">تلات خطوات بينك وبين بريف مرتب من كل عميل</p>' +
      '<div class="mg-steps">' +
        '<div class="mg-step-card"><div class="mg-step-num">١</div><div><h3>اعمل حسابك وأضف عميلك</h3><p>في ثواني يكون عندك لينك بريف خاص بكل عميل، جاهز يتبعت.</p></div></div>' +
        '<div class="mg-step-card"><div class="mg-step-num">٢</div><div><h3>ابعت اللينك لعميلك</h3><p>العميل يملا بريف موجّه خطوة بخطوة، من غير ما يعمل حساب أو ينزّل حاجة.</p></div></div>' +
        '<div class="mg-step-card"><div class="mg-step-num">٣</div><div><h3>استلم كل الإجابات مرتبة</h3><p>المنتج، الهدف، الجمهور، الأنجلز والأصول، كلها في صفحة واحدة لكل عميل، وإشعار فوري أول ما البريف يكتمل.</p></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="mg-section">' +
      '<h2 class="mg-section-title">ليه اتفاق مختلف؟</h2>' +
      '<p class="mg-section-sub">مش مجرد فورم، ده بريف بيشتغل معاك</p>' +
      '<div class="mg-features">' +
        '<div class="mg-feature"><div class="mg-f-ico">🧭</div><h3>بريف بيعلّم عميلك</h3><p>كل سؤال معاه سببه، فالعميل يفهم إنت محتاج إيه وليه، ويجاوب صح من أول مرة.</p></div>' +
        '<div class="mg-feature"><div class="mg-f-ico">⚡</div><h3>مكتبة أنجلز جاهزة</h3><p>عميلك يختار الأنجلز اللي حاسس إنها قريبة من جمهوره، وإنت تبدأ التجربة من نص الطريق.</p></div>' +
        '<div class="mg-feature"><div class="mg-f-ico">📎</div><h3>رفع الأصول جوه المنصة</h3><p>الصور والفيديوهات واللينكات بتترفع مكانها، من غير رسايل واتساب ضايعة.</p></div>' +
        '<div class="mg-feature"><div class="mg-f-ico">💾</div><h3>حفظ تلقائي واستكمال</h3><p>العميل يوقف ويكمّل في أي وقت، إجاباته محفوظة، وإنت شايف التقدم أول بأول.</p></div>' +
        '<div class="mg-feature"><div class="mg-f-ico">💬</div><h3>علّق على أي إجابة</h3><p>محتاج توضيح على نقطة معينة؟ علّق عليها مباشرة بدل ما تدوّر في الشات.</p></div>' +
        '<div class="mg-feature"><div class="mg-f-ico">📄</div><h3>ملخص صفحة واحدة</h3><p>كل عميل يتجمّع في ملخص واحد تقدر تراجعه أو تبعته لفريقك قبل أي ميتنج.</p></div>' +
      '</div>' +
    '</div>' +
    '<div class="mg-final-cta">' +
      '<h2>جاهز توقف دوشة البريفات؟</h2>' +
      '<p>ابدأ دلوقتي وابعت أول لينك بريف في أقل من دقيقة.</p>' +
      '<a class="mg-btn" data-action="nav" data-to="/auth?mode=signup">ابدأ مجاناً</a>' +
    '</div>' +
    '<div class="mg-footer-note">اتفاق — بريف واضح من أول مرة</div>' +
  '</div>';
}

/* ===================== Auth ===================== */
function viewAuth() {
  var a = state.auth;
  var isLogin = a.mode === 'login';
  return topbar('') +
  '<div class="mg-wrap">' + toastHtml() + '<div class="mg-brief-card mg-auth-card">' +
    '<h1>' + (isLogin ? 'أهلاً بيك تاني 👋' : 'اعمل حسابك مجاناً') + '</h1>' +
    '<p>' + (isLogin ? 'سجّل دخولك عشان تشوف بريفات عملائك.' : 'دقيقة واحدة وتقدر تبعت أول لينك بريف لعميلك.') + '</p>' +
    '<div class="mg-auth-tabs">' +
      '<button type="button" class="' + (isLogin ? 'is-active' : '') + '" data-action="auth-mode" data-v="login">تسجيل دخول</button>' +
      '<button type="button" class="' + (!isLogin ? 'is-active' : '') + '" data-action="auth-mode" data-v="signup">حساب جديد</button>' +
    '</div>' +
    (a.err ? '<div class="mg-error">' + esc(a.err) + '</div>' : '') +
    (a.ok ? '<div class="mg-success">' + esc(a.ok) + '</div>' : '') +
    (!isLogin ? '<div class="mg-field"><label>اسمك <span class="mg-req">*</span></label><input data-afield="name" value="' + esc(a.name) + '" placeholder="مثال: حسن محمد"></div>' : '') +
    '<div class="mg-field"><label>الإيميل <span class="mg-req">*</span></label><input type="email" dir="ltr" style="text-align:left" data-afield="email" value="' + esc(a.email) + '" placeholder="you@email.com"></div>' +
    '<div class="mg-field"><label>كلمة السر <span class="mg-req">*</span></label><input type="password" dir="ltr" style="text-align:left" data-afield="pass" value="' + esc(a.pass) + '" placeholder="٦ حروف على الأقل"></div>' +
    '<a class="mg-btn mg-btn--block" data-action="auth-submit">' + (a.busy ? 'ثانية واحدة…' : isLogin ? 'دخول ←' : 'إنشاء الحساب ←') + '</a>' +
    '<p class="mg-hint-sm" style="margin-top:12px">بياناتك وبيانات عملائك محفوظة ومش بتتشارك مع أي حد.</p>' +
  '</div></div>';
}

/* ===================== Setup (config missing) ===================== */
function viewSetup() {
  return topbar('') +
  '<div class="mg-wrap"><div class="mg-brief-card mg-setup">' +
    '<h1>فاضل خطوة واحدة ⚙️</h1>' +
    '<p>الموقع اترفع تمام، بس لسه محتاج يتوصل بقاعدة البيانات بتاعتك على Supabase:</p>' +
    '<div class="mg-field"><p>١. افتح مشروعك على Supabase ← Project Settings ← API</p>' +
    '<p>٢. انسخ <code>Project URL</code> و <code>anon public key</code></p>' +
    '<p>٣. حطّهم في ملف <code>config.js</code> على GitHub (اضغط على الملف ← علامة القلم ← عدّل ← Commit changes)</p></div>' +
    '<p class="mg-hint-sm">الخطوات بالتفصيل في ملف README.md اللي جوه حزمة الكود.</p>' +
  '</div></div>';
}
/* ===================== Dashboard ===================== */
function viewDashboard() {
  if (!state.clientsLoaded) return topbar('') + '<div class="mg-wrap"><div class="mg-loading">بنجهّز بريفاتك… ⏳</div></div>';
  var done = 0, filling = 0, i, c;
  for (i = 0; i < state.clients.length; i++) {
    if (state.clients[i].status === 'done') done++;
    if (state.clients[i].status === 'filling') filling++;
  }
  var rows = '';
  for (i = 0; i < state.clients.length; i++) {
    c = state.clients[i];
    rows += '<div class="mg-client" data-action="nav" data-to="/client/' + c.id + '">' +
      '<div class="mg-avatar">' + esc(c.name.charAt(0)) + '</div>' +
      '<div class="mg-client-main"><b>' + esc(c.name) + '</b><small>' + esc(c.brand) + ' · اتبعت ' + timeAgo(c.created_at) + '</small></div>' +
      '<div class="mg-client-side">' + chip(c.status) + '<span class="mg-chevron">‹</span></div></div>';
  }
  if (!state.clients.length) {
    rows = '<div class="mg-empty"><div class="mg-e-ico">📭</div><h2>لسه مفيش عملاء</h2><p>دوس "بريف جديد" وهنطلعلك أول لينك تبعته لعميلك.</p></div>';
  }
  return topbar(bellBtn() + '<a class="mg-btn mg-btn--sm" data-action="open-new">＋ بريف جديد</a>' +
    '<button class="mg-btn mg-btn--ghost mg-btn--sm" data-action="sign-out">خروج</button>') + notifPanel() +
  '<div class="mg-wrap">' + toastHtml() +
    '<div class="mg-page-head"><div><h1>أهلاً يا ' + esc(state.me.name || 'صاحبي') + ' 👋</h1><p>دي كل بريفات عملائك في مكان واحد</p></div></div>' +
    '<div class="mg-stats">' +
      '<div class="mg-stat"><b>' + toAr(state.clients.length) + '</b><span>إجمالي العملاء</span></div>' +
      '<div class="mg-stat mg-stat--done"><b>' + toAr(done) + '</b><span>بريف مكتمل</span></div>' +
      '<div class="mg-stat mg-stat--fill"><b>' + toAr(filling) + '</b><span>قيد الملء</span></div>' +
    '</div>' +
    '<div class="mg-client-list">' + rows + '</div>' +
    '<div class="mg-footer-note">اتفاق — بريف واضح من أول مرة</div>' +
  '</div>';
}

function newClientModal() {
  var nc = state.newClient;
  var body;
  if (!nc.link) {
    body = '<p>اكتب اسم العميل والبراند، وهنطلعلك لينك خاص بيه تبعته على الواتساب.</p>' +
      '<div class="mg-field"><label>اسم العميل <span class="mg-req">*</span></label><input data-nfield="name" value="' + esc(nc.name) + '" placeholder="مثال: كريم عادل"></div>' +
      '<div class="mg-field"><label>اسم البراند <span class="mg-req">*</span></label><input data-nfield="brand" value="' + esc(nc.brand) + '" placeholder="مثال: سولاريس للطاقة الشمسية"></div>' +
      '<div class="mg-modal-actions"><a class="mg-btn mg-btn--ghost" data-action="close-modal">إلغاء</a><a class="mg-btn" data-action="create-link">إنشاء اللينك ←</a></div>';
  } else {
    body = '<p>اللينك جاهز! ابعته لـ ' + esc(nc.name) + ' على الواتساب، وهو يملا البريف من غير ما يعمل حساب.</p>' +
      '<div class="mg-link-box">' + esc(nc.link) + '</div>' +
      '<p class="mg-hint">اللينك ده خاص بالعميل ده بس، وأي إجابة بتوصلك باسمه</p>' +
      '<div class="mg-modal-actions"><a class="mg-btn mg-btn--ghost" data-action="close-modal">تم</a><a class="mg-btn" data-action="copy-link">' + (nc.copied ? 'اتنسخ ✓' : 'نسخ اللينك') + '</a></div>';
  }
  return '<div class="mg-modal"><h2>ابعت لينك بريف جديد</h2>' + body + '</div></div>';
}

/* ===================== Client detail ===================== */
var FIELD_LABELS = {
  productName: 'اسم المنتج', price: 'السعر', offer: 'العرض الحالي', edge: 'إيه اللي بيميزه',
  goal: 'الهدف', budget: 'الميزانية الشهرية', platforms: 'المنصات المفضلة',
  age: 'السن', gender: 'النوع', geo: 'الأماكن', interests: 'وصفهم بكلمات العميل',
  responder: 'مين بيرد على الرسايل', codConfirm: 'نسبة تأكيد الأوردرات', codReturns: 'نسبة المرتجعات'
};

function commentBtn(clientId, field) {
  return '<button class="mg-comment-btn" data-action="comment" data-client="' + clientId + '" data-field="' + field + '">💬 علّق</button>';
}
function commentsFor(clientId, field) {
  var list = state.detail ? state.detail.comments : [];
  var out = '';
  for (var i = 0; i < list.length; i++) {
    if (list[i].field === field) out += '<div class="mg-comment">💬 ' + esc(list[i].body) + ' <small class="mg-hint-sm">' + timeAgo(list[i].created_at) + '</small></div>';
  }
  return out;
}
function kvRow(clientId, field, value) {
  return '<div class="mg-kv-row"><dt>' + FIELD_LABELS[field] + '</dt><dd>' + esc(value) + commentBtn(clientId, field) + '</dd>' + commentsFor(clientId, field) + '</div>';
}

function assetValueRow(a, b) {
  var v = b.assets ? b.assets[a.id] : '';
  if (!v) return '<div class="mg-asset-row"><span class="mg-no">⏳</span> ' + esc(a.name) + ' — لسه</div>';
  var path = b.assetPaths ? b.assetPaths[a.id] : '';
  if (path) return '<div class="mg-asset-row"><span class="mg-ok">✓</span> ' + esc(a.name) + ' — <a class="mg-asset-link" data-action="open-asset" data-path="' + esc(path) + '" style="cursor:pointer">' + esc(v) + ' ↗</a></div>';
  if (v.indexOf('http') === 0) return '<div class="mg-asset-row"><span class="mg-ok">✓</span> ' + esc(a.name) + ' — <a class="mg-asset-link" href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(v) + ' ↗</a></div>';
  return '<div class="mg-asset-row"><span class="mg-ok">✓</span> ' + esc(a.name) + ' — ' + esc(v) + '</div>';
}

function viewClient() {
  if (!state.detail) return topbar(bellBtn()) + '<div class="mg-wrap"><div class="mg-loading">بنحمّل صفحة العميل… ⏳</div></div>';
  var c = state.detail.client;
  var head = topbar(bellBtn() + '<a class="mg-btn mg-btn--sm" data-action="open-new">＋ بريف جديد</a>') + notifPanel() +
    '<div class="mg-wrap">' + toastHtml() +
    '<a class="mg-back" data-action="nav" data-to="/dashboard">→ رجوع لكل العملاء</a>' +
    '<div class="mg-client-hero">' +
      '<div class="mg-avatar">' + esc(c.name.charAt(0)) + '</div>' +
      '<div class="mg-client-hero-main"><h1>' + esc(c.name) + '</h1><p>' + esc(c.brand) +
      (c.status === 'done' && c.briefs && c.briefs.submitted_at ? ' · أتم البريف ' + timeAgo(c.briefs.submitted_at) : ' · اللينك اتبعت ' + timeAgo(c.created_at)) + '</p></div>' +
      chip(c.status) +
    '</div>';

  var actions = '<div class="mg-detail-actions">' +
    '<a class="mg-btn mg-btn--ghost mg-btn--sm" data-action="copy-client-link" data-id="' + c.id + '">نسخ لينك البريف</a>' +
    (c.status === 'done' ? '<a class="mg-btn mg-btn--sm" data-action="open-summary" data-id="' + c.id + '">📄 ملخص صفحة واحدة</a>' : '') +
    '<a class="mg-btn mg-btn--ghost mg-btn--sm" data-action="delete-client" data-id="' + c.id + '">' + (state.confirmDelete === c.id ? 'متأكد؟ امسح نهائي' : '🗑 مسح العميل') + '</a>' +
    '</div>';

  var body = '';
  if (c.status === 'new') {
    body = '<div class="mg-empty"><div class="mg-e-ico">⏳</div><h2>' + esc(c.name) + ' لسه مابدأش البريف</h2>' +
      '<p>اللينك اتبعت ' + timeAgo(c.created_at) + '. لو عدّى وقت، انسخه وابعتهولو تاني.</p>' +
      '<a class="mg-btn" data-action="copy-client-link" data-id="' + c.id + '">نسخ اللينك ↻</a></div>';
  } else {
    var b = briefData(c);
    if (c.status === 'filling') {
      var pct = c.briefs && c.briefs.step ? Math.min(90, c.briefs.step * 18) : 20;
      body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">⏳</span> العميل لسه بيملى</h2>' +
        '<div class="mg-progress"><b style="width:' + pct + '%"></b></div>' +
        '<div class="mg-progress-note">واقف عند الخطوة ' + toAr(c.briefs ? c.briefs.step : 1) + ' من ٥ — هيوصلك إشعار فوري أول ما يكمّل، وإجاباته بتحفظ تلقائياً لو وقف.</div></div>';
    }
    body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">📦</span> المنتج</h2><dl class="mg-kv">' +
      kvRow(c.id, 'productName', b.productName || '—') + kvRow(c.id, 'price', b.price || '—') +
      (b.offer ? kvRow(c.id, 'offer', b.offer) : '') + kvRow(c.id, 'edge', b.edge || '—') + '</dl></div>';
    body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">🎯</span> الهدف والميزانية</h2><dl class="mg-kv">' +
      kvRow(c.id, 'goal', b.goal || '—') + kvRow(c.id, 'budget', b.budget || '—') +
      (b.platforms && b.platforms.length ? kvRow(c.id, 'platforms', b.platforms.join('، ')) : '') + '</dl></div>';
    if (b.geo || b.interests || (b.age && b.age.length)) {
      body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">👥</span> الجمهور المستهدف</h2><dl class="mg-kv">' +
        (b.age && b.age.length ? kvRow(c.id, 'age', b.age.join('، ')) : '') +
        (b.gender ? kvRow(c.id, 'gender', b.gender) : '') +
        (b.geo ? kvRow(c.id, 'geo', b.geo) : '') +
        (b.interests ? kvRow(c.id, 'interests', b.interests) : '') + '</dl></div>';
    }
    if (b.responder || b.codConfirm || b.codReturns) {
      body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">📞</span> الرد والأوردرات</h2><dl class="mg-kv">' +
        (b.responder ? kvRow(c.id, 'responder', b.responder) : '') +
        (b.codConfirm ? kvRow(c.id, 'codConfirm', b.codConfirm) : '') +
        (b.codReturns ? kvRow(c.id, 'codReturns', b.codReturns) : '') + '</dl></div>';
    }
    if (b.angles && b.angles.length) {
      var pills = '';
      for (var j = 0; j < b.angles.length; j++) pills += '<span class="mg-pill">' + esc(angleName(b.angles[j])) + '</span>';
      body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">⚡</span> الأنجلز اللي العميل اختارها</h2><div class="mg-pill-list">' + pills + '</div></div>';
    }
    var assetRows = '';
    for (var k = 0; k < ASSET_DEFS.length; k++) assetRows += assetValueRow(ASSET_DEFS[k], b);
    body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">📎</span> الأصول</h2>' + assetRows + '</div>';
  }
  if (c.status === 'done') {
    var ag = briefAgreement(c);
    body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">🤝</span> نقاط الاتفاق</h2>' +
      '<div class="mg-agree-row"><span>العميل</span>' + (ag.client ? '<b class="mg-ok">أكد الاتفاق ✓</b>' : '<b class="mg-no">لسه</b>') + '</div>' +
      '<div class="mg-agree-row"><span>إنت</span>' + (ag.buyer ? '<b class="mg-ok">أكدت الاتفاق ✓</b>' : '<a class="mg-btn mg-btn--sm" data-action="agree-buyer" data-id="' + c.id + '">أكد الاتفاق ✓</a>') + '</div>' +
      (ag.client && ag.buyer ? '<div class="mg-agree-done">الاتفاق متأكد من الطرفين 🎉 تقدر تبدأ الشغل رسمي</div>' : '') +
      '</div>';
  }
  if (state.detail.events.length) {
    var logRows = '';
    for (var li = 0; li < state.detail.events.length; li++) {
      logRows += '<div class="mg-log-row"><i></i>' + timeAgo(state.detail.events[li].created_at) + ' — ' + esc(state.detail.events[li].body) + '</div>';
    }
    body += '<div class="mg-answer-section"><h2><span class="mg-s-ico">🕘</span> سجل النشاط</h2>' + logRows + '</div>';
  }
  return head + actions + body + '<div class="mg-footer-note">اتفاق — بريف واضح من أول مرة</div></div>';
}

function commentModal() {
  var d = state.commentDraft;
  return '<div class="mg-modal">' +
    '<h2>تعليق على: ' + esc(FIELD_LABELS[d.field] || '') + '</h2>' +
    '<p>التعليق بيظهر للعميل جنب السؤال ده بالذات لما يفتح لينك البريف، عشان يوضّح أو يعدّل.</p>' +
    '<div class="mg-field"><textarea data-cfield="text" placeholder="مثال: السعر ده شامل التركيب ولا لأ؟">' + esc(d.text) + '</textarea></div>' +
    '<div class="mg-modal-actions"><a class="mg-btn mg-btn--ghost" data-action="close-modal">إلغاء</a><a class="mg-btn" data-action="save-comment">حفظ التعليق</a></div>' +
    '</div></div>';
}

function summaryModal() {
  var s = state.summary;
  if (!s) return '';
  var b = s.brief;
  var angles = [], i;
  for (i = 0; i < (b.angles || []).length; i++) angles.push(angleName(b.angles[i]));
  var assetsDone = 0;
  for (i = 0; i < ASSET_DEFS.length; i++) if (b.assets && b.assets[ASSET_DEFS[i].id]) assetsDone++;
  return '<div class="mg-modal mg-modal--summary">' +
    '<h2>📄 ملخص صفحة واحدة</h2><p>جاهز تراجعه في دقيقة أو تبعته لأي حد في فريقك.</p>' +
    '<div class="mg-summary-card">' +
      '<div class="mg-sum-head"><b>' + esc(s.brand) + '</b><span>' + esc(s.name) + ' · ' + esc(s.when) + ' · جاهزية ' + toAr(readiness(b).score) + '٪</span></div>' +
      '<div class="mg-sum-row"><span>المنتج</span><b>' + esc(b.productName || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>السعر والعرض</span><b>' + esc(b.price || '—') + (b.offer ? ' · ' + esc(b.offer) : '') + '</b></div>' +
      '<div class="mg-sum-row"><span>التميز</span><b>' + esc(b.edge || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>الهدف</span><b>' + esc(b.goal || '—') + ' · ميزانية ' + esc(b.budget || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>الجمهور</span><b>' + esc((b.age || []).join('، ')) + ' · ' + esc(b.gender || '—') + ' · ' + esc(b.geo || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>الأنجلز</span><b>' + esc(angles.join('، ') || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>الرد والأوردرات</span><b>' + esc(b.responder || '—') + ' · تأكيد ' + esc(b.codConfirm || '—') + ' · مرتجعات ' + esc(b.codReturns || '—') + '</b></div>' +
      '<div class="mg-sum-row"><span>الأصول</span><b>' + toAr(assetsDone) + ' من ' + toAr(ASSET_DEFS.length) + ' متسلمة</b></div>' +
    '</div>' +
    '<div class="mg-modal-actions"><a class="mg-btn mg-btn--ghost" data-action="close-modal">قفل</a><a class="mg-btn" data-action="print-summary">طباعة / PDF</a></div>' +
    '</div></div>';
}
/* ===================== Brief flow (client side) ===================== */
function buyerFirst() {
  var n = (state.briefMeta && state.briefMeta.buyerName) || 'الميديا باير بتاعك';
  return n.split(' ')[0];
}
function briefTop(stepText, pct) {
  return '<div class="mg-brief-top"><div class="mg-brief-top-in">' +
    '<div class="mg-brief-brand"><b>اتفاق</b><span>' + stepText + '</span></div>' +
    (pct != null ? '<div class="mg-progress"><b style="width:' + pct + '%"></b></div>' : '') +
    '</div></div>';
}
function whyBox(text) {
  return '<div class="mg-why">💡 <span><b>ليه بنسأل؟</b> ' + text + '</span></div>';
}
function commentsNote(field) {
  if (!state.brief || !state.brief.comments) return '';
  var out = '';
  for (var i = 0; i < state.brief.comments.length; i++) {
    var c = state.brief.comments[i];
    if (c.field === field) out += '<div class="mg-comment-note">💬 تعليق ' + esc(buyerFirst()) + ': ' + esc(c.body) + '</div>';
  }
  return out;
}

function viewBriefError() {
  return briefTop('بريف عميل', null) + '<div class="mg-wrap"><div class="mg-brief-card">' +
    '<div class="mg-empty"><div class="mg-e-ico">🔍</div><h2>اللينك ده مش شغال</h2><p>' + esc(state.briefErr || 'اتأكد إن اللينك متنسخ كامل، أو كلم الميديا باير يبعته تاني.') + '</p></div>' +
    '</div></div>';
}

function viewBriefLoading() {
  return briefTop('بريف عميل', null) + '<div class="mg-wrap"><div class="mg-loading">بنجهّز البريف… ⏳</div></div>';
}

function viewBrief() {
  var br = state.brief;
  var brand = state.briefMeta ? state.briefMeta.brand : '';
  var first = state.briefMeta ? (state.briefMeta.name || '').split(' ')[0] : '';

  if (br.step === 0) return briefTop('بريف عميل — ' + esc(brand), null) + '<div class="mg-wrap"><div class="mg-brief-card">' +
    '<h1>أهلاً بيك يا ' + esc(first) + ' 👋</h1>' +
    '<p>' + esc(buyerFirst()) + '، الميديا باير بتاعك، بيستخدم اتفاق عشان يفهم منتجك وأهدافك قبل ما يبدأ أي إعلان. البريف ده هو أساس الشغل كله، فخد وقتك فيه.</p>' +
    '<div class="mg-welcome-points">' +
      '<div><span>🖐</span> ٥ خطوات قصيرة: المنتج، الهدف، الجمهور، الأنجلز، والأصول</div>' +
      '<div><span>💡</span> كل سؤال مكتوب جنبه ليه بنسأله، عشان تعرف إجابتك رايحة فين</div>' +
      '<div><span>💾</span> إجاباتك بتتحفظ تلقائياً، تقدر توقف وتكمّل في أي وقت</div>' +
    '</div>' +
    (br.productName ? '<p class="mg-hint" style="margin-bottom:10px">ليك إجابات محفوظة من المرة اللي فاتت، هنكمّل من آخر حاجة وصلتلها.</p>' : '') +
    '<a class="mg-btn mg-btn--block" data-action="brief-start">يلا نبدأ ←</a>' +
    '</div><div class="mg-footer-note">بريفك بيوصل لـ ' + esc(buyerFirst()) + ' مباشرة، مفيش حاجة بتتشارك مع حد تاني</div></div>';

  if (br.step === 6) {
    var rd = br.readiness != null ? { score: br.readiness, missing: [] } : readiness(briefPayload());
    var miss = '';
    if (rd.missing.length) {
      miss = '<div class="mg-score-missing">عشان توصل ١٠٠٪ كمّل: ' + esc(rd.missing.join('، ')) + '</div>';
    } else if (rd.score >= 100) {
      miss = '<div class="mg-score-missing mg-score-missing--full">جاهزية كاملة 🎉 كل حاجة محتاجها الميديا باير وصلت.</div>';
    } else {
      miss = '<div class="mg-score-missing mg-score-missing--full">بريفك وصل ✅ لو حابب تكمّل أي حاجة ناقصة ابعتها على الواتساب.</div>';
    }
    var agreed = br.agreement && br.agreement.client;
    return briefTop('بريف عميل — ' + esc(brand), null) + '<div class="mg-wrap"><div class="mg-brief-card">' +
    '<div class="mg-done-hero"><div class="mg-done-ico">✓</div><h1>بريفك وصل 🎉</h1>' +
    '<p>شكراً يا ' + esc(first) + '! ' + esc(buyerFirst()) + ' هيراجع إجاباتك ويرجعلك بخطة الإعلانات.</p></div>' +
    '<div class="mg-score-card"><div class="mg-score-num">' + toAr(rd.score) + '٪</div>' +
      '<div class="mg-score-body"><b>جاهزيتك للإعلانات</b>' + miss + '</div></div>' +
    '<p style="color:var(--mg-muted);font-size:0.94rem;margin-top:18px">عشان تكون في الصورة، دي قسمة الشغل الجاية:</p>' +
    '<div class="mg-split">' +
      '<div class="mg-split-card mg-split-card--you"><h3>المطلوب منك</h3><ul>' +
        '<li>تبعت أي أصول ناقصة على الواتساب</li>' +
        '<li>ترد لو الميديا باير سألك سؤال متابعة</li>' +
        '<li>تراجع الإعلانات لما تتبعتلك قبل النشر</li>' +
      '</ul></div>' +
      '<div class="mg-split-card"><h3>المطلوب من الميديا باير</h3><ul>' +
        '<li>يطلّع خطة إعلانات مبنية على إجاباتك</li>' +
        '<li>يجرب الأنجلز اللي اخترتها</li>' +
        '<li>يبعتلك تقرير أسبوعي بالنتائج</li>' +
      '</ul></div>' +
      '<div class="mg-split-card mg-split-card--you"><h3>مشمول في الاتفاق ✅</h3><ul>' +
        '<li>إدارة ومتابعة الحملات الإعلانية</li>' +
        '<li>كتابة الإعلانات وتجربة الأنجلز</li>' +
        '<li>تقرير أسبوعي واضح بالنتايج</li>' +
      '</ul></div>' +
      '<div class="mg-split-card mg-split-card--no"><h3>مش مشمول ❌</h3><ul>' +
        '<li>تصوير صور أو فيديوهات جديدة للمنتج</li>' +
        '<li>تعديل الموقع أو صفحة الهبوط</li>' +
        '<li>الرد على الرسايل (إلا لو اتفقنا عليه لوحده)</li>' +
      '</ul></div>' +
    '</div>' +
    '<div class="mg-agree"><h3>🤝 نقاط الاتفاق النهائية</h3>' +
      '<p>لو التقسيمة اللي فوق مظبوطة بالنسبالك، أكد بضغطة. دي زي عقد مصغّر بينك وبين الميديا باير، وكل طرف بيشوف إن التاني أكد.</p>' +
      (agreed
        ? '<div class="mg-agree-done">✓ أكدت نقاط الاتفاق — مستني تأكيد ' + esc(buyerFirst()) + '</div>'
        : '<a class="mg-btn mg-btn--block" data-action="agree-client">أوافق على نقاط الاتفاق ✓</a>') +
    '</div>' +
    '<div class="mg-brief-nav">' +
      '<a class="mg-btn mg-btn--ghost" data-action="open-summary-brief">📄 حمّل الملخص PDF</a>' +
    '</div>' +
    '<p class="mg-hint" style="margin-top:14px">تقدر تقفل الصفحة دي دلوقتي، وصلنا كل حاجة ✅</p>' +
    '</div></div>';
  }

  var stepLabel = 'الخطوة ' + ['١', '٢', '٣', '٤', '٥'][br.step - 1] + ' من ٥';
  var top = briefTop(stepLabel + ' · ✓ بيتحفظ تلقائياً', br.step * 20);
  var body = '';

  if (br.step === 1) {
    body = '<h1>إيه المنتج اللي هنعلن عنه؟ 📦</h1><p>ابدأ بالأساسيات: اسم المنتج وسعره والعرض الحالي.</p>' +
      '<div class="mg-field"><label>اسم المنتج <span class="mg-req">*</span></label><input data-bfield="productName" value="' + esc(br.productName) + '" placeholder="مثال: شاحن سيارة سريع ٤٥ واط">' + commentsNote('productName') + '</div>' +
      '<div class="mg-field"><label>سعر المنتج <span class="mg-req">*</span></label><input data-bfield="price" value="' + esc(br.price) + '" placeholder="مثال: ٦٥٠ جنيه">' + commentsNote('price') + whyBox('السعر بيحدد الاستراتيجية كلها: إعلان منتج بـ ٥٠٠ جنيه مختلف تماماً عن منتج بـ ٥٠٠٠.') + '</div>' +
      '<div class="mg-field"><label>العرض الحالي (لو فيه)</label><input data-bfield="offer" value="' + esc(br.offer) + '" placeholder="مثال: خصم ٢٥٪ وشحن مجاني">' + commentsNote('offer') + whyBox('الإعلان محتاج سبب يخلي الناس تشتري دلوقتي مش بعدين.') + '</div>' +
      '<div class="mg-field"><label>إيه اللي بيميز منتجك عن غيره؟ <span class="mg-req">*</span></label><textarea data-bfield="edge" placeholder="مثال: بيشحن الموبايل كامل في ٤٠ دقيقة">' + esc(br.edge) + '</textarea>' + commentsNote('edge') + whyBox('دي النقطة اللي كل الإعلانات هتتبني عليها، فخد وقتك فيها.') + '</div>';
  }

  if (br.step === 2) {
    var goals = [
      { id: 'مبيعات أونلاين', ico: '🎯', desc: 'عايز أوردرات مباشرة من الموقع أو صفحة الهبوط' },
      { id: 'رسايل ولايدز', ico: '💬', desc: 'عايز الناس تكلمني وأنا اللي أقفل البيع' },
      { id: 'وعي بالبراند', ico: '📣', desc: 'عايز الناس تعرفني الأول، والمبيعات تيجي بعدين' }
    ];
    var gh = '', i;
    for (i = 0; i < goals.length; i++) {
      gh += '<button type="button" class="mg-choice' + (br.goal === goals[i].id ? ' is-selected' : '') + '" data-action="sel-goal" data-v="' + esc(goals[i].id) + '"><span class="mg-c-ico">' + goals[i].ico + '</span><span><b>' + goals[i].id + '</b><small>' + goals[i].desc + '</small></span></button>';
    }
    var budgets = ['أقل من ١٠ آلاف', '١٠ – ٣٠ ألف', '٣٠ – ١٠٠ ألف', 'أكتر من ١٠٠ ألف'];
    var bh = '';
    for (i = 0; i < budgets.length; i++) bh += '<button type="button" class="mg-opt-chip' + (br.budget === budgets[i] ? ' is-selected' : '') + '" data-action="sel-budget" data-v="' + budgets[i] + '">' + budgets[i] + '</button>';
    var plats = ['فيسبوك وإنستجرام', 'تيك توك', 'سناب شات', 'جوجل'];
    var ph = '';
    for (i = 0; i < plats.length; i++) ph += '<button type="button" class="mg-opt-chip' + (br.platforms.indexOf(plats[i]) > -1 ? ' is-selected' : '') + '" data-action="tog-platform" data-v="' + plats[i] + '">' + plats[i] + '</button>';
    var resps = ['برد بنفسي', 'عندي فريق بيرد', 'لسه محتاج حد'];
    var rh = '';
    for (i = 0; i < resps.length; i++) rh += '<button type="button" class="mg-opt-chip' + (br.responder === resps[i] ? ' is-selected' : '') + '" data-action="sel-responder" data-v="' + resps[i] + '">' + resps[i] + '</button>';
    var cods = ['أقل من ٥٠٪', '٥٠ – ٧٠٪', 'أكتر من ٧٠٪', 'مش ببيع COD'];
    var ch = '';
    for (i = 0; i < cods.length; i++) ch += '<button type="button" class="mg-opt-chip' + (br.codConfirm === cods[i] ? ' is-selected' : '') + '" data-action="sel-codconfirm" data-v="' + cods[i] + '">' + cods[i] + '</button>';
    var rets = ['أقل من ١٠٪', '١٠ – ٢٥٪', 'أكتر من ٢٥٪', 'مفيش مرتجعات'];
    var cr = '';
    for (i = 0; i < rets.length; i++) cr += '<button type="button" class="mg-opt-chip' + (br.codReturns === rets[i] ? ' is-selected' : '') + '" data-action="sel-codreturn" data-v="' + rets[i] + '">' + rets[i] + '</button>';
    body = '<h1>إيه هدفك من الإعلانات؟ 🎯</h1><p>هدفك بيحدد نوع الحملة وطريقة قياس النجاح.</p>' +
      '<div class="mg-choice-grid">' + gh + '</div>' + commentsNote('goal') +
      '<div class="mg-field" style="margin-top:22px"><label>ميزانية الإعلانات الشهرية <span class="mg-req">*</span></label><div class="mg-chips">' + bh + '</div>' + commentsNote('budget') + whyBox('الميزانية بتحدد عدد المنصات والإعلانات اللي نقدر نجربها في أول شهر.') + '</div>' +
      '<div class="mg-field"><label>بتفكر تعلن فين؟ (اختياري)</label><div class="mg-chips">' + ph + '</div></div>' +
      '<div class="mg-field"><label>مين بيرد على الرسايل وبيأكد الأوردرات؟ <span class="mg-req">*</span></label><div class="mg-chips">' + rh + '</div>' + commentsNote('responder') +
        whyBox('سرعة الرد بتفرق جداً في النتايج: لو مفيش حد بيرد بسرعة، الإعلانات هتجيب رسايل وتضيع. لو محتاج، نقدر نرشحلك حلول.') + '</div>' +
      '<div class="mg-field"><label>لو بتبيع COD: نسبة تأكيد الأوردرات تقريباً؟</label><div class="mg-chips">' + ch + '</div>' + commentsNote('codConfirm') +
        whyBox('نسبة التأكيد بتأثر على العرض والسعر اللي نقترحه. لو التأكيد ضعيف، هنشتغل على تأكيد الأوردر قبل ما نزود الإعلانات.') + '</div>' +
      '<div class="mg-field"><label>ونسبة المرتجعات؟</label><div class="mg-chips">' + cr + '</div>' + commentsNote('codReturns') +
        whyBox('المرتجعات بتاكل من الربح، فلازم تتحسب في تكلفة الأوردر المقبولة من الأول.') + '</div>';
  }

  if (br.step === 3) {
    var ages = ['١٨ – ٢٤', '٢٥ – ٣٤', '٣٥ – ٤٤', '٤٥+'];
    var ah = '', j;
    for (j = 0; j < ages.length; j++) ah += '<button type="button" class="mg-opt-chip' + (br.age.indexOf(ages[j]) > -1 ? ' is-selected' : '') + '" data-action="tog-age" data-v="' + ages[j] + '">' + ages[j] + '</button>';
    var genders = ['رجالة', 'ستات', 'الاتنين'];
    var ghh = '';
    for (j = 0; j < genders.length; j++) ghh += '<button type="button" class="mg-opt-chip' + (br.gender === genders[j] ? ' is-selected' : '') + '" data-action="sel-gender" data-v="' + genders[j] + '">' + genders[j] + '</button>';
    body = '<h1>مين اللي عايز يشوف إعلانك؟ 👥</h1><p>كل ما توصف جمهورك بدقة، الإعلان يوصل للناس الصح بتكلفة أقل.</p>' +
      '<div class="mg-field"><label>الفئة السنية <span class="mg-req">*</span></label><div class="mg-chips">' + ah + '</div></div>' +
      '<div class="mg-field"><label>النوع <span class="mg-req">*</span></label><div class="mg-chips">' + ghh + '</div></div>' +
      '<div class="mg-field"><label>المحافظات أو المناطق</label><input data-bfield="geo" value="' + esc(br.geo) + '" placeholder="مثال: القاهرة، الجيزة، الإسكندرية">' + commentsNote('geo') + '</div>' +
      '<div class="mg-field"><label>وصفهم بكلماتك</label><textarea data-bfield="interests" placeholder="مثال: ناس بتسوق عربياتها يومياً ومهتمة بالأدوات التقنية">' + esc(br.interests) + '</textarea>' + commentsNote('interests') + whyBox('وصفك الحر بيديني إحساس حقيقي بالعميل، والتارجتنج الدقيق بيبدأ من هنا.') + '</div>';
  }

  if (br.step === 4) {
    var cards = '';
    for (var q = 0; q < ANGLES.length; q++) {
      var an = ANGLES[q], sel = br.angles.indexOf(an.id) > -1;
      cards += '<button type="button" class="mg-choice' + (sel ? ' is-selected' : '') + '" data-action="tog-angle" data-v="' + an.id + '"><span class="mg-c-ico">' + an.ico + '</span><span><b>' + an.name + '</b><small>' + an.desc + '</small></span></button>';
    }
    body = '<h1>اختار الأنجلز اللي حاسس إنها بتلمس جمهورك ⚡</h1><p>الأنجل هو زاوية الكلام اللي الإعلان هيتبني عليها. اختيارك بيساعدني أبدأ التجربة من نص الطريق.</p>' +
      '<div class="mg-counter">اخترت ' + toAr(br.angles.length) + ' من ٣</div>' +
      '<div class="mg-choice-grid mg-choice-grid--2">' + cards + '</div>';
  }

  if (br.step === 5) {
    var rows = '';
    for (var w = 0; w < ASSET_DEFS.length; w++) {
      var ad = ASSET_DEFS[w], cur = br.assets[ad.id];
      var isLink = LINK_ASSETS.indexOf(ad.id) > -1;
      if (cur) {
        rows += '<div class="mg-choice is-selected mg-asset"><span class="mg-c-ico">✅</span><span><b>' + ad.name + '</b><small>' + esc(cur) + '</small></span>' +
          '<span class="mg-asset-act">' + (isLink
            ? '<button type="button" class="mg-mini-link" data-action="asset-clear" data-v="' + ad.id + '">غيّر</button>'
            : '<label class="mg-mini-link">غيّر<input type="file" data-asset="' + ad.id + '" hidden></label>') + '</span></div>';
      } else if (isLink) {
        rows += '<div class="mg-choice mg-asset"><span class="mg-c-ico">' + ad.ico + '</span><span><b>' + ad.name + '</b><small>' + ad.hint + '</small></span></div>' +
          '<div class="mg-field" style="margin-top:-6px"><input data-basset="' + ad.id + '" value="" placeholder="الصق اللينك هنا"><button type="button" class="mg-mini-link" data-action="asset-wa" data-v="' + ad.id + '">هبعتها واتساب</button></div>';
      } else {
        rows += '<div class="mg-choice mg-asset"><span class="mg-c-ico">' + ad.ico + '</span><span><b>' + ad.name + '</b><small>' + ad.hint + '</small></span>' +
          '<span class="mg-asset-act"><label class="mg-upload-btn">رفع الملف<input type="file" data-asset="' + ad.id + '" hidden></label>' +
          '<button type="button" class="mg-mini-link" data-action="asset-wa" data-v="' + ad.id + '">هبعتها واتساب</button></span></div>';
      }
    }
    body = '<h1>الأصول المطلوبة منك 📎</h1><p>دي الحاجات اللي الميديا باير محتاجها عشان يطلّع إعلانات شكلها محترف. ارفع اللي جاهز دلوقتي:</p>' +
      (state.saving ? '<p class="mg-uploading">⏳ بيترفع / بيتحفظ…</p>' : '') +
      '<div class="mg-choice-grid">' + rows + '</div>' +
      '<div class="mg-why" style="margin-top:14px">💡 <span>اللي مش جاهز دلوقتي متقلقش، الميديا باير هيتابعه معاك بعد ما يوصله البريف.</span></div>';
  }

  var nav = '<div class="mg-brief-nav">' +
    (br.step > 1 ? '<a class="mg-btn mg-btn--ghost" data-action="brief-back">→ السابق</a>' : '') +
    (br.step < 5 ? '<a class="mg-btn" data-action="brief-next">التالي ←</a>' : '<a class="mg-btn" data-action="brief-submit">إرسال البريف ✅</a>') +
    '</div>';
  return top + '<div class="mg-wrap">' + toastHtml() + '<div class="mg-brief-card">' + body + nav + '</div></div>';
}
/* ===================== Controller ===================== */
function render() {
  if (!containerEl) return;
  var r = state.route;
  var html;
  if (!cfgOk()) html = viewSetup();
  else if (r.indexOf('/b/') === 0) html = state.briefErr ? viewBriefError() : (state.brief ? viewBrief() : viewBriefLoading());
  else if (r === '/dashboard') html = state.session ? viewDashboard() : viewAuth();
  else if (r.indexOf('/client/') === 0) html = state.session ? viewClient() : viewAuth();
  else if (r === '/auth') html = state.session ? viewDashboard() : viewAuth();
  else html = viewLanding();
  containerEl.innerHTML = '<div class="mg-root" dir="rtl" lang="ar">' + html + modalHtml() + '</div>';
  if (state.modal) {
    var d = containerEl.querySelector('dialog.mg-dialog');
    if (d && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute('open', ''); } }
  }
}

function parsePath() {
  var p = location.pathname || '/';
  var q = location.search || '';
  if (p.indexOf('/b/') === 0) return { route: '/b/' + p.split('/')[2] };
  if (p.indexOf('/client/') === 0) return { route: '/client/' + p.split('/')[2] };
  if (p === '/dashboard') return { route: '/dashboard' };
  if (p === '/auth') return { route: '/auth', signup: q.indexOf('signup') > -1 };
  return { route: '/' };
}

function go(to, opts) {
  opts = opts || {};
  var path = to;
  if (to === '/auth' && opts.signup) path = '/auth?mode=signup';
  try { history.pushState({}, '', path); } catch (e) {}
  applyRoute(to, opts);
}

function applyRoute(to, opts) {
  opts = opts || {};
  state.route = to;
  state.notifOpen = false;
  if (to === '/auth' && opts.signup) state.auth.mode = 'signup';
  if (to.indexOf('/b/') === 0) {
    var token = to.slice(3);
    if (!state.brief || state.brief.token !== token) {
      state.brief = null;
      state.briefErr = '';
      render();
      loadBriefByToken(token);
      window.scrollTo(0, 0);
      return;
    }
  }
  if (to.indexOf('/client/') === 0 && state.session) {
    var id = to.slice(8);
    if (state.detailId !== id) {
      render();
      loadDetail(id);
      window.scrollTo(0, 0);
      return;
    }
  }
  if ((to === '/dashboard' || to === '/auth') && state.session && !state.clientsLoaded) {
    render();
    loadClients().then(render);
    loadNotifs().then(render);
    subscribeNotifs();
    window.scrollTo(0, 0);
    return;
  }
  render();
  window.scrollTo(0, 0);
}

function toast(msg) {
  state.toast = msg;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { state.toast = ''; render(); }, 2500);
}

function copyText(text, okMsg) {
  function fallback() { toast('اللينك ظاهر قدامك، حدّده وانسخه'); }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else fallback();
  } catch (e) { fallback(); }
}

function tog(arr, v) {
  var i = arr.indexOf(v);
  if (i > -1) arr.splice(i, 1); else arr.push(v);
}

function findClient(id) {
  for (var i = 0; i < state.clients.length; i++) if (state.clients[i].id === id) return state.clients[i];
  return null;
}

async function doAuth() {
  var a = state.auth;
  a.err = ''; a.ok = '';
  if (!a.email.trim() || a.pass.length < 6) { a.err = 'اكتب إيميل صح وكلمة سر ٦ حروف على الأقل'; render(); return; }
  if (a.mode === 'signup' && !a.name.trim()) { a.err = 'اكتب اسمك الأول'; render(); return; }
  a.busy = true; render();
  if (a.mode === 'signup') {
    var r = await sb.auth.signUp({ email: a.email.trim(), password: a.pass, options: { data: { full_name: a.name.trim() } } });
    a.busy = false;
    if (r.error) { a.err = r.error.message.indexOf('already') > -1 ? 'الإيميل ده مسجل قبل كده، جرب تسجيل الدخول' : 'حصلت مشكلة في إنشاء الحساب، جرب تاني'; render(); return; }
    if (r.data.session) { await onSession(r.data.session); go('/dashboard'); return; }
    a.ok = 'الحساب اتعمل ✅ بص على إيميلك وأكد التسجيل، وبعدين سجّل دخولك.';
    a.mode = 'login'; render(); return;
  }
  var r2 = await sb.auth.signInWithPassword({ email: a.email.trim(), password: a.pass });
  a.busy = false;
  if (r2.error) { a.err = 'الإيميل أو كلمة السر مش صح، جرب تاني'; render(); return; }
  await onSession(r2.data.session);
  go('/dashboard');
}

async function onSession(session) {
  state.session = session;
  var meta = session.user.user_metadata || {};
  state.me.name = meta.full_name || (session.user.email || '').split('@')[0];
  state.me.email = session.user.email || '';
  if (!state.clientsLoaded) {
    await loadClients();
    await loadNotifs();
    subscribeNotifs();
  }
}

function onClick(e) {
  var t = e.target;
  if (t.classList && t.classList.contains('mg-dialog')) { state.modal = null; render(); return; }
  var el = t.closest ? t.closest('[data-action]') : null;
  if (!el) return;
  var action = el.getAttribute('data-action');
  var v = el.getAttribute('data-v');
  var br = state.brief;

  if (action === 'nav') {
    var to = el.getAttribute('data-to');
    if (to === '/auth?mode=signup') { go('/auth', { signup: true }); return; }
    if ((to === '/dashboard' || to.indexOf('/client/') === 0) && !state.session) { go('/auth'); return; }
    go(to); return;
  }
  if (action === 'auth-mode') { state.auth.mode = v; state.auth.err = ''; state.auth.ok = ''; render(); return; }
  if (action === 'auth-submit') { doAuth(); return; }
  if (action === 'sign-out') {
    sb.auth.signOut().then(function () {
      state.session = null; state.clients = []; state.clientsLoaded = false; state.notifs = [];
      state.detail = null; state.detailId = null; state.rtChannel = null;
      go('/');
    });
    return;
  }
  if (action === 'open-new') { state.newClient = { name: '', brand: '', link: '', copied: false }; state.modal = 'newClient'; render(); return; }
  if (action === 'close-modal') { state.modal = null; render(); return; }
  if (action === 'create-link') {
    var nc = state.newClient;
    if (!nc.name.trim() || !nc.brand.trim()) { toast('اكتب اسم العميل والبراند الأول'); return; }
    el.textContent = 'ثانية واحدة…';
    sb.from('clients').insert({ user_id: state.session.user.id, name: nc.name.trim(), brand: nc.brand.trim(), buyer_name: state.me.name }).select().single()
      .then(async function (r) {
        if (r.error) { toast('حصلت مشكلة، جرب تاني'); render(); return; }
        var c = r.data;
        await sb.from('events').insert({ client_id: c.id, body: 'اللينك اتعمل واتبعت' });
        state.clients.unshift(c);
        nc.link = briefLink(c);
        render();
      });
    return;
  }
  if (action === 'copy-link') { state.newClient.copied = true; render(); copyText(state.newClient.link, 'اللينك اتنسخ ✓ ابعته على الواتساب'); return; }
  if (action === 'copy-client-link') { var c1 = findClient(el.getAttribute('data-id')); if (c1) copyText(briefLink(c1), 'اللينك اتنسخ ✓ ابعته على الواتساب'); return; }
  if (action === 'bell') {
    state.notifOpen = !state.notifOpen;
    if (state.notifOpen) {
      var ids = [];
      for (var i = 0; i < state.notifs.length; i++) { if (!state.notifs[i].read) ids.push(state.notifs[i].id); state.notifs[i].read = true; }
      if (ids.length) sb.from('notifications').update({ read: true }).in('id', ids).then(function () {});
    }
    render(); return;
  }
  if (action === 'comment') {
    state.commentDraft = { clientId: el.getAttribute('data-client'), field: el.getAttribute('data-field'), text: '' };
    state.modal = 'comment'; render(); return;
  }
  if (action === 'save-comment') {
    var d = state.commentDraft;
    if (!d.text.trim()) { toast('اكتب التعليق الأول'); return; }
    sb.from('comments').insert({ client_id: d.clientId, field: d.field, body: d.text.trim() })
      .then(function (r) {
        if (r.error) { toast('حصلت مشكلة، جرب تاني'); return; }
        state.modal = null;
        toast('التعليق اتسجل ✓ هيظهر للعميل جنب السؤال');
        loadDetail(d.clientId);
      });
    return;
  }
  if (action === 'open-summary') {
    var cs = findClient(el.getAttribute('data-id')) || (state.detail && state.detail.client);
    if (cs && cs.briefs) {
      state.summary = { name: cs.name, brand: cs.brand, when: cs.briefs.submitted_at ? timeAgo(cs.briefs.submitted_at) : '', brief: cs.briefs.data || {} };
      state.modal = 'summary'; render();
    }
    return;
  }
  if (action === 'open-summary-brief') {
    if (br) {
      state.summary = { name: state.briefMeta.name, brand: state.briefMeta.brand, when: '', brief: briefPayload() };
      state.modal = 'summary'; render();
    }
    return;
  }
  if (action === 'print-summary') { try { window.print(); } catch (e) {} toast('من الطباعة اختار "حفظ كـ PDF"'); return; }
  if (action === 'agree-buyer') {
    var cBy = findClient(el.getAttribute('data-id')) || (state.detail && state.detail.client);
    if (cBy) {
      var ag = briefAgreement(cBy);
      ag.buyer = true;
      sb.from('briefs').update({ agreement: ag, updated_at: new Date().toISOString() }).eq('client_id', cBy.id)
        .then(async function (r) {
          if (r.error) { toast('حصلت مشكلة، جرب تاني'); return; }
          await sb.from('events').insert({ client_id: cBy.id, body: 'الميديا باير أكد نقاط الاتفاق 🤝' });
          if (cBy.briefs) cBy.briefs.agreement = ag;
          toast(ag.client ? 'الاتفاق متأكد من الطرفين 🎉' : 'أكدت الاتفاق ✓ مستني تأكيد العميل');
          loadDetail(cBy.id);
        });
    }
    return;
  }
  if (action === 'agree-client') {
    if (!br) return;
    sb.rpc('confirm_agreement_client', { p_token: br.token }).then(function (r) {
      if (r.error || r.data === false) { toast('حصلت مشكلة، جرب تاني'); return; }
      br.agreement.client = true;
      render();
      toast('أكدت نقاط الاتفاق ✓');
    });
    return;
  }

  if (action === 'open-asset') {
    var ap = el.getAttribute('data-path');
    el.textContent = 'ثانية…';
    sb.storage.from('assets').createSignedUrl(ap, 600).then(function (r) {
      if (r.error || !r.data) { toast('الملف مش متاح، جرب تاني'); render(); return; }
      window.open(r.data.signedUrl, '_blank', 'noopener');
      render();
    });
    return;
  }
  if (action === 'delete-client') {
    var dc = findClient(el.getAttribute('data-id')) || (state.detail && state.detail.client);
    if (!dc) return;
    if (state.confirmDelete !== dc.id) { state.confirmDelete = dc.id; toast('متأكد؟ دوس تاني للمسح النهائي — الملفات والبريف هيتمسحوا'); render(); return; }
    state.confirmDelete = null;
    sb.storage.from('assets').list(dc.link_token).then(function (lr) {
      var names = (lr && lr.data) || [];
      var paths = names.map(function (f) { return dc.link_token + '/' + f.name; });
      var done = function () {
        sb.from('clients').delete().eq('id', dc.id).then(function (dr) {
          if (dr.error) { toast('حصلت مشكلة في المسح، جرب تاني'); return; }
          state.clients = state.clients.filter(function (x) { return x.id !== dc.id; });
          state.detail = null; state.detailId = null;
          toast('العميل وملفاته وبريفه اتمسحوا نهائياً ✓');
          go('/dashboard');
        });
      };
      if (paths.length) sb.storage.from('assets').remove(paths).then(done); else done();
    });
    return;
  }

  /* brief flow */
  if (action === 'brief-start') { br.step = 1; render(); scheduleDraftSave(); return; }
  if (action === 'brief-next') { if (br.step < 5) { br.step++; render(); window.scrollTo(0, 0); scheduleDraftSave(); } return; }
  if (action === 'brief-back') { if (br.step > 1) { br.step--; render(); window.scrollTo(0, 0); } return; }
  if (action === 'sel-goal') { br.goal = v; render(); scheduleDraftSave(); return; }
  if (action === 'sel-budget') { br.budget = v; render(); scheduleDraftSave(); return; }
  if (action === 'tog-platform') { tog(br.platforms, v); render(); scheduleDraftSave(); return; }
  if (action === 'tog-age') { tog(br.age, v); render(); scheduleDraftSave(); return; }
  if (action === 'sel-gender') { br.gender = v; render(); scheduleDraftSave(); return; }
  if (action === 'sel-responder') { br.responder = v; render(); scheduleDraftSave(); return; }
  if (action === 'sel-codconfirm') { br.codConfirm = v; render(); scheduleDraftSave(); return; }
  if (action === 'sel-codreturn') { br.codReturns = v; render(); scheduleDraftSave(); return; }
  if (action === 'tog-angle') {
    var ix = br.angles.indexOf(v);
    if (ix > -1) br.angles.splice(ix, 1);
    else if (br.angles.length < 3) br.angles.push(v);
    else { toast('تقدر تختار لحد ٣ أنجلز بس'); return; }
    render(); scheduleDraftSave(); return;
  }
  if (action === 'asset-wa') { br.assets[v] = 'هتتبعت على الواتساب'; render(); scheduleDraftSave(); return; }
  if (action === 'asset-clear') { br.assets[v] = ''; if (br.assetPaths) delete br.assetPaths[v]; render(); scheduleDraftSave(); return; }
  if (action === 'brief-submit') {
    if (!br.productName.trim() || !br.price.trim() || !br.goal || !br.budget || !br.responder) {
      toast('كمّل الخانات اللي عليها * قبل الإرسال'); return;
    }
    el.textContent = 'بيبعت…';
    var score = readiness(briefPayload()).score;
    sb.rpc('submit_brief', { p_token: br.token, p_data: briefPayload(), p_readiness: score }).then(function (r) {
      if (r.error || r.data === false) { toast('حصلت مشكلة في الإرسال، جرب تاني'); render(); return; }
      br.submitted = true;
      br.readiness = score;
      br.step = 6;
      render(); window.scrollTo(0, 0);
    });
    return;
  }
}

function onInput(e) {
  var el = e.target;
  if (!el.getAttribute) return;
  var af = el.getAttribute('data-afield');
  if (af) { state.auth[af] = el.value; return; }
  var nf = el.getAttribute('data-nfield');
  if (nf) { state.newClient[nf] = el.value; return; }
  var cf = el.getAttribute('data-cfield');
  if (cf) { state.commentDraft[cf] = el.value; return; }
  var bf = el.getAttribute('data-bfield');
  if (bf && state.brief) { state.brief[bf] = el.value; scheduleDraftSave(); return; }
  var ba = el.getAttribute('data-basset');
  if (ba && state.brief) {
    if (el.value.trim()) state.brief.assets[ba] = el.value.trim();
    else delete state.brief.assets[ba];
    scheduleDraftSave(); return;
  }
}

function onChange(e) {
  var el = e.target;
  if (!el.getAttribute) return;
  var asset = el.getAttribute('data-asset');
  if (asset && state.brief && el.files && el.files[0]) {
    var file = el.files[0];
    if (file.size > 50 * 1024 * 1024) { toast('الملف أكبر من ٥٠ ميجا، ابعته واتساب'); return; }
    var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = state.brief.token + '/' + asset + '-' + Date.now() + '.' + ext;
    state.saving = true; render();
    sb.storage.from('assets').upload(path, file, { upsert: false }).then(function (r) {
      state.saving = false;
      if (r.error) { toast('الرفع ما تمش، جرب تاني أو ابعتها واتساب'); render(); return; }
      state.brief.assets[asset] = 'اترفع: ' + file.name;
      state.brief.assetPaths[asset] = path;
      render(); scheduleDraftSave();
    });
  }
}

/* ===================== Boot ===================== */
async function boot() {
  if (!cfgOk()) { render(); return; }
  sb = supabase.createClient(ITIFAQ_CONFIG.SUPABASE_URL, ITIFAQ_CONFIG.SUPABASE_ANON_KEY);
  var r = await sb.auth.getSession();
  if (r.data && r.data.session) await onSession(r.data.session);
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') {
      state.session = null; state.clients = []; state.clientsLoaded = false;
      if (state.route === '/dashboard' || state.route.indexOf('/client/') === 0) go('/');
    }
  });
  var p = parsePath();
  applyRoute(p.route, p);
  window.addEventListener('popstate', function () {
    var pp = parsePath();
    applyRoute(pp.route, pp);
  });
}

function mountItifaq(container) {
  containerEl = container;
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  boot();
}

mountItifaq(document.getElementById('app'));
