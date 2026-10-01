const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let supabaseClient = null;
let liveMode = false;
let currentUser = null;
let cards = [];
const state = { query: "", category: "all", editingId: null };

function configured() {
  return window.FG_CONFIG &&
    window.FG_CONFIG.SUPABASE_URL &&
    window.FG_CONFIG.SUPABASE_KEY &&
    !window.FG_CONFIG.SUPABASE_URL.includes("YOUR_") &&
    !window.FG_CONFIG.SUPABASE_KEY.includes("YOUR_");
}

function escapeHtml(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fallbackImage(card) {
  const initials = String(card.player || "CARD").split(" ").map(p => p[0]).join("").slice(0, 3).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 710 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12151c"/><stop offset="1" stop-color="#313a4b"/></linearGradient></defs><rect width="710" height="1000" fill="url(#g)"/><circle cx="560" cy="150" r="210" fill="#d7ff3f" opacity=".08"/><text x="55" y="110" fill="#d7ff3f" font-family="Arial" font-weight="700" font-size="28">FRENZYGOLDIES</text><text x="55" y="700" fill="#fff" font-family="Arial" font-weight="900" font-size="72">${escapeSvg(initials)}</text><text x="55" y="780" fill="#fff" font-family="Arial" font-weight="700" font-size="32">${escapeSvg(card.player)}</text><text x="55" y="825" fill="#a8afbc" font-family="Arial" font-size="23">${escapeSvg(card.set_name || "Card")}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function escapeSvg(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }

function normalizeCard(c) {
  return {
    ...c,
    set: c.set_name ?? c.set ?? "",
    image_front: c.image_front_url ?? c.image_url ?? c.image ?? "",
    image_back: c.image_back_url ?? "",
    image: c.image_front_url ?? c.image_url ?? c.image ?? "",
    grade: c.grade || "—",
    purchase_price: c.purchase_price ?? null,
    estimated_value: c.estimated_value ?? null,
    is_numbered: c.is_numbered ?? false,
numbering: c.numbering ?? "",
is_autograph: c.is_autograph ?? false,
is_relic: c.is_relic ?? false,
    acquired_date: c.acquired_date ?? null,
    price: c.estimated_value != null ? `${c.estimated_value} USD` : "Collection",
    acquired: c.acquired_date || "—"
  };
}

async function initSupabase() {
  if (!configured() || !window.supabase) return;
  supabaseClient = window.supabase.createClient(window.FG_CONFIG.SUPABASE_URL, window.FG_CONFIG.SUPABASE_KEY);
  liveMode = true;
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
  });
  await loadCards();
}

async function loadCards() {
  if (!liveMode) { cards = demoCards.map(normalizeCard); return; }
  const { data, error } = await supabaseClient.from("cards").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showToast("Kartlar yüklenemedi. Supabase ayarlarını kontrol et.", true);
    cards = demoCards.map(normalizeCard);
    return;
  }
  cards = (data || []).map(normalizeCard);
  renderAll();
  renderCollectionGrowth();
}

function cardTags(card) {
  let out = `<span class="tag">${escapeHtml(card.category)}</span>`;

  if (card.rookie)
    out += `<span class="tag accent">RC</span>`;

  if (card.grade && card.grade !== "—")
    out += `<span class="tag">${escapeHtml(card.grade)}</span>`;

  if (card.parallel && card.parallel !== "Base")
    out += `<span class="tag">${escapeHtml(card.parallel)}</span>`;

  if (card.is_numbered)
    out += `<span class="tag accent">NUMBERED${card.numbering ? ` · ${escapeHtml(card.numbering)}` : ""}</span>`;

  if (card.is_autograph)
    out += `<span class="tag accent">AUTOGRAPH</span>`;

  if (card.is_relic)
    out += `<span class="tag accent">RELIC</span>`;

  return out;
}

