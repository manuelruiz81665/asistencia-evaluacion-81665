import { storage } from "./storage.js";
import { api } from "./api.js";
import { scannerController } from "./scanner.js";

const $ = id => document.getElementById(id);
const state = { options: [], students: [], count: 0, deferredPrompt: null };

document.addEventListener("DOMContentLoaded", init);

async function init(){
  initNavigation();
  initTheme();
  initDates();
  initSettings();
  initOnlineStatus();
  initInstall();
  bindActions();
  renderSummary();
  await loadOptions(false);
  registerServiceWorker();
}

function initNavigation(){
  document.querySelectorAll("[data-view]").forEach(btn=>{
    btn.addEventListener("click",()=>showView(btn.dataset.view));
  });
}
function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="reportsView") renderSummary();
}
function initTheme(){
  const dark = localStorage.getItem("theme")==="dark";
  document.body.classList.toggle("dark",dark);
  $("themeBtn").addEventListener("click",()=>{
    document.body.classList.toggle("dark");
    localStorage.setItem("theme",document.body.classList.contains("dark")?"dark":"light");
  });
}
function initDates(){
  const now=new Date();
  $("date").value=localDate(now);
  $("startTime").value=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
}
function initSettings(){
  const cfg=storage.getConfig();
  $("apiUrl").value=cfg.apiUrl||"";
  $("apiKey").value=cfg.apiKey||"";
  updateSyncStatus();
}
function initOnlineStatus(){
  const update=()=>{
    $("offlineBanner").hidden=navigator.onLine;
    if(navigator.onLine) syncPending();
  };
  addEventListener("online",update);addEventListener("offline",update);update();
}
function initInstall(){
  addEventListener("beforeinstallprompt",e=>{
    e.preventDefault(); state.deferredPrompt=e; $("installBtn").hidden=false;
  });
  $("installBtn").addEventListener("click",async()=>{
    if(!state.deferredPrompt)return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt=null;$("installBtn").hidden=true;
  });
}
function bindActions(){
  $("saveSettingsBtn").onclick=saveSettings;
  $("testConnectionBtn").onclick=testConnection;
  $("startScannerBtn").onclick=startScanner;
  $("stopScannerBtn").onclick=()=>scannerController.stop();
  $("closeSessionBtn").onclick=closeSession;
  $("saveEvaluationBtn").onclick=saveEvaluation;
  $("loadStudentsBtn").onclick=()=>loadStudents(true);
  $("studentSearch").oninput=renderStudents;
  $("syncBtn").onclick=syncPending;
  $("clearLocalBtn").onclick=clearLocal;
}
async function loadOptions(showMessage=true){
  try{
    const r=await api.call("getOptions",{});
    if(!r.ok) throw new Error(r.message);
    state.options=r.data||[];
    storage.setCache("options",state.options);
    fillOptions(state.options);
    if(showMessage) toast("Opciones actualizadas.");
  }catch(e){
    state.options=storage.getCache("options")||[
      {area:"CyT",grado:"1.°",seccion:"A"},
      {area:"EPT",grado:"1.°",seccion:"A"},
      {area:"Tutoría",grado:"1.°",seccion:"A"}
    ];
    fillOptions(state.options);
  }
}
function fillOptions(options){
  const areas=[...new Set(options.map(x=>x.area))];
  setSelect("area",areas);setSelect("evaluationArea",areas);
  const updateGrades=()=>{
    const grades=[...new Set(options.filter(x=>x.area===$("area").value).map(x=>x.grado))];
    setSelect("grade",grades);updateSections();
  };
  const updateSections=()=>{
    const sections=[...new Set(options.filter(x=>x.area===$("area").value&&x.grado===$("grade").value).map(x=>x.seccion))];
    setSelect("section",sections);
  };
  $("area").onchange=updateGrades;$("grade").onchange=updateSections;updateGrades();
}
function setSelect(id,values){ $(id).innerHTML=values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(""); }
function sessionPayload(){
  return {area:$("area").value,grado:$("grade").value,seccion:$("section").value,fecha:$("date").value,horaInicio:$("startTime").value,tolerancia:Number($("tolerance").value||10)};
}
async function startScanner(){
  setResult("scanResult","Solicitando acceso a la cámara…","neutral");
  try{
    await scannerController.start(async code=>registerAttendance(code));
    setResult("scanResult","Escáner activo","success","Acerque el código QR.");
  }catch(e){ setResult("scanResult","No se pudo abrir la cámara","error",e.message); }
}
async function registerAttendance(code){
  const payload={...sessionPayload(),codigo:String(code).trim()};
  if(!payload.area||!payload.grado||!payload.seccion) return setResult("scanResult","Complete los datos de la sesión","warning");
  const localRecord={id:crypto.randomUUID(),type:"attendance",payload,createdAt:new Date().toISOString(),status:"pending"};
  storage.addRecord(localRecord);
  setResult("scanResult","Procesando…","neutral",payload.codigo);
  try{
    const r=await api.call("registerAttendance",payload);
    if(!r.ok) throw new Error(r.message);
    storage.markSynced(localRecord.id,r);
    state.count++; $("attendanceCounter").textContent=state.count;
    const cls=r.data?.estado==="PRESENTE"?"success":"warning";
    setResult("scanResult",r.message||"Asistencia registrada",cls);
    vibrate(); beep();
  }catch(e){
    if(!navigator.onLine||/Failed to fetch|NetworkError/i.test(e.message)){
      state.count++; $("attendanceCounter").textContent=state.count;
      setResult("scanResult","Guardado sin conexión","warning",`${payload.codigo}. Se sincronizará luego.`);
    }else{
      storage.removeRecord(localRecord.id);
      setResult("scanResult","No se registró","error",e.message);
    }
  }
}
async function closeSession(){
  if(!confirm("Se marcará FALTA a quienes no hayan sido registrados. ¿Continuar?")) return;
  try{
    const r=await api.call("closeSession",sessionPayload());
    if(!r.ok) throw new Error(r.message);
    setResult("scanResult",r.message,"success");toast("Sesión cerrada.");
  }catch(e){setResult("scanResult","No se pudo cerrar la sesión","error",e.message);}
}
async function saveEvaluation(){
  const level=document.querySelector('input[name="level"]:checked')?.value;
  const payload={codigo:$("evaluationCode").value.trim(),area:$("evaluationArea").value,criterio:$("criterion").value.trim(),nivel:level,observacion:$("evaluationNote").value.trim(),fecha:localDate(new Date())};
  if(!payload.codigo||!payload.criterio) return setResult("evaluationResult","Complete código y criterio","warning");
  const localRecord={id:crypto.randomUUID(),type:"evaluation",payload,createdAt:new Date().toISOString(),status:"pending"};
  storage.addRecord(localRecord);
  try{
    const r=await api.call("registerEvaluation",payload);
    if(!r.ok) throw new Error(r.message);
    storage.markSynced(localRecord.id,r);
    setResult("evaluationResult",r.message||"Evaluación guardada","success");
    $("evaluationCode").value="";$("evaluationNote").value="";vibrate();
  }catch(e){
    if(!navigator.onLine||/Failed to fetch|NetworkError/i.test(e.message)){
      setResult("evaluationResult","Evaluación guardada sin conexión","warning");
    }else{storage.removeRecord(localRecord.id);setResult("evaluationResult","No se guardó","error",e.message);}
  }
}
async function loadStudents(showMessage){
  try{
    const r=await api.call("getStudents",{});
    if(!r.ok) throw new Error(r.message);
    state.students=r.data||[];storage.setCache("students",state.students);renderStudents();
    if(showMessage)toast("Nómina actualizada.");
  }catch(e){
    state.students=storage.getCache("students")||[];renderStudents();
    if(showMessage)toast(e.message);
  }
}
function renderStudents(){
  const q=$("studentSearch").value.toLowerCase();
  const data=state.students.filter(s=>`${s.codigo} ${s.nombre}`.toLowerCase().includes(q));
  $("studentList").innerHTML=data.length?data.map(s=>`<div class="student-item"><div class="mini-avatar">${initials(s.nombre)}</div><div><strong>${escapeHtml(s.nombre)}</strong><small>${escapeHtml(s.codigo)} · ${escapeHtml(s.grado)} ${escapeHtml(s.seccion)}</small></div></div>`).join(""):'<p class="empty">No hay estudiantes para mostrar.</p>';
}
async function saveSettings(){
  storage.setConfig({apiUrl:$("apiUrl").value.trim(),apiKey:$("apiKey").value.trim()});
  updateSyncStatus();toast("Configuración guardada.");await loadOptions(false);
}
async function testConnection(){
  setResult("connectionResult","Probando conexión…","neutral");
  try{
    const r=await api.call("ping",{});
    if(!r.ok)throw new Error(r.message);
    setResult("connectionResult","Conexión correcta","success",r.message);
  }catch(e){setResult("connectionResult","Conexión fallida","error",e.message);}
}
async function syncPending(){
  if(!navigator.onLine)return;
  const pending=storage.getRecords().filter(r=>r.status==="pending");
  for(const item of pending){
    try{
      const action=item.type==="attendance"?"registerAttendance":"registerEvaluation";
      const r=await api.call(action,item.payload);
      if(r.ok)storage.markSynced(item.id,r);
    }catch(e){}
  }
  renderSummary();updateSyncStatus();
}
function clearLocal(){
  if(confirm("¿Eliminar el historial local? Los datos ya sincronizados en Google Sheets no se borrarán.")){
    storage.clearRecords();renderSummary();toast("Historial local eliminado.");
  }
}
function renderSummary(){
  const records=storage.getRecords();
  const attendance=records.filter(r=>r.type==="attendance");
  const evaluations=records.filter(r=>r.type==="evaluation");
  const pending=records.filter(r=>r.status==="pending");
  $("summaryCards").innerHTML=`
    <div class="summary-card"><strong>${attendance.length}</strong><span>Asistencias</span></div>
    <div class="summary-card"><strong>${evaluations.length}</strong><span>Evaluaciones</span></div>
    <div class="summary-card"><strong>${pending.length}</strong><span>Pendientes</span></div>`;
  $("localLog").innerHTML=records.slice().reverse().slice(0,30).map(r=>`<div class="log-row"><strong>${r.type==="attendance"?"Asistencia":"Evaluación"}</strong> · ${escapeHtml(r.payload.codigo||"")}<br><small>${new Date(r.createdAt).toLocaleString("es-PE")} · ${r.status==="synced"?"Sincronizado":"Pendiente"}</small></div>`).join("")||'<p class="empty">No existen registros locales.</p>';
}
function updateSyncStatus(){
  const cfg=storage.getConfig();const pending=storage.getRecords().filter(r=>r.status==="pending").length;
  $("syncStatus").textContent=!cfg.apiUrl?"Sin configurar":pending?`${pending} pendientes`:"Conectado";
}
function setResult(id,title,type="neutral",detail=""){const el=$(id);el.className=`result-card ${type}`;el.innerHTML=`<strong>${escapeHtml(title)}</strong>${detail?`<span>${escapeHtml(detail)}</span>`:""}`;}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2400);}
function vibrate(){if(navigator.vibrate)navigator.vibrate(100);}
function beep(){try{const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=780;g.gain.value=.05;o.start();o.stop(c.currentTime+.08);}catch(e){}}
function initials(n=""){return n.split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function localDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
async function registerServiceWorker(){if("serviceWorker"in navigator)try{await navigator.serviceWorker.register("./service-worker.js");}catch(e){}}
