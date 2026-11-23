// [AI] Logic chính của GoNow. Chia theo khu vực: tiện ích → ảnh → đăng nhập → đồ ăn → cửa hàng → giỏ hàng → đặt xe → QR → giỏ/modal → đơn hàng → trang chủ → sự kiện → khởi tạo.
const $ = s => document.querySelector(s);
const money = n => n.toLocaleString("vi-VN") + "đ";
const foodById = id => FOODS.find(f => f.id === id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

// ---- Ảnh: khung xám trống, có file ảnh thì tự hiện ----
const imgOf = (kind, o) => o.img || `images/${kind}/${o.id}.jpg`;
const CAT_ICON = { "Món nước": "🍜", "Cơm": "🍚", "Ăn vặt": "🥖", "Pizza & Burger": "🍕", "Đồ uống": "🧋", "Tráng miệng": "🍮", "Món chay": "🥗" };
const catIcon = c => CAT_ICON[c] || "🍽️";
const failImg = icon => icon ? `this.outerHTML='<b class=&quot;ph&quot;>${icon}</b>'` : "this.remove()";
const pic = (src, cls, icon = "") => `<span class="${cls}"><img src="${src}" alt="" onerror="${failImg(icon)}"></span>`;

// ---- Firebase (chỉ bật khi đã điền FIREBASE_CONFIG trong js/config.js) ----
const fbReady = typeof firebase !== "undefined" && !!FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("DIEN");
let auth = null;
if (fbReady) {
  try { const fbApp = firebase.initializeApp(FIREBASE_CONFIG); auth = fbApp.auth(); if (typeof dbStart === "function") dbStart(fbApp, false); }
  catch (err) { console.error("Firebase lỗi:", err); }
}
const useFirebase = !!auth;

// ---- Trạng thái (đồng bộ với LocalStorage) ----
let cart = load("gonow_cart", []).filter(c => foodById(c.id));
let favs = load("gonow_favs", []);
let orders = load("gonow_orders", []);
let trip = { from: "", to: "", vehicle: "bike", fromLoc: null, toLoc: null, km: 0, exact: false, busy: false };
let ctx = "food";
let voucher = null;
let voucherMsg = { text: "", ok: false };
const COD = "Thanh toán khi nhận hàng (COD)", COD_RIDE = "Trả tiền mặt cho tài xế";
let ref = "";
let user = useFirebase ? null : load("gonow_user", null);
let authMode = "login";
let loc = load("gonow_loc", "Quận 1");
let cartStore = load("gonow_cartstore", 0);
let contact = { phone: "", addr: "", note: "", ...load("gonow_contact", {}) };
const cid = load("gonow_cid", null) || (() => { const v = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); save("gonow_cid", v); return v; })();
const myUid = () => (auth && auth.currentUser && auth.currentUser.uid) || cid;
if (!DISTRICTS[loc]) loc = "Quận 1";
let storeId = 0;
let storesShown = 6;

const QUICK = [
  ["Xe máy", "ride", "bike"], ["Ô tô 4 chỗ", "ride", "car4"],
  ["Yêu thích", "favOnly", ""], ["Ưu đãi", "toPromos", ""]
];

// ---- Tiện ích ----
let toastTimer = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), Math.max(2200, msg.length * 60));
}
const goto = sel => $(sel)?.scrollIntoView({ behavior: "smooth", block: "start" });

function showTab(tab) {
  if (tab === "account" && !user) return openAuth();
  ["food", "ride", "orders", "account"].forEach(name => {
    $("#" + name).hidden = name !== tab;
    document.querySelectorAll(`[data-tab="${name}"]`).forEach(b => b.classList.toggle("active", name === tab));
  });
  if (tab === "orders") renderOrders();
  if (tab === "account") renderAccount();
  if (tab === "ride") initRideMap();
  updateRails();
}

function updateRails() {
  document.querySelectorAll(".railWrap").forEach(w => {
    const r = w.querySelector(".rail"), b = w.querySelector(".next");
    if (r && b) b.hidden = r.scrollWidth <= r.clientWidth + 4;
  });
}

function initRailDrag() {
  document.querySelectorAll(".rail, .quick").forEach(r => {
    let down = false, moved = false, sx = 0, sl = 0;
    r.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") return; down = true; moved = false; sx = e.clientX; sl = r.scrollLeft; });
    window.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 5) { moved = true; r.classList.add("drag"); }
      if (moved) r.scrollLeft = sl - dx;
    });
    window.addEventListener("pointerup", () => { if (down) { down = false; r.classList.remove("drag"); } });
    r.addEventListener("dragstart", e => e.preventDefault());
    r.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  });
}

