import ts from 'typescript';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const hooks=new Set(['useState','useReducer']);
function literals(node,values=new Set()) {
  if(!node)return [];
  if(ts.isStringLiteral(node))values.add(node.text);
  ts.forEachChild(node,child=>{literals(child,values);});
  return [...values];
}
function enclosingName(node) {
  for(let p=node.parent;p;p=p.parent){
    if(ts.isFunctionDeclaration(p)&&p.name)return p.name.text;
    if((ts.isArrowFunction(p)||ts.isFunctionExpression(p))&&ts.isVariableDeclaration(p.parent)&&ts.isIdentifier(p.parent.name))return p.parent.name.text;
  }
  return 'module';
}
/** Static candidates, never a proof that every state is reachable or safe. */
export function inspectStateSource(file,text) {
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const state=[],contracts=[],guards=[],imperative=[],external=[],native=[];
  const lineOf=node=>source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
  const nameOf=node=>ts.isIdentifier(node)?node.text:ts.isPropertyAccessExpression(node)?node.name.text:'';
  function walk(node){
    if(ts.isCallExpression(node)&&['useSearchParams','useSession','useSyncExternalStore','usePathname'].includes(nameOf(node.expression)))external.push({owner:enclosingName(node),hook:nameOf(node.expression),line:lineOf(node)});
    if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&['details','dialog','select','UiSelect'].includes(node.tagName.getText(source)))native.push({owner:enclosingName(node),component:node.tagName.getText(source),line:lineOf(node)});
    if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&hooks.has(nameOf(node.initializer.expression))){
      const call=node.initializer,name=node.name.elements[0]?.name?.getText(source),setter=node.name.elements[1]?.name?.getText(source);
      const initial=call.arguments[0],type=call.typeArguments?.[0];
      const boolean=initial?.kind===ts.SyntaxKind.TrueKeyword||initial?.kind===ts.SyntaxKind.FalseKeyword;
      const typedStates=literals(type);
      state.push({line:lineOf(node),owner:enclosingName(node),name,setter,hook:nameOf(call.expression),kind:boolean?'boolean-region':typedStates.length?'explicit-domain':'data-or-selection',domain:typedStates});
    }
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&nameOf(node.initializer.expression)==='useRef'&&/(pending|flight|mounted|owner|request|controller|epoch|revision|active|operation)/i.test(node.name.text))imperative.push({owner:enclosingName(node),name:node.name.text,kind:'imperative-operation-or-identity-guard'});
    if(ts.isPropertySignature(node)&&node.type&&/^(state|status|phase|stage|mode)$/.test(node.name.getText(source).replaceAll(/['"]/g,''))){
      const values=literals(node.type);if(values.length){let parent=node.parent;while(parent&&!ts.isTypeAliasDeclaration(parent)&&!ts.isInterfaceDeclaration(parent))parent=parent.parent;contracts.push({name:`${parent?.name?.text??enclosingName(node)}.${node.name.getText(source)}`,values});}
    }
    if(ts.isTypeAliasDeclaration(node)&&/(State|Status|Phase|Stage|Mode|Action|Event)$/.test(node.name.text)){
      const domain=literals(node.type);if(domain.length)contracts.push({name:node.name.text,values:domain});
    }
    if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateExpression(node))&&/\b(?:UPDATE|INSERT|SELECT)\b/i.test(node.getText(source))&&/\b(?:status|state|phase|reserved|revision|deleted_at)\b/.test(node.getText(source))){
      guards.push({owner:enclosingName(node),kind:'persistent-lifecycle-or-concurrency-guard'});
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
  return {file,external,native,vendored:/\/(bencho|ui\/rare-)/.test(file),state,contracts,imperative,guards:[...new Map(guards.map(g=>[g.owner,g])).values()]};
}
export async function auditStateMachines(root=process.cwd()) {
  const files=[];
  async function collect(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=resolve(dir,entry.name);if(entry.isDirectory())await collect(path);else if(/\.(tsx?|mjs|sql)$/.test(entry.name))files.push(path);}}
  for(const dir of ['src','workers','migrations','analytics-migrations'])await collect(resolve(root,dir));
  const reports=[];
  for(const file of files){
    const name=relative(root,file).replaceAll('\\','/'),text=await readFile(file,'utf8');
    const report=file.endsWith('.sql')?{file:name,vendored:false,state:[],contracts:[],imperative:[],external:[],native:[],guards:[...text.matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map(match=>({owner:match[1],kind:'database-trigger'}))}:inspectStateSource(name,text);
    if(report.state.length||report.contracts.length||report.guards.length||report.imperative.length||report.external.length||report.native.length)reports.push(report);
  }
  return {format:'folio-state-candidates-v1',scope:['src','workers','migrations','analytics-migrations'],limitations:['Static candidates require semantic review. Independent booleans are not automatically invalid.','Input values and selections are context, not automatically lifecycle states.','Dynamic dependencies, SQL trigger behavior, aliased hooks, provider internals and runtime reachability are not proven by this scan.','No credentials, local state, runtime records or provider calls are read.'],summary:{filesScanned:files.length,filesWithSignals:reports.length,hookSlots:reports.reduce((n,r)=>n+r.state.length,0),booleanRegions:reports.reduce((n,r)=>n+r.state.filter(s=>s.kind==='boolean-region').length,0),explicitContracts:reports.reduce((n,r)=>n+r.contracts.length,0),imperativeGuards:reports.reduce((n,r)=>n+r.imperative.length,0),externalSubscriptions:reports.reduce((n,r)=>n+r.external.length,0),nativeOrLibraryControls:reports.reduce((n,r)=>n+r.native.length,0),persistentGuards:reports.reduce((n,r)=>n+r.guards.length,0)},files:reports};
}
async function main(){const report=await auditStateMachines();if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(report,null,2)+'\n');else{console.log('Folio state-machine candidates (static scan; see docs/STATE-MACHINES.md)');console.log(JSON.stringify(report.summary,null,2));for(const file of report.files)console.log(`${file.file}: ${file.state.length} hook slots, ${file.contracts.length} contracts, ${file.guards.length} persistent guards`);}}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)void main().catch(error=>{console.error(error.message);process.exitCode=1;});
