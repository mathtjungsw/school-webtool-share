'use strict'
// In-memory SpreadsheetApp contract used for fault injection. Synthetic data only.
function makeBook(id='synthetic-book') {
  const sheets=new Map(),events=[];let fail=null,nextSheetId=1
  const copy=v=>v instanceof Date?new Date(v):Array.isArray(v)?v.map(copy):v
  function point(kind,sheet){events.push({kind,sheet});if(fail&&fail(kind,sheet))throw Error('injected storage failure')}
  function sheet(name){
    let values=[],formats=[],formulas=[],maxRows=1000,maxCols=100,frozen=0,hidden=false;const sid=nextSheetId++
    function cell(matrix,r,c,fallback=''){return matrix[r-1]?.[c-1]??fallback}
    function assign(matrix,r,c,v){while(matrix.length<r)matrix.push([]);matrix[r-1][c-1]=copy(v)}
    function bounds(args){
      if(typeof args[0]==='number')return [args[0],args[1],args[2]??1,args[3]??1]
      const text=args[0],m=/^([A-Z]+)(\d*)?(?::([A-Z]+)(\d*)?)?$/.exec(text)
      if(!m)throw Error('unsupported fixture range')
      const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)
      const row=Number(m[2]||1),last=Number(m[4]||(m[3]?maxRows:row))
      return [row,col(m[1]),last-row+1,col(m[3]||m[1])-col(m[1])+1]
    }
    function range(...args){
      const [r,c,nr,nc]=bounds(args);if(r<1||c<1||nr<1||nc<1||r+nr-1>maxRows||c+nc-1>maxCols)throw Error('range out of bounds')
      const matrix=(data,empty='')=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>copy(cell(data,r+i,c+j,empty))))
      const target={
        getRow:()=>r,getColumn:()=>c,getNumRows:()=>nr,getNumColumns:()=>nc,
        getValues(){point('read-values',name);Object.assign(events[events.length-1],{row:r,rows:nr,columns:nc});return matrix(values)},getDisplayValues:()=>matrix(values).map(row=>row.map(v=>typeof v==='boolean'?(v?'TRUE':'FALSE'):String(v))),
        getFormulas:()=>matrix(formulas),getNumberFormats:()=>matrix(formats,'General'),
        setValues(data){if(data.length!==nr||data.some(row=>row.length!==nc))throw Error('shape mismatch');point('before-write',name);for(let i=0;i<nr;i++)for(let j=0;j<nc;j++){assign(values,r+i,c+j,data[i][j]);assign(formulas,r+i,c+j,typeof data[i][j]==='string'&&data[i][j].startsWith('=')?data[i][j]:'')}point('after-write',name);return target},
        setValue(v){return target.setValues(Array.from({length:nr},()=>Array(nc).fill(v)))},
        clearContent(){return target.setValues(Array.from({length:nr},()=>Array(nc).fill('')))},clearContents(){return target.clearContent()},
        setNumberFormat(v){point('before-format',name);for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)assign(formats,r+i,c+j,v);return target},
        setNumberFormats(data){point('before-format',name);for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)assign(formats,r+i,c+j,data[i][j]);return target},
        createTextFinder(key){const options={};const finder={matchEntireCell(v){options.entire=v;return finder},matchCase(v){options.case=v;return finder},useRegularExpression(v){options.regex=v;return finder},findAll(){if(!options.entire||!options.case||options.regex)throw Error('unsafe finder');const found=[];for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)if(String(cell(values,r+i,c+j))===key)found.push(range(r+i,c+j));return found}};return finder},
      };return target
    }
    const result={
      getName:()=>name,getSheetId:()=>sid,getMaxRows:()=>maxRows,getMaxColumns:()=>maxCols,getFrozenRows:()=>frozen,
      getLastRow:()=>values.reduce((last,row,index)=>row.some(v=>v!==''&&v!==undefined&&v!==null)?index+1:last,0),
      getLastColumn:()=>values.reduce((last,row)=>Math.max(last,row.reduce((end,v,index)=>v!==''&&v!==undefined&&v!==null?index+1:end,0)),0),
      getRange:range,getDataRange:()=>range(1,1,Math.max(1,result.getLastRow()),Math.max(1,result.getLastColumn())),
      appendRow(row){range(result.getLastRow()+1,1,1,row.length).setValues([row]);return result},
      insertRowsAfter(_,n){maxRows+=n;return result},insertColumnsAfter(_,n){maxCols+=n;return result},setFrozenRows(n){frozen=n;return result},
      hideSheet(){hidden=true;return result},isSheetHidden:()=>hidden,
      deleteRow(r){point('before-delete',name);values.splice(r-1,1);formats.splice(r-1,1);formulas.splice(r-1,1);return result},
      deleteRows(r,n){for(let i=0;i<n;i++)result.deleteRow(r);return result},
      copyTo(destination){const other=destination.insertSheet('Copy of '+name);if(result.getLastRow())other.getRange(1,1,result.getLastRow(),result.getLastColumn()).setValues(result.getDataRange().getValues());return other},
      setName(next){sheets.delete(name);name=next;sheets.set(name,result);return result},
    };return result
  }
  const book={getId:()=>id,getSheetByName:n=>sheets.get(n)||null,getSheets:()=>[...sheets.values()],insertSheet(n){if(sheets.has(n))throw Error('duplicate sheet');point('insert-sheet',n);const s=sheet(n);sheets.set(n,s);return s},events,setFault:f=>{fail=f},flush(){point('flush','')}}
  return book
}
module.exports={makeBook}
