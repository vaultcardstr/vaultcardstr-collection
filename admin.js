const $ = (s) => document.querySelector(s);
let supabaseClient = null;
let currentUser = null;
let cards = [];
let editingId = null;

function escapeHtml(v){
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function toast(message,error=false){
  const t=$("#toast"); t.textContent=message; t.className="toast "+(error?"error":""); t.classList.remove("hidden");
  setTimeout(()=>t.classList.add("hidden"),3500);
}
function normalizeCard(c){
  return {...c,set:c.set_name??c.set??"",image_front:c.image_front_url??c.image_url??c.image??"",image_back:c.image_back_url??"",image:c.image_front_url??c.image_url??c.image??""};
}
async function uploadCardImage(file){
  if(!file)return "";
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Sadece JPG, PNG veya WebP görsel yükleyebilirsin.");
  if(file.size>6*1024*1024)throw new Error("Fotoğraf 6 MB'dan küçük olsun.");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${currentUser.id}/${crypto.randomUUID()}.${ext}`;
  const {error}=await supabaseClient.storage.from("card-images").upload(path,file,{cacheControl:"31536000",contentType:file.type,upsert:false});
  if(error)throw error;
  return supabaseClient.storage.from("card-images").getPublicUrl(path).data.publicUrl;
}
async function loadCards(){
  const {data,error}=await supabaseClient.from("cards").select("*").order("created_at",{ascending:false});
  if(error){toast(error.message,true);return;}
  cards=(data||[]).map(normalizeCard); renderList();
}
function renderList(){
  const box=$("#adminList");
  if(!box)return;
  if(!cards.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📦</div><h3>Henüz kart yok</h3><p>Yeni kart ekleyerek başlayabilirsin.</p></div>';return;}
  box.innerHTML=cards.map(c=>`<div class="admin-row">
    <img src="${escapeHtml(c.image)}" alt="">
    <div><strong>${escapeHtml(c.player)}</strong><small>${escapeHtml(c.set||"")} · ${escapeHtml(c.year||"")}</small></div>
    <div class="admin-actions"><button class="small-btn edit-btn" data-id="${c.id}">Düzenle</button><button class="small-btn danger delete-btn" data-id="${c.id}">Sil</button></div>
  </div>`).join("");
  box.querySelectorAll(".edit-btn").forEach(b=>b.onclick=()=>openForm(cards.find(c=>String(c.id)===String(b.dataset.id))));
  box.querySelectorAll(".delete-btn").forEach(b=>b.onclick=()=>deleteCard(b.dataset.id));
}
function openForm(card=null){
  editingId=card?.id??null;
  $("#adminFormTitle").textContent=card?"Kartı Düzenle":"Yeni Kart Ekle";
  const fields=["player","team","category","year","set_name","card_number","parallel","condition","grade","purchase_price","estimated_value","acquired_date","note"];
  fields.forEach(f=>{if($("#"+f))$("#"+f).value=card?.[f]??"";});
  $("#category").value=card?.category||"Football";
  $("#parallel").value=card?.parallel||"Base";
  $("#condition").value=card?.condition||"Raw";
  $("#grade").value=card?.grade||"—";
  $("#rookie").checked=!!card?.rookie;
  $("#featured").checked=!!card?.featured;
  $("#is_numbered").checked=!!card?.is_numbered;
  $("#numbering").value=card?.numbering||"";
  $("#is_autograph").checked=!!card?.is_autograph;
  $("#is_relic").checked=!!card?.is_relic;
  $("#forSale").checked=!!card?.for_sale;
  $("#forTrade").checked=!!card?.for_trade;
  $("#dolapUrl").value=card?.dolap_url||"";
  $("#imageFront").value=""; $("#imageBack").value="";
  $("#numberingWrap").style.display=$("#is_numbered").checked?"":"none";
  $("#adminForm").classList.remove("hidden");
  window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
}
function closeForm(){editingId=null;$("#adminForm").classList.add("hidden");}
async function saveCard(e){
  e.preventDefault();
  const frontFile=$("#imageFront").files[0], backFile=$("#imageBack").files[0];
  const existing=editingId?cards.find(c=>String(c.id)===String(editingId)):null;
  let frontUrl=existing?.image_front||existing?.image||"", backUrl=existing?.image_back||"";
  if(!editingId&&!frontFile){toast("Yeni kart için ön yüz fotoğrafı seçmelisin.",true);return;}
  try{
    if(frontFile)frontUrl=await uploadCardImage(frontFile);
    if(backFile)backUrl=await uploadCardImage(backFile);
  }catch(err){toast(err.message||"Görsel yüklenemedi.",true);return;}
  const purchaseRaw=$("#purchase_price").value.trim(), estimatedRaw=$("#estimated_value").value.trim();
  const payload={
    player:$("#player").value.trim(),team:$("#team").value.trim(),category:$("#category").value,
    year:$("#year").value.trim(),set_name:$("#set_name").value.trim(),card_number:$("#card_number").value.trim(),
    parallel:$("#parallel").value.trim()||"Base",condition:$("#condition").value.trim()||"Raw",grade:$("#grade").value.trim()||"—",
    purchase_price:purchaseRaw?Number(purchaseRaw):null,estimated_value:estimatedRaw?Number(estimatedRaw):null,
    acquired_date:$("#acquired_date").value||null,rookie:$("#rookie").checked,
    numbered:!!$("#parallel").value.trim().match(/\d+\/\d+|\d+\s*\/?\s*\d+/),
    is_numbered:$("#is_numbered").checked,numbering:$("#numbering").value.trim(),
    is_autograph:$("#is_autograph").checked,is_relic:$("#is_relic").checked,
    graded:!!$("#grade").value.trim()&&$("#grade").value.trim()!=="—",featured:$("#featured").checked,
    image_url:frontUrl,image_front_url:frontUrl,image_back_url:backUrl,note:$("#note").value.trim(),
    for_sale:$("#forSale").checked,for_trade:$("#forTrade").checked,dolap_url:$("#dolapUrl").value.trim(),status:"Collection"
  };
  if(!payload.player||!payload.image_front_url){toast("Oyuncu ve ön yüz fotoğrafı gerekli.",true);return;}
  if(Number.isNaN(payload.purchase_price)||Number.isNaN(payload.estimated_value)){toast("Fiyat alanlarını sayı olarak gir.",true);return;}
  const result=editingId?await supabaseClient.from("cards").update(payload).eq("id",editingId):await supabaseClient.from("cards").insert(payload);
  if(result.error){toast(result.error.message,true);return;}
  toast(editingId?"Kart güncellendi.":"Kart koleksiyona eklendi."); closeForm(); await loadCards();
}
async function deleteCard(id){
  if(!confirm("Bu kartı silmek istediğine emin misin?"))return;
  const {error}=await supabaseClient.from("cards").delete().eq("id",id);
  if(error){toast(error.message,true);return;}
  toast("Kart silindi."); await loadCards();
}
async function importDemo(){
  if(cards.length&&!confirm("Mevcut kartların üzerine demo kartlar eklemek istiyor musun?"))return;
  const base=new URL(".",location.href).href;
  const rows=demoCards.map(({id,set_name,image_url,...c})=>({...c,set_name,image_url:new URL(image_url,base).href}));
  const {error}=await supabaseClient.from("cards").insert(rows);
  if(error){toast(error.message,true);return;}
  await loadCards(); toast("Demo kartlar veritabanına aktarıldı.");
}
function initForm(){
  $("#is_numbered").addEventListener("change",()=>{$("#numberingWrap").style.display=$("#is_numbered").checked?"":"none";if(!$("#is_numbered").checked)$("#numbering").value="";});
  $("#addCardBtn").onclick=()=>openForm();
  $("#cancelAdminForm").onclick=closeForm; $("#cancelAdminForm2").onclick=closeForm;
  $("#cardEditorForm").onsubmit=saveCard; $("#importDemoBtn").onclick=importDemo;
  $("#logoutBtn").onclick=async()=>{await supabaseClient.auth.signOut();location.href="index.html";};
  const ai=$("#aiEstimateBtn");
  ai.onclick=async()=>{
    ai.disabled=true;ai.textContent="🤖 Thinking...";
    try{
      const card={player:$("#player").value.trim(),category:$("#category").value,year:$("#year").value.trim(),set:$("#set_name").value.trim(),card_number:$("#card_number").value.trim(),parallel:$("#parallel").value.trim(),condition:$("#condition").value.trim(),grade:$("#grade").value.trim()};
      const {data,error}=await supabaseClient.functions.invoke("vaultbot",{body:{mode:"estimate",card}});
      if(error)throw error;
      if(!data?.estimated_value)throw new Error("No estimated value returned.");
      $("#estimated_value").value=data.estimated_value;
    }catch(err){console.error(err);alert("AI estimated value could not be calculated.");}
    ai.disabled=false;ai.textContent="🤖 AI Value";
  };
}
async function boot(){
  if(!window.FG_CONFIG?.SUPABASE_URL||!window.FG_CONFIG?.SUPABASE_KEY||!window.supabase){
    $("#adminLoading").classList.add("hidden");$("#adminDenied").classList.remove("hidden");$("#adminDenied h2").textContent="Supabase bağlantısı bulunamadı.";return;
  }
  supabaseClient=window.supabase.createClient(window.FG_CONFIG.SUPABASE_URL,window.FG_CONFIG.SUPABASE_KEY);
  const {data,error}=await supabaseClient.auth.getUser();
  currentUser=data?.user||null;
  if(error||!currentUser||currentUser.app_metadata?.role!=="admin"){
    $("#adminLoading").classList.add("hidden");$("#adminDenied").classList.remove("hidden");
    if(!currentUser) $("#adminDenied h2").textContent="Admin paneline erişmek için giriş yapmalısın.";
    return;
  }
  $("#adminLoading").classList.add("hidden");$("#adminSection").classList.remove("hidden");
  $("#adminEmail").textContent=currentUser.email||"Admin";
  $("#adminEmail2").textContent=currentUser.email||"";
  initForm(); await loadCards();
  supabaseClient.auth.onAuthStateChange((_event,session)=>{if(!session?.user){location.href="index.html";}});
}
document.addEventListener("DOMContentLoaded",boot);
