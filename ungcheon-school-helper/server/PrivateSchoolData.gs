// Server-only. Firestore remains the source of administrative writes.
// The published private commit is an authenticated read copy of that version.
const PRIVATE_SCHOOL_GROUPS_ = ['staffRoster','studentRoster','timetable','studentTimetable'];
function privateSchoolRevision_(group) {
  if (PRIVATE_SCHOOL_GROUPS_.indexOf(group)<0) throw Error('허용되지 않은 자료입니다.');
  const props=PropertiesService.getScriptProperties();
  const pinned=props.getProperty('UNG_PRIVATE_ACTIVE_COMMIT');
  if (!props.getProperty('UNG_PRIVATE_REPO') || !/^[a-f0-9]{40}$/.test(pinned || '')) return '';
  return props.getProperty('UNG_PRIVATE_REV_'+group) || pinned;
}
function privateSchoolGit_(endpoint, writer, content, credentials) {
  const props=PropertiesService.getScriptProperties(), repo=credentials?credentials.repo:props.getProperty('UNG_PRIVATE_REPO');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('비공개 학교 저장소 설정을 확인해 주세요.');
  const token=credentials?(writer?credentials.write:credentials.read):props.getProperty(writer?'UNG_PRIVATE_WRITE_TOKEN':'UNG_PRIVATE_READ_TOKEN');
  if (!token) throw Error('학교 저장소 접근 권한 설정을 확인해 주세요.');
  const options={method:content?'put':'get',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},followRedirects:false,muteHttpExceptions:true};
  if(content){ options.contentType='application/json';options.payload=JSON.stringify(content); }
  const result=UrlFetchApp.fetch('https://api.github.com/repos/'+repo+endpoint,options);
  if(result.getResponseCode()<200 || result.getResponseCode()>=300) throw Error('비공개 학교 자료 조회 또는 저장에 실패했습니다.');
  return JSON.parse(result.getContentText());
}
function privateSchoolRead_(group) {
  return privateSchoolReadAt_(group,privateSchoolRevision_(group));
}
function privateSchoolReadAt_(group,rev,credentials) {
  if(PRIVATE_SCHOOL_GROUPS_.indexOf(group)<0 || !/^[0-9a-f]{40}$/.test(rev)) throw Error('학교 자료 버전이 올바르지 않습니다.');
  const cache=CacheService.getScriptCache(),key='private-school:'+group+':'+rev;
  const saved=cache.get(key);if(saved) return JSON.parse(saved);
  try {
    const count=Number(cache.get(key+':chunks'));
    if(Number.isInteger(count) && count>0 && count<=24){
      const parts=Array.from({length:count},function(_,i){return cache.get(key+':'+i);});
      if(parts.every(Boolean)){
        return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(parts.join('')),'application/x-gzip')).getDataAsString());
      }
    }
  }catch(_){}
  const blob=privateSchoolGit_('/contents/school/'+group+'.json?ref='+rev,false,null,credentials);
  const payload=(blob.content && blob.encoding==='base64') ? blob : privateSchoolGit_('/git/blobs/'+blob.sha,false,null,credentials);
  const raw=Utilities.newBlob(Utilities.base64Decode(payload.content.replace(/\s/g,''))).getDataAsString('UTF-8');
  try {
    if(raw.length<23000) cache.put(key,raw,300);
    else {
      const encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw)).getBytes());
      const count=Math.ceil(encoded.length/80000);
      if(count<=24){
        for(let i=0;i<count;i++) cache.put(key+':'+i,encoded.slice(i*80000,(i+1)*80000),300);
        cache.put(key+':chunks',String(count),300);
      }
    }
  }catch(_){}
  return JSON.parse(raw);
}
function privateSchoolMetadata_(group) {
  const sheets={staffRoster:STAFF_ROSTER_META_SHEET,studentRoster:STUDENT_ROSTER_META_SHEET,
    timetable:TIMETABLE_META_SHEET,studentTimetable:STUDENT_TIMETABLE_META_SHEET};
  return readObjects_(sheets[group])[0] || null;
}
function privateSchoolVersionMatches_(data, meta) {
  return !!(data && meta && data.version===(Number(meta.version)||1) && data.uploadedAt===iso_(meta.uploadedAt));
}
function privateSchoolServe_(group, fallback) {
  if(!privateSchoolRevision_(group)) return fallback();
  const supplement = {timetable:'pulledLessons',studentTimetable:'helpClassSchedules'}[group];
  let saved;
  try { saved=privateSchoolRead_(group); }
  catch (_) {
    if (supplement) throw Error('시간표의 추가 편성 자료를 확인하지 못했습니다. 잠시 뒤 다시 동기화해 주세요.');
    return fallback();
  }
  if (supplement && !Array.isArray(saved[supplement])) throw Error('시간표의 추가 편성 자료가 누락되었습니다. 관리자에게 동기화를 요청해 주세요.');
  if(privateSchoolVersionMatches_(saved,privateSchoolMetadata_(group))) return saved;
  const current=fallback();
  if(!current) return current;
  if(supplement) current[supplement]=saved[supplement];
  return current;
}
function privateSchoolValidateInput_(body) {
  function inspect(value){ if (!value || typeof value!=='object')return;Object.keys(value).forEach(function(key){if(/성적|원점수|성취도|석차|학생부|등급|^scores?$|^gradePoint/i.test(key))throw Error('성적 열이 포함된 자료는 공유할 수 없습니다.');inspect(value[key]);});}
  inspect(body.timetable || body.students || body.members);
}
function privateSchoolPublish_(group,data) {
  const props=PropertiesService.getScriptProperties();if(!props.getProperty('UNG_PRIVATE_REPO')) return;
  const previous=privateSchoolRevision_(group);
  const target=privateSchoolGit_('',true);
  if (target.private!==true) throw Error('학교 자료는 비공개 저장소에만 게시할 수 있습니다.');
  const file='/contents/school/'+group+'.json';
  const previousFile=previous ? privateSchoolGit_(file+'?ref='+previous,false) : null;
  const supplement = {timetable:'pulledLessons',studentTimetable:'helpClassSchedules'}[group];
  if(previous && supplement){
    const old=privateSchoolRead_(group);
    if(!Array.isArray(old[supplement])) throw Error('기존 시간표의 추가 편성 자료를 확인해 주세요.');
    data[supplement]=old[supplement];
  }
  privateSchoolValidateInput_({timetable:data});
  const content={message:'Update school '+group,content:Utilities.base64Encode(JSON.stringify(data),Utilities.Charset.UTF_8)};
  if(previousFile)content.sha=previousFile.sha;
  let receipt;
  try { receipt=privateSchoolGit_(file,true,content); }
  catch (error) {
    // The previous PUT may have committed before its response reached Apps Script.
    const head=privateSchoolGit_('/git/ref/heads/'+encodeURIComponent(target.default_branch),false).object.sha;
    const published=privateSchoolReadAt_(group,head);
    if(migrationHash_(published)!==migrationHash_(data)) throw error;
    receipt={commit:{sha:head}};
  }
  if(!receipt.commit || !/^[a-f0-9]{40}$/.test(receipt.commit.sha))throw Error('학교 자료 게시 결과를 확인할 수 없습니다.');
  props.setProperty('UNG_PRIVATE_REV_'+group,receipt.commit.sha);
}

