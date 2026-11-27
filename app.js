(function(){
const $=id=>document.getElementById(id);
const fmt=n=>Math.round(n).toLocaleString('vi-VN')+'đ';
const fmtK=n=>{const a=Math.abs(n);if(a>=1e6)return (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})+'tr';if(a>=1e3)return Math.round(n/1e3)+'K';return String(Math.round(n))};
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseD=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const today=()=>ds(new Date());
const ym=s=>s.slice(0,7);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOW=['CN','T2','T3','T4','T5','T6','T7'];
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

const DEFAULT_MENU=[
 ['Bé Mỡ Đặc biệt',35000,'Bánh mì'],['Heo quay (thường)',30000,'Bánh mì'],['Heo quay (đầy)',40000,'Bánh mì'],
 ['Sài Gòn',25000,'Bánh mì'],['Jambong (thường)',25000,'Bánh mì'],['Jambong (đầy)',35000,'Bánh mì'],
 ['Xá xíu',25000,'Bánh mì'],['Truyền thống',25000,'Bánh mì'],['Pate + Ruốc',20000,'Bánh mì'],['Bơ + Ruốc',20000,'Bánh mì'],
 ['+ Thịt nguội',5000,'Topping'],['+ Sốt bơ',5000,'Topping'],['+ Pate',5000,'Topping'],['+ Ruốc',5000,'Topping'],['+ Xá xíu',5000,'Topping'],
 ['+ Heo quay',10000,'Topping'],['+ Jambong',10000,'Topping'],
 ['Trà quất',15000,'Đồ uống'],['Trà chanh',15000,'Đồ uống'],['Nước đậu',10000,'Đồ uống'],['Nước đỗ đen rang',10000,'Đồ uống']
].map(([n,p,g])=>({n,p,g}));
const GROUPS=['Bánh mì','Topping','Đồ uống'];
const CHI_CATS=['Vỏ bánh mì','Pate','Thịt, chả, jambong','Heo quay','Rau, dưa, hành','Nước, đồ uống','Gas, điện bếp','Túi, giấy gói','Mặt bằng','Điện nước','Lương nhân viên','Quảng cáo Facebook','Khác'];
const THU_CATS=['Bán hàng cuối ngày','Bán qua app (Grab, Shopee)','Thu khác'];

const API=window.BM_API_URL||'';
let session=LS.get('bm-session',null); // {sdt,name,role}
if(session&&!session.sdt)session=null; // phiên cũ dùng mã PIN
let menu=LS.get('bm-menu',null)||DEFAULT_MENU.slice();
let cart=LS.get('bm-cart',{})||{};
let outbox=LS.get('bm-outbox',[])||[];
let thuMode='mon', thuM='tm', chiM='tm', chiCat=null, thuCat=THU_CATS[0];
let per='day', anchor=today();
const months={}; // ym -> {docs:[], loaded, loading, err}
let lastSync=null, netErr=false;

function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2400)}
function status(){
  const s=$('status');let msg,warn=false;
  if(!API){msg='Chưa nối Google Sheets';warn=true}
  else if(outbox.length){msg='Chờ gửi '+outbox.length+' khoản…';warn=netErr}
  else if(netErr){msg='Mất mạng, đang thử lại';warn=true}
  else if(lastSync){msg='Đã đồng bộ · '+lastSync.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}
  else msg='Đang tải sổ…';
  s.textContent=msg;s.classList.toggle('warn',warn);
}

/* ---------- API ---------- */
async function api(action,data,sdtOverride){
  if(!API)throw new Error('no_api');
  const body=JSON.stringify(Object.assign({action,sdt:sdtOverride||(session&&session.sdt)},data||{}));
  const r=await fetch(API,{method:'POST',body,redirect:'follow'});
  const j=await r.json();
  if(!j.ok){const e=new Error(j.error||'loi');e.code=j.error;throw e}
  return j;
}
function authFail(e){if(e&&e.code==='chua_cap_phep'){session=null;LS.set('bm-session',null);showLogin('Số điện thoại này không còn được cấp phép.');return true}return false}

