/** The source is edited only through this app. Successful schema/one-off repair
 * work is reusable until the server version or workbook changes. Failed work is
 * never cached. This cache contains only a digest, no source data or credentials. */
function migrationSchemaKey_(kind) {
  if(['ALL','CHECKLISTS'].indexOf(kind)<0)throw migrationError_('MIGRATION_INVALID_SCHEMA_KIND');
  return 'UNG_MIGRATION_SCHEMA_'+kind+'_V1';
}
function migrationSchemaReady_(book,version,kind) {
  return PropertiesService.getScriptProperties().getProperty(migrationSchemaKey_(kind))===migrationHash_([book.getId(),version]);
}
function migrationRememberSchema_(book,version,kind) {
  var props=PropertiesService.getScriptProperties(),signature=migrationHash_([book.getId(),version]);
  props.setProperty(migrationSchemaKey_(kind),signature);
  if(kind==='ALL')props.setProperty(migrationSchemaKey_('CHECKLISTS'),signature);
}