function privateSchoolManifest_(){
  const manifest=getSyncManifest_();
  PRIVATE_SCHOOL_GROUPS_.forEach(function(group){
    const rev=privateSchoolRevision_(group);
    if(rev) manifest.resources[group]+=':'+rev;
  });
  return manifest;
}
function privateSchoolGroupForWrite_(action) {
  return {replaceStaffRoster:'staffRoster',replaceStudentRoster:'studentRoster',
    replaceTimetable:'timetable',replaceStudentTimetable:'studentTimetable'}[action] || '';
}
function privateSchoolReaders_() {
  return {staffRoster:getStaffRoster_,studentRoster:getStudentRoster_,timetable:getTimetable_,studentTimetable:getStudentTimetable_};
}
// The project owner runs this in the Apps Script editor after configuring
// repository credentials. It is never routed from a desktop or mobile request.
function activatePrivateSchoolConnection() {
  return migrationWithSourceLock_(function(){
    const props=PropertiesService.getScriptProperties(),config=migrationPrimaryConfig_();
    if(!config || config.phase!=='FIRESTORE') throw Error('운영 Firestore 자료 상태를 확인해 주세요.');
    const source=migrationPrimaryRepository_(config),root=migrationPrimaryRoot_(source,config);
    const staged=source.get('privateConnectionSetup/pending'),credentials=staged&&staged.data;
    const now=Date.now();
    if(credentials && (!(credentials.expiresAt>now && credentials.expiresAt<now+30*60000) ||
       !/^github_pat_[A-Za-z0-9_]{30,}$/.test(credentials.read || '') ||
       !/^github_pat_[A-Za-z0-9_]{30,}$/.test(credentials.write || '') ||
       credentials.read===credentials.write || !/^[A-Za-z0-9+/]{43}=$/.test(credentials.caseVerifier || ''))) {
      throw Error('서버 인증 등록 자료의 만료시간 또는 형식을 확인해 주세요.');
    }
    const repo=credentials?credentials.repo:props.getProperty('UNG_PRIVATE_REPO');
    const readerAccess=privateSchoolGit_('',false,null,credentials),writerAccess=privateSchoolGit_('',true,null,credentials);
    if(!readerAccess.private || !writerAccess.private || readerAccess.full_name!==repo || writerAccess.full_name!==repo) {
      throw Error('등록된 학교 자료 저장소가 비공개인지 확인해 주세요.');
    }
    const branch=readerAccess.default_branch;
    if(!/^[\w.-]+$/.test(branch || '')) throw Error('학교 자료 저장소의 기본 브랜치를 확인해 주세요.');
    const githubHead=function(){return privateSchoolGit_('/git/ref/heads/'+branch,false,null,credentials).object.sha;};
    const head=githubHead();
    if(!/^[a-f0-9]{40}$/.test(head || '')) throw Error('검증할 GitHub 자료 버전이 없습니다.');
    migrationWithBackend_(migrationPrimaryReader_(source,config,root),config.sourceBookId,false,function(){
      const readers=privateSchoolReaders_();
      PRIVATE_SCHOOL_GROUPS_.forEach(function(group){
        const copy=Object.assign({},privateSchoolReadAt_(group,head,credentials));
        if(group==='timetable') delete copy.pulledLessons;
        if(group==='studentTimetable') delete copy.helpClassSchedules;
        if(migrationHash_(copy)!==migrationHash_(readers[group]())) throw Error('운영 자료와 대조가 필요한 항목: '+group);
      });
    });
    if(githubHead()!==head) throw Error('검증 중 GitHub 자료가 바뀌었습니다. 다시 확인해 주세요.');
    if(PRIVATE_SCHOOL_GROUPS_.some(function(group){return props.getProperty('UNG_PRIVATE_REV_'+group);})) {
      throw Error('이미 개별 버전이 반영되었습니다. 최초 연결 설정을 다시 적용할 수 없습니다.');
    }
    const updates={UNG_PRIVATE_ACTIVE_COMMIT:head};
    if(credentials){
      updates.UNG_PRIVATE_REPO=repo;
      updates.UNG_PRIVATE_READ_TOKEN=credentials.read;
      updates.UNG_PRIVATE_WRITE_TOKEN=credentials.write;
      if(!props.getProperty('UNG_CASE_PIN_HASH')) updates.UNG_CASE_PIN_HASH=credentials.caseVerifier;
    }
    props.setProperties(updates,false);
    return {revision:head,groups:PRIVATE_SCHOOL_GROUPS_.length};
  });
}
function privateSchoolMirrorAfterWrite_(repo,config,body,response) {
  const group=privateSchoolGroupForWrite_(body.action);
  if(!group || !privateSchoolRevision_(group)) return;
  // An external Git commit must follow the durable Firestore commit and receipt.
  // If GitHub is unavailable, serve the current Firestore version. Retrying the
  // same operation can publish it without performing the administrative write twice.
  try {
    const committed=JSON.parse(response.getContent());
    if(!committed.ok || !committed.data) return;
    const current=migrationWithBackend_(migrationPrimaryReader_(repo,config),config.sourceBookId,false,function(){
      return privateSchoolReaders_()[group]();
    }).response;
    if(!privateSchoolVersionMatches_(current,committed.data)) return;
    privateSchoolSyncCurrent_(group,current);
  } catch (_) {
    // Keep the successful source receipt even during a Script Properties outage.
    // Status compares the last confirmed source version on its next read.
    try { privateSchoolRecordMirror_(group,'pending',null); } catch (propertyError) {}
  }
}

