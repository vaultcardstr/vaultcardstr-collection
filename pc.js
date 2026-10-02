const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

let allCards = [];
let pcPlayers = [];
let viewedUserId = null;
let currentUserId = null;
let editingPcId = null;

function fallbackImage(player){
  const initials = player.split(" ").map(x => x[0]).join("").slice(0,3).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 710 1000"><rect width="710" height="1000" fill="#12151c"/><circle cx="560" cy="150" r="210" fill="#ff9d2e" opacity=".08"/><text x="55" y="700" fill="#fff" font-family="Arial" font-weight="900" font-size="72">${esc(initials)}</text><text x="55" y="780" fill="#fff" font-family="Arial" font-weight="700" font-size="32">${esc(player)}</text></svg>`;
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

function cardsFor(name){
  return allCards.filter(c =>
    String(c.player || "").trim().toLowerCase() === String(name || "").trim().toLowerCase()
  );
}

async function init(){
  const supabaseClient = window.supabase.createClient(
    window.FG_CONFIG.SUPABASE_URL,
    window.FG_CONFIG.SUPABASE_KEY
  );

  const params = new URLSearchParams(window.location.search);
  viewedUserId = params.get("user");

  const { data: authData } = await supabaseClient.auth.getUser();
  currentUserId = authData?.user?.id || null;

  if (!viewedUserId) viewedUserId = currentUserId;

  if (!viewedUserId) {
    $("#pcList").innerHTML = '<div class="pc-empty">Bir koleksiyoner profili seçilmedi.</div>';
    return;
  }

  const [{ data: profile }, { data: pcs, error: pcError }, { data: cards, error: cardError }] = await Promise.all([
    supabaseClient.from("profiles").select("id,username").eq("id", viewedUserId).maybeSingle(),
    supabaseClient.from("profile_pcs").select("id,owner_id,player_name,target,team,created_at").eq("owner_id", viewedUserId).order("created_at", { ascending: true }),
    supabaseClient.from("cards").select("*").eq("owner_id", viewedUserId).order("created_at", { ascending: false })
  ]);

  if (pcError) {
    console.error(pcError);
    $("#pcList").innerHTML = '<div class="pc-empty">PC verileri yüklenemedi. Supabase SQL kurulumunu tamamla.</div>';
    return;
  }

  if (cardError) console.error(cardError);

  pcPlayers = pcs || [];
  allCards = (cards || []).map(normalize);

  const username = profile?.username || "Koleksiyoner";
  document.title = `${username} | PC'ler | VaultCardsTR`;
  document.querySelector(".pc-hero h1").textContent = `${username}'in PC'leri.`;
  document.querySelector(".pc-hero p").textContent = "Koleksiyonunda özellikle takip ettiği ve kartlarını toplamaya odaklandığı oyuncular.";

  if (currentUserId && currentUserId === viewedUserId) {
    $("#pcManageBtn").style.display = "inline-flex";
  }

  render();
  renderManager();

  $("#pcManageBtn").onclick = () => {
    $("#pcManagerOverlay").classList.add("open");
    renderManager();
  };

  $("#pcManagerClose").onclick = () => {
    $("#pcManagerOverlay").classList.remove("open");
    resetManagerForm();
  };

  $("#pcManagerOverlay").addEventListener("click", e => {
    if (e.target.id === "pcManagerOverlay") {
      $("#pcManagerOverlay").classList.remove("open");
      resetManagerForm();
    }
  });

  $("#pcManagerForm").onsubmit = async e => {
    e.preventDefault();

    const playerName = $("#pcPlayerName").value.trim();
    const team = $("#pcPlayerTeam").value.trim();
    const target = Math.max(Number($("#pcPlayerTarget").value) || 1, 1);

    if (!playerName) return;

    if (editingPcId) {
      const { data, error } = await supabaseClient
        .from("profile_pcs")
        .update({ player_name: playerName, team, target })
        .eq("id", editingPcId)
        .eq("owner_id", currentUserId)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") alert("Bu oyuncu zaten PC listende.");
        else alert("PC güncellenemedi.");
        return;
      }

      pcPlayers = pcPlayers.map(p => p.id === editingPcId ? data : p);
    } else {
      const { data, error } = await supabaseClient
        .from("profile_pcs")
        .insert({ owner_id: currentUserId, player_name: playerName, team, target })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") alert("Bu oyuncu zaten PC listende.");
        else alert("PC eklenemedi.");
        return;
      }

      pcPlayers.push(data);
    }

    resetManagerForm();
    render();
    renderManager();
  };

  $("#backToPC").onclick = closePC;
  $("#navToggle").onclick = () => $(".main-nav").classList.toggle("open");
  $(".main-nav").querySelectorAll("a").forEach(a => a.onclick = () => $(".main-nav").classList.remove("open"));
  $("#year").textContent = new Date().getFullYear();
}

