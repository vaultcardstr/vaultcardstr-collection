const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  query: "",
  category: "all"
};

const fallbackImage = (card) => {
  const initials = card.player.split(" ").map((part) => part[0]).join("").slice(0, 3).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 710 1000">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#161a21"/>
          <stop offset="1" stop-color="#2f3745"/>
        </linearGradient>
      </defs>
      <rect width="710" height="1000" fill="url(#g)"/>
      <circle cx="560" cy="150" r="210" fill="#d7ff3f" opacity=".08"/>
      <text x="55" y="110" fill="#d7ff3f" font-family="Arial" font-weight="700" font-size="28">FRENZYGOLDIES</text>
      <text x="55" y="700" fill="#fff" font-family="Arial" font-weight="900" font-size="72">${escapeSvg(initials)}</text>
      <text x="55" y="780" fill="#fff" font-family="Arial" font-weight="700" font-size="32">${escapeSvg(card.player)}</text>
      <text x="55" y="825" fill="#a8afbc" font-family="Arial" font-size="23">${escapeSvg(card.set)}</text>
      <text x="55" y="930" fill="#a8afbc" font-family="Arial" font-size="18">IMAGE PLACEHOLDER</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

function escapeSvg(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cardTags(card) {
  const tags = [];
  if (card.rookie) tags.push('<span class="tag accent">Rookie</span>');
  if (card.grade && card.grade !== "—") tags.push(`<span class="tag">${escapeHtml(card.grade)}</span>`);
  if (card.parallel && card.parallel !== "Base") tags.push(`<span class="tag">${escapeHtml(card.parallel)}</span>`);
  return tags.join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matches(card) {
  const q = state.query.trim().toLowerCase();
  const categoryMatch =
    state.category === "all" ||
    card.category === state.category ||
    (state.category === "Rookie" && card.rookie) ||
    (state.category === "Graded" && card.grade && card.grade !== "—");

  const queryMatch = !q || [
    card.player, card.team, card.category, card.year,
    card.set, card.cardNumber, card.parallel, card.condition,
    card.grade, card.price
  ].join(" ").toLowerCase().includes(q);

  return categoryMatch && queryMatch;
}

function cardMarkup(card) {
  return `
    <article class="card-item" data-id="${card.id}" tabindex="0" aria-label="${escapeHtml(card.player)} kart detayları">
      <div class="card-image">
        <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.player)} kartı" loading="lazy" data-fallback="${escapeHtml(fallbackImage(card))}" />
      </div>
      <div class="card-body">
        <div class="tag-row">
          <span class="tag">${escapeHtml(card.category)}</span>
          ${card.rookie ? '<span class="tag accent">RC</span>' : ''}
        </div>
        <h3>${escapeHtml(card.player)}</h3>
        <p>${escapeHtml(card.set)} · ${escapeHtml(card.year)}</p>
      </div>
    </article>`;
}

function renderCollection() {
  const filtered = cards.filter(matches);
  const grid = $("#cardGrid");
  const empty = $("#emptyState");

  grid.innerHTML = filtered.map(cardMarkup).join("");
  $("#resultCount").textContent = `${filtered.length} kart`;
  empty.classList.toggle("hidden", filtered.length > 0);

  $$(".card-item").forEach((item) => {
    item.addEventListener("click", () => openModal(Number(item.dataset.id)));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(Number(item.dataset.id));
      }
    });
  });

  $$('img[data-fallback]').forEach((img) => {
    img.addEventListener("error", () => {
      if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true });
  });
}

function renderFeatured() {
  const featured = cards.filter((card) => card.featured).slice(0, 4);
  $("#featuredGrid").innerHTML = featured.map(cardMarkup).join("");
  $$("#featuredGrid .card-item").forEach((item) => {
    item.addEventListener("click", () => openModal(Number(item.dataset.id)));
  });
  $$('img[data-fallback]').forEach((img) => {
    img.addEventListener("error", () => {
      if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true });
  });
}

function renderStats() {
  $("#statTotal").textContent = cards.length;
  $("#statFootball").textContent = cards.filter((card) => card.category === "Football").length;
  $("#statBasketball").textContent = cards.filter((card) => card.category === "Basketball").length;
  $("#statGraded").textContent = cards.filter((card) => card.grade && card.grade !== "—").length;
}

function renderHero() {
  const picks = cards.filter((card) => card.featured).slice(0, 3);
  const html = picks.map((card) => `
    <div class="showcase-card">
      <img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.player)}" data-fallback="${escapeHtml(fallbackImage(card))}" />
    </div>
  `).join("");
  $("#heroShowcase").innerHTML = html;
  $$('img[data-fallback]').forEach((img) => {
    img.addEventListener("error", () => {
      if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
    }, { once: true });
  });
}

function openModal(id) {
  const card = cards.find((item) => item.id === id);
  if (!card) return;
  $("#modalImage").src = card.image;
  $("#modalImage").alt = `${card.player} kartı`;
  $("#modalImage").onerror = () => { $("#modalImage").src = fallbackImage(card); };
  $("#modalTags").innerHTML = cardTags(card) + `<span class="tag">${escapeHtml(card.category)}</span>`;
  $("#modalCategory").textContent = `${card.category} · ${card.year}`;
  $("#modalTitle").textContent = card.player;
  $("#modalSubtitle").textContent = card.team || "";

  const details = [
    ["Set", card.set],
    ["Card No.", card.cardNumber],
    ["Parallel", card.parallel],
    ["Condition", card.condition],
    ["Grade", card.grade],
    ["Acquired", card.acquired],
    ["Purchase / Note", card.price]
  ];

  $("#modalDetails").innerHTML = details.map(([label, value]) => `
    <div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");
  $("#modalNote").textContent = card.note || "";
  $("#cardModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#cardModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function init() {
  $("#year").textContent = new Date().getFullYear();
  renderStats();
  renderHero();
  renderCollection();
  renderFeatured();

  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderCollection();
  });

  $$("#categoryFilters .filter").forEach((button) => {
    button.addEventListener("click", () => {
      $$("#categoryFilters .filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.category = button.dataset.category;
      renderCollection();
    });
  });

  $("#modalClose").addEventListener("click", closeModal);
  $$('[data-close-modal]').forEach((item) => item.addEventListener("click", closeModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  $("#navToggle").addEventListener("click", () => {
    $(".main-nav").classList.toggle("open");
  });
  $$(".main-nav a").forEach((link) => link.addEventListener("click", () => $(".main-nav").classList.remove("open")));
}

document.addEventListener("DOMContentLoaded", init);
