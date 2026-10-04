const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let supabaseClient = null;
let liveMode = false;
let currentUser = null;
let cards = [];

let collectorProfiles = [];
let collectorCards = [];

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
    for_trade: c.for_trade ?? false,
    acquired_date: c.acquired_date ?? null,
    price: c.estimated_value != null ? `${c.estimated_value} USD` : "Collection",
    acquired: c.acquired_date || "—"
  };
}

async function initSupabase() {
  if (!configured() || !window.supabase) return;
  supabaseClient = window.supabase.createClient(window.FG_CONFIG.SUPABASE_URL, window.FG_CONFIG.SUPABASE_KEY);
  liveMode = true;
  // Start the public card query immediately; session restoration can happen in parallel.
  // This avoids making the initial collection render wait on auth initialization.
  const cardsPromise = loadCards();
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  updateAuthUI();
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
  });
  await cardsPromise;
}

async function loadCards() {
  if (!liveMode) { cards = demoCards.map(normalizeCard); return; }
  const { data, error } = await supabaseClient.from("cards").select("id,player,team,category,year,set_name,card_number,parallel,condition,grade,numbering,is_numbered,is_autograph,is_relic,rookie,for_trade,for_sale,featured,estimated_value,purchase_price,acquired_date,dolap_url,note,status,owner_id,image_url,image_front_url,image_back_url").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showToast("Kartlar yüklenemedi. Supabase ayarlarını kontrol et.", true);
    cards = demoCards.map(normalizeCard);
    return;
  }
  cards = (data || []).map(normalizeCard);
  // Keep the first paint light on phones: render the visible hero immediately,
  // then build non-critical widgets when the browser is idle.
  renderHero();
  const defer = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 })
    : (fn) => setTimeout(fn, 120);
  defer(() => renderCollectionGrowth());
  defer(() => renderRandomCard());
  defer(() => renderTradeMatch());
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

  if (card.for_trade)
    out += `<span class="tag trade-tag">FOR TRADE</span>`;

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
    (state.category === "For Sale" && card.for_sale) ||
    (state.category === "For Trade" && card.for_trade);

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
    card.for_trade ? "for trade" : "",
    card.price,
    card.status
  ].join(" ").toLowerCase();

  return categoryMatch && (!q || text.includes(q));
}

function cardMarkup(card) {
  return `<article class="card-item" data-id="${escapeHtml(card.id)}" tabindex="0"><div class="card-image">${card.for_sale ? `<span class="sale-badge">SATILIK</span>` : ""}<img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.player)} kartı" loading="lazy" decoding="async" data-fallback="${escapeHtml(fallbackImage(card))}"></div><div class="card-body"><div class="tag-row">${cardTags(card)}</div><h3>${escapeHtml(card.player)}</h3><p>${escapeHtml(card.set)} · ${escapeHtml(card.year)}</p></div></article>`;
  }

function bindCardClicks(scope = document) {
  scope.querySelectorAll(".card-item").forEach(el => {
    el.addEventListener("click", () => openModal(Number(el.dataset.id)));
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(Number(el.dataset.id)); } });
  });
  scope.querySelectorAll("img[data-fallback]").forEach(img => img.addEventListener("error", () => { if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback; }, { once: true }));
}

