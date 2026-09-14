
function esc(v){return String(v??"-").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function get(key){return JSON.parse(localStorage.getItem(key))||[]}
function put(key,val){localStorage.setItem(key,JSON.stringify(val))}
function go(page){location.href=page}
function addHomeButton(){if(!document.querySelector(".home-btn")&&location.pathname.split("/").pop()!=="index.html"){document.body.insertAdjacentHTML("afterbegin",'<a class="home-btn" href="index.html">← 🏠 ホーム</a>')}}
function loadTackleSelect(id="tackleSet"){const s=document.getElementById(id);if(!s)return;const a=get("tackleSets");s.innerHTML='<option value="">タックル未選択</option>'+a.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}
function loadJigChecks(id="jigList"){const box=document.getElementById(id);if(!box)return;const a=get("jigs");box.innerHTML=a.length?a.map(x=>`<label class="check"><input type="checkbox" name="usedJig" value="${esc(x.id)}"><span><strong>${esc(x.name)}</strong><br>${esc(x.maker||"-")} / ${esc(x.weight||"-")}g / ${esc(x.color||"-")}</span></label>`).join(""):'<div class="note">ジグ図鑑に登録がありません。</div>'}
addHomeButton();

// ============================
// 潮流自動取得
// ============================

function getTideConfig(){
    return {apiBase:"https://api.msil.go.jp"};
}

async function fetchTideData({area, date, time}){
    if(!area || !date || !time){
        return {ok:false,reason:"INPUT_MISSING",message:"エリア・日付・時刻が必要です。"};
    }
    try{
        const r=await fetch("/api/tidal-current",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({area,date,time})
        });
        const data=await r.json();
        if(!r.ok) return data;
        return data;
    }catch(e){
        return {ok:false,reason:"API_ERROR",message:"潮流データを取得できませんでした。Node.jsサーバーが起動しているか確認してください。"};
    }
}
