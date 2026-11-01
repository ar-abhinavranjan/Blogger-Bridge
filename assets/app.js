(()=>{'use strict';
const pages=['overview','terminal','posts','pages','comments','analytics'];
const names={overview:'Overview',terminal:'Command terminal',posts:'Posts',pages:'Pages',comments:'Comments',analytics:'Analytics'};
const output=document.getElementById('output'),input=document.getElementById('command-input');
function navigate(id){if(!pages.includes(id))return;document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));document.getElementById('view-name').textContent=names[id];if(id==='terminal')setTimeout(()=>input.focus(),0)}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));
function line(text,cls=''){const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;output.appendChild(p);output.scrollTop=output.scrollHeight}
function run(raw){const cmd=raw.trim().toLowerCase();if(!cmd)return;line('ar@blogger:~$ '+raw,'dim');
if(cmd==='help'||cmd==='--help'){line('AVAILABLE COMMANDS','success');[['help','Show this command list'],['clear','Clear terminal output'],['connect status','Show backend connection status'],['blog info','Show configured Blogger blog information'],['posts list','List posts (backend required)'],['posts search <query>','Search posts (backend required)'],['pages list','List pages (backend required)'],['comments list','List comments (backend required)'],['stats views','Show page-view statistics (backend required)'],['system status','Show application status']].forEach(([a,b])=>line('  '+a.padEnd(27)+' '+b));line('This is a restricted application console, not a system shell.');}
else if(cmd==='clear'){output.innerHTML='';}
else if(cmd==='connect status'||cmd==='system status'){line('Frontend: ONLINE','success');line('Backend: NOT CONNECTED','error');line('Google authorization: NOT CONNECTED','error');line('Live Blogger operations: DISABLED','error');}
else if(cmd==='blog info'){line('No blog data available. Secure backend authorization is required.','error');}
else if(['posts list','pages list','comments list','stats views'].includes(cmd)||cmd.startsWith('posts search ')){line('Backend required: this operation has not been sent. No live Blogger connection is configured.','error');}
else{line('Unknown command. Type "help" to see supported commands.','error');}}
document.getElementById('command-form').addEventListener('submit',e=>{e.preventDefault();const v=input.value;run(v);input.value='';input.focus()});
document.getElementById('clear-terminal').addEventListener('click',()=>{output.innerHTML='';line('Console cleared. Type "help" to continue.','dim')});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{navigate('terminal');run(b.dataset.command)}));
})();