function matches(card) {
  const q = state.query.trim().toLowerCase();

  const categoryMatch =
    state.category === "all" ||
    card.category === state.category ||
    (state.category === "Rookie" && card.rookie) ||
    (state.category === "Graded" && card.grade && card.grade !== "—") ||
    (state.category === "Numbered" && (card.is_numbered || card.numbered)) ||
    (state.category === "Autograph" && card.is_autograph) ||
    (state.category === "Relic" && card.is_relic) ||
    (state.category === "For Sale" && card.for_sale);

  const text = [
    card.player,
    card.team,
    card.category,
    card.year,
    card.set,
    card.card_number,
    card.parallel,
    card.condition,
    card.grade,
    card.numbering,
    card.is_autograph ? "autograph" : "",
    card.is_relic ? "relic" : "",
    card.for_sale ? "for sale" : "",
    card.price,
    card.status
  ].join(" ").toLowerCase();

  return categoryMatch && (!q || text.includes(q));
}

function cardMarkup(card) {
  return `<article class="card-item" data-id="${escapeHtml(card.id)}" tabindex="0"><div class="card-image">${card.for_sale ? `<span class="sale-badge">SATILIK</span>` : ""}<img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.player)} kartı" loading="lazy" data-fallback="${escapeHtml(fallbackImage(card))}"></div><div class="card-body"><div class="tag-row">${cardTags(card)}</div><h3>${escapeHtml(card.player)}</h3><p>${escapeHtml(card.set)} · ${escapeHtml(card.year)}</p></div></article>`;
  }

function bindCardClicks(scope = document) {
  scope.querySelectorAll(".card-item").forEach(el => {
    el.addEventListener("click", () => openModal(Number(el.dataset.id)));
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(Number(el.dataset.id)); } });
  });
  scope.querySelectorAll("img[data-fallback]").forEach(img => img.addEventListener("error", () => { if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback; }, { once: true }));
}

async function renderUserCollection(userId) {
  const { data: userCards, error } = await supabaseClient
    .from("cards")
    .select("*")
    .eq("owner_id", userId)
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

 const grid = $("#userGrid");

  grid.innerHTML = userCards
    .map(card => cardMarkup(normalizeCard(card)))
    .join("");

  $("#resultCount").textContent = `${userCards.length} kart`;

  $("#emptyState").classList.toggle("hidden", userCards.length > 0);

  bindCardClicks($("#cardGrid"));
}
function renderCollection() {
  const filtered = cards.filter(matches);
  $("#cardGrid").innerHTML = filtered.map(cardMarkup).join("");
  $("#resultCount").textContent = `${filtered.length} kart`;
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  bindCardClicks($("#cardGrid"));
}
async function renderUsers() {
  const { data: profiles, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url, created_at")
    .order("created_at", { ascending: false });

  if (profileError) {
    console.error(profileError);
    return;
  }

  const { data: allCards, error: cardError } = await supabaseClient
    .from("cards")
    .select("owner_id, category");

  if (cardError) {
    console.error(cardError);
    return;
  }

  const grid = $("#userGrid");

  if (!grid) return;

  grid.innerHTML = profiles.map(profile => {
    const userCards = allCards.filter(
      card => card.owner_id === profile.id
    );

    const footballCount = userCards.filter(
      card => card.category === "Football"
    ).length;

    const basketballCount = userCards.filter(
      card => card.category === "Basketball"
    ).length;

    return `
      <article class="user-card" data-user-id="${escapeHtml(profile.id)}">
        <div class="user-avatar">
          ${
            profile.avatar_url
              ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(profile.username || "Kullanıcı")}">`
              : `<span>👤</span>`
          }
        </div>

        <div class="user-card-body">
          <h3>${escapeHtml(profile.username || "Kullanıcı")}</h3>

          <p>VaultCardstr Koleksiyonu</p>

          <div class="user-stats">
            <div class="user-stat">
              <strong>${userCards.length}</strong>
              <span>Kart</span>
            </div>

            <div class="user-stat">
              <strong>${footballCount}</strong>
              <span>Football</span>
            </div>

            <div class="user-stat">
              <strong>${basketballCount}</strong>
              <span>Basketball</span>
            </div>
          </div>

          <button class="btn btn-primary view-user-collection">
            Koleksiyonu Gör →
          </button>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll(".view-user-collection").forEach(button => {
    button.addEventListener("click", e => {
      const userId = e.target.closest(".user-card").dataset.userId;
      location.hash = `user/${userId}`;
    });
  });
}
function renderFeatured() {
  const featured = cards.filter(c => c.featured).slice(0, 4);
  $("#featuredGrid").innerHTML = featured.map(cardMarkup).join("");
  bindCardClicks($("#featuredGrid"));
}
function renderStats() {
  $("#statTotal").textContent = cards.length;
  $("#statFootball").textContent = cards.filter(c => c.category === "Football").length;
  $("#statBasketball").textContent = cards.filter(c => c.category === "Basketball").length;
  $("#statGraded").textContent = cards.filter(c => c.grade !== "—").length;

  const totalEstimatedValue = cards.reduce((total, card) => {
    return total + (Number(card.estimated_value) || 0);
  }, 0);

  $("#statEstimatedValue").textContent =
    `$${totalEstimatedValue.toLocaleString("en-US")}`;
}
function renderHero() {
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 3);

  $("#heroShowcase").innerHTML = picks.map(c => `
    <div class="showcase-card" data-id="${escapeHtml(c.id)}" tabindex="0">
      <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.player)} kartı" data-fallback="${escapeHtml(fallbackImage(c))}">
    </div>
  `).join("");

  $("#heroShowcase").querySelectorAll(".showcase-card").forEach(card => {
    card.addEventListener("click", () => {
      openModal(Number(card.dataset.id));
    });

    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(Number(card.dataset.id));
      }
    });
  });

  $("#heroShowcase").querySelectorAll("img[data-fallback]").forEach(img => {
    img.addEventListener("error", () => {
      if (img.src !== img.dataset.fallback) {
        img.src = img.dataset.fallback;
      }
    }, { once: true });
  });
}
function renderAll() {
  renderStats();
  renderHero();

  const h = location.hash.replace("#", "");

  if (h === "collection") {
  renderCollection();
} else if (h.startsWith("user/")) {
  const userId = h.split("/")[1];
  renderUserCollection(userId);
} else {
  renderUsers();
}

  renderAdminList();
  updateAuthUI();
}

