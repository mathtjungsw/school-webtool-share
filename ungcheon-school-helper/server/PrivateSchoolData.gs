// Server-only opt-in for the isolated trial. The active revision is an immutable commit.
const PRIVATE_SCHOOL_GROUPS_ = ['staffRoster','studentRoster','timetable','studentTimetable'];
function privateSchoolRevision_(group) {
  if (PRIVATE_SCHOOL_GROUPS_.indexOf(group)<0) throw Error('허용되지 않은 자료입니다.');
  const props=PropertiesService.getScriptProperties();
  return props.getProperty('UNG_PRIVATE_REPO') ? props.getProperty('UNG_PRIVATE_REV_'+group) || '' : '';
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
  const rev=privateSchoolRevision_(group);if(!/^[0-9a-f]{40}$/.test(rev)) throw Error('학교 자료 버전이 올바르지 않습니다.');
  const cache=CacheService.getScriptCache(),key='private-school:'+group+':'+rev;
  const saved=cache.get(key);if(saved) return JSON.parse(saved);
  const blob=privateSchoolGit_('/contents/school/'+group+'.json?ref='+rev,false);
  const payload=(blob.content && blob.encoding==='base64') ? blob : privateSchoolGit_('/git/blobs/'+blob.sha,false);
  const raw=Utilities.newBlob(Utilities.base64Decode(payload.content.replace(/\s/g,''))).getDataAsString('UTF-8');
  if(raw.length<23000) cache.put(key,raw,300);
  return JSON.parse(raw);
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
  PRIVATE_SCHOOL_GROUPS_.forEach(function(group){const rev=privateSchoolRevision_(group);if(rev)manifest.resources[group]=rev;});
  return manifest;
}
function privateSchoolRoute_(action,body){
  if(action==='getSyncManifest')return {data:privateSchoolManifest_()};
  const match=/^(get|replace)(StaffRoster|StudentRoster|StudentTimetable|Timetable)$/.exec(action);
  if(!match)return null;
  const group=match[2][0].toLowerCase()+match[2].slice(1);
  if(match[1]==='get')return privateSchoolRevision_(group)?{data:privateSchoolRead_(group)}:null;
  requireAdmin_(body.adminPassword);privateSchoolValidateInput_(body);
  const readers={staffRoster:getStaffRoster_,studentRoster:getStudentRoster_,timetable:getTimetable_,studentTimetable:getStudentTimetable_};
  const writers={staffRoster:replaceStaffRoster_,studentRoster:replaceStudentRoster_,timetable:replaceTimetable_,studentTimetable:replaceStudentTimetable_};
  const result=writers[group](body),lock=sourceLock_();lock.waitLock(30000);
  try {
    const data=readers[group]();if(data.version!==result.version || data.uploadedAt!==result.uploadedAt)throw Error('다른 관리자가 자료를 갱신했습니다. 최신 버전을 확인해 주세요.');
    privateSchoolPublish_(group,data);
  }finally{lock.releaseLock();}
  return {data:result};
}