async function renderUserCollection(userId) {
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, username, avatar_url, created_at")
    .eq("id", userId)
    .single();

  if (profileError) {
    console.error(profileError);
    return;
  }

  const { data: userCards, error: cardError } = await supabaseClient
    .from("cards")
    .select("*")
    .eq("owner_id", userId)
    .order("id", { ascending: false });

  if (cardError) {
    console.error(cardError);
    return;
  }

  const footballCount = userCards.filter(
    card => card.category === "Football"
  ).length;

  const basketballCount = userCards.filter(
    card => card.category === "Basketball"
  ).length;

  const profilePage = $("#profilePage");
  const profileContent = $("#profilePageContent");

  $("#userGrid").classList.add("hidden");
  $("#cardGrid").classList.add("hidden");
  $("#emptyState").classList.add("hidden");

  profilePage.classList.remove("hidden");

  profileContent.innerHTML = `
    <div class="collector-profile">

      <div class="collector-profile-header">

        <div class="collector-profile-avatar">
          ${
            profile.avatar_url
              ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(profile.username || "Kullanıcı")}">`
              : `<span>👤</span>`
          }
        </div>

        <div class="collector-profile-info">
          <div class="eyebrow">VAULTCARDSTR COLLECTOR</div>

          <h1>${escapeHtml(profile.username || "Kullanıcı")}</h1>

          <p>Koleksiyonunu keşfet</p>

          <div class="collector-profile-stats">

            <div class="collector-stat">
              <strong>${userCards.length}</strong>
              <span>Kart</span>
            </div>

            <div class="collector-stat">
              <strong>${footballCount}</strong>
              <span>Football</span>
            </div>

            <div class="collector-stat">
              <strong>${basketballCount}</strong>
              <span>Basketball</span>
            </div>

          </div>
        </div>

      </div>

      <div class="collector-section-heading">
        <div>
          <div class="eyebrow">COLLECTION</div>
          <h2>${escapeHtml(profile.username || "Kullanıcı")}'in Koleksiyonu</h2>
        </div>

        <span>${userCards.length} kart</span>
      </div>

      <div class="card-grid collector-card-grid">
        ${
          userCards.length
            ? userCards.map(card => cardMarkup(normalizeCard(card))).join("")
            : `
              <div class="empty-state">
                <div class="empty-icon">📦</div>
                <h3>Henüz kart yok</h3>
                <p>Bu koleksiyonda henüz kart bulunmuyor.</p>
              </div>
            `
        }
      </div>

    </div>
  `;

  bindCardClicks(profileContent.querySelector(".collector-card-grid"));
}
function renderCollection() {
  const filtered = cards.filter(matches);
  $("#cardGrid").innerHTML = filtered.map(cardMarkup).join("");
  $("#resultCount").textContent = `${filtered.length} kart`;
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  bindCardClicks($("#cardGrid"));
}
async function renderUsers(searchTerm = "") {

  if (!supabaseClient) return;

  const grid = $("#userGrid");

  if (!grid) return;

  // Koleksiyonerleri yalnızca gerektiğinde Supabase'den çek
  if (!collectorProfiles.length) {

    const { data: profiles, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .order("created_at", { ascending: false });

    if (profileError) {
      console.error(profileError);
      return;
    }

    collectorProfiles = profiles || [];
  }

  // Kart verilerini yalnızca gerektiğinde çek
  if (!collectorCards.length) {

    const { data: allCards, error: cardError } = await supabaseClient
      .from("cards")
      .select("owner_id, category");

    if (cardError) {
      console.error(cardError);
      return;
    }

    collectorCards = allCards || [];
  }

  // Toplam koleksiyoner sayısı
  $("#collectorCount").textContent = collectorProfiles.length;

  const query = searchTerm.trim().toLowerCase();

  // Arama
  const filteredProfiles = collectorProfiles.filter(profile => {

    const username = String(profile.username || "").toLowerCase();

    return !query || username.includes(query);
  });

  // Sonuç yoksa
  if (!filteredProfiles.length) {

    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">⌕</div>
        <h3>Koleksiyoner bulunamadı</h3>
        <p>Farklı bir kullanıcı adı deneyebilirsin.</p>
      </div>
    `;

    return;
  }

  grid.innerHTML = filteredProfiles.map(profile => {

    const userCards = collectorCards.filter(
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
              ? `
                <img
                  src="${escapeHtml(profile.avatar_url)}"
                  alt="${escapeHtml(profile.username || "Kullanıcı")}"
                >
              `
              : `<span>👤</span>`
          }

        </div>

        <div class="user-card-body">

          <h3>
            ${escapeHtml(profile.username || "Kullanıcı")}
          </h3>

          <p>VaultCardstr Collector</p>

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

          <button
            class="btn btn-primary view-user-collection"
            type="button"
          >
            Koleksiyonu Gör →
          </button>

        </div>

      </article>
    `;

  }).join("");

  // Koleksiyona git
  grid.querySelectorAll(".view-user-collection").forEach(button => {

    button.addEventListener("click", e => {

      const userId =
        e.currentTarget.closest(".user-card").dataset.userId;

      window.location.href =
        `profile.html?user=${encodeURIComponent(userId)}`;

    });

  });

}
function renderFeatured() {
  const featured = cards.filter(c => c.featured).slice(0, 4);
  $("#featuredGrid").innerHTML = featured.map(cardMarkup).join("");
  bindCardClicks($("#featuredGrid"));
}
async function renderStats() {
  if (liveMode && supabaseClient) {
    const [cardsCountRes, cardsValueRes, profilesRes] = await Promise.all([
      supabaseClient.from("cards").select("id", { count: "exact", head: true }),
      supabaseClient.from("cards").select("estimated_value"),
      supabaseClient.from("profiles").select("id", { count: "exact", head: true })
    ]);

    $("#statTotal").textContent = !cardsCountRes.error ? (cardsCountRes.count ?? 0) : cards.length;

    const valueRows = !cardsValueRes.error ? (cardsValueRes.data || []) : cards;
    const totalValue = valueRows.reduce((sum, card) => sum + (Number(card.estimated_value) || 0), 0);
    $("#statEstimatedValue").textContent = "$" + totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 });

    $("#statCollectors").textContent = !profilesRes.error
      ? (profilesRes.count ?? 0)
      : (collectorProfiles.length || 0);
  } else {
    $("#statTotal").textContent = cards.length;
    const totalValue = cards.reduce((sum, card) => sum + (Number(card.estimated_value) || 0), 0);
    $("#statEstimatedValue").textContent = "$" + totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
    $("#statCollectors").textContent = collectorProfiles.length || 0;
  }
}
function renderHero() {
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  const picks = shuffled.slice(0, 3);

  $("#heroShowcase").innerHTML = picks.map((c, i) => `
    <div class="showcase-card" data-id="${escapeHtml(c.id)}" tabindex="0">
      <img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.player)} kartı" loading="${i === 1 ? "eager" : "lazy"}" fetchpriority="${i === 1 ? "high" : "low"}" decoding="async" data-fallback="${escapeHtml(fallbackImage(c))}">
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