function openModal(id) {
  const c = cards.find(x => Number(x.id) === Number(id));
  if (!c) return;

  const frontImage = $("#modalImage");
  const backImage = $("#modalBackImage");
  const nextButton = $("#modalImageNext");

  frontImage.src = c.image_front || c.image;
  frontImage.alt = `${c.player} kartı`;
  frontImage.classList.remove("hidden");

  frontImage.onerror = () => {
    frontImage.src = fallbackImage(c);
  };

  if (c.image_back) {
    backImage.src = c.image_back;
    backImage.alt = `${c.player} kartı arka yüzü`;
    backImage.classList.add("hidden");
    nextButton.classList.remove("hidden");
    nextButton.textContent = "→";
  } else {
    backImage.removeAttribute("src");
    backImage.classList.add("hidden");
    nextButton.classList.add("hidden");
  }

  $("#modalTags").innerHTML = cardTags(c);
  $("#modalCategory").textContent = `${c.category} · ${c.year}`;
  $("#modalTitle").textContent = c.player;
  $("#modalSubtitle").textContent = c.team || "";

  const details = [
    ["Set", c.set],
    ["Card No.", c.card_number],
    ["Parallel", c.parallel],
    ["Condition", c.condition],
    ["Grade", c.grade],
    ["Acquired", c.acquired],
    ["Purchase price", c.purchase_price != null ? `${c.purchase_price} USD` : "—"],
    ["Estimated value", c.estimated_value != null ? `${c.estimated_value} USD` : "—"]
  ];

  $("#modalDetails").innerHTML = details
    .map(([a,b]) => `<div class="detail"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`)
    .join("");

  $("#modalNote").textContent = c.note || "";
  let dolapButton = $("#dolapButton");

if (!dolapButton) {
  dolapButton = document.createElement("a");
  dolapButton.id = "dolapButton";
  dolapButton.className = "btn btn-primary";
  dolapButton.textContent = "Dolap İlanına Git";
  dolapButton.target = "_blank";
  dolapButton.rel = "noopener noreferrer";
  $("#modalNote").insertAdjacentElement("afterend", dolapButton);
}

if (c.for_sale && c.dolap_url) {
  dolapButton.href = c.dolap_url;
  dolapButton.classList.remove("hidden");
} else {
  dolapButton.classList.add("hidden");
}
  $("#cardModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal() { $("#cardModal").classList.add("hidden"); document.body.style.overflow = ""; }
let showingBackImage = false;

$("#modalImageNext").addEventListener("click", () => {
  const frontImage = $("#modalImage");
  const backImage = $("#modalBackImage");
  const nextButton = $("#modalImageNext");

  if (backImage.classList.contains("hidden")) {
    frontImage.classList.add("hidden");
    backImage.classList.remove("hidden");
    nextButton.textContent = "←";
    nextButton.setAttribute("aria-label", "Kartın ön yüzünü göster");
    showingBackImage = true;
  } else {
    backImage.classList.add("hidden");
    frontImage.classList.remove("hidden");
    nextButton.textContent = "→";
    nextButton.setAttribute("aria-label", "Kartın arka yüzünü göster");
    showingBackImage = false;
  }
});
function updateAuthUI() {
  const adminLink = $("#adminLink");
  const loginBtn = $("#loginBtn");

  if (!liveMode) {
    adminLink.classList.add("hidden");
    loginBtn.classList.remove("hidden");
    loginBtn.textContent = "Giriş Yap";
    return;
  }

  if (currentUser) {
    loginBtn.classList.remove("hidden");
    loginBtn.textContent = "Hesabım";

    const isAdmin =
      currentUser.app_metadata?.role === "admin";

    adminLink.classList.toggle("hidden", !isAdmin);

    if (isAdmin) {
      $("#adminEmail").textContent =
        currentUser.email || "Admin";
    }
  } else {
    loginBtn.classList.remove("hidden");
    loginBtn.textContent = "Giriş Yap";
    adminLink.classList.add("hidden");
  }
}

function showToast(message, error = false) {
  const t = $("#toast"); t.textContent = message; t.className = `toast ${error ? "error" : ""}`; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 3500);
}

function openLogin() {
  if (!liveMode) { location.hash = "setup"; $("#setupModal").classList.remove("hidden"); return; }
  if (currentUser) {
  $("#accountEmail").textContent = currentUser.email || "Hesabım";
  $("#accountMenu").classList.toggle("hidden");
  return;
}
  $("#loginModal").classList.remove("hidden");
}
function closeLogin() { $("#loginModal").classList.add("hidden"); }
function openSignup() {
  $("#loginModal").classList.add("hidden");
  $("#signupModal").classList.remove("hidden");
}

function closeSignup() {
  $("#signupModal").classList.add("hidden");
}
function openProfileSettings() {
  if (!currentUser) return;

  $("#profileUsername").value = "";
  $("#profileSettingsModal").classList.remove("hidden");

  supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", currentUser.id)
    .single()
    .then(({ data, error }) => {
      if (error) {
        console.error(error);
        return;
      }

      $("#profileUsername").value = data?.username || "";
    });
}

function closeProfileSettings() {
  $("#profileSettingsModal").classList.add("hidden");
}
async function uploadAvatar(file) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("Lütfen bir görsel seç.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Profil fotoğrafı 5 MB'dan küçük olmalı.");
  }

  const ext = (file.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabaseClient
    .storage
    .from("avatars")
    .getPublicUrl(path);

  return data.publicUrl;
}
async function saveProfileSettings(e) {
  e.preventDefault();

  if (!currentUser) return;

  const username = $("#profileUsername").value.trim();
const avatarFile = $("#profilePhotoInput").files[0];
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    showToast(
      "Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam veya _ içerebilir.",
      true
    );
    return;
  }