function privateSchoolRecordMirror_(group,state,data) {
  const status={state:state,checkedAt:new Date().toISOString(),version:data ? data.version : null,uploadedAt:data ? data.uploadedAt : null};
  PropertiesService.getScriptProperties().setProperty('UNG_PRIVATE_MIRROR_'+group,JSON.stringify(status));
}

function privateSchoolSyncCurrent_(group,current,verifyContents) {
  if(!current) throw Error('동기화할 운영 원본을 확인할 수 없습니다.');
  const copy=privateSchoolRead_(group);
  const supplement={timetable:'pulledLessons',studentTimetable:'helpClassSchedules'}[group];
  if(supplement && !Array.isArray(copy[supplement])) throw Error('시간표의 추가 편성 자료를 확인해 주세요.');
  let matches=privateSchoolVersionMatches_(copy,current);
  if(matches && verifyContents) {
    const comparable=Object.assign({},copy);
    if(supplement) delete comparable[supplement];
    matches=migrationHash_(comparable)===migrationHash_(current);
  }
  if(!matches) privateSchoolPublish_(group,current);
  privateSchoolRecordMirror_(group,'current',current);
}

function privateSchoolMirrorStatus_(body) {
  requireAdmin_(body.adminPassword);
  const props=PropertiesService.getScriptProperties();
  return PRIVATE_SCHOOL_GROUPS_.map(function(group) {
    if(!privateSchoolRevision_(group)) return {group:group,state:'disabled'};
    const saved=JSON.parse(props.getProperty('UNG_PRIVATE_MIRROR_'+group) || 'null');
    const state=!saved ? 'unchecked' : saved.state==='current' && privateSchoolVersionMatches_(saved,privateSchoolMetadata_(group)) ? 'current' : 'pending';
    return {group:group,state:state,checkedAt:saved && saved.checkedAt};
  });
}