// ---- HERO: carousel ảnh ----
const hs = { list: [], i: 0, timer: 0, hover: false, x0: null };
function heroSlides() {
  const raw = typeof HERO_SLIDES !== "undefined" && Array.isArray(HERO_SLIDES) ? HERO_SLIDES : [];
  const l = raw.filter(x => x && x.title);
  return l.length ? l : [{ title: "Món ngon<br>đến tận cửa nhà bạn", text: "", cta: "", act: "" }];
}
function renderHero() {
  hs.list = heroSlides();
  $("#introVideo").innerHTML = hs.list.map((x, k) => `<div class="hslide tone${k % 4}">${x.img ? `<img src="${esc(x.img)}" alt="" ${k ? "" : 'fetchpriority="high"'} onerror="this.remove()">` : ""}</div>`).join("");
  const many = hs.list.length > 1;
  $("#heroDots").hidden = !many;
  document.querySelectorAll(".heroNav").forEach(b => { b.hidden = !many; });
  $("#heroDots").innerHTML = hs.list.map((_, k) => `<button type="button" data-act="heroGo" data-id="${k}" aria-label="Chuyển tới slide ${k + 1}"></button>`).join("");
  showHero(0, true);
  const hero = $("#hero");
  const reveal = () => hero.classList.remove("loading"), firstImg = $("#introVideo img");
  if (firstImg && !firstImg.complete) { firstImg.addEventListener("load", reveal, { once: true }); firstImg.addEventListener("error", reveal, { once: true }); setTimeout(reveal, 1500); }
  else reveal();
  ["mouseenter", "focusin"].forEach(ev => hero.addEventListener(ev, () => { hs.hover = true; }));
  ["mouseleave", "focusout"].forEach(ev => hero.addEventListener(ev, () => { hs.hover = false; }));
  hero.addEventListener("touchstart", e => { hs.x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener("touchend", e => {
    if (hs.x0 === null) return;
    const dx = e.changedTouches[0].clientX - hs.x0; hs.x0 = null;
    if (Math.abs(dx) > 50) moveHero(dx < 0 ? 1 : -1);
  });
  restartHero();
}
function showHero(i, first) {
  const n = hs.list.length; hs.i = ((i % n) + n) % n;
  const x = hs.list[hs.i], box = $(".heroIn");
  const slides = [...document.querySelectorAll(".hslide")], old = slides.find(el => el.classList.contains("on"));
  slides.forEach((el, k) => {
    if (k === hs.i) { el.classList.remove("prev"); el.classList.add("on"); }
    else if (el === old) { el.classList.remove("on"); el.classList.add("prev"); setTimeout(() => el.classList.remove("prev"), 950); }
    else el.classList.remove("on", "prev");
  });
  document.querySelectorAll("#heroDots button").forEach((el, k) => { el.classList.toggle("on", k === hs.i); el.setAttribute("aria-current", k === hs.i ? "true" : "false"); });
  const apply = () => {
    $("#heroTitle").innerHTML = x.title;
    $("#heroText").innerHTML = x.text || ""; $("#heroText").hidden = !x.text;
    $("#heroCta").innerHTML = x.cta ? `<button class="btn heroBtn" data-act="${esc(x.act || "toFoods")}" data-id="${esc(x.id || "")}">${esc(x.cta)}</button>` : "";
    box.classList.remove("swap");
  };
  if (first) apply(); else { box.classList.add("swap"); setTimeout(apply, 220); }
}
const moveHero = d => { showHero(hs.i + d); restartHero(); };
function restartHero() {
  clearInterval(hs.timer);
  if (hs.list.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  hs.timer = setInterval(() => { if (!hs.hover && !document.hidden) showHero(hs.i + 1); }, 6000);
}

// ---- ĐĂNG NHẬP / ĐĂNG KÝ ----
const AUTH_ERR = {
  "auth/invalid-email": "Email không hợp lệ.",
  "auth/weak-password": "Mật khẩu cần ít nhất 6 ký tự.",
  "auth/email-already-in-use": "Tài khoản này đã được đăng ký. Hãy đăng nhập.",
  "auth/invalid-credential": "Sai tài khoản hoặc mật khẩu.",
  "auth/user-not-found": "Không tìm thấy tài khoản này.",
  "auth/wrong-password": "Sai mật khẩu.",
  "auth/too-many-requests": "Thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
  "auth/network-request-failed": "Lỗi mạng. Kiểm tra kết nối internet.",
  "auth/unauthorized-domain": "Tên miền chưa được cho phép. Thêm vào Firebase → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "Chưa bật phương thức đăng nhập này trong Firebase → Authentication → Sign-in method (Email/Password).",
  "auth/requires-recent-login": "Phiên đăng nhập đã cũ. Hãy đăng xuất và đăng nhập lại."
};

function normPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("84")) d = d.slice(2);
  d = d.replace(/^0/, "");
  return /^[35789]\d{8}$/.test(d) ? d : "";
}
const isGmail = v => /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(String(v || "").trim());
const authEmail = () => $("#aEmail").value.trim().toLowerCase();
function authValid() {
  if (!isGmail(authEmail()) || $("#aPass").value.length < 6) return false;
  return authMode !== "register" || (!!$("#aName").value.trim() && !!normPhone($("#aPhone").value));
}
const updateAuthBtn = () => { $("#authGo").disabled = !authValid(); };

let authReason = "";
function showReason(t) { const n = $("#authReason"); n.textContent = t || ""; n.hidden = !t; }
function renderAuth() {
  const reg = authMode === "register";
  $("#authTitle").textContent = reg ? "Đăng ký GoNow" : "Đăng nhập vào GoNow";
  $("#authForm").hidden = false; $("#authVerify").hidden = true;
  $("#aName").hidden = !reg; $("#authPhone").hidden = !reg;
  $("#authGo").textContent = reg ? "Tạo tài khoản" : "Đăng nhập";
  $("#aPass").autocomplete = reg ? "new-password" : "current-password";
  $("#authSwitch").innerHTML = (reg
    ? 'Đã có tài khoản? <button class="link2" data-act="authMode" data-id="login">Đăng nhập</button>'
    : 'Chưa có tài khoản? <button class="link2" data-act="authMode" data-id="register">Đăng ký</button>')
    + (!reg ? ' • <button class="link2" data-act="resetPw">Quên mật khẩu</button>' : "");
  $("#authDemo").hidden = useFirebase;
  showReason(authReason);
  $("#amsg").textContent = "";
  updateAuthBtn();
}

function openAuth(reason = "") {
  authMode = "login"; authReason = reason; $("#auth").hidden = false; renderAuth();
  setTimeout(() => $("#aEmail").focus(), 50);
}
const closeAuth = () => { $("#auth").hidden = true; authReason = ""; };
const isVerified = u => !!(u && !u.isAnonymous && u.emailVerified);
const verifiedPhone = u => { const m = ((u && u.phoneNumber) || "").match(/^\+84(\d{9})$/); return m ? "0" + m[1] : ""; };
const vMsg = (t, ok) => { const m = $("#vmsg"); m.className = "msg " + (ok ? "ok" : "bad"); m.textContent = t || ""; };
function coolDown(sel, label, sec) {
  const b = $(sel); if (!b) return;
  let n = sec; b.disabled = true;
  const tick = () => { if (n <= 0) { b.disabled = false; b.textContent = label; return; } b.textContent = `${label} (${n--}s)`; setTimeout(tick, 1000); };
  tick();
}
function openVerify(reason = "") {
  if (!useFirebase || !auth.currentUser || auth.currentUser.isAnonymous) return openAuth(reason);
  $("#auth").hidden = false; $("#authForm").hidden = true; $("#authVerify").hidden = false;
  $("#authTitle").textContent = "Xác minh tài khoản"; showReason(reason);
  renderVerify();
}
function renderVerify() {
  const u = auth.currentUser; if (!u) return;
  const eOk = u.emailVerified;
  $("#vEmailBadge").textContent = eOk ? "Đã xác minh" : "Chưa xác minh"; $("#vEmailBadge").className = "vBadge" + (eOk ? " ok" : "");
  $("#vEmailText").textContent = eOk ? u.email : `Chúng tôi đã gửi email xác minh tới ${u.email}. Mở email, bấm vào đường dẫn, rồi quay lại đây bấm “Tôi đã xác minh”. Hãy xem cả mục Spam.`;
  $("#vEmailActs").hidden = eOk;
  if ($("#vPhoneBadge")) $("#vPhoneBadge").hidden = true;
  if ($("#vPhoneDone")) $("#vPhoneDone").hidden = true;
  if ($("#vPhoneForm")) $("#vPhoneForm").hidden = true;
  if ($("#vCodeForm")) $("#vCodeForm").hidden = true;
  $("#vDone").disabled = !eOk;
}
async function sendVerifyEmail() {
  try { await auth.currentUser.sendEmailVerification(); vMsg("Đã gửi email xác minh. Hãy kiểm tra hộp thư (cả mục Spam).", true); coolDown("#vResend", "Gửi lại email", 60); }
  catch (err) { vMsg(AUTH_ERR[err.code] || "Không gửi được email (" + err.code + ")"); }
}
async function checkEmailVerified() {
  try { await auth.currentUser.reload(); } catch (err) { return vMsg(AUTH_ERR[err.code] || "Không kiểm tra được (" + err.code + ")"); }
  const u = auth.currentUser;
  if (!u.emailVerified) return vMsg("Email chưa được xác minh. Hãy bấm vào đường dẫn trong email rồi thử lại.");
  await u.getIdToken(true);
  setUser(u); renderVerify(); vMsg("Email đã được xác minh.", true);
}
function finishVerify() {
  if (!isVerified(auth.currentUser)) return vMsg("Cần xác minh email trước.");
  closeAuth(); toast("Tài khoản đã xác minh. Bạn có thể đặt hàng.");
}
function blockUnverified() {
  if (!useFirebase) { if (user) return false; openAuth("Vui lòng đăng nhập để đặt hàng."); return true; }
  const u = auth.currentUser;
  if (!u || u.isAnonymous) { openAuth("Vui lòng đăng nhập để đặt hàng."); return true; }
  if (!isVerified(u)) { openVerify("Cần xác minh email trước khi đặt hàng."); return true; }
  return false;
}

function setUser(u) {
  if (!u) user = null;
  else user = {
    name: u.displayName || (u.email || "").split("@")[0],
    email: u.email,
    phone: verifiedPhone(u) || (user && user.phone) || contact.phone || "",
    verified: isVerified(u)
  };
  renderUser();
}
const initial = n => (String(n || "?").trim().charAt(0) || "?").toUpperCase();
function renderUser() {
  const b = $("#loginBtn");
  b.innerHTML = user ? `<span class="avatar sm">${esc(initial(user.name))}</span><span class="uname">${esc(user.name)}</span>` : "Đăng nhập";
  b.setAttribute("aria-label", user ? "Tài khoản của " + user.name : "Đăng nhập");
  if (!$("#account").hidden) { if (user) renderAccount(); else showTab("food"); }
}

function renderAccount() {
  if (!user) return;
  orders = load("gonow_orders", []);
  const mine = orders.filter(o => !o.uid || o.uid === myUid());
  const done = mine.filter(o => !o.cancelled && o.status === 4);
  $("#acMe").innerHTML = `<span class="avatar">${esc(initial(user.name))}</span>
    <div class="acWho"><h3>${esc(user.name)}</h3><p>${esc(user.email || "")}${user.phone ? " · " + esc(user.phone) : ""}</p>${useFirebase ? (user.verified ? '<span class="vBadge ok">Đã xác minh email</span>' : '<button class="btn ghost vBtn" data-act="openVerify">Xác minh email</button>') : ""}</div>
    <div class="acStats"><div><b>${mine.length}</b><span>Đơn đã đặt</span></div><div><b>${done.length}</b><span>Hoàn tất</span></div><div><b>${money(done.reduce((t, o) => t + o.total, 0))}</b><span>Đã chi tiêu</span></div></div>
    <div class="acts"><button class="btn" data-act="toOrders">Xem đơn hàng của tôi</button><button class="btn ghost" data-act="logout">Đăng xuất</button></div>`;
  if (document.activeElement !== $("#acName")) $("#acName").value = user.name;
  $("#acId").value = user.email || "";
  $("#acPwCard").classList.toggle("off", !useFirebase);
  $("#pwDemo").hidden = useFirebase;
  ["#acNew", "#acCur", "#acNew2"].forEach(id => { $(id).disabled = !useFirebase; });
}
const acMsg = (sel, text, ok) => { const m = $(sel); m.className = "msg " + (ok ? "ok" : "bad"); m.textContent = text; };
async function saveName() {
  const name = $("#acName").value.trim().replace(/\s+/g, " ");
  if (name.length < 2) return acMsg("#acMsg", "Tên cần ít nhất 2 ký tự.", false);
  if (name === user.name) return acMsg("#acMsg", "Tên chưa thay đổi.", false);
  try {
    if (useFirebase) { await auth.currentUser.updateProfile({ displayName: name }); setUser(auth.currentUser); }
    else { user = { ...user, name }; save("gonow_user", user); renderUser(); }
    acMsg("#acMsg", "Đã cập nhật tên.", true); renderAccount(); toast("Đã lưu tên mới");
  } catch (err) { acMsg("#acMsg", AUTH_ERR[err.code] || "Không lưu được (" + (err.code || err.message) + ")", false); }
}
async function changePassword() {
  if (!useFirebase) return acMsg("#pwMsg", "Chế độ demo chưa có mật khẩu thật.", false);
  const cur = $("#acCur").value, nw = $("#acNew").value, nw2 = $("#acNew2").value;
  if (!cur) return acMsg("#pwMsg", "Hãy nhập mật khẩu hiện tại.", false);
  if (nw.length < 6) return acMsg("#pwMsg", "Mật khẩu mới cần ít nhất 6 ký tự.", false);
  if (nw !== nw2) return acMsg("#pwMsg", "Hai mật khẩu mới chưa khớp nhau.", false);
  if (nw === cur) return acMsg("#pwMsg", "Mật khẩu mới phải khác mật khẩu cũ.", false);
  const btn = $("#pwGo"); btn.disabled = true;
  try {
    const u = auth.currentUser;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, cur));
    await u.updatePassword(nw);
    ["#acCur", "#acNew", "#acNew2"].forEach(id => { $(id).value = ""; });
    acMsg("#pwMsg", "Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.", true); toast("Đã đổi mật khẩu");
  } catch (err) { acMsg("#pwMsg", AUTH_ERR[err.code] || "Không đổi được mật khẩu (" + (err.code || err.message) + ")", false); }
  btn.disabled = false;
}

