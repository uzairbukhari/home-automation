/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),env={DASHBOARD_OWNER_EMAIL:'owner@example.com'},auth={user:{userId:'alice'}},afterTasks=[];
const original=Module._resolveFilename,load=Module._load;
Module._resolveFilename=function(name,parent,...args){return original.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
Module._load=function(name,...args){return name==='next/server'?{after:task=>afterTasks.push(task)}:name==='cloudflare:workers'?{env}:name==='@/app/session-auth'?{getSessionUser:async()=>auth.user?{email:'owner@example.com',...auth.user}:null,signInPath:to=>`/login?return_to=${encodeURIComponent(to)}`}:load.call(this,name,...args);};
require.extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);};
require.extensions['.tsx']=require.extensions['.ts'];
const {DatabaseSync}=require('node:sqlite');
function database(){const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));const prepare=sql=>{let values=[];return{bind(...next){values=next;return this;},async first(){return sqlite.prepare(sql).get(...values)??null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},async run(){return sqlite.prepare(sql).run(...values);}};};let batchTail=Promise.resolve();const db={prepare,batch(statements){const task=batchTail.then(async()=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}});batchTail=task.catch(()=>{});return task;}};env.DB=db;return{sqlite,db};}
module.exports={env,database,auth,afterTasks};