/* ---------- login ---------- */
function showLogin(err){
  $('login').hidden=false;$('loginErr').textContent=err||'';
  $('sdtIn').value=LS.get('bm-lastsdt','');
  setTimeout(()=>$('sdtIn').focus(),50);
}
$('loginForm').onsubmit=async ev=>{
  ev.preventDefault();
  const sdt=$('sdtIn').value.replace(/\D/g,'');
  if(sdt.length<9){$('loginErr').textContent='Nhập đủ số điện thoại.';return}
  if(!API){$('loginErr').textContent='App chưa nối Google Sheets.';return}
  $('loginBtn').disabled=true;$('loginErr').textContent='';$('loginBtn').textContent='Đang kiểm tra…';
  try{
    const j=await api('ping',{},sdt);
    session={sdt,name:j.name,role:j.role};LS.set('bm-session',session);LS.set('bm-lastsdt',sdt);
    $('login').hidden=true;start();toast('Chào '+j.name);
  }catch(e){
    $('loginErr').textContent=e.code==='chua_cap_phep'?'Số này chưa được chủ quán cấp phép.':'Không kết nối được, kiểm tra mạng.';
  }
  $('loginBtn').disabled=false;$('loginBtn').textContent='Vào sổ';
};
$('logoutBtn').onclick=()=>{session=null;LS.set('bm-session',null);showLogin()};

