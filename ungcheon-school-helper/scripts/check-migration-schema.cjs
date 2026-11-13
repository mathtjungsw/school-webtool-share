'use strict'
const assert=require('node:assert/strict'),vm=require('node:vm'),{fixture}=require('./migration-tracking-fixture.cjs')
const f=fixture(),version=vm.runInContext('MOBILE_SERVICE_VERSION',f.ctx)
assert.equal(f.ctx.migrationSchemaReady_(f.book,version,'ALL'),true)
assert.equal(f.ctx.migrationSchemaReady_(f.book,version,'CHECKLISTS'),true)
f.book.events.length=0;f.ctx.ensureSheets_();f.ctx.ensureStaffChecklistSheets_();assert.equal(f.book.events.length,0)
assert.equal(f.ctx.migrationSchemaReady_(f.book,version+1,'ALL'),false)
assert.equal(f.ctx.migrationSchemaReady_({getId:()=>'another-book'},version,'ALL'),false)
f.properties.delete('UNG_MIGRATION_SCHEMA_ALL_V1');f.properties.delete('UNG_MIGRATION_SCHEMA_CHECKLISTS_V1')
f.ctx.ensureReleaseNotices_=()=>{throw Error('synthetic late initialization failure')}
assert.throws(()=>f.ctx.ensureSheets_());assert.equal(f.ctx.migrationSchemaReady_(f.book,version,'ALL'),false);assert.equal(f.ctx.migrationSchemaReady_(f.book,version,'CHECKLISTS'),false)
f.ctx.ensureReleaseNotices_=()=>{};f.ctx.ensureSheets_();assert.equal(f.ctx.migrationSchemaReady_(f.book,version,'ALL'),true)
f.enable();f.book.events.length=0
assert.equal(f.post({action:'addLink',operationId:'synthetic-cached-schema-write',title:'Synthetic',url:'https://example.com',department:'Test'}).ok,true)
assert.equal(f.book.events.some(e=>e.sheet==='NEIS학급시간표'),false);assert.equal(f.journal().length,1)
console.log('Migration schema: workbook/version isolation, no repeated table reads, failed initialization retry and tracked real writes passed.')