function render(){
  const list = $("#pcList");

  $("#pcCount").textContent = `${pcPlayers.length} oyuncu`;

  if (!pcPlayers.length) {
    list.innerHTML = `
      <div class="pc-empty" style="grid-column:1/-1;">
        <h3>Henüz PC eklenmemiş.</h3>
        <p>${currentUserId === viewedUserId ? "PC'lerini Düzenle butonundan ilk oyuncunu ekleyebilirsin." : "Bu koleksiyoner henüz bir PC listesi oluşturmamış."}</p>
      </div>
    `;
    return;
  }

  list.innerHTML = pcPlayers.map(p => {
    const cards = cardsFor(p.player_name);
    const count = cards.length;
    const target = Math.max(Number(p.target) || count, 1);
    const pct = Math.min(100, Math.round((count / target) * 100));
    const cover = cards[0]?.image || fallbackImage(p.player_name);
    const team = p.team || cards[0]?.team || "Personal Collection";

    return `
      <article class="pc-card" data-player="${esc(p.player_name)}">
        <div class="pc-cover">
          <img src="${esc(cover)}" alt="${esc(p.player_name)}">
        </div>
        <div class="pc-overlay"></div>
        <div class="pc-info">
          <div class="pc-sport">PERSONAL COLLECTION</div>
          <div class="pc-name">${esc(p.player_name)}</div>
          <div class="pc-team">${esc(team)}</div>
          <div class="pc-progress-row">
            <span>${count} / ${target} Cards</span>
            <strong>${pct}%</strong>
          </div>
          <div class="pc-progress"><span style="width:${pct}%"></span></div>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".pc-card").forEach(el => {
    el.onclick = () => openPC(el.dataset.player);
  });
}

function renderManager(){
  const list = $("#pcManagerList");
  if (!list) return;

  if (!pcPlayers.length) {
    list.innerHTML = '<div class="pc-empty">Henüz PC eklemedin.</div>';
    return;
  }

  list.innerHTML = pcPlayers.map(p => `
    <div class="pc-manager-item">
      <div>
        <strong>${esc(p.player_name)}</strong>
        <small>${esc(p.team || "Takım belirtilmedi")} · Hedef: ${Number(p.target) || 1} kart</small>
      </div>
      <div style="display:flex;gap:7px;">
        <button class="pc-manage-btn pc-edit-btn" type="button" data-id="${p.id}">Düzenle</button>
        <button class="pc-delete-btn" type="button" data-id="${p.id}">Sil</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".pc-edit-btn").forEach(btn => {
    btn.onclick = () => {
      const p = pcPlayers.find(x => String(x.id) === String(btn.dataset.id));
      if (!p) return;
      editingPcId = p.id;
      $("#pcPlayerName").value = p.player_name || "";
      $("#pcPlayerTeam").value = p.team || "";
      $("#pcPlayerTarget").value = p.target || 18;
      $("#pcManagerForm button[type=submit]").textContent = "Değiştir";
      $("#pcPlayerName").focus();
    };
  });

  list.querySelectorAll(".pc-delete-btn").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Bu oyuncuyu PC listesinden kaldırmak istediğine emin misin?")) return;

      const { error } = await window.supabase.createClient(
        window.FG_CONFIG.SUPABASE_URL,
        window.FG_CONFIG.SUPABASE_KEY
      ).from("profile_pcs").delete().eq("id", btn.dataset.id).eq("owner_id", currentUserId);

      if (error) {
        alert("PC silinemedi.");
        return;
      }

      pcPlayers = pcPlayers.filter(p => String(p.id) !== String(btn.dataset.id));
      resetManagerForm();
      render();
      renderManager();
    };
  });
}

function resetManagerForm(){
  editingPcId = null;
  $("#pcManagerForm")?.reset();
  if ($("#pcPlayerTarget")) $("#pcPlayerTarget").value = 18;
  const submit = $("#pcManagerForm button[type=submit]");
  if (submit) submit.textContent = "PC Ekle";
}

function openPC(name){
  const config = pcPlayers.find(p => p.player_name.toLowerCase() === name.toLowerCase());
  const cards = cardsFor(name);
  if (!config) return;

  $("#pcOverview").style.display = "none";
  $("#pcDetail").classList.add("active");
  $("#detailName").textContent = config.player_name;
  $("#detailTeam").textContent = config.team || cards[0]?.team || "Personal Collection";

  const numbered = cards.filter(c => /\d+\s*\/\s*\d+/.test(c.parallel || "") || c.serial_number).length;
  const rookie = cards.filter(c => c.rookie).length;
  const graded = cards.filter(c => c.grade && c.grade !== "—").length;
  const target = Math.max(Number(config.target) || cards.length, 1);

  $("#detailStats").innerHTML = `
    <div class="pc-mini-stat"><small>Total Cards</small><strong>${cards.length}</strong></div>
    <div class="pc-mini-stat"><small>Target</small><strong>${target}</strong></div>
    <div class="pc-mini-stat"><small>Numbered</small><strong>${numbered}</strong></div>
    <div class="pc-mini-stat"><small>Rookie</small><strong>${rookie}</strong></div>
    <div class="pc-mini-stat"><small>Graded</small><strong>${graded}</strong></div>
  `;

  $("#detailCards").innerHTML = cards.length
    ? cards.map(cardMarkup).join("")
    : '<div class="pc-empty">Bu oyuncuya ait henüz kart eklenmemiş.</div>';

  window.scrollTo({top:0,behavior:"smooth"});
}

function cardMarkup(c){
  return `
    <article class="card-item" data-id="${esc(c.id)}">
      <div class="card-image">
        ${c.for_sale ? '<span class="sale-badge">SATILIK</span>' : ""}
        <img src="${esc(c.image || fallbackImage(c.player))}" alt="${esc(c.player)} kartı">
      </div>
      <div class="card-body">
        <div class="tag-row">
          ${c.rookie ? '<span class="tag accent">RC</span>' : ""}
          ${c.parallel && c.parallel !== "Base" ? `<span class="tag">${esc(c.parallel)}</span>` : ""}
          ${c.grade && c.grade !== "—" ? `<span class="tag">${esc(c.grade)}</span>` : ""}
        </div>
        <h3>${esc(c.player)}</h3>
        <p>${esc(c.set)} · ${esc(c.year)}</p>
      </div>
    </article>
  `;
}

function closePC(){
  $("#pcDetail").classList.remove("active");
  $("#pcOverview").style.display = "block";
  window.scrollTo({top:0,behavior:"smooth"});
}

document.addEventListener("DOMContentLoaded", init);
