/** Server-only REST adapter. No network calls or scope changes at module load. */
function migrationError_(code, retryable) {
  var error = new Error(code);
  error.code = code;
  error.retryable = !!retryable;
  return error;
}

function migrationTransportError_(error) {
  var message = String(error && error.message || '');
  if (/one day|daily quota|daily limit/i.test(message)) return migrationError_('MIGRATION_URLFETCH_DAILY_QUOTA');
  if (/not permitted by your admin|blocked by your administrator/i.test(message)) return migrationError_('MIGRATION_URLFETCH_ADMIN_BLOCK');
  if (/authorization is required|do not have permission to call|insufficient authentication scopes/i.test(message)) return migrationError_('MIGRATION_URLFETCH_AUTHORIZATION_REQUIRED');
  if (/timed out|timeout/i.test(message)) return migrationError_('MIGRATION_URLFETCH_TIMEOUT', true);
  if (/address unavailable|dns|could not resolve host/i.test(message)) return migrationError_('MIGRATION_URLFETCH_ADDRESS_UNAVAILABLE', true);
  return migrationError_('MIGRATION_TRANSPORT_FAILED', true);
}

function migrationCanonical_(value) {
  if (value === null) return 'null';
  if (value instanceof Date) {
    if (!isFinite(value.getTime())) throw migrationError_('MIGRATION_INVALID_DATE');
    return 'timestamp:' + JSON.stringify(value.toISOString());
  }
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value + ':' + JSON.stringify(value);
  if (typeof value === 'number') {
    if (!isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw migrationError_('MIGRATION_INVALID_NUMBER');
    return 'number:' + JSON.stringify(value);
  }
  if (Array.isArray(value)) return 'array:[' + value.map(migrationCanonical_).join(',') + ']';
  if (value && Object.prototype.toString.call(value) === '[object Object]') {
    return 'object:{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + migrationCanonical_(value[key]);
    }).join(',') + '}';
  }
  throw migrationError_('MIGRATION_UNSUPPORTED_VALUE');
}

function migrationHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, migrationCanonical_(value), Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function migrationEncode_(value, depth) {
  depth = depth || 0;
  if (depth > 18) throw migrationError_('MIGRATION_DOCUMENT_TOO_DEEP');
  if (value === null) return { nullValue: null };
  if (value instanceof Date) {
    migrationCanonical_(value);
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    migrationCanonical_(value);
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(function(item) {
    if (Array.isArray(item)) throw migrationError_('MIGRATION_NESTED_ARRAY');
    return migrationEncode_(item, depth + 1);
  }) } };
  if (value && Object.prototype.toString.call(value) === '[object Object]') {
    var fields = Object.create(null);
    Object.keys(value).forEach(function(key) { fields[key] = migrationEncode_(value[key], depth + 1); });
    return { mapValue: { fields: fields } };
  }
  throw migrationError_('MIGRATION_UNSUPPORTED_VALUE');
}

function migrationDecode_(value) {
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value || 'doubleValue' in value) {
    var number = Number('integerValue' in value ? value.integerValue : value.doubleValue);
    migrationCanonical_(number);
    return number;
  }
  if (value.arrayValue) return (value.arrayValue.values || []).map(migrationDecode_);
  if (value.mapValue) {
    var object = Object.create(null);
    Object.keys(value.mapValue.fields || {}).forEach(function(key) { object[key] = migrationDecode_(value.mapValue.fields[key]); });
    return object;
  }
  throw migrationError_('MIGRATION_UNSUPPORTED_FIRESTORE_VALUE');
}

