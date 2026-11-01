(()=>{'use strict';
const $=id=>document.getElementById(id);
const pages=['overview','terminal','posts','pages','comments','analytics'];
const names={overview:'Overview',terminal:'Command terminal',posts:'Posts',pages:'Pages',comments:'Comments',analytics:'Analytics'};
const output=$('output'),input=$('command-input');
let idToken=null,blogData=null,postData=[],pageData=[],googleReady=false;
function navigate(id){if(!pages.includes(id))return;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));$('view-name').textContent=names[id];if(id==='terminal')setTimeout(()=>input.focus(),0)}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
function line(text,cls=''){const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;output.appendChild(p);output.scrollTop=output.scrollHeight}
function status(id,text,cls){const el=$(id);if(el){el.textContent=text;el.className=cls||''}}
function setNotice(title,message){const n=$('connection-notice');if(!n)return;n.querySelector('b').textContent=title;n.querySelector('p').textContent=message}
async function request(action,extra={}){
 if(!idToken)throw new Error('Sign in with the authorized Google account first.');
 const res=await fetch('/.netlify/functions/blogger',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},body:JSON.stringify({action,...extra})});
 let data;try{data=await res.json()}catch{throw new Error('The server returned an unreadable response.')}
 if(!res.ok||!data.ok)throw new Error(data.error||'Blogger request failed.');
 return data.result;
}
function addCell(parent,tag,text,cls){const el=document.createElement(tag);el.textContent=text??'';if(cls)el.className=cls;parent.appendChild(el);return el}
function renderPosts(items){
 const root=$('posts-data');root.replaceChildren();
 if(!items.length){addCell(root,'p','No posts were returned by Blogger.','muted');return}
 items.forEach(p=>{const card=document.createElement('article');card.className='data-item';addCell(card,'h3',p.title||'(Untitled)');addCell(card,'p',(p.status||'UNKNOWN')+' · '+(p.updated||p.published||'Date unavailable'),'muted');if(p.url){const a=addCell(card,'a','Open published post');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer'}root.appendChild(card)});
}
function renderPages(items){
 const root=$('pages-data');root.replaceChildren();
 if(!items.length){addCell(root,'p','No pages were returned by Blogger.','muted');return}
 items.forEach(p=>{const card=document.createElement('article');card.className='data-item';addCell(card,'h3',p.title||'(Untitled)');addCell(card,'p',(p.status||'UNKNOWN')+' · '+(p.updated||p.published||'Date unavailable'),'muted');if(p.url){const a=addCell(card,'a','Open published page');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer'}root.appendChild(card)});
}
async function loadDashboard(){
 status('backend-state','● Connecting','warn');
 try{
  const [blog,posts,pagesResult]=await Promise.all([request('getBlog'),request('listPosts',{maxResults:50}),request('listPages',{maxResults:50})]);
  blogData=blog;postData=posts.items||[];pageData=pagesResult.items||[];
  $('metric-blog').textContent=blog.name||'Connected';
  $('metric-blog-url').textContent=blog.url||'Blogger blog';
  $('metric-posts').textContent=String(posts.totalItems??postData.length);
  $('metric-pages').textContent=String(pagesResult.totalItems??pageData.length);
  renderPosts(postData);renderPages(pageData);
  status('backend-state','● Connected','good');status('google-state','● Authorized','good');status('sidebar-connection','Blogger connected');status('sidebar-detail','Read-only API active');
  status('auth-status','CONNECTED','mode');status('system-state','LIVE','pill');
  status('terminal-state','CONNECTED','terminal-state');
  setNotice('Blogger connected','Live blog information, posts and pages loaded successfully. This integration is read-only.');
  line('Authenticated as the authorized Google account. Blogger data loaded.','success');
 }catch(err){
  status('backend-state','● Error','error');status('sidebar-connection','Connection error');status('sidebar-detail','Check Netlify function logs');setNotice('Connection failed',err.message);
  line('Connection error: '+err.message,'error');
 }
}
async function initGoogle(){
 try{
  const r=await fetch('/.netlify/functions/blogger');
  const cfg=await r.json();
  if(!r.ok||!cfg.googleClientId)throw new Error(cfg.error||'Google sign-in configuration unavailable.');
  const waitForGIS=()=>new Promise((resolve,reject)=>{let tries=0;const timer=setInterval(()=>{if(window.google?.accounts?.id){clearInterval(timer);resolve()}else if(++tries>60){clearInterval(timer);reject(new Error('Google sign-in library did not load.'))}},150)});
  await waitForGIS();
  google.accounts.id.initialize({client_id:cfg.googleClientId,callback:async response=>{
    idToken=response.credential;
    status('auth-status','VERIFYING…','mode');status('google-state','● Verifying','warn');
    line('Google identity received. Verifying access…','dim');
    await loadDashboard();
  }});
  google.accounts.id.renderButton($('google-signin'),{type:'standard',theme:'filled_black',size:'medium',text:'signin_with',shape:'pill'});
  googleReady=true;
 }catch(err){setNotice('Sign-in unavailable',err.message);line('Sign-in setup error: '+err.message,'error')}
}
function run(raw){
 const cmd=raw.trim();if(!cmd)return;line('ar@blogger:~$ '+cmd,'dim');
 const lower=cmd.toLowerCase();
 if(lower==='help'||lower==='--help'){line('AVAILABLE COMMANDS','success');[['help','Show this command list'],['clear','Clear terminal output'],['connect status','Show connection status'],['blog info','Show blog metadata'],['posts list','List Blogger posts'],['pages list','List Blogger pages'],['system status','Show application status']].forEach(([a,b])=>line('  '+a.padEnd(22)+' '+b));line('Write operations, comments and analytics are not enabled in this release.')}
 else if(lower==='clear'){output.replaceChildren()}
 else if(lower==='connect status'||lower==='system status'){line('Frontend: ONLINE','success');line('Google authorization: '+(idToken?'SIGNED IN':'NOT SIGNED IN'));line('Blogger backend: '+(blogData?'CONNECTED':'NOT CONNECTED'));line('Write operations: DISABLED')}
 else if(lower==='blog info'){if(!blogData)line('Sign in first to load blog information.','error');else{line('Blog: '+blogData.name,'success');line('URL: '+blogData.url);line('ID: '+blogData.id)}}
 else if(lower==='posts list'){if(!postData.length)line(idToken?'No posts found.':'Sign in first to load posts.','error');else postData.forEach(p=>line((p.status||'')+' · '+(p.title||'(Untitled)')))}
 else if(lower==='pages list'){if(!pageData.length)line(idToken?'No pages found.':'Sign in first to load pages.','error');else pageData.forEach(p=>line((p.status||'')+' · '+(p.title||'(Untitled)')))}
 else line('Unknown or disabled command. Type "help".','error');
}
$('command-form').addEventListener('submit',e=>{e.preventDefault();run(input.value);input.value='';input.focus()});
$('clear-terminal').addEventListener('click',()=>{output.replaceChildren();line('Console cleared. Type "help" to continue.','dim')});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{navigate('terminal');run(b.dataset.command)}));
status('backend-state','● Waiting','warn');status('google-state','● Not signed in','warn');
initGoogle();
})();