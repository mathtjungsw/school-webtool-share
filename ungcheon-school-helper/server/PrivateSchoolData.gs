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
function privateSchoolGit_(endpoint, writer, content) {
  const props=PropertiesService.getScriptProperties(), repo=props.getProperty('UNG_PRIVATE_REPO');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('비공개 학교 저장소 설정을 확인해 주세요.');
  const token=props.getProperty(writer?'UNG_PRIVATE_WRITE_TOKEN':'UNG_PRIVATE_READ_TOKEN');
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
function privateSchoolReadAt_(group,rev) {
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
  const blob=privateSchoolGit_('/contents/school/'+group+'.json?ref='+rev,false);
  const payload=(blob.content && blob.encoding==='base64') ? blob : privateSchoolGit_('/git/blobs/'+blob.sha,false);
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
  let saved;
  try { saved=privateSchoolRead_(group); }
  catch (_) { return fallback(); }
  if(privateSchoolVersionMatches_(saved,privateSchoolMetadata_(group))) return saved;
  const current=fallback();
  if(!current) return current;
  if(group==='timetable' && Array.isArray(saved.pulledLessons)) current.pulledLessons=saved.pulledLessons;
  if(group==='studentTimetable' && Array.isArray(saved.helpClassSchedules)) current.helpClassSchedules=saved.helpClassSchedules;
  return current;
}
function privateSchoolValidateInput_(body) {
  function inspect(value){ if (!value || typeof value!=='object')return;Object.keys(value).forEach(function(key){if(/성적|원점수|성취도|석차|학생부|등급|^scores?$|^gradePoint/i.test(key))throw Error('성적 열이 포함된 자료는 공유할 수 없습니다.');inspect(value[key]);});}
  inspect(body.timetable || body.students || body.members);
}
function privateSchoolPublish_(group,data) {
  const props=PropertiesService.getScriptProperties();if(!props.getProperty('UNG_PRIVATE_REPO')) return;
  const previous=privateSchoolRevision_(group);
  if (privateSchoolGit_('',true).private!==true) throw Error('학교 자료는 비공개 저장소에만 게시할 수 있습니다.');
  const file='/contents/school/'+group+'.json';
  const previousFile=previous ? privateSchoolGit_(file+'?ref='+previous,false) : null;
  if(previous && (group==='timetable'||group==='studentTimetable')){const old=privateSchoolRead_(group);for(const prop of ['pulledLessons','helpClassSchedules'])if(old[prop] && !data[prop])data[prop]=old[prop];}
  privateSchoolValidateInput_({timetable:data});
  const content={message:'Update school '+group,content:Utilities.base64Encode(JSON.stringify(data),Utilities.Charset.UTF_8)};
  if(previousFile)content.sha=previousFile.sha;
  const receipt=privateSchoolGit_(file,true,content);
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
    const props=PropertiesService.getScriptProperties(),repo=props.getProperty('UNG_PRIVATE_REPO');
    const readerAccess=privateSchoolGit_('',false),writerAccess=privateSchoolGit_('',true);
    if(!readerAccess.private || !writerAccess.private || readerAccess.full_name!==repo || writerAccess.full_name!==repo) {
      throw Error('등록된 학교 자료 저장소가 비공개인지 확인해 주세요.');
    }
    const branch=readerAccess.default_branch;
    if(!/^[\w.-]+$/.test(branch || '')) throw Error('학교 자료 저장소의 기본 브랜치를 확인해 주세요.');
    const githubHead=function(){return privateSchoolGit_('/git/ref/heads/'+branch,false).object.sha;};
    const head=githubHead();
    if(!/^[a-f0-9]{40}$/.test(head || '')) throw Error('검증할 GitHub 자료 버전이 없습니다.');
    const config=migrationPrimaryConfig_();
    if(!config || config.phase!=='FIRESTORE') throw Error('운영 Firestore 자료 상태를 확인해 주세요.');
    const source=migrationPrimaryRepository_(config),root=migrationPrimaryRoot_(source,config);
    migrationWithBackend_(migrationPrimaryReader_(source,config,root),config.sourceBookId,false,function(){
      const readers=privateSchoolReaders_();
      PRIVATE_SCHOOL_GROUPS_.forEach(function(group){
        const copy=Object.assign({},privateSchoolReadAt_(group,head));
        if(group==='timetable') delete copy.pulledLessons;
        if(group==='studentTimetable') delete copy.helpClassSchedules;
        if(migrationHash_(copy)!==migrationHash_(readers[group]())) throw Error('운영 자료와 대조가 필요한 항목: '+group);
      });
    });
    if(githubHead()!==head) throw Error('검증 중 GitHub 자료가 바뀌었습니다. 다시 확인해 주세요.');
    if(PRIVATE_SCHOOL_GROUPS_.some(function(group){return props.getProperty('UNG_PRIVATE_REV_'+group);})) {
      throw Error('이미 개별 버전이 반영되었습니다. 최초 연결 설정을 다시 적용할 수 없습니다.');
    }
    props.setProperty('UNG_PRIVATE_ACTIVE_COMMIT',head);
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
    if(privateSchoolVersionMatches_(privateSchoolRead_(group),current)) return;
    privateSchoolPublish_(group,current);
  } catch (_) {}
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