function migrationRepository_(config, transport) {
  if (!config || config.enabled !== true) throw migrationError_('MIGRATION_CONNECTION_DISABLED');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId || '') || !/^[a-z0-9-]{1,64}$/.test(config.schoolId || '')) throw migrationError_('MIGRATION_INVALID_CONFIG');
  var emulator = config.environment === 'EMULATOR';
  if (emulator && (!/^demo-/.test(config.projectId) || typeof transport !== 'function')) throw migrationError_('MIGRATION_EMULATOR_ONLY');
  if (!emulator && (!(config.environment === 'MIRROR' && config.sourceOfTruth === 'SHEETS' || config.environment === 'PRIMARY' && config.sourceOfTruth === 'FIRESTORE') || transport)) throw migrationError_('MIGRATION_INVALID_CONFIG');
  var root = 'projects/' + config.projectId + '/databases/(default)/documents';
  var prefix = 'schools/' + config.schoolId + '/';
  var globalOrigin = 'https://firestore.googleapis.com';
  var origin = emulator ? 'http://127.0.0.1:8185' : globalOrigin;
  if (config.projectId === 'ungcheon-school-helper') origin = 'https://firestore.asia-northeast3.rep.googleapis.com';
  var metrics = { requests: 0, documentsRead: 0, documentsWritten: 0 };

  function documentName(path, collection) {
    var parts = String(path).split('/');
    if (parts.some(function(part) { return !/^[A-Za-z0-9_-]{1,128}$/.test(part); }) || parts.length % 2 !== (collection ? 1 : 0)) throw migrationError_('MIGRATION_INVALID_PATH');
    return root + '/' + prefix + path;
  }
  function fetchResponse(host, method, suffix, body) {
    metrics.requests++;
    if (transport) return transport(method, host + '/v1/' + root + suffix, body);
    var options = { method: method, muteHttpExceptions: true, followRedirects: false, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    var fetched = UrlFetchApp.fetch(host + '/v1/' + root + suffix, options);
    return { status: fetched.getResponseCode(), text: fetched.getContentText() };
  }

  function request(method, suffix, body, allowMissing) {
    var response;
    try {
      response = fetchResponse(origin, method, suffix, body);
    } catch (error) {
      var failure = migrationTransportError_(error);
      var readOnly = method === 'get' || suffix === ':batchGet';
      if (!failure.retryable || config.projectId !== 'ungcheon-school-helper' || origin === globalOrigin || !readOnly) throw failure;
      try {
        response = fetchResponse(globalOrigin, method, suffix, body);
        // Retain the working host for the remainder of this repository instance.
        if (response.status >= 200 && response.status < 300 || response.status === 404 && allowMissing) origin = globalOrigin;
      } catch (fallbackError) { throw migrationTransportError_(fallbackError); }
    }
    if (response.status === 404 && allowMissing) return null;
    if (response.status < 200 || response.status >= 300) {
      var code = response.status === 409 || response.status === 412 ? 'CONFLICT' : response.status === 401 || response.status === 403 ? 'PERMISSION_DENIED' : 'HTTP_' + response.status;
      throw migrationError_('MIGRATION_FIRESTORE_' + code, response.status === 408 || response.status === 429 || response.status >= 500);
    }
    try { return JSON.parse(response.text || '{}'); }
    catch (error) { throw migrationError_('MIGRATION_INVALID_RESPONSE', true); }
  }
  function decodeDocument(document) {
    if (typeof document.name !== 'string' || document.name.indexOf(root + '/' + prefix) !== 0 || typeof document.updateTime !== 'string') throw migrationError_('MIGRATION_INVALID_RESPONSE');
    metrics.documentsRead++;
    return { path: document.name.slice((root + '/' + prefix).length), data: migrationDecode_({ mapValue: { fields: document.fields || {} } }), updateTime: document.updateTime };
  }
  return {
    metrics: metrics,
    get: function(path) {
      var result = request('get', '/' + documentName(path).slice(root.length + 1), null, true);
      return result ? decodeDocument(result) : null;
    },
    batchGet: function(paths) {
      if (!Array.isArray(paths) || !paths.length || paths.length>100 || paths.some(function(path,i){return paths.indexOf(path)!==i;})) throw migrationError_('MIGRATION_BATCH_LIMIT');
      var names=paths.map(function(path){return documentName(path);}),result=request('post',':batchGet',{documents:names}),found=Object.create(null);
      if (!Array.isArray(result)) throw migrationError_('MIGRATION_INVALID_RESPONSE');
      result.forEach(function(item){
        var name=item.found && item.found.name || item.missing;
        if (names.indexOf(name)<0 || Object.prototype.hasOwnProperty.call(found,name) || (!!item.found===!!item.missing)) throw migrationError_('MIGRATION_INVALID_RESPONSE');
        found[name]=item.found?decodeDocument(item.found):null;
      });
      if (Object.keys(found).length!==names.length) throw migrationError_('MIGRATION_INVALID_RESPONSE');
      return names.map(function(name){return found[name];});
    },
    list: function(path, pageToken) {
      var suffix = '/' + documentName(path, true).slice(root.length + 1) + '?pageSize=100';
      if (pageToken) suffix += '&pageToken=' + encodeURIComponent(pageToken);
      var result = request('get', suffix);
      return { documents: (result.documents || []).map(decodeDocument), nextPageToken: result.nextPageToken || '' };
    },
    commit: function(writes) {
      if (!Array.isArray(writes) || !writes.length || writes.length > 101) throw migrationError_('MIGRATION_BATCH_LIMIT');
      var payload = { writes: writes.map(function(write) {
        var fields = migrationEncode_(write.data).mapValue.fields;
        if (Utilities.newBlob(JSON.stringify(fields)).getBytes().length > 850000) throw migrationError_('MIGRATION_DOCUMENT_TOO_LARGE');
        var result = { update: { name: documentName(write.path), fields: fields } };
        if (write.updateTime) result.currentDocument = { updateTime: write.updateTime };
        else if (write.createOnly === true) result.currentDocument = { exists: false };
        else throw migrationError_('MIGRATION_PRECONDITION_REQUIRED');
        return result;
      }) };
      if (Utilities.newBlob(JSON.stringify(payload)).getBytes().length > 8000000) throw migrationError_('MIGRATION_REQUEST_TOO_LARGE');
      var result = request('post', ':commit', payload);
      metrics.documentsWritten += writes.length;
      return result;
    }
  };
}
