const PC_PLAYERS = [
  { name: "Dylan Harper", target: 18 },
  { name: "Luka Dončić", target: 18 }
  // Yeni PC eklemek için: { name: "Cooper Flagg", target: 18 },
];

let allCards = [];
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

function fallbackImage(player){
  const initials = player.split(" ").map(x=>x[0]).join("").slice(0,3).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 710 1000"><rect width="710" height="1000" fill="#12151c"/><circle cx="560" cy="150" r="210" fill="#d7ff3f" opacity=".08"/><text x="55" y="700" fill="#fff" font-family="Arial" font-weight="900" font-size="72">${esc(initials)}</text><text x="55" y="780" fill="#fff" font-family="Arial" font-weight="700" font-size="32">${esc(player)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalize(c){
  return {
    ...c,
    image: c.image_front_url || c.image_url || c.image || "",
    set: c.set_name || c.set || "",
    grade: c.grade || "—"
  };
}

async function loadCards(){
  if(
    !window.FG_CONFIG?.SUPABASE_URL ||
    !window.FG_CONFIG?.SUPABASE_KEY ||
    !window.supabase
  ){
    render();
    return;
  }

  const client = window.supabase.createClient(
    window.FG_CONFIG.SUPABASE_URL,
    window.FG_CONFIG.SUPABASE_KEY
  );

  const { data, error } = await client
    .from("cards")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    console.error(error);
    render();
    return;
  }

  allCards = (data || []).map(normalize);
  render();
}

function cardsFor(name){
  return allCards.filter(
    c =>
      String(c.player || "").trim().toLowerCase() ===
      name.trim().toLowerCase()
  );
}

function cardMarkup(c){
  return `
    <article class="card-item" data-id="${esc(c.id)}">
      <div class="card-image">
        ${
          c.for_sale
            ? '<span class="sale-badge">SATILIK</span>'
            : ""
        }
        <img
          src="${esc(c.image || fallbackImage(c.player))}"
          alt="${esc(c.player)} kartı"
        >
      </div>

      <div class="card-body">
        <div class="tag-row">
          ${
            c.rookie
              ? '<span class="tag accent">RC</span>'
              : ""
          }

          ${
            c.parallel && c.parallel !== "Base"
              ? `<span class="tag">${esc(c.parallel)}</span>`
              : ""
          }

          ${
            c.grade && c.grade !== "—"
              ? `<span class="tag">${esc(c.grade)}</span>`
              : ""
          }
        </div>

        <h3>${esc(c.player)}</h3>
        <p>${esc(c.set)} · ${esc(c.year)}</p>
      </div>
    </article>
  `;
}

function render(){
  const list = $("#pcList");

  const configured = PC_PLAYERS.map(p => ({
    ...p,
    cards: cardsFor(p.name)
  }));

  $("#pcCount").textContent = `${configured.length} oyuncu`;

  list.innerHTML = configured.map(p => {

    const count = p.cards.length;
    const target = Math.max(Number(p.target) || count, 1);
    const pct = Math.min(
      100,
      Math.round((count / target) * 100)
    );

    const cover =
      p.cards[0]?.image ||
      fallbackImage(p.name);

    const team =
      p.cards[0]?.team ||
      "Personal Collection";

    return `
      <article
        class="pc-card"
        data-player="${esc(p.name)}"
      >
        <div class="pc-cover">
          <img
            src="${esc(cover)}"
            alt="${esc(p.name)}"
          >
        </div>

        <div class="pc-overlay"></div>

        <div class="pc-info">
          <div class="pc-sport">
            PERSONAL COLLECTION
          </div>

          <div class="pc-name">
            ${esc(p.name)}
          </div>

          <div class="pc-team">
            ${esc(team)}
          </div>

          <div class="pc-progress-row">
            <span>
              ${count} / ${target} Cards
            </span>

            <strong>
              ${pct}%
            </strong>
          </div>

          <div class="pc-progress">
            <span style="width:${pct}%"></span>
          </div>
        </div>
      </article>
    `;

  }).join("");

  list
    .querySelectorAll(".pc-card")
    .forEach(el => {
      el.onclick = () =>
        openPC(el.dataset.player);
    });
}

function openPC(name){

  const config = PC_PLAYERS.find(
    p =>
      p.name.toLowerCase() ===
      name.toLowerCase()
  );

  const cards = cardsFor(name);

  if(!config) return;

  $("#pcOverview").style.display = "none";
  $("#pcDetail").classList.add("active");

  $("#detailName").textContent =
    config.name;

  $("#detailTeam").textContent =
    cards[0]?.team ||
    "Personal Collection";

  const numbered = cards.filter(
    c =>
      /\d+\s*\/\s*\d+/.test(
        c.parallel || ""
      )
  ).length;

  const rookie = cards.filter(
    c => c.rookie
  ).length;

  const graded = cards.filter(
    c =>
      c.grade &&
      c.grade !== "—"
  ).length;

  const target = Math.max(
    Number(config.target) || cards.length,
    1
  );

  $("#detailStats").innerHTML = `

    <div class="pc-mini-stat">
      <small>Total Cards</small>
      <strong>${cards.length}</strong>
    </div>

    <div class="pc-mini-stat">
      <small>Target</small>
      <strong>${target}</strong>
    </div>

    <div class="pc-mini-stat">
      <small>Numbered</small>
      <strong>${numbered}</strong>
    </div>

    <div class="pc-mini-stat">
      <small>Rookie</small>
      <strong>${rookie}</strong>
    </div>

    <div class="pc-mini-stat">
      <small>Graded</small>
      <strong>${graded}</strong>
    </div>

  `;

  $("#detailCards").innerHTML =
    cards.length
      ? cards.map(cardMarkup).join("")
      : `
        <div class="pc-empty">
          Bu oyuncuya ait henüz kart eklenmemiş.
        </div>
      `;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function closePC(){

  $("#pcDetail").classList.remove("active");

  $("#pcOverview").style.display =
    "block";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

$("#backToPC").onclick = closePC;

$("#navToggle").onclick = () =>
  $(".main-nav").classList.toggle("open");

$(".main-nav")
  .querySelectorAll("a")
  .forEach(a =>
    a.onclick = () =>
      $(".main-nav").classList.remove("open")
  );

$("#year").textContent =
  new Date().getFullYear();

loadCards();