/* ---------- tabs ---------- */
function show(v){
  ['thu','chi','bc','cd'].forEach(k=>$('v-'+k).hidden=k!==v);
  document.querySelectorAll('nav.tabs button').forEach(b=>{if(b.dataset.v===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  if(v==='bc')renderReport();
  if(v==='cd')renderMenuEdit();
  LS.set('bm-tab',v);
  window.scrollTo(0,0);
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>show(b.dataset.v));
function seg(ids,cb){ids.forEach(([id,val])=>{$(id).onclick=()=>{ids.forEach(([i,v])=>$(i).setAttribute('aria-pressed',v===val));cb(val)}});}
seg([['thuMode-mon','mon'],['thuMode-tong','tong']],v=>{thuMode=v;$('thu-mon').hidden=v!=='mon';$('thu-tong').hidden=v!=='tong';updSave()});
seg([['thuM-tm','tm'],['thuM-ck','ck']],v=>thuM=v);
seg([['chiM-tm','tm'],['chiM-ck','ck']],v=>chiM=v);
seg([['per-day','day'],['per-week','week'],['per-month','month']],v=>{per=v;renderReport()});

/* ---------- menu / cart ---------- */
function renderMenu(){
  const box=$('menuGroups');box.innerHTML='';
  GROUPS.concat([...new Set(menu.map(m=>m.g))].filter(g=>!GROUPS.includes(g))).forEach(g=>{
    const items=menu.map((m,i)=>({m,i})).filter(x=>x.m.g===g);if(!items.length)return;
    const l=document.createElement('div');l.className='lbl';l.textContent=g;box.appendChild(l);
    const grid=document.createElement('div');grid.className='grid'+(g==='Bánh mì'?' g-banh':g==='Đồ uống'?' g-drink':'');
    items.forEach(({m,i})=>{
      const b=document.createElement('button');b.className='item'+(g==='Bánh mì'?'':' small');
      b.innerHTML='<span class="nm"></span><span class="pr"></span>'+(cart[i]?'<span class="q">'+cart[i]+'</span>':'');
      b.querySelector('.nm').textContent=m.n;b.querySelector('.pr').textContent=fmtK(m.p);
      b.onclick=()=>{cart[i]=(cart[i]||0)+1;LS.set('bm-cart',cart);renderMenu();renderCart()};
      grid.appendChild(b);
    });
    box.appendChild(grid);
  });
}
function cartLines(){return Object.entries(cart).filter(([i,q])=>q>0&&menu[i]).map(([i,q])=>({i:+i,n:menu[i].n,p:menu[i].p,q}))}
function cartTotal(){return cartLines().reduce((s,l)=>s+l.p*l.q,0)}
function renderCart(){
  const box=$('cart');const lines=cartLines();
  if(!lines.length){box.innerHTML='<div class="empty" style="padding:10px">Bấm vào món ở trên để thêm vào đơn.</div>'}
  else{box.innerHTML='';lines.forEach(l=>{
    const r=document.createElement('div');r.className='cart-line';
    r.innerHTML='<button class="qbtn" aria-label="Bớt">−</button><span class="n"></span><button class="qbtn" aria-label="Thêm">+</button><span class="s"></span>';
    r.querySelector('.n').textContent=l.q+' × '+l.n;r.querySelector('.s').textContent=fmt(l.p*l.q);
    const [minus,plus]=r.querySelectorAll('.qbtn');
    minus.onclick=()=>{cart[l.i]--;if(cart[l.i]<=0)delete cart[l.i];LS.set('bm-cart',cart);renderMenu();renderCart()};
    plus.onclick=()=>{cart[l.i]++;LS.set('bm-cart',cart);renderMenu();renderCart()};
    box.appendChild(r)});
    const c=document.createElement('button');c.className='ghost';c.style.marginTop='8px';c.textContent='Xoá đơn';c.onclick=()=>{cart={};LS.set('bm-cart',cart);renderMenu();renderCart()};box.appendChild(c);
  }
  $('cartTotal').textContent=fmt(cartTotal());updSave();
}

/* ---------- amount inputs ---------- */
function num(el){return Number(String(el.value).replace(/\D/g,''))||0}
function bindAmt(inp,hint,quick,def){
  const upd=()=>{const n=num(inp);inp.value=n?n.toLocaleString('vi-VN'):'';hint.textContent=n?('= '+fmt(n)+(n<1000?'  · Nhớ gõ đủ số, vd 50000':'')):def;updSave()};
  inp.addEventListener('input',upd);
  [['+10K',1e4],['+50K',5e4],['+100K',1e5],['+500K',5e5],['+1tr',1e6],['Xoá',0]].forEach(([t,v])=>{
    const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>{inp.value=v?String(num(inp)+v):'';upd()};quick.appendChild(b)});
}
bindAmt($('thuAmt'),$('thuAmtHint'),$('thuQuick'),'Gõ số tiền, ví dụ 1500000');
bindAmt($('chiAmt'),$('chiAmtHint'),$('chiQuick'),'Gõ số tiền, ví dụ 250000');
function chips(box,list,get,set){box.innerHTML='';list.forEach(c=>{const b=document.createElement('button');b.className='chip';b.textContent=c;b.setAttribute('aria-pressed',get()===c);b.onclick=()=>{set(c);chips(box,list,get,set);updSave()};box.appendChild(b)})}
chips($('chiCats'),CHI_CATS,()=>chiCat,v=>chiCat=v);
chips($('thuCats'),THU_CATS,()=>thuCat,v=>thuCat=v);
$('thuDate').value=today();$('chiDate').value=today();

function updSave(){
  const ok=!!session;
  const ta=thuMode==='mon'?cartTotal():num($('thuAmt')),ca=num($('chiAmt'));
  $('saveThu').innerHTML='Lưu khoản thu'+(ta?' <span class="amt-in">· '+fmt(ta)+'</span>':'');
  $('saveChi').innerHTML='Lưu khoản chi'+(ca?' <span class="amt-in">· '+fmt(ca)+'</span>':'');
  $('saveThu').disabled=!(ta>0)||!ok;
  $('saveChi').disabled=!(ca>0&&chiCat)||!ok;
}

/* ---------- saving (outbox: lưu tạm trên máy, gửi khi có mạng) ---------- */
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function addEntry(e){
  e.id=newId();e.by=session.name;e.at=new Date().toISOString();
  outbox.push(e);LS.set('bm-outbox',outbox);
  const m=ym(e.d);(months[m]=months[m]||{docs:[]}).docs.push(e);
  renderAll();flush();
}
let flushing=false;
async function flush(){
  if(flushing||!outbox.length||!session)return;
  flushing=true;
  try{
    const batch=outbox.slice(0,50);
    const j=await api('add',{entries:batch});
    const done=new Set(j.ids||[]);
    outbox=outbox.filter(e=>!done.has(e.id));LS.set('bm-outbox',outbox);
    netErr=false;lastSync=new Date();
  }catch(e){if(!authFail(e))netErr=true}
  flushing=false;status();
  if(outbox.length&&!netErr)flush();
}
$('saveThu').onclick=()=>{
  const base={t:'thu',d:$('thuDate').value||today(),m:thuM,n:$('thuNote').value.trim()};
  let e;
  if(thuMode==='mon'){const lines=cartLines();e={...base,c:'Bán hàng (theo món)',a:cartTotal(),items:lines.map(l=>({n:l.n,p:l.p,q:l.q}))}}
  else e={...base,c:thuCat,a:num($('thuAmt')),items:[]};
  addEntry(e);toast('Đã lưu thu '+fmt(e.a));
  if(thuMode==='mon'){cart={};LS.set('bm-cart',cart);renderMenu();renderCart()}else{$('thuAmt').value='';$('thuAmtHint').textContent='Gõ số tiền, ví dụ 1500000'}
  $('thuNote').value='';updSave();
};
$('saveChi').onclick=()=>{
  const e={t:'chi',d:$('chiDate').value||today(),m:chiM,c:chiCat,a:num($('chiAmt')),n:$('chiNote').value.trim(),items:[]};
  addEntry(e);toast('Đã lưu chi '+fmt(e.a));
  $('chiAmt').value='';$('chiNote').value='';$('chiAmtHint').textContent='Gõ số tiền, ví dụ 250000';updSave();
};

/* ---------- loading data ---------- */
function monthRange(m){const [y,mo]=m.split('-').map(Number);return {from:m+'-01',to:ds(new Date(y,mo,0))}}
async function loadMonth(m){
  if(!session)return;
  const rec=months[m]=months[m]||{docs:[]};
  if(rec.loading)return;rec.loading=true;
  try{
    const j=await api('list',monthRange(m));
    const pend=outbox.filter(e=>ym(e.d)===m);
    const ids=new Set(j.entries.map(e=>e.id));
    rec.docs=j.entries.concat(pend.filter(e=>!ids.has(e.id)));
    rec.loaded=true;netErr=false;lastSync=new Date();
  }catch(e){if(!authFail(e))netErr=true}
  rec.loading=false;status();renderAll();
}
function ensureMonth(m){const r=months[m];if(!r||(!r.loaded&&!r.loading))loadMonth(m)}
function refresh(){if(document.hidden||!session)return;flush();Object.keys(months).forEach(m=>{if(months[m].loaded||m===ym(today()))loadMonth(m)})}
setInterval(refresh,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
window.addEventListener('online',refresh);

function renderAll(){renderHero();if(!$('v-bc').hidden)renderReport()}

function renderHero(){
  const t=today(),x=parseD(t);
  $('hDate').textContent='Hôm nay, '+DOW[x.getDay()]+' '+x.getDate()+'/'+(x.getMonth()+1);
  const es=((months[ym(t)]&&months[ym(t)].docs)||[]).filter(e=>e.d===t);
  const sum=a=>a.reduce((s,e)=>s+(+e.a||0),0);
  const thu=es.filter(e=>e.t==='thu'),chi=es.filter(e=>e.t==='chi');
  const T=sum(thu),C=sum(chi),banh=thu.reduce((s,e)=>s+(e.items||[]).filter(i=>!String(i.n).startsWith('+')).reduce((a,i)=>a+(+i.q||0),0),0);
  $('hThu').textContent=fmt(T);$('hChi').textContent=fmt(C);$('hLai').textContent=fmt(T-C);
  $('hThuS').textContent=thu.length?('TM '+fmtK(sum(thu.filter(e=>e.m==='tm')))+' · CK '+fmtK(sum(thu.filter(e=>e.m==='ck')))):'Chưa có';
  $('hChiS').textContent=chi.length?(chi.length+' khoản'):'Chưa có';
  $('hLaiS').textContent=banh?('Đã bán '+banh+' món'):(T?'':'Bấm Thu để ghi đơn đầu tiên');
  $('hCount').textContent=es.length?(es.length+' khoản đã ghi'):'';
}
setInterval(()=>{if($('hDate').dataset.d!==today()){$('hDate').dataset.d=today();$('thuDate').value=today();$('chiDate').value=today();ensureMonth(ym(today()));renderHero()}},60000);

/* ---------- periods ---------- */
function range(){
  const a=parseD(anchor);
  if(per==='day')return {from:anchor,to:anchor,name:(ds(a)===today()?'Hôm nay, ':'')+DOW[a.getDay()]+' '+a.getDate()+'/'+(a.getMonth()+1)+'/'+a.getFullYear()};
  if(per==='week'){const s=new Date(a);s.setDate(a.getDate()-((a.getDay()+6)%7));const e=new Date(s);e.setDate(s.getDate()+6);
    return {from:ds(s),to:ds(e),name:'Tuần '+s.getDate()+'/'+(s.getMonth()+1)+' – '+e.getDate()+'/'+(e.getMonth()+1)}}
  const s=new Date(a.getFullYear(),a.getMonth(),1),e=new Date(a.getFullYear(),a.getMonth()+1,0);
  return {from:ds(s),to:ds(e),name:'Tháng '+(a.getMonth()+1)+'/'+a.getFullYear()};
}
function shift(dir){const a=parseD(anchor);if(per==='day')a.setDate(a.getDate()+dir);else if(per==='week')a.setDate(a.getDate()+7*dir);else a.setMonth(a.getMonth()+dir,1);anchor=ds(a);renderReport()}
$('prevP').onclick=()=>shift(-1);$('nextP').onclick=()=>shift(1);
function entriesIn(r){const ms=new Set([ym(r.from),ym(r.to)]);ms.forEach(ensureMonth);let out=[];ms.forEach(m=>out=out.concat((months[m]&&months[m].docs)||[]));return out.filter(e=>e.d>=r.from&&e.d<=r.to)}
function rangeLoaded(r){return [ym(r.from),ym(r.to)].every(m=>months[m]&&months[m].loaded)}

let openDel=null;
function renderReport(){
  const r=range();$('perName').textContent=r.name;
  const es=entriesIn(r).sort((a,b)=>(b.d+b.at).localeCompare(a.d+a.at));
  const thu=es.filter(e=>e.t==='thu'),chi=es.filter(e=>e.t==='chi');
  const sum=a=>a.reduce((s,e)=>s+(+e.a||0),0);
  const T=sum(thu),C=sum(chi);
  $('tThu').textContent=fmt(T);$('tChi').textContent=fmt(C);$('tLai').textContent=fmt(T-C);
  $('tLai').style.color=T-C<0?'var(--chi)':'var(--ink)';
  $('tThuSub').textContent='TM '+fmtK(sum(thu.filter(e=>e.m==='tm')))+' · CK '+fmtK(sum(thu.filter(e=>e.m==='ck')));
  $('tChiSub').textContent='TM '+fmtK(sum(chi.filter(e=>e.m==='tm')))+' · CK '+fmtK(sum(chi.filter(e=>e.m==='ck')));
  $('tLaiSub').textContent=T?('Biên lãi '+Math.round((T-C)/T*100)+'%'):'';

  const cw=$('chartWrap');cw.hidden=per==='day';
  if(per!=='day'){
    const days=[];for(let d=parseD(r.from);ds(d)<=r.to;d.setDate(d.getDate()+1))days.push(ds(d));
    const by=Object.fromEntries(days.map(d=>[d,{t:0,c:0}]));es.forEach(e=>{if(by[e.d])by[e.d][e.t==='thu'?'t':'c']+=+e.a||0});
    const mx=Math.max(1,...days.map(d=>Math.max(by[d].t,by[d].c)));
    $('chart').innerHTML=days.map(d=>'<div class="col" title="'+esc(d)+'"><i style="background:var(--thu);height:'+(by[d].t/mx*100)+'%"></i><i style="background:var(--chi);height:'+(by[d].c/mx*100)+'%"></i></div>').join('');
    $('chartX').innerHTML=days.map((d,i)=>{const x=parseD(d);const sh=per==='week'||i%5===0||i===days.length-1;return '<span>'+(sh?(per==='week'?DOW[x.getDay()]:x.getDate()):'')+'</span>'}).join('');
  }
  const cats={};chi.forEach(e=>cats[e.c]=(cats[e.c]||0)+(+e.a||0));
  const cl=Object.entries(cats).sort((a,b)=>b[1]-a[1]);const cmx=cl.length?cl[0][1]:1;
  const PAL=['#D9822B','#2F7FB8','#C7402D','#2E9A62','#8A5CC2','#D0618F','#6C8F2B','#8C7A62','#3AA6A6','#B5883A','#5A6BD1','#A0503A','#6E7C74'];
  let donut='';
  if(cl.length){let acc=0;const R=52,L=2*Math.PI*R;
    donut='<div class="donut-wrap"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="'+R+'" fill="none" stroke="var(--sunk)" stroke-width="18"/>'+
    cl.map(([k,v],i)=>{const len=v/C*L;const s='<circle cx="66" cy="66" r="'+R+'" fill="none" stroke="'+PAL[i%PAL.length]+'" stroke-width="18" stroke-dasharray="'+len+' '+(L-len)+'" stroke-dashoffset="'+(-acc)+'" transform="rotate(-90 66 66)"/>';acc+=len;return s}).join('')+
    '<text x="66" y="62" text-anchor="middle" class="ctr">Tổng chi</text><text x="66" y="82" text-anchor="middle" class="ctr-v">'+esc(fmtK(C))+'</text></svg><div style="flex:1;min-width:0;font-size:12.5px;color:var(--muted)">'+cl.length+' danh mục. Nhiều nhất: <b style="color:var(--ink)">'+esc(cl[0][0])+'</b> ('+Math.round(cl[0][1]/C*100)+'%)</div></div>';}
  $('byCat').innerHTML=cl.length?donut+cl.map(([k,v],i)=>'<div class="b"><span class="t">'+esc(k)+'</span><span class="val">'+fmt(v)+' · '+Math.round(v/C*100)+'%</span><div class="track"><div class="fill" style="background:'+PAL[i%PAL.length]+';width:'+(v/cmx*100)+'%"></div></div></div>').join(''):'<div class="empty">Chưa có khoản chi nào trong kỳ này.</div>';
  const it={};thu.forEach(e=>(e.items||[]).forEach(x=>{const o=it[x.n]=it[x.n]||{q:0,s:0};o.q+=+x.q||0;o.s+=(+x.q||0)*(+x.p||0)}));
  const il=Object.entries(it).sort((a,b)=>b[1].q-a[1].q).slice(0,10);const imx=il.length?il[0][1].q:1;
  $('topItems').innerHTML=il.length?il.map(([k,v])=>'<div class="b"><span class="t">'+esc(k)+'</span><span class="val">'+v.q+' cái · '+fmtK(v.s)+'</span><div class="track"><div class="fill" style="background:var(--crust);width:'+(v.q/imx*100)+'%"></div></div></div>').join(''):'<div class="empty">Chưa có đơn ghi theo món trong kỳ này.</div>';
  const L=$('list');
  if(!es.length){L.innerHTML='<div class="empty">'+(rangeLoaded(r)?'Chưa có khoản nào. Vào tab Thu hoặc Chi để ghi khoản đầu tiên.':'Đang tải sổ…')+'</div>';return}
  L.innerHTML='';
  const pendIds=new Set(outbox.map(e=>e.id));
  es.forEach(e=>{
    const row=document.createElement('div');row.className='entry';
    const x=parseD(e.d);const time=e.at?new Date(e.at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'';
    const itemsTxt=(e.items||[]).map(i=>i.q+' '+i.n).join(', ');
    row.innerHTML='<span class="dot"></span><div class="main"><div class="t1"></div><div class="t2"></div><div class="t2 nt"></div></div><div style="text-align:right"><div class="amt"></div></div>';
    row.querySelector('.dot').style.background=e.t==='thu'?'var(--thu)':'var(--chi)';
    row.querySelector('.t1').textContent=e.c;
    row.querySelector('.t2').textContent=(per!=='day'?x.getDate()+'/'+(x.getMonth()+1)+' · ':'')+time+' · '+(e.m==='ck'?'Chuyển khoản':'Tiền mặt')+(e.by?' · '+e.by:'')+(pendIds.has(e.id)?' · chờ gửi':'');
    row.querySelector('.nt').textContent=[itemsTxt,e.n].filter(Boolean).join(' — ');
    const amt=row.querySelector('.amt');amt.textContent=(e.t==='thu'?'+':'−')+fmt(e.a);amt.style.color=e.t==='thu'?'var(--thu)':'var(--chi)';
    const main=row.querySelector('.main');
    if(openDel===e.id){
      const c=document.createElement('div');c.className='confirm';c.innerHTML='<button class="yes">Xoá khoản này</button><button>Thôi</button>';
      c.children[0].onclick=async()=>{
        c.children[0].disabled=true;
        try{
          if(pendIds.has(e.id)){outbox=outbox.filter(o=>o.id!==e.id);LS.set('bm-outbox',outbox)}
          else await api('del',{id:e.id});
          const rec=months[ym(e.d)];if(rec)rec.docs=rec.docs.filter(d=>d.id!==e.id);
          toast('Đã xoá');
        }catch(err){if(!authFail(err))toast('Chưa xoá được, kiểm tra mạng')}
        openDel=null;renderAll();status();
      };
      c.children[1].onclick=()=>{openDel=null;renderReport()};main.appendChild(c);
    }else{const d=document.createElement('button');d.className='del';d.textContent='Xoá';d.onclick=()=>{openDel=e.id;renderReport()};main.appendChild(d)}
    L.appendChild(row);
  });
}

/* ---------- export ---------- */
function toCSV(es){
  const q=v=>{v=String(v??'');return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const rows=[['Ngày','Loại','Danh mục','Số tiền','Hình thức','Món','Ghi chú','Người nhập','Lúc nhập']];
  es.slice().sort((a,b)=>(a.d+a.at).localeCompare(b.d+b.at)).forEach(e=>rows.push([e.d,e.t==='thu'?'Thu':'Chi',e.c,e.a,e.m==='ck'?'Chuyển khoản':'Tiền mặt',(e.items||[]).map(i=>i.q+'x '+i.n+' ('+i.p+')').join('; '),e.n,e.by||'',e.at?new Date(e.at).toLocaleString('vi-VN'):'']));
  return '﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n');
}
function saveFile(name,data){
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Đã xuất '+name);
}
$('expPeriod').onclick=()=>{const r=range();saveFile('thu-chi-be-mo_'+r.from+'_'+r.to+'.csv',toCSV(entriesIn(r)))};
$('expAll').onclick=async()=>{
  $('expAll').disabled=true;
  try{const j=await api('all');saveFile('sao-luu-thu-chi-be-mo_'+today()+'.csv',toCSV(j.entries))}
  catch(e){if(!authFail(e))toast('Chưa sao lưu được, kiểm tra mạng')}
  $('expAll').disabled=false;
};
$('expHint').textContent='File .csv mở bằng Excel. Toàn bộ dữ liệu cũng nằm sẵn trong Google Sheets của chủ quán.';

/* ---------- menu edit ---------- */
let draftMenu=null;
const isAdmin=()=>!!(session&&session.role==='admin');
function renderMenuEdit(){
  draftMenu=draftMenu||menu.map(m=>({...m}));
  const box=$('menuRows');box.innerHTML='';
  draftMenu.forEach((m,i)=>{
    const r=document.createElement('div');r.className='r';
    r.innerHTML='<input aria-label="Tên món"><input aria-label="Giá" inputmode="numeric"><select aria-label="Nhóm"></select><button class="x" aria-label="Xoá món">×</button>';
    const [n,p,g]=r.querySelectorAll('input,select');n.id='mn'+i;p.id='mp'+i;g.id='mg'+i;
    n.value=m.n;p.value=m.p;GROUPS.forEach(x=>{const o=document.createElement('option');o.textContent=x;o.selected=x===m.g;g.appendChild(o)});
    n.oninput=()=>m.n=n.value;p.oninput=()=>m.p=Number(p.value.replace(/\D/g,''))||0;g.onchange=()=>m.g=g.value;
    r.querySelector('.x').onclick=()=>{draftMenu.splice(i,1);renderMenuEdit()};
    [n,p,g,r.querySelector('.x')].forEach(el=>el.disabled=!isAdmin());
    box.appendChild(r);
  });
  ['addRow','resetMenu','saveMenu'].forEach(id=>$(id).disabled=!isAdmin());
  $('menuPerm').textContent=isAdmin()?'Sửa tên món, giá, nhóm. Bấm Lưu thực đơn để mọi người cùng thấy.':'Chỉ chủ quán sửa được thực đơn. Bạn vẫn ghi thu chi bình thường.';
  $('whoNote').textContent=session?('Đang nhập với tên: '+session.name+' · '+(isAdmin()?'Chủ quán':'Nhân viên')):'';
}
$('addRow').onclick=()=>{draftMenu.push({n:'',p:0,g:'Bánh mì'});renderMenuEdit()};
$('resetMenu').onclick=()=>{draftMenu=DEFAULT_MENU.map(m=>({...m}));renderMenuEdit()};
$('saveMenu').onclick=async()=>{
  const clean=draftMenu.filter(m=>m.n.trim()&&m.p>0).map(m=>({n:m.n.trim(),p:m.p,g:m.g}));
  $('saveMenu').disabled=true;
  try{const j=await api('saveMenu',{items:clean});setMenu(j.items);draftMenu=null;renderMenuEdit();toast('Đã lưu thực đơn')}
  catch(e){if(!authFail(e))toast(e.code==='can_quyen_chu_quan'?'Chỉ chủ quán được sửa thực đơn':'Chưa lưu được thực đơn')}
  $('saveMenu').disabled=!isAdmin();
};
function setMenu(items){
  if(!Array.isArray(items)||!items.length)return;
  const changed=JSON.stringify(items)!==JSON.stringify(menu);
  menu=items;LS.set('bm-menu',menu);
  if(changed){cart={};LS.set('bm-cart',cart)}
  renderMenu();renderCart();
}

/* ---------- install (PWA) ---------- */
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').hidden=false});
$('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();try{await deferredPrompt.userChoice}catch(e){}deferredPrompt=null;$('installBtn').hidden=true};
window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;toast('Đã cài app Sổ Bé Mỡ')});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

/* ---------- boot ---------- */
function start(){
  status();updSave();
  api('menu').then(j=>setMenu(j.items)).catch(e=>authFail(e));
  loadMonth(ym(today()));flush();
  if(!$('v-cd').hidden)renderMenuEdit();
}
renderMenu();renderCart();renderHero();status();
const t0=LS.get('bm-tab','thu');if($('v-'+t0))show(t0);
if(session)start();else showLogin(API?'':'App chưa nối Google Sheets.');
})();