function renderRandomCard() {
  const slot = $("#randomCardSlot");
  if (!slot) return;

  if (!cards.length) {
    slot.innerHTML = '<div class="trade-match-message">Henüz kart bulunamadı.</div>';
    return;
  }

  const card = cards[Math.floor(Math.random() * cards.length)];
  slot.innerHTML = cardMarkup(card);
  bindCardClicks(slot);
}

async function renderTradeMatch() {
  const login = $("#tradeMatchLogin");
  const empty = $("#tradeMatchEmpty");
  const content = $("#tradeMatchContent");
  const select = $("#tradeCardSelect");
  const results = $("#tradeMatchResults");

  if (!login || !empty || !content || !select || !results) return;

  login.classList.add("hidden");
  empty.classList.add("hidden");
  content.classList.add("hidden");

  if (!currentUser) {
    login.classList.remove("hidden");
    return;
  }

  const myTradeCards = cards.filter(c => c.owner_id === currentUser.id && c.for_trade);

  if (!myTradeCards.length) {
    empty.classList.remove("hidden");
    return;
  }

  content.classList.remove("hidden");

  select.innerHTML = myTradeCards.map(c =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.player)} — ${escapeHtml(c.set || "Kart")}</option>`
  ).join("");

  const renderMatches = () => {
    const selected = myTradeCards.find(c => String(c.id) === String(select.value));
    if (!selected) {
      results.innerHTML = "";
      return;
    }

    const candidates = cards
      .filter(c => c.owner_id && c.owner_id !== currentUser.id && c.for_trade)
      .map(c => {
        let score = 0;
        if (String(c.player || "").trim().toLowerCase() === String(selected.player || "").trim().toLowerCase()) score += 5;
        if (String(c.team || "").trim().toLowerCase() && String(c.team || "").trim().toLowerCase() === String(selected.team || "").trim().toLowerCase()) score += 3;
        if (String(c.category || "").trim().toLowerCase() === String(selected.category || "").trim().toLowerCase()) score += 1;
        return { card: c, score };
      })
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, 6);

    if (!candidates.length) {
      results.innerHTML = '<div class="trade-match-message">Şu anda uygun bir potansiyel eşleşme bulunamadı.</div>';
      return;
    }

    results.innerHTML = candidates.map(({card, score}) => {
      const owner = collectorProfiles.find(p => p.id === card.owner_id);
      const image = card.image || fallbackImage(card);
      const matchText = score >= 5 ? "Aynı oyuncu" : score >= 3 ? "Aynı takım" : "Aynı kategori";
      return `
        <article class="trade-match-card card-item" data-id="${escapeHtml(card.id)}" tabindex="0">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(card.player)} kartı" loading="lazy">
          <strong>${escapeHtml(card.player)}</strong>
          <small>${escapeHtml(owner?.username || "Koleksiyoner")} · ${escapeHtml(card.set || "Kart")}</small>
          <span class="trade-match-score">${matchText}</span>
        </article>
      `;
    }).join("");

    bindCardClicks(results);
  };

  select.onchange = renderMatches;
  renderMatches();
}


let feedLikes = [];
let feedComments = [];

async function loadVaultFeedData() {
  const feed = $("#vaultFeedList");
  if (!feed) return;

  if (!liveMode || !supabaseClient) {
    renderVaultFeed();
    return;
  }

  if (!collectorProfiles.length) {
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("id, username, avatar_url, created_at")
      .order("created_at", { ascending: false });
    collectorProfiles = profiles || [];
  }

  const [likesRes, commentsRes] = await Promise.all([
    supabaseClient.from("card_likes").select("card_id,user_id"),
    supabaseClient.from("card_comments").select("id,card_id,user_id,body,created_at").order("created_at", { ascending: false })
  ]);

  if (likesRes.error) console.warn("Feed likes:", likesRes.error);
  if (commentsRes.error) console.warn("Feed comments:", commentsRes.error);

  feedLikes = likesRes.data || [];
  feedComments = commentsRes.data || [];

  renderVaultFeed();
}

function feedProfile(userId) {
  return collectorProfiles.find(p => p.id === userId);
}

function renderVaultFeed() {
  const feed = $("#vaultFeedList");
  if (!feed) return;

  const posts = cards.filter(c => c.owner_id || !liveMode).slice(0, 12);

  if (!posts.length) {
    feed.innerHTML = '<div class="vault-feed-empty">Henüz topluluk gönderisi yok. İlk kartını paylaşan sen ol! 🃏</div>';
    return;
  }

  feed.innerHTML = posts.map(card => {
    const profile = feedProfile(card.owner_id);
    const likes = feedLikes.filter(x => String(x.card_id) === String(card.id));
    const comments = feedComments.filter(x => String(x.card_id) === String(card.id)).slice(0, 4);
    const liked = currentUser && likes.some(x => x.user_id === currentUser.id);
    const image = card.image || fallbackImage(card);
    const username = profile?.username || "Koleksiyoner";
    const avatar = profile?.avatar_url
      ? `<img src="${escapeHtml(profile.avatar_url)}" alt="">`
      : escapeHtml(String(username).charAt(0).toUpperCase());

    return `
      <article class="vault-feed-post" data-feed-card="${escapeHtml(card.id)}">
        <div class="vault-feed-media" data-feed-open="${escapeHtml(card.id)}" role="button" tabindex="0">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(card.player)} kartı" loading="lazy" data-fallback="${escapeHtml(fallbackImage(card))}">
          <div class="vault-feed-info">
            <div class="vault-feed-user">
              <div class="vault-feed-avatar">${avatar}</div>
              <strong>@${escapeHtml(username)}</strong>
            </div>
            <h3>${escapeHtml(card.player)}</h3>
            <p>${escapeHtml(card.set || "Card")} · ${escapeHtml(card.year || "")} · ${escapeHtml(card.category || "")}</p>
          </div>
        </div>

        <aside class="vault-feed-actions">
          <button class="vault-feed-action ${liked ? "liked" : ""}" data-feed-like="${escapeHtml(card.id)}" aria-label="Beğen">
            ${liked ? "♥" : "♡"}
          </button>
          <span class="vault-feed-count">${likes.length}</span>
          <button class="vault-feed-action" data-feed-comments-toggle="${escapeHtml(card.id)}" aria-label="Yorumları göster">💬</button>
          <span class="vault-feed-count">${feedComments.filter(x => String(x.card_id) === String(card.id)).length}</span>
        </aside>

        ${posts.indexOf(card) < posts.length - 1 ? `<button class="vault-feed-next" data-feed-next="${escapeHtml(card.id)}" aria-label="Sonraki kart">↓</button>` : ""}

        <div class="vault-feed-comments hidden" data-feed-comments="${escapeHtml(card.id)}">
          <div class="vault-feed-comments-list">
            ${comments.length
              ? comments.map(comment => {
                  const cp = feedProfile(comment.user_id);
                  return `<div class="vault-feed-comment"><strong>@${escapeHtml(cp?.username || "Koleksiyoner")}</strong>${escapeHtml(comment.body)}</div>`;
                }).join("")
              : '<div class="vault-feed-comment">Henüz yorum yok. İlk yorumu sen bırak.</div>'}
          </div>
          <form class="vault-feed-comment-form" data-feed-comment-form="${escapeHtml(card.id)}">
            <input maxlength="500" placeholder="${currentUser ? "Bir yorum yaz..." : "Yorum yapmak için giriş yap"}" ${currentUser ? "" : "disabled"}>
            <button class="btn btn-primary" type="submit" ${currentUser ? "" : "disabled"}>Gönder</button>
          </form>
        </div>
      </article>
    `;
  }).join("");

  feed.querySelectorAll("[data-fallback]").forEach(img => {
    img.addEventListener("error", () => {
      if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true });
  });

  feed.querySelectorAll("[data-feed-open]").forEach(el => {
    const open = () => openModal(Number(el.dataset.feedOpen));
    el.addEventListener("click", open);
    el.addEventListener("dblclick", e => {
      e.preventDefault();
      toggleFeedLike(Number(el.dataset.feedOpen));
    });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });

  feed.querySelectorAll("[data-feed-like]").forEach(btn => {
    btn.addEventListener("click", () => toggleFeedLike(Number(btn.dataset.feedLike)));
  });

  feed.querySelectorAll("[data-feed-next]").forEach(btn => {
    btn.addEventListener("click", () => {
      const current = btn.closest(".vault-feed-post");
      const next = current?.nextElementSibling;
      if (next) {
        feed.scrollTo({ top: next.offsetTop - feed.offsetTop, behavior: "smooth" });
      }
    });
  });

  feed.querySelectorAll("[data-feed-comments-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const box = feed.querySelector(`[data-feed-comments="${btn.dataset.feedCommentsToggle}"]`);
      if (box) box.classList.toggle("hidden");
    });
  });

  feed.querySelectorAll("[data-feed-comment-form]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      submitFeedComment(Number(form.dataset.feedCommentForm), form);
    });
  });
}

async function toggleFeedLike(cardId) {
  if (!currentUser) {
    openLogin();
    return;
  }

  const existing = feedLikes.find(x => String(x.card_id) === String(cardId) && x.user_id === currentUser.id);

  if (existing) {
    const { error } = await supabaseClient.from("card_likes").delete().eq("card_id", cardId).eq("user_id", currentUser.id);
    if (error) return showToast("Beğeni kaldırılamadı.", true);
    feedLikes = feedLikes.filter(x => !(String(x.card_id) === String(cardId) && x.user_id === currentUser.id));
  } else {
    const { data, error } = await supabaseClient.from("card_likes").insert({ card_id: cardId, user_id: currentUser.id }).select("card_id,user_id").single();
    if (error) return showToast("Beğeni eklenemedi.", true);
    feedLikes.push(data);
  }

  renderVaultFeed();
}

async function submitFeedComment(cardId, form) {
  if (!currentUser) {
    openLogin();
    return;
  }

  const input = form.querySelector("input");
  const body = input.value.trim();
  if (!body) return;

  const { data, error } = await supabaseClient
    .from("card_comments")
    .insert({ card_id: cardId, user_id: currentUser.id, body })
    .select("id,card_id,user_id,body,created_at")
    .single();

  if (error) return showToast("Yorum gönderilemedi.", true);

  feedComments.unshift(data);
  input.value = "";
  renderVaultFeed();

  const box = document.querySelector(`[data-feed-comments="${cardId}"]`);
  if (box) box.classList.remove("hidden");
}

function renderAll() {
  renderStats();
  renderHero();
  renderRandomCard();
  renderTradeMatch();

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
  renderTradeMatch();
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

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Sadece JPG, PNG veya WEBP görseller yükleyebilirsin.");
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

  if (password.length < 8) {
    showToast("Şifre en az 8 karakter olmalı.", true);
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
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

  // Email confirmation is required before the new account can be used.
  // Supabase normally returns no session here when confirmation is enabled.
  if (!data?.session) {
    closeSignup();
    showToast("Kayıt başarılı! E-posta adresini doğrulamak için mail kutunu kontrol et.");
    return;
  }

  // Keep this fallback for projects where email confirmation is disabled.
  currentUser = data?.user || currentUser;
  closeSignup();
  updateAuthUI();
  showToast("Kayıt başarılı! Hesabın oluşturuldu.");
}

async function login(e) {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), password = $("#loginPassword").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    if (/email not confirmed/i.test(error.message || "")) {
      showToast("Önce e-posta adresini doğrulamalısın. Mail kutunu kontrol et.", true);
    } else {
      showToast(error.message, true);
    }
    return;
  }

  const signedInUser = data?.user;
  if (signedInUser && !signedInUser.email_confirmed_at) {
    await supabaseClient.auth.signOut();
    showToast("Önce e-posta adresini doğrulamalısın. Mail kutunu kontrol et.", true);
    return;
  }

  currentUser = signedInUser || currentUser;
  closeLogin();
  location.hash = "admin";
  showToast("Giriş başarılı.");
}
async function logout() { await supabaseClient.auth.signOut(); location.hash = "home"; showToast("Çıkış yapıldı."); }

function openAdminForm(card = null) {
  state.editingId = card ? card.id : null;
  $("#adminFormTitle").textContent = card ? "Kartı Düzenle" : "Yeni Kart Ekle";
  const fields = ["player","team","category","year","set_name","card_number","parallel","condition","grade","purchase_price","estimated_value","acquired_date","note"];
  fields.forEach(f => { $("#"+f).value = card?.[f] ?? ""; });
  $("#category").value = card?.category || "Football";
  $("#rookie").checked = !!card?.rookie;
  $("#featured").checked = !!card?.featured;
  if ($("#forTrade")) $("#forTrade").checked = !!card?.for_trade;
  $("#imageFront").value = "";
$("#imageBack").value = "";
  $("#adminForm").classList.remove("hidden"); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
function closeAdminForm() { $("#adminForm").classList.add("hidden"); state.editingId = null; }

async function uploadCardImage(file) {
  if (!file) return "";

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Sadece JPG, PNG veya WebP görsel yükleyebilirsin.");
  }

  if (file.size > 6 * 1024 * 1024) {
    throw new Error("Fotoğraf 6 MB'dan küçük olsun.");
  }

  const ext = (file.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!currentUser?.id) throw new Error("Kart görseli yüklemek için giriş yapmalısın.");

  const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;

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
    for_trade: $("#forTrade").checked,
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
  initSupabase();

  $("#searchInput").oninput = e => { state.query = e.target.value; renderCollection(); };
  const collectorSearch = $("#collectorSearch");

if (collectorSearch) {
  collectorSearch.oninput = e => {
    renderUsers(e.target.value);
  };
}
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

  if (!currentUser) return;

  window.location.href =
    `profile.html?user=${encodeURIComponent(currentUser.id)}`;
}
});
  window.addEventListener("hashchange", handleHash); handleHash();
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closeLogin(); closeSetup(); } });
}

function handleHash() {
  const h = location.hash.replace("#", "");
  
  renderAll();
  if (h.startsWith("user/")) {
  const userId = h.split("/")[1];

  $("#userGrid").classList.add("hidden");
  $("#cardGrid").classList.add("hidden");
  $("#emptyState").classList.add("hidden");
  $("#adminSection").classList.add("hidden");

  renderUserCollection(userId);

  return;
}
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

    const userMessageEl = document.createElement("div");
    userMessageEl.className = "vaultbot-message user";
    userMessageEl.textContent = message;
    vaultbotMessages.appendChild(userMessageEl);

    vaultbotInput.value = "";
    vaultbotSend.disabled = true;
    vaultbotSend.textContent = "Thinking...";

    try {
      const { data, error } = await supabaseClient.functions.invoke("vaultbot", {
        body: { message }
      });

      if (error) throw error;

      const botMessageEl = document.createElement("div");
      botMessageEl.className = "vaultbot-message bot";
      botMessageEl.textContent = String(data?.reply ?? "");
      vaultbotMessages.appendChild(botMessageEl);
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


/* =========================
   SECURE ACCOUNT DELETION
========================= */

document.addEventListener("DOMContentLoaded", () => {

  const deleteAccountBtn = document.getElementById("deleteAccountBtn");

  if (!deleteAccountBtn) return;

  deleteAccountBtn.addEventListener("click", () => {

    if (!currentUser) {
      showToast("Önce hesabına giriş yapmalısın.", true);
      return;
    }

    const deleteBox = document.createElement("div");

    deleteBox.style.cssText = `
      position:fixed;
      inset:0;
      z-index:999999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,0,0,.82);
      backdrop-filter:blur(12px);
    `;

    deleteBox.innerHTML = `
      <div style="
        width:min(520px,100%);
        max-height:90vh;
        overflow:auto;
        box-sizing:border-box;
        background:linear-gradient(145deg,#181a22,#101218);
        border:1px solid rgba(255,80,80,.22);
        border-radius:24px;
        padding:28px;
        box-shadow:0 30px 90px rgba(0,0,0,.7);
      ">

        <div style="
          width:52px;
          height:52px;
          border-radius:15px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,70,70,.10);
          border:1px solid rgba(255,80,80,.25);
          color:#ff7777;
          font-size:24px;
          margin-bottom:18px;
        ">
          ⚠
        </div>

        <div style="
          color:#ff7777;
          font-size:11px;
          font-weight:900;
          letter-spacing:.10em;
          text-transform:uppercase;
          margin-bottom:7px;
        ">
          ACCOUNT DELETION
        </div>

        <h2 style="
          margin:0 0 12px;
          color:#f4f5f7;
          font-size:24px;
        ">
          Hesabını silmek üzeresin
        </h2>

        <p style="
          margin:0 0 18px;
          color:#9ca3af;
          font-size:13px;
          line-height:1.7;
        ">
          Bu işlem hesabını, koleksiyonundaki kartları ve
          hesabına bağlı profil verilerini kalıcı olarak siler.
          <strong style="color:#ff7777;">
            Bu işlem geri alınamaz.
          </strong>
        </p>

        <div style="
          padding:14px;
          margin-bottom:18px;
          border-radius:12px;
          background:rgba(255,70,70,.055);
          border:1px solid rgba(255,80,80,.14);
          color:#c7cbd3;
          font-size:12px;
          line-height:1.6;
        ">
          Güvenlik nedeniyle devam etmek için şifreni tekrar
          doğrulaman ve aşağıdaki onay metnini yazman gerekiyor.
        </div>

        <label style="
          display:block;
          margin-bottom:14px;
          color:#aeb4bf;
          font-size:11px;
          font-weight:800;
          letter-spacing:.07em;
          text-transform:uppercase;
        ">
          Şifren

          <input
            id="deleteAccountPassword"
            type="password"
            autocomplete="current-password"
            placeholder="Hesap şifren"
            style="
              width:100%;
              box-sizing:border-box;
              height:46px;
              margin-top:7px;
              padding:0 13px;
              border-radius:12px;
              border:1px solid rgba(255,255,255,.10);
              background:#0f1116;
              color:#f4f5f7;
              outline:none;
              font-size:13px;
            "
          >
        </label>

        <label style="
          display:block;
          margin-bottom:20px;
          color:#aeb4bf;
          font-size:11px;
          font-weight:800;
          letter-spacing:.07em;
          text-transform:uppercase;
        ">
          Onay

          <input
            id="deleteAccountConfirmation"
            type="text"
            autocomplete="off"
            placeholder="HESABIMI SİL"
            style="
              width:100%;
              box-sizing:border-box;
              height:46px;
              margin-top:7px;
              padding:0 13px;
              border-radius:12px;
              border:1px solid rgba(255,255,255,.10);
              background:#0f1116;
              color:#f4f5f7;
              outline:none;
              font-size:13px;
              font-weight:800;
              letter-spacing:.04em;
            "
          >
        </label>

        <div style="
          display:flex;
          justify-content:flex-end;
          gap:10px;
        ">

          <button
            type="button"
            id="deleteAccountCancel"
            style="
              min-height:46px;
              padding:0 18px;
              border-radius:12px;
              border:1px solid rgba(255,255,255,.10);
              background:rgba(255,255,255,.05);
              color:#aeb4bf;
              font-size:12px;
              font-weight:900;
              cursor:pointer;
            "
          >
            Vazgeç
          </button>

          <button
            type="button"
            id="deleteAccountConfirm"
            style="
              min-height:46px;
              padding:0 18px;
              border-radius:12px;
              border:1px solid rgba(255,80,80,.30);
              background:rgba(255,70,70,.10);
              color:#ff7777;
              font-size:12px;
              font-weight:900;
              cursor:pointer;
            "
          >
            Hesabı Kalıcı Olarak Sil
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(deleteBox);

    const passwordInput =
      deleteBox.querySelector("#deleteAccountPassword");

    const confirmationInput =
      deleteBox.querySelector("#deleteAccountConfirmation");

    const cancelButton =
      deleteBox.querySelector("#deleteAccountCancel");

    const confirmButton =
      deleteBox.querySelector("#deleteAccountConfirm");

    cancelButton.addEventListener("click", () => {
      deleteBox.remove();
    });

    confirmButton.addEventListener("click", async () => {

      const password = passwordInput.value;
      const confirmation =
        confirmationInput.value.trim();

      if (!password) {
        alert("Şifreni girmelisin.");
        passwordInput.focus();
        return;
      }

      if (confirmation !== "HESABIMI SİL") {
        alert('Onay alanına tam olarak "HESABIMI SİL" yazmalısın.');
        confirmationInput.focus();
        return;
      }

      const finalConfirm = confirm(
        "Hesabın ve koleksiyonun kalıcı olarak silinecek. Devam etmek istediğine emin misin?"
      );

      if (!finalConfirm) {
        return;
      }

      confirmButton.disabled = true;
      cancelButton.disabled = true;
      confirmButton.textContent = "Doğrulanıyor...";

      try {

        /*
         * 1. Şifreyi tekrar doğrula
         */
        const { data: authData, error: authError } =
          await supabaseClient.auth.signInWithPassword({
            email: currentUser.email,
            password
          });

        if (authError) {
          throw new Error("Şifre yanlış. Hesap silme işlemi iptal edildi.");
        }

        /*
         * 2. Yeni doğrulanmış session'ı kontrol et
         */
        const session =
          authData.session;

        if (!session?.access_token) {
          throw new Error(
            "Güvenli oturum doğrulanamadı."
          );
        }

        confirmButton.textContent =
          "Hesap siliniyor...";

        /*
         * 3. Server-side account deletion
         */
        const { data, error } =
          await supabaseClient.functions.invoke(
            "delete-account",
            {
              headers: {
                Authorization:
                  `Bearer ${session.access_token}`
              }
            }
          );

        if (error) {
          console.error(error);
          throw new Error(
            "Hesap silme sunucusunda bir hata oluştu."
          );
        }

        if (!data?.success) {
          throw new Error(
            "Hesap silinemedi."
          );
        }

        /*
         * 4. Oturumu kapat
         */
        await supabaseClient.auth.signOut();

        deleteBox.remove();

        alert(
          "Hesabın ve koleksiyonun başarıyla silindi."
        );

        window.location.href = "index.html";

      } catch (error) {

        console.error(
          "Account deletion error:",
          error
        );

        confirmButton.disabled = false;
        cancelButton.disabled = false;
        confirmButton.textContent =
          "Hesabı Kalıcı Olarak Sil";

        alert(
          error.message ||
          "Hesap silinirken bir hata oluştu."
        );
      }

    });

  });

});