async function submitAuth() {
  if (!authValid()) return;
  const reg = authMode === "register", name = $("#aName").value.trim(), email = authEmail(), pass = $("#aPass").value;
  const msg = $("#amsg"), btn = $("#authGo"), fromOrder = !!authReason;
  if (!useFirebase) {
    const phone = reg ? "0" + normPhone($("#aPhone").value) : "";
    user = { name: reg ? name : email.split("@")[0], email, phone }; save("gonow_user", user);
    renderUser(); closeAuth(); if (!fromOrder) { showTab("account"); window.scrollTo({ top: 0 }); } return toast("Đăng nhập thành công (chế độ demo)");
  }
  btn.disabled = true; msg.textContent = "";
  try {
    await auth.setPersistence($("#remember").checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    if (reg) {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      const phone = normPhone($("#aPhone").value);
      if (phone) { contact.phone = "0" + phone; save("gonow_contact", contact); }
      try { await cred.user.sendEmailVerification(); } catch (e) { console.warn("Không gửi được email xác minh:", e.code); }
      setUser(auth.currentUser); openVerify("Đăng ký thành công! Hãy xác minh email để đặt hàng.");
      coolDown("#vResend", "Gửi lại email", 60);
    } else {
      await auth.signInWithEmailAndPassword(email, pass);
      const u = auth.currentUser; setUser(u);
      if (isVerified(u)) { closeAuth(); if (!fromOrder) { showTab("account"); window.scrollTo({ top: 0 }); } toast("Đăng nhập thành công!"); }
      else openVerify("Tài khoản chưa xác minh email.");
    }
  } catch (err) {
    msg.textContent = err.code === "auth/operation-not-allowed"
      ? "Dự án Firebase “" + FIREBASE_CONFIG.projectId + "” chưa bật đăng nhập Email/Password (Authentication → Sign-in method). Mã lỗi: " + err.code
      : (AUTH_ERR[err.code] || "Có lỗi xảy ra (" + err.code + ")");
    updateAuthBtn();
  }
}

async function resetPassword() {
  const email = $("#aEmail").value.trim(), m = $("#amsg");
  if (!/^\S+@\S+\.\S+$/.test(email)) { m.className = "msg bad"; m.textContent = "Nhập email của bạn rồi bấm lại “Quên mật khẩu”."; return; }
  if (!useFirebase) { m.className = "msg bad"; m.textContent = "Cần cấu hình Firebase để gửi email đặt lại mật khẩu."; return; }
  try { await auth.sendPasswordResetEmail(email); m.className = "msg ok"; m.textContent = "Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư (cả mục Spam)."; }
  catch (err) { m.className = "msg bad"; m.textContent = AUTH_ERR[err.code] || "Không gửi được email (" + err.code + ")"; }
}

const CFM_ICONS = {
  logout: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  trash: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>',
  warn: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/></svg>'
};
let cfmResolve = null;
function askConfirm({ title, text = "", yes = "Xác nhận", no = "Quay lại", danger = false, icon = "warn" }) {
  closeConfirm(false);
  return new Promise(res => {
    cfmResolve = res;
    $("#cfmIcon").innerHTML = CFM_ICONS[icon] || CFM_ICONS.warn;
    $("#cfmIcon").className = "cfmIcon" + (danger ? " danger" : "");
    $("#cfmTitle").textContent = title; $("#cfmText").textContent = text;
    $("#cfmYes").textContent = yes; $("#cfmYes").className = "btn" + (danger ? " danger" : "");
    $("#cfmNo").textContent = no;
    $("#confirmWrap").hidden = false; $("#cfmNo").focus();
  });
}
function closeConfirm(result) {
  if (!cfmResolve) return;
  const r = cfmResolve; cfmResolve = null;
  $("#confirmWrap").hidden = true; r(result);
}

async function logout() {
  const ok = await askConfirm({ icon: "logout", danger: true, yes: "Đăng xuất", no: "Ở lại",
    title: "Đăng xuất khỏi GoNow?",
    text: `Bạn đang đăng nhập với tên “${user.name}”. Giỏ hàng và lịch sử đơn vẫn được giữ trên thiết bị này.` });
  if (!ok) return;
  if (useFirebase) auth.signOut(); else { user = null; localStorage.removeItem("gonow_user"); renderUser(); }
  toast("Đã đăng xuất");
}

// ---- ĐỒ ĂN ----
function foodCard(f, promo) {
  const liked = favs.includes(f.id);
  return `<article class="card">
    <div class="pic"><img src="${imgOf("food", f)}" alt="${esc(f.name)}" onerror="${failImg(catIcon(f.cat))}">${promo ? '<span class="promo">Ưu đãi</span>' : ""}<button class="heart ${liked ? "on" : ""}" data-act="fav" data-id="${f.id}" aria-label="Yêu thích">${liked ? "♥" : "♡"}</button></div>
    <div class="info"><b>${esc(f.name)}</b><small>${esc(f.cat)} • ★ ${f.rating}</small><small>${esc(f.desc)}</small>
      <span class="price">${money(f.price)}</span>
      <button class="btn sm" data-act="add" data-id="${f.id}">+ Thêm vào giỏ</button></div></article>`;
}

function renderFood() {
  const raw = $("#q").value.trim(), q = norm(raw), cat = $("#cat").value;
  const maxPrice = +$("#price").value, sort = $("#sort").value, onlyFav = $("#onlyFav").checked;
  const list = FOODS.filter(f =>
    norm(f.name + " " + f.cat).includes(q) && (cat === "all" || f.cat === cat) &&
    (!maxPrice || f.price <= maxPrice) && (!onlyFav || favs.includes(f.id)));
  if (sort === "asc") list.sort((a, b) => a.price - b.price);
  if (sort === "desc") list.sort((a, b) => b.price - a.price);
  $("#foodList").textContent = raw ? `Kết quả cho “${raw}”` : "Toàn bộ thực đơn";
  $("#foodGrid").innerHTML = list.length ? list.map(foodCard).join("")
    : '<p class="empty">Không tìm thấy món phù hợp. Thử đổi từ khóa hoặc bộ lọc nhé.</p>';
}

function toggleFav(id) {
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  save("gonow_favs", favs); renderHome(); renderFood();
}

// ---- CỬA HÀNG ----
function storeKm(s) {
  const [x1, y1] = DISTRICTS[loc], [x2, y2] = DISTRICTS[s.district];
  return Math.round((Math.hypot(x2 - x1, y2 - y1) * 1.3 + s.near) * 10) / 10;
}
const cartStoreObj = () => STORES.find(s => s.id === cartStore);
const cartKm = () => { const s = cartStoreObj(); return s ? storeKm(s) : 0; };
const shipFeeKm = km => SHIP_FEE + Math.max(0, Math.ceil(km - 2)) * 5000;
const shipFee = () => shipFeeKm(cartKm());
const storeMin = km => Math.round(km / 25 * 60) + 12;
const chip = code => { const v = VOUCHERS[code]; if (!v) return ""; return `<span class="chip">${code}: ${v.pct ? "giảm " + v.pct + "%" : "miễn phí giao" + (v.min ? " từ " + v.min / 1000 + "K" : "")}</span>`; };

function renderStores() {
  const el = $("#storeGrid");
  if (!el || typeof STORES === "undefined") return;
  const list = STORES.slice(0, storesShown);
  el.innerHTML = list.map(s => `<button class="store" data-act="store" data-id="${s.id}">
    ${pic(imgOf("store", s), "logoBox", catIcon(s.cats[0]))}
    <span class="sname">${esc(s.name)}</span>
    <span class="smeta"><span>${storeKm(s)} km • ★ ${s.rating}</span><span>Giao ${money(shipFeeKm(storeKm(s)))}</span></span>
    <span class="chips">${s.promos.map(chip).join("")}</span></button>`).join("");
  if ($("#moreStores")) $("#moreStores").hidden = storesShown >= STORES.length;
}

const renderLoc = () => { $("#locText").textContent = loc + ", TP.HCM"; };
function setLoc(d) {
  loc = d; save("gonow_loc", loc);
  renderLoc(); renderStores();
  $("#from").value = loc; renderRide();
  closeModal(); toast("Đã chọn khu vực " + d);
}

// ---- GIỎ HÀNG ----
const cartSubtotal = () => cart.reduce((s, c) => s + foodById(c.id).price * c.qty, 0);

function cartChanged() {
  if (!cart.length) cartStore = 0;
  save("gonow_cart", cart); save("gonow_cartstore", cartStore);
  $("#badge").textContent = cart.reduce((s, c) => s + c.qty, 0);
  if (!$("#drawerWrap").hidden) renderDrawer();
}

function addCart(id, sid = 0) {
  const f = foodById(id), cur = STORES.find(s => s.id === cartStore);
  if (!sid) {
    sid = cur && cart.length && cur.cats.includes(f.cat) ? cur.id
      : (STORES.filter(s => s.cats.includes(f.cat)).sort((x, y) => storeKm(x) - storeKm(y))[0] || {}).id || 0;
  }
  const put = () => {
    cartStore = sid;
    const item = cart.find(c => c.id === id);
    item ? item.qty++ : cart.push({ id, qty: 1 });
    cartChanged(); toast(`Đã thêm ${f.name} vào giỏ`);
  };
  if (cart.length && cartStore && sid !== cartStore) {
    askConfirm({ icon: "warn", title: "Đổi cửa hàng?", text: `Giỏ đang có món của “${cur ? cur.name : "cửa hàng khác"}”. Mỗi đơn chỉ đặt từ một cửa hàng; thêm món này sẽ xóa giỏ hiện tại.`, yes: "Xóa giỏ & thêm", no: "Giữ giỏ" })
      .then(ok => { if (ok) { cart = []; put(); } });
    return;
  }
  put();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(c => c.id !== id);
  cartChanged();
}

function calc(subtotal, ship) {
  if (voucher && voucher.min && subtotal < voucher.min) { voucher = null; voucherMsg = { text: "Đơn không còn đủ điều kiện, đã gỡ mã.", ok: false }; }
  let discount = 0;
  if (voucher) {
    if (voucher.pct) discount = Math.round(subtotal * voucher.pct / 100);
    if (voucher.freeship) ship = 0;
  }
  return { subtotal, discount, ship, total: subtotal - discount + ship };
}

// ---- ĐẶT XE ----
const useGoogle = typeof GOOGLE_MAPS_KEY !== "undefined" && !!GOOGLE_MAPS_KEY;
let rideMode = "map";
const gm = { st: "idle", seq: 0, acSeq: { from: 0, to: 0 }, mk: {}, sug: { from: [], to: [] }, active: "from", token: null, line: null, lib: {}, map: null };
const VN_BOUNDS = { west: 106.3, east: 107.1, south: 10.3, north: 11.2 };
const ll = v => ({ lat: typeof v.lat === "function" ? v.lat() : v.lat, lng: typeof v.lng === "function" ? v.lng() : v.lng });

function distanceKm() {
  if (rideMode === "map") return trip.fromLoc && trip.toLoc && !trip.busy ? trip.km : 0;
  if (!trip.from || !trip.to || trip.from === trip.to) return 0;
  const [x1, y1] = DISTRICTS[trip.from], [x2, y2] = DISTRICTS[trip.to];
  return Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.3 * 10) / 10);
}
const fareOf = (v, km) => Math.round((v.base + km * v.perKm) / 1000) * 1000;
const kmUnit = () => (rideMode === "map" ? (trip.exact ? "" : " (ước tính)") : " (mô phỏng)");

