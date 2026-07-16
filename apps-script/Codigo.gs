const SHEETS = {
  CONFIG: 'CONFIGURACION',
  STUDENTS: 'ESTUDIANTES',
  ENROLLMENT: 'MATRICULA',
  SESSIONS: 'SESIONES',
  ATTENDANCE: 'REGISTRO_ASISTENCIA',
  EVALUATION: 'REGISTRO_EVALUACION'
};

// Cambie esta clave por una frase privada difícil de adivinar.
// Debe escribir la misma clave en Configuración dentro de EduTrack.
const APP_PRIVATE_KEY = 'CAMBIAR-ESTA-CLAVE-PRIVADA';

function doGet() {
  return json_({ok:true, message:'EduTrack API activa'});
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    if (request.apiKey !== APP_PRIVATE_KEY) {
      return json_({ok:false, message:'Clave de aplicación incorrecta.'});
    }

    const action = String(request.action || '');
    const payload = request.payload || {};

    switch (action) {
      case 'ping': return json_({ok:true, message:'Conexión activa con Google Sheets.'});
      case 'getOptions': return json_({ok:true, data:getOptions_()});
      case 'getStudents': return json_({ok:true, data:getStudents_()});
      case 'registerAttendance': return json_(registerAttendance_(payload));
      case 'closeSession': return json_(closeSession_(payload));
      case 'registerEvaluation': return json_(registerEvaluation_(payload));
      default: return json_({ok:false, message:'Acción no reconocida.'});
    }
  } catch (error) {
    return json_({ok:false, message:error.message || String(error)});
  }
}

function getBook_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('El proyecto debe estar vinculado a la hoja de cálculo.');
  return ss;
}

function getOptions_() {
  const ss = getBook_();
  const sh = requiredSheet_(ss, SHEETS.ENROLLMENT);
  const last = sh.getLastRow();
  if (last < 3) return [];
  const values = sh.getRange(3, 1, last - 2, 7).getDisplayValues();
  const map = {};
  values.forEach(r => {
    const active = normalize_(r[6]);
    if (active !== 'SI') return;
    const area = String(r[5]).trim();
    const grado = String(r[3]).trim();
    const seccion = String(r[4]).trim();
    if (!area || !grado || !seccion) return;
    map[[area,grado,seccion].join('|')] = {area,grado,seccion};
  });
  return Object.values(map).sort((a,b)=>a.area.localeCompare(b.area)||a.grado.localeCompare(b.grado));
}

function getStudents_() {
  const ss = getBook_();
  const sh = requiredSheet_(ss, SHEETS.STUDENTS);
  const last = sh.getLastRow();
  if (last < 3) return [];
  const values = sh.getRange(3,1,last-2,5).getDisplayValues();
  return values.filter(r=>normalize_(r[4])==='ACTIVO').map(r=>({
    codigo:String(r[0]).trim(),
    nombre:String(r[1]).trim(),
    grado:String(r[2]).trim(),
    seccion:String(r[3]).trim()
  }));
}

function registerAttendance_(p) {
  validate_(p,['codigo','area','grado','seccion','fecha','horaInicio']);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = getBook_();
    const tz = ss.getSpreadsheetTimeZone() || 'America/Lima';
    const code = normalize_(p.codigo);
    const student = findStudent_(ss,code);
    if (!student) throw new Error('Código no encontrado: '+code);
    if (!isEnrolled_(ss,code,p.area,p.grado,p.seccion)) {
      throw new Error(student.nombre+' no está matriculado en esta sección y área.');
    }

    const sessionId = getOrCreateSession_(ss,p);
    if (alreadyRegistered_(ss,sessionId,code)) {
      return {ok:false,message:'Ya registrado: '+student.nombre};
    }

    const now = new Date();
    const limit = Utilities.parseDate(`${p.fecha} ${p.horaInicio}`,tz,'yyyy-MM-dd HH:mm');
    limit.setMinutes(limit.getMinutes()+Number(p.tolerancia||10));
    const estado = now <= limit ? 'PRESENTE' : 'TARDANZA';

    const sh = requiredSheet_(ss,SHEETS.ATTENDANCE);
    sh.appendRow([
      Utilities.getUuid(),
      Utilities.parseDate(p.fecha,tz,'yyyy-MM-dd'),
      now,
      code,
      student.nombre,
      p.grado,
      p.seccion,
      p.area,
      estado,
      sessionId,
      ''
    ]);
    return {ok:true,message:`${estado}: ${student.nombre}`,data:{estado,nombre:student.nombre}};
  } finally { lock.releaseLock(); }
}

function closeSession_(p) {
  validate_(p,['area','grado','seccion','fecha','horaInicio']);
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const ss=getBook_(), tz=ss.getSpreadsheetTimeZone()||'America/Lima';
    const sessionId=getOrCreateSession_(ss,p);
    const enrolled=getEnrolled_(ss,p.area,p.grado,p.seccion);
    const present=getRegisteredCodes_(ss,sessionId);
    const sh=requiredSheet_(ss,SHEETS.ATTENDANCE);
    let absences=0;
    enrolled.forEach(s=>{
      if(!present.has(s.codigo)){
        sh.appendRow([Utilities.getUuid(),Utilities.parseDate(p.fecha,tz,'yyyy-MM-dd'),new Date(),s.codigo,s.nombre,p.grado,p.seccion,p.area,'FALTA',sessionId,'Registrada al cerrar la sesión']);
        absences++;
      }
    });
    closeSessionRow_(ss,sessionId);
    return {ok:true,message:`Sesión cerrada. Faltas registradas: ${absences}`,data:{faltas:absences}};
  }finally{lock.releaseLock();}
}