let avatarUrl = "";

if (avatarFile) {
  try {
    avatarUrl = await uploadAvatar(avatarFile);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Profil fotoğrafı yüklenemedi.", true);
    return;
  }
}
  const { error } = await supabaseClient
    .from("profiles")
    .update({
  username,
  ...(avatarUrl ? { avatar_url: avatarUrl } : {})
})
    .eq("id", currentUser.id);

  if (error) {
    if (error.code === "23505") {
      showToast("Bu kullanıcı adı zaten kullanılıyor.", true);
    } else {
      console.error(error);
      showToast("Kullanıcı adı güncellenemedi.", true);
    }
    return;
  }

  $("#accountEmail").textContent = username;
  closeProfileSettings();
  showToast("Kullanıcı adın güncellendi.");
}

async function signup(e) {
  e.preventDefault();
const username = $("#signupUsername").value.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
  showToast("Kullanıcı adı 3-20 karakter olmalı ve sadece harf, rakam veya _ içerebilir.", true);
  return;
}
  const email = $("#signupEmail").value.trim();
  const password = $("#signupPassword").value;
  const passwordConfirm = $("#signupPasswordConfirm").value;

  if (password !== passwordConfirm) {
    showToast("Şifreler eşleşmiyor.", true);
    return;
  }

  if (password.length < 6) {
    showToast("Şifre en az 6 karakter olmalı.", true);
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
  email,
  password,
  options: {
    data: {
      username
    }
  }
});

  if (error) {
    showToast(error.message, true);
    return;
  }

  closeSignup();

  showToast(
    "Kayıt başarılı! E-posta doğrulaması gerekiyorsa gelen kutunu kontrol et."
  );
}