function privateSchoolRetryMirror_(body) {
  requireAdmin_(body.adminPassword);
  const group=body.group;
  if(PRIVATE_SCHOOL_GROUPS_.indexOf(group)<0) throw Error('허용되지 않은 자료입니다.');
  return migrationWithSourceLock_(function() {
    const config=migrationPrimaryConfig_();
    if(!config || config.phase!=='FIRESTORE' || !privateSchoolRevision_(group)) throw Error('비공개 저장소와 운영 원본의 연결을 확인해 주세요.');
    const repo=migrationPrimaryRepository_(config);
    const current=migrationWithBackend_(migrationPrimaryReader_(repo,config),config.sourceBookId,false,function(){
      staffRequire_(body);
      requireAdmin_(body.adminPassword);
      return privateSchoolReaders_()[group]();
    }).response;
    try { privateSchoolSyncCurrent_(group,current,true); return {state:'current'}; }
    catch (_) { privateSchoolRecordMirror_(group,'pending',null); return {state:'pending'}; }
  });
}
function privateSchoolRoute_(action,body){
  if(action==='getSyncManifest')return {data:privateSchoolManifest_()};
  const match=/^(get|replace)(StaffRoster|StudentRoster|StudentTimetable|Timetable)$/.exec(action);
  if(!match)return null;
  const group=match[2][0].toLowerCase()+match[2].slice(1);
  if(!privateSchoolRevision_(group)) return null;
  if(match[1]==='get') return {data:privateSchoolServe_(group,privateSchoolReaders_()[group])};
  requireAdmin_(body.adminPassword);
  privateSchoolValidateInput_(body);
  return null;
}