function registerEvaluation_(p) {
  validate_(p,['codigo','area','criterio','nivel','fecha']);
  const ss=getBook_(), tz=ss.getSpreadsheetTimeZone()||'America/Lima';
  const student=findStudent_(ss,normalize_(p.codigo));
  if(!student)throw new Error('Código no encontrado: '+p.codigo);
  const sh=getOrCreateEvaluationSheet_(ss);
  sh.appendRow([
    Utilities.getUuid(),
    Utilities.parseDate(p.fecha,tz,'yyyy-MM-dd'),
    new Date(),
    normalize_(p.codigo),
    student.nombre,
    p.area,
    p.criterio,
    p.nivel,
    p.observacion||''
  ]);
  return {ok:true,message:`Evaluación guardada: ${student.nombre}`,data:{nombre:student.nombre}};
}

function findStudent_(ss,code){
  const sh=requiredSheet_(ss,SHEETS.STUDENTS),last=sh.getLastRow();
  if(last<3)return null;
  const data=sh.getRange(3,1,last-2,5).getDisplayValues();
  const row=data.find(r=>normalize_(r[0])===code&&normalize_(r[4])==='ACTIVO');
  return row?{codigo:normalize_(row[0]),nombre:String(row[1]).trim(),grado:String(row[2]).trim(),seccion:String(row[3]).trim()}:null;
}
function isEnrolled_(ss,code,area,grade,section){
  const sh=requiredSheet_(ss,SHEETS.ENROLLMENT),last=sh.getLastRow();
  if(last<3)return false;
  return sh.getRange(3,1,last-2,7).getDisplayValues().some(r=>
    normalize_(r[1])===code&&normalize_(r[5])===normalize_(area)&&String(r[3]).trim()===String(grade).trim()&&normalize_(r[4])===normalize_(section)&&normalize_(r[6])==='SI');
}
function getEnrolled_(ss,area,grade,section){
  const sh=requiredSheet_(ss,SHEETS.ENROLLMENT),last=sh.getLastRow();
  if(last<3)return [];
  return sh.getRange(3,1,last-2,7).getDisplayValues().filter(r=>normalize_(r[5])===normalize_(area)&&String(r[3]).trim()===String(grade).trim()&&normalize_(r[4])===normalize_(section)&&normalize_(r[6])==='SI').map(r=>({codigo:normalize_(r[1]),nombre:String(r[2]).trim()}));
}
function getOrCreateSession_(ss,p){
  const sh=requiredSheet_(ss,SHEETS.SESSIONS),tz=ss.getSpreadsheetTimeZone()||'America/Lima';
  const id=[p.fecha,normalize_(p.area),String(p.grado).trim(),normalize_(p.seccion)].join('|');
  const last=sh.getLastRow();
  if(last>=3){
    const ids=sh.getRange(3,1,last-2,1).getDisplayValues().flat().map(normalize_);
    const pos=ids.indexOf(normalize_(id));
    if(pos>=0){
      if(normalize_(sh.getRange(pos+3,8).getDisplayValue())==='CERRADA')throw new Error('La sesión ya está cerrada.');
      return id;
    }
  }
  sh.appendRow([id,Utilities.parseDate(p.fecha,tz,'yyyy-MM-dd'),p.area,p.grado,p.seccion,Utilities.parseDate(`${p.fecha} ${p.horaInicio}`,tz,'yyyy-MM-dd HH:mm'),Number(p.tolerancia||10),'ABIERTA','']);
  return id;
}
function alreadyRegistered_(ss,sessionId,code){
  const sh=requiredSheet_(ss,SHEETS.ATTENDANCE),last=sh.getLastRow();
  if(last<3)return false;
  return sh.getRange(3,4,last-2,7).getDisplayValues().some(r=>normalize_(r[0])===code&&normalize_(r[6])===normalize_(sessionId));
}
function getRegisteredCodes_(ss,sessionId){
  const sh=requiredSheet_(ss,SHEETS.ATTENDANCE),last=sh.getLastRow(),set=new Set();
  if(last<3)return set;
  sh.getRange(3,4,last-2,7).getDisplayValues().forEach(r=>{if(normalize_(r[6])===normalize_(sessionId))set.add(normalize_(r[0]));});
  return set;
}
function closeSessionRow_(ss,sessionId){
  const sh=requiredSheet_(ss,SHEETS.SESSIONS),last=sh.getLastRow();
  if(last<3)return;
  const ids=sh.getRange(3,1,last-2,1).getDisplayValues().flat().map(normalize_);
  const pos=ids.indexOf(normalize_(sessionId));
  if(pos>=0){sh.getRange(pos+3,8).setValue('CERRADA');sh.getRange(pos+3,9).setValue(new Date());}
}
function getOrCreateEvaluationSheet_(ss){
  let sh=ss.getSheetByName(SHEETS.EVALUATION);
  if(!sh){
    sh=ss.insertSheet(SHEETS.EVALUATION);
    sh.getRange(1,1,1,9).merge().setValue('REGISTRO DE EVALUACIÓN');
    sh.getRange(2,1,1,9).setValues([['ID_REGISTRO','FECHA','HORA_REGISTRO','CODIGO_QR','ESTUDIANTE','AREA','CRITERIO','NIVEL','OBSERVACION']]);
  }
  return sh;
}
function requiredSheet_(ss,name){
  const sh=ss.getSheetByName(name);
  if(!sh)throw new Error(`No existe la pestaña ${name}.`);
  return sh;
}
function validate_(p,fields){fields.forEach(f=>{if(!String(p[f]??'').trim())throw new Error('Falta completar: '+f);});}
function normalize_(v){return String(v??'').trim().toUpperCase();}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