async function login(e) {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), password = $("#loginPassword").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { showToast(error.message, true); return; }
  closeLogin(); location.hash = "admin"; showToast("Giriş başarılı.");
}
async function logout() { await supabaseClient.auth.signOut(); location.hash = "home"; showToast("Çıkış yapıldı."); }

function openAdminForm(card = null) {
  state.editingId = card ? card.id : null;
  $("#adminFormTitle").textContent = card ? "Kartı Düzenle" : "Yeni Kart Ekle";
  const fields = ["player","team","category","year","set_name","card_number","parallel","condition","grade","purchase_price","estimated_value","acquired_date","note"];
  fields.forEach(f => { $("#"+f).value = card?.[f] ?? ""; });
  $("#category").value = card?.category || "Football";
  $("#rookie").checked = !!card?.rookie; $("#featured").checked = !!card?.featured; $("#imageFront").value = "";
$("#imageBack").value = "";
  $("#adminForm").classList.remove("hidden"); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
function closeAdminForm() { $("#adminForm").classList.add("hidden"); state.editingId = null; }

async function uploadCardImage(file) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("Lütfen bir görsel seç.");
  }

  if (file.size > 6 * 1024 * 1024) {
    throw new Error("Fotoğraf 6 MB'dan küçük olsun.");
  }

  const ext = (file.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("card-images")
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data } = supabaseClient
    .storage
    .from("card-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

async function saveCard(e) {
  e.preventDefault();

  if (!currentUser) return showToast("Önce admin girişi yap.", true);

  const frontFile = $("#imageFront").files[0];
  const backFile = $("#imageBack").files[0];

  const existingCard = state.editingId
    ? cards.find(c => Number(c.id) === Number(state.editingId))
    : null;

  let frontUrl = existingCard?.image_front || existingCard?.image || "";
  let backUrl = existingCard?.image_back || "";

  if (!state.editingId && !frontFile) {
    return showToast("Yeni kart için ön yüz fotoğrafı seçmelisin.", true);
  }

  try {
    if (frontFile) {
      frontUrl = await uploadCardImage(frontFile);
    }

    if (backFile) {
      backUrl = await uploadCardImage(backFile);
    }
  } catch (error) {
    return showToast(error.message, true);
  }

  const purchaseRaw = $("#purchase_price").value.trim();
  const estimatedRaw = $("#estimated_value").value.trim();

  const payload = {
    player: $("#player").value.trim(),
    team: $("#team").value.trim(),
    category: $("#category").value,
    year: $("#year").value.trim(),
    set_name: $("#set_name").value.trim(),
    card_number: $("#card_number").value.trim(),
    parallel: $("#parallel").value.trim() || "Base",
    condition: $("#condition").value.trim() || "Raw",
    grade: $("#grade").value.trim() || "—",
    purchase_price: purchaseRaw ? Number(purchaseRaw) : null,
    estimated_value: estimatedRaw ? Number(estimatedRaw) : null,
    acquired_date: $("#acquired_date").value || null,
    rookie: $("#rookie").checked,
    numbered: !!$("#parallel").value.trim().match(/\d+\/\d+|\d+\s*\/?\s*\d+/),
    is_numbered: $("#is_numbered").checked,
numbering: $("#numbering").value.trim(),
is_autograph: $("#is_autograph").checked,
is_relic: $("#is_relic").checked,
    graded: !!$("#grade").value.trim() && $("#grade").value.trim() !== "—",
    featured: $("#featured").checked,
    image_url: frontUrl,
    image_front_url: frontUrl,
    image_back_url: backUrl,
    note: $("#note").value.trim(),
    for_sale: $("#forSale").checked,
dolap_url: $("#dolapUrl").value.trim(),
    status: "Collection"
  };

  if (!payload.player || !payload.image_front_url) {
    return showToast("Oyuncu ve ön yüz fotoğrafı gerekli.", true);
  }

  if (
    Number.isNaN(payload.purchase_price) ||
    Number.isNaN(payload.estimated_value)
  ) {
    return showToast("Fiyat alanlarını sayı olarak gir.", true);
  }

  let result;

  if (state.editingId) {
    result = await supabaseClient
      .from("cards")
      .update(payload)
      .eq("id", state.editingId);
  } else {
    result = await supabaseClient
      .from("cards")
      .insert(payload);
  }

  if (result.error) {
    return showToast(result.error.message, true);
  }

  showToast(
    state.editingId
      ? "Kart güncellendi."
      : "Kart koleksiyona eklendi."
  );

  closeAdminForm();
  await loadCards();
  renderAll();
}

async function deleteCard(id) {
  if (!currentUser || !confirm("Bu kartı silmek istediğine emin misin?")) return;
  const { error } = await supabaseClient.from("cards").delete().eq("id", id);
  if (error) return showToast(error.message, true);
  showToast("Kart silindi."); await loadCards(); renderAll();
}

function renderAdminList() {
  const box = $("#adminList"); if (!box) return;
  if (!currentUser) { box.innerHTML = ""; return; }
  const isAdmin = currentUser.app_metadata?.role === "admin";
const myCards = isAdmin ? cards : cards.filter(c => c.owner_id === currentUser.id);
  box.innerHTML = myCards.map(c => `<div class="admin-row"><img src="${escapeHtml(c.image)}" alt=""><div><strong>${escapeHtml(c.player)}</strong><small>${escapeHtml(c.set)} · ${escapeHtml(c.year)}</small></div><div class="admin-actions"><button class="small-btn edit-btn" data-id="${c.id}">Düzenle</button><button class="small-btn danger delete-btn" data-id="${c.id}">Sil</button></div></div>`).join("");
  box.querySelectorAll(".edit-btn").forEach(b => b.onclick = () => openAdminForm(myCards.find(c => Number(c.id) === Number(b.dataset.id))));
  box.querySelectorAll(".delete-btn").forEach(b => b.onclick = () => deleteCard(Number(b.dataset.id)));
}

async function importDemo() {
  if (!currentUser) return showToast("Önce admin girişi yap.", true);
  if (cards.length && !confirm("Mevcut kartların üzerine demo kartlar eklemek istiyor musun?")) return;
  const base = new URL(".", location.href).href;
  const rows = demoCards.map(({id, set_name, image_url, ...c}) => ({...c, set_name, image_url: new URL(image_url, base).href}));
  const { error } = await supabaseClient.from("cards").insert(rows);
  if (error) return showToast(error.message, true);
  await loadCards(); renderAll(); showToast("Demo kartlar veritabanına aktarıldı.");
}

function showSetup() { $("#setupModal").classList.remove("hidden"); }
function closeSetup() { $("#setupModal").classList.add("hidden"); }

function init() {
  $("#year").textContent = new Date().getFullYear();
  cards = demoCards.map(normalizeCard);
  renderAll();
  initSupabase().then(() => renderAll());

  $("#searchInput").oninput = e => { state.query = e.target.value; renderCollection(); };
  $$("#categoryFilters .filter").forEach(b => b.onclick = () => { $$("#categoryFilters .filter").forEach(x => x.classList.remove("active")); b.classList.add("active"); state.category = b.dataset.category; renderCollection(); });
  $("#modalClose").onclick = closeModal; $$('[data-close-modal]').forEach(x => x.onclick = closeModal);
  $("#navToggle").onclick = () => $(".main-nav").classList.toggle("open");
  $$(".main-nav a").forEach(x => x.onclick = () => $(".main-nav").classList.remove("open"));
  $("#loginBtn").onclick = openLogin; $("#loginForm").onsubmit = login; $("#loginCloseBtn").onclick = closeLogin; $$('[data-login-close]').forEach(x => x.onclick = closeLogin);
  $("#signupBtn").onclick = openSignup;
$("#signupForm").onsubmit = signup;
  $("#profileSettingsBtn").onclick = openProfileSettings;
  $("#profilePhotoInput").addEventListener("change", e => {
  const file = e.target.files[0];

  if (!file) return;

  const preview = $("#profilePhotoPreview");
  const placeholder = $("#profilePhotoPlaceholder");

  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  placeholder.style.display = "none";
});
  $("#profileSettingsForm").onsubmit = saveProfileSettings;
$("#profileSettingsCloseBtn").onclick = closeProfileSettings;

$$('[data-profile-settings-close]').forEach(
  x => x.onclick = closeProfileSettings
);
$("#signupCloseBtn").onclick = closeSignup;

$$('[data-signup-close]').forEach(x => x.onclick = closeSignup);

$("#backToLoginBtn").onclick = () => {
  closeSignup();
  openLogin();
};
  $("#logoutBtn").onclick = logout; $("#addCardBtn").onclick = () => openAdminForm(); $("#cancelAdminForm").onclick = closeAdminForm; $("#cancelAdminForm2").onclick = closeAdminForm; $("#cardEditorForm").onsubmit = saveCard; $("#importDemoBtn").onclick = importDemo; $("#setupCloseBtn").onclick = closeSetup; $("#setupCloseAction").onclick = closeSetup; $$('[data-setup-close]').forEach(x => x.onclick = closeSetup);
 document.addEventListener("click", (e) => {
  if (e.target.closest("#accountLogoutBtn")) {
    $("#accountMenu").classList.add("hidden");
    logout();
    return;
  }

  if (e.target.closest("#myCollectionBtn")) {
    $("#accountMenu").classList.add("hidden");
    location.hash = "collection";
  }
});
  window.addEventListener("hashchange", handleHash); handleHash();
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeLogin(); closeSetup(); } });
}