function setRideMode(m) {
  rideMode = m;
  $("#rideMapUI").hidden = m !== "map"; $("#mapCol").hidden = m !== "map"; $("#rideLegacy").hidden = m !== "legacy";
  $("#ride").classList.toggle("withMap", m === "map");
  renderRide();
}

function renderRide() {
  const map = rideMode === "map";
  if (map) { trip.from = trip.fromLoc ? trip.fromLoc.address : ""; trip.to = trip.toLoc ? trip.toLoc.address : ""; }
  else { trip.from = $("#from").value; trip.to = $("#to").value; }
  const km = distanceKm(), ok = km > 0;
  const hint = trip.busy ? "Đang tính quãng đường…" : map ? "Nhập điểm đón và điểm đến để xem giá" : "Chọn 2 điểm khác nhau để xem giá";
  $("#vehicles").innerHTML = Object.entries(VEHICLES).map(([key, v]) => `
    <div class="veh ${trip.vehicle === key ? "sel" : ""}" data-act="veh" data-id="${key}">
      ${pic(`images/vehicle/${key}.png`, "thumb")}
      <div><b>${v.name}</b><small>${v.desc} • mở cửa ${money(v.base)} + ${money(v.perKm)}/km</small>
        <small>${ok ? `~${km} km${kmUnit()} • khoảng ${Math.round(km / v.speed * 60) + 3} phút` : hint}</small></div>
      <b>${ok ? "~" + money(fareOf(v, km)) : "—"}</b></div>`).join("");
  $("#bookBtn").disabled = !ok;
  $("#bookBtn").textContent = ok ? "Đặt xe ngay" : trip.busy ? "Đang tính quãng đường…" : map ? "Nhập điểm đón và điểm đến" : "Chọn 2 khu vực khác nhau";
}