function handleHash() {
  const h = location.hash.replace("#", "");
  
  renderAll();
  
  if (h === "admin" && currentUser && currentUser.app_metadata?.role === "admin") { $("#adminSection").classList.remove("hidden"); setTimeout(() => $("#adminSection").scrollIntoView({ behavior: "smooth" }), 50); }
  else if (h === "setup" && !liveMode) showSetup();
  else if (h === "home" || h === "collection" || h === "featured" || !h) { $("#adminSection").classList.add("hidden"); }
}

document.addEventListener("DOMContentLoaded", init);

document.addEventListener("DOMContentLoaded", () => {
  const vaultbotInput = document.getElementById("vaultbotInput");
  const vaultbotSend = document.getElementById("vaultbotSend");
  const vaultbotMessages = document.getElementById("vaultbotMessages");
  const vaultbotToggle = document.getElementById("vaultbotToggle");
  const vaultbotPanel = document.getElementById("vaultbotPanel");
  const vaultbotClose = document.getElementById("vaultbotClose");

  async function sendVaultBotMessage() {
    const message = vaultbotInput.value.trim();

    if (!message) return;

    vaultbotMessages.innerHTML += `
      <div class="vaultbot-message user">
        ${message}
      </div>
    `;

    vaultbotInput.value = "";
    vaultbotSend.disabled = true;
    vaultbotSend.textContent = "Thinking...";

    try {
      const { data, error } = await supabaseClient.functions.invoke("vaultbot", {
        body: { message }
      });

      if (error) throw error;

      vaultbotMessages.innerHTML += `
        <div class="vaultbot-message bot">
          ${data.reply}
        </div>
      `;
    } catch (error) {
      console.error("VaultBot error:", error);

      vaultbotMessages.innerHTML += `
        <div class="vaultbot-message bot">
          Sorry, VaultBot is temporarily unavailable.
        </div>
      `;
    }

    vaultbotSend.disabled = false;
    vaultbotSend.textContent = "Send";
  }

  vaultbotSend.addEventListener("click", sendVaultBotMessage);

  vaultbotInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendVaultBotMessage();
    }
  });

  vaultbotToggle.addEventListener("click", () => {
    vaultbotPanel.classList.toggle("open");
  });

  vaultbotClose.addEventListener("click", () => {
    vaultbotPanel.classList.remove("open");
  });
    const aiEstimateBtn = document.getElementById("aiEstimateBtn");

  if (aiEstimateBtn) {
    aiEstimateBtn.addEventListener("click", async () => {
      aiEstimateBtn.disabled = true;
      aiEstimateBtn.textContent = "🤖 Thinking...";

      try {
        const cardData = {
          player: document.getElementById("player")?.value.trim(),
          category: document.getElementById("category")?.value,
          year: document.getElementById("year")?.value.trim(),
          set: document.getElementById("set_name")?.value.trim(),
          card_number: document.getElementById("card_number")?.value.trim(),
          parallel: document.getElementById("parallel")?.value.trim(),
          condition: document.getElementById("condition")?.value.trim(),
          grade: document.getElementById("grade")?.value.trim()
        };

        const { data, error } = await supabaseClient.functions.invoke("vaultbot", {
          body: {
            mode: "estimate",
            card: cardData
          }
        });

        if (error) throw error;

        if (!data?.estimated_value) {
          throw new Error("No estimated value returned.");
        }

        document.getElementById("estimated_value").value = data.estimated_value;

      } catch (error) {
        console.error("AI estimate error:", error);
        alert("AI estimated value could not be calculated.");
      }

      aiEstimateBtn.disabled = false;
      aiEstimateBtn.textContent = "🤖 AI Value";
    });
  }
});
function renderCollectionGrowth() {
  const chart = document.getElementById("growthChart");
  const total = document.getElementById("growthTotal");

  if (!chart || !total || !Array.isArray(cards)) return;

  total.textContent = cards.length;

  const datedCards = cards
    .filter(card => card.acquired_at)
    .map(card => ({
      date: new Date(card.acquired_at),
      id: card.id
    }))
    .filter(card => !isNaN(card.date.getTime()))
    .sort((a, b) => a.date - b.date);

  if (!datedCards.length) {
    chart.innerHTML = "";
    return;
  }

  const dailyCounts = {};

  datedCards.forEach(card => {
    const key = card.date.toISOString().slice(0, 10);
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  });

  let cumulative = 0;

  const points = Object.entries(dailyCounts).map(([date, count]) => {
    cumulative += count;

    return {
      date,
      count: cumulative
    };
  });

  const width = 900;
  const height = 320;
  const padding = 35;

  const maxValue = Math.max(...points.map(p => p.count), 1);

  const x = index => {
    if (points.length === 1) return width / 2;
    return padding + index * ((width - padding * 2) / (points.length - 1));
  };

  const y = value =>
    height - padding -
    (value / maxValue) * (height - padding * 2);

  const linePoints = points
    .map((point, index) => `${x(index)},${y(point.count)}`)
    .join(" ");

  const circles = points
    .map((point, index) => `
      <circle
        cx="${x(index)}"
        cy="${y(point.count)}"
        r="5"
        fill="#ff9d2e"
      />
    `)
    .join("");

  const labels = points
    .map((point, index) => {
      const date = new Date(point.date);

      return `
        <text
          x="${x(index)}"
          y="${height - 8}"
          text-anchor="middle"
          fill="rgba(255,255,255,.55)"
          font-size="11"
        >
          ${date.getDate()}/${date.getMonth() + 1}
        </text>
      `;
    })
    .join("");

  chart.innerHTML = `
    <line
      x1="${padding}"
      y1="${height - padding}"
      x2="${width - padding}"
      y2="${height - padding}"
      stroke="rgba(255,255,255,.12)"
    />

    <polyline
      points="${linePoints}"
      fill="none"
      stroke="#ff9d2e"
      stroke-width="4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    ${circles}
    ${labels}
  `;
}