window.gm_authFailure = () => {
  if (rideMode !== "map") return;
  gm.st = "failed"; setRideMode("legacy"); toast("Google Maps báo lỗi key. Đang dùng chế độ chọn quận.");
};
const mapMsg = t => { const m = $("#mapMsg"); m.textContent = t || ""; m.hidden = !t; };

function loadMapsScript() {
  return new Promise((ok, bad) => {
    if (window.google && google.maps && google.maps.importLibrary) return ok();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&loading=async&language=vi&region=VN&v=weekly`;
    s.async = true; s.onload = ok; s.onerror = () => bad(new Error("Không tải được script Google Maps"));
    document.head.appendChild(s);
  });
}

async function initRideMap() {
  if (rideMode !== "map") return;
  if (!useGoogle) return initOsmMap();
  if (gm.st === "ready") return google.maps.event.trigger(gm.map, "resize");
  if (gm.st !== "idle") return;
  gm.st = "loading"; mapMsg("Đang tải bản đồ…");
  try {
    await loadMapsScript();
    const [maps, marker, places, routes, geo, core] = await Promise.all(["maps", "marker", "places", "routes", "geocoding", "core"].map(n => google.maps.importLibrary(n)));
    gm.lib = { maps, marker, places, routes, geo, core };
    gm.map = new maps.Map($("#map"), {
      center: { lat: 10.7769, lng: 106.7009 }, zoom: 13, mapId: (typeof GOOGLE_MAP_ID !== "undefined" && GOOGLE_MAP_ID) || "DEMO_MAP_ID",
      disableDefaultUI: true, zoomControl: true, fullscreenControl: true, gestureHandling: "greedy", clickableIcons: false
    });
    gm.map.addListener("click", e => pickOnMap(e.latLng));
    gm.st = "ready"; mapMsg("");
    if (!gm.autoLocated && !trip.fromLoc) { gm.autoLocated = true; locateMe(true); }
  } catch (err) {
    console.error("Google Maps lỗi:", err);
    gm.st = "failed"; setRideMode("legacy"); toast("Chưa tải được Google Maps. Đang dùng chế độ chọn quận.");
  }
}

function locateMe(auto) {
  if (gm.st !== "ready") return auto ? 0 : toast("Bản đồ chưa sẵn sàng.");
  if (!navigator.geolocation) return auto ? 0 : toast("Trình duyệt không hỗ trợ định vị.");
  if (auto) mapMsg("Đang xác định vị trí của bạn… Hãy bấm “Cho phép” khi trình duyệt hỏi."); else toast("Đang lấy vị trí của bạn…");
  navigator.geolocation.getCurrentPosition(async pos => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const addr = await reverseGeocode(p);
    mapMsg(""); setPoint("from", { ...p, address: addr });
  }, err => {
    mapMsg("");
    toast(err.code === 1 ? "Bạn đã chặn quyền vị trí. Hãy bật lại trong cài đặt trình duyệt, hoặc tự nhập điểm đón." : "Không lấy được vị trí. Hãy bật GPS/định vị hoặc tự nhập điểm đón.");
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

async function reverseGeocode(p) {
  if (!useGoogle) return osmReverse(p);
  try {
    const { results } = await new gm.lib.geo.Geocoder().geocode({ location: p });
    if (results && results[0]) return results[0].formatted_address;
  } catch (err) { console.warn("Geocoding lỗi:", err); }
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

function pinEl(w) { const d = document.createElement("div"); d.className = "pin " + w; d.textContent = w === "from" ? "A" : "B"; return d; }
function updateMarkers() {
  if (!useGoogle) return osmMarkers();
  ["from", "to"].forEach(w => {
    const p = trip[w + "Loc"]; let m = gm.mk[w];
    if (!p) { if (m) { m.map = null; gm.mk[w] = null; } return; }
    if (!m) {
      m = new gm.lib.marker.AdvancedMarkerElement({ map: gm.map, position: p, content: pinEl(w), gmpDraggable: true, title: w === "from" ? "Điểm đón" : "Điểm đến" });
      m.addListener("dragend", async () => { const q = ll(m.position); setPoint(w, { ...q, address: await reverseGeocode(q) }); });
      gm.mk[w] = m;
    } else m.position = p;
  });
}

function focusMap(pt) {
  if (useGoogle) { gm.map.panTo(pt); gm.map.setZoom(16); } else gm.map.setView([pt.lat, pt.lng], 16);
}
function loadLeaflet() {
  return new Promise((ok, bad) => {
    if (window.L && L.map) return ok();
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = ok; sc.onerror = () => bad(new Error("Không tải được thư viện bản đồ Leaflet")); document.head.appendChild(sc);
  });
}
async function initOsmMap() {
  if (gm.st === "ready") return gm.map.invalidateSize();
  if (gm.st !== "idle") return;
  gm.st = "loading"; mapMsg("Đang tải bản đồ…");
  try {
    await loadLeaflet();
    gm.map = L.map("map", { zoomControl: true }).setView([10.7769, 106.7009], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(gm.map);
    gm.map.on("click", e => pickOnMap(e.latlng));
    gm.st = "ready"; mapMsg("");
    setTimeout(() => gm.map.invalidateSize(), 60);
    if (!gm.autoLocated && !trip.fromLoc) { gm.autoLocated = true; locateMe(true); }
  } catch (err) {
    console.error("Bản đồ lỗi:", err);
    gm.st = "failed"; setRideMode("legacy"); toast("Chưa tải được bản đồ (kiểm tra mạng). Đang dùng chế độ chọn quận.");
  }
}
function osmMarkers() {
  ["from", "to"].forEach(w => {
    const q = trip[w + "Loc"]; let m = gm.mk[w];
    if (!q) { if (m) { m.remove(); gm.mk[w] = null; } return; }
    if (!m) {
      m = L.marker([q.lat, q.lng], {
        draggable: true, title: w === "from" ? "Điểm đón" : "Điểm đến",
        icon: L.divIcon({ className: "osmPin", html: `<div class="pin ${w}">${w === "from" ? "A" : "B"}</div>`, iconSize: [32, 42], iconAnchor: [16, 41] })
      }).addTo(gm.map);
      m.on("dragend", async () => { const c = m.getLatLng(), pt = { lat: c.lat, lng: c.lng }; setPoint(w, { ...pt, address: await reverseGeocode(pt) }); });
      gm.mk[w] = m;
    } else m.setLatLng([q.lat, q.lng]);
  });
}
const shortAddr = name => name.split(", ").filter(x => x !== "Việt Nam" && !/^\d{4,6}$/.test(x)).join(", ");
async function osmReverse(q) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${q.lat}&lon=${q.lng}&zoom=18&accept-language=vi`);
    const j = await r.json();
    if (j && j.display_name) return shortAddr(j.display_name);
  } catch (err) { console.warn("Nominatim reverse:", err); }
  return `${q.lat.toFixed(5)}, ${q.lng.toFixed(5)}`;
}
async function osmSearch(text) {
  try {
    const j = await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=6&lat=10.78&lon=106.70&lang=default`)).json();
    const out = (j.features || []).filter(f => !f.properties.countrycode || f.properties.countrycode === "VN").map(f => {
      const pr = f.properties, main = pr.name || [pr.housenumber, pr.street].filter(Boolean).join(" ");
      const sub = [pr.name && pr.street ? (pr.housenumber ? pr.housenumber + " " : "") + pr.street : "", pr.district, pr.city || pr.state].filter(Boolean).join(", ");
      return { main, sub, label: [main, sub].filter(Boolean).join(", "), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
    });
    if (out.length) return out;
  } catch (err) { console.warn("Photon:", err); }
  const j = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(text)}&countrycodes=vn&limit=6&accept-language=vi`)).json();
  return j.map(x => { const label = shortAddr(x.display_name), parts = label.split(", "); return { main: parts[0], sub: parts.slice(1).join(", "), label, lat: +x.lat, lng: +x.lon }; });
}
async function osmSuggest(which) {
  const inp = $(which === "from" ? "#pFrom" : "#pTo"), list = $(which === "from" ? "#acFrom" : "#acTo"), text = inp.value.trim();
  if (gm.st !== "ready" || text.length < 3) { list.hidden = true; return; }
  const mine = ++gm.acSeq[which];
  try {
    const res = await osmSearch(text);
    if (mine !== gm.acSeq[which]) return;
    gm.sug[which] = res;
    list.innerHTML = res.length
      ? res.map((r, i) => `<li><button type="button" class="acItem" data-act="pickSug" data-id="${which}:${i}"><b>${esc(r.main || r.label)}</b><small>${esc(r.sub)}</small></button></li>`).join("")
      : '<li class="acEmpty">Không tìm thấy địa điểm phù hợp. Hãy thử gõ thêm tên đường/quận hoặc chạm vào bản đồ.</li>';
  } catch (err) {
    console.warn("Tìm địa chỉ lỗi:", err);
    list.innerHTML = '<li class="acEmpty">Không tìm được địa chỉ lúc này. Bạn có thể chạm trực tiếp lên bản đồ để chọn điểm.</li>';
  }
  list.hidden = false;
}
async function osrmRoute(a, b) {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
  const j = await r.json();
  if (j.code !== "Ok" || !j.routes || !j.routes[0]) throw new Error("OSRM: " + (j.code || r.status));
  return { km: j.routes[0].distance / 1000, path: j.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
}

function clearRoute() { if (gm.line) { if (useGoogle) gm.line.setMap(null); else gm.line.remove(); gm.line = null; } trip.km = 0; trip.busy = false; gm.seq++; }

function setPoint(which, pt) {
  if (gm.st !== "ready") return;
  trip[which + "Loc"] = pt;
  $(which === "from" ? "#pFrom" : "#pTo").value = pt.address;
  $(which === "from" ? "#acFrom" : "#acTo").hidden = true;
  updateMarkers();
  if (!(trip.fromLoc && trip.toLoc)) { clearRoute(); focusMap(pt); renderRide(); }
  else computeRoute();
}

async function pickOnMap(latLng) {
  if (gm.st !== "ready") return;
  const which = !trip.fromLoc ? "from" : !trip.toLoc ? "to" : gm.active, p = ll(latLng);
  setPoint(which, { ...p, address: await reverseGeocode(p) });
}

const haversineKm = (a, b) => {
  const R = 6371, rad = d => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function computeRoute() {
  const a = trip.fromLoc, b = trip.toLoc;
  clearRoute();
  if (!a || !b) return renderRide();
  if (haversineKm(a, b) < 0.05) { toast("Điểm đón và điểm đến đang trùng nhau."); return renderRide(); }
  const seq = gm.seq; trip.busy = true; renderRide();
  let km = 0, path = null, exact = false;
  const R = useGoogle ? gm.lib.routes : null;
  if (!useGoogle) {
    try { const r = await osrmRoute(a, b); km = r.km; path = r.path; exact = true; }
    catch (err) { console.warn("OSRM:", err); }
  } else try {
    if (R.Route && R.Route.computeRoutes) {
      const { routes } = await R.Route.computeRoutes({ origin: a, destination: b, travelMode: "DRIVE", fields: ["path", "distanceMeters"] });
      if (routes && routes[0]) { km = routes[0].distanceMeters / 1000; path = routes[0].path.map(ll); exact = true; }
    }
  } catch (err) { console.warn("Routes API:", err); }
  if (useGoogle && !exact) {
    try {
      const res = await new R.DirectionsService().route({ origin: a, destination: b, travelMode: "DRIVING" });
      km = res.routes[0].legs[0].distance.value / 1000; path = res.routes[0].overview_path.map(ll); exact = true;
    } catch (err) { console.warn("Directions API:", err); }
  }
  if (seq !== gm.seq) return;
  if (!exact) { km = haversineKm(a, b) * 1.3; path = [a, b]; toast("Chưa lấy được đường đi thật, đang ước tính quãng đường."); }
  trip.km = Math.max(1, Math.round(km * 10) / 10); trip.exact = exact; trip.busy = false;
  if (useGoogle) {
    gm.line = new gm.lib.maps.Polyline({ map: gm
