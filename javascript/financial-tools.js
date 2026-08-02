"use strict";

const EPSILON = 1e-10;
const DASH = "—";
const tools = [
  {id:"returns",number:"01",title:"報酬與現金流",subtitle:"投資績效核心計算",tags:["IRR","XIRR","NPV","CAGR","ROI","年化報酬","實質報酬","稅後報酬"]},
  {id:"growth",number:"02",title:"複利與投入規劃",subtitle:"資產成長與目標投入",tags:["複利終值","現值","定期定額","單筆投資","配息再投入","損益兩平","反推投入"]},
  {id:"policy",number:"03",title:"保單價值分析",subtitle:"保費與保單價值現金流",tags:["保單年度 IRR","解約金 IRR","保障槓桿","累積保費","保單損益兩平"]},
  {id:"retirement",number:"04",title:"年金與退休規劃",subtitle:"退休準備與資金缺口",tags:["年金現值","年金終值","退休金缺口","通膨"]},
  {id:"risk",number:"05",title:"投資風險指標",subtitle:"報酬序列與風險品質",tags:["標準差","夏普值","Beta","Alpha","R²","最大回撤","波動率","風險報酬比較"]},
  {id:"loan",number:"06",title:"貸款與分期",subtitle:"借款成本與提前還款",tags:["本息攤還","房貸","提前還款","貸款比較","分期實質利率","循環利息"]},
  {id:"currency",number:"07",title:"匯率與稅後報酬",subtitle:"匯兌與稅負試算",tags:["匯率損益","稅後報酬","配息所得稅"]},
  {id:"cashflow",number:"08",title:"現金流與資產配置",subtitle:"結餘、配置與組合報酬",tags:["每月現金流","儲蓄率","資產配置","投資組合報酬","帳戶餘額"]}
];

/* =============================================================================
   基本工具：空白欄位一律視為 0，算不出來的結果顯示「—」
   ============================================================================= */
const $ = (selector, root=document) => root.querySelector(selector);
const escapeHtml = text => String(text).replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char]);
const textOf = id => { const node=$("#"+id); return node?node.value:""; };
const raw = id => textOf(id);
const isBlank = id => textOf(id).trim()==="";
const n = (value, fallback=0) => { const parsed=Number(String(value).replace(/,/g,"").trim()); return Number.isFinite(parsed)?parsed:fallback; };
const val = id => { const text=textOf(id).trim(); if(text==="")return 0; return n(text,Number.NaN); };

/* 關鍵欄位還沒填就先不給數字，避免出現看似合理其實是「當成 0」算出來的結果。
   利率、稅率、通膨這類欄位空白時視為 0，不列入必填。 */
const req = (ids,value) => ids.every(id=>!isBlank(id))?value:Number.NaN;
const nf = (value,digits=2) => new Intl.NumberFormat("zh-TW",{maximumFractionDigits:digits}).format(value);
const pct = value => Number.isFinite(value)?`${(value*100).toFixed(2)}%`:DASH;
const num = (value,digits=2) => Number.isFinite(value)?nf(value,digits):DASH;
const money = (value,digits=0) => Number.isFinite(value)?new Intl.NumberFormat("zh-TW",{style:"currency",currency:"TWD",maximumFractionDigits:digits}).format(value):DASH;
/* 算式裡的短數字 */
const g = (value,digits=2) => Number.isFinite(value)?nf(value,digits):"?";
const gp = (value,digits=2) => Number.isFinite(value)?`${nf(value,digits)}%`:"?";

/* =============================================================================
   日期防呆：寬容輸入格式，但嚴格驗證日期是否真實存在
   支援 2021-01-01、2021/1/1、2021.1.1、20210101、2021年1月1日、民國110/1/1、110.1.1
   ============================================================================= */
const isLeap = year => (year%4===0&&year%100!==0)||year%400===0;
const daysInMonth = (year,month) => [31,isLeap(year)?29:28,31,30,31,30,31,31,30,31,30,31][month-1];

function parseDateText(input){
  const original=String(input||"").trim();
  if(original==="")return{ok:false,reason:"沒有填日期"};
  let text=original.replace(/\s+/g,"").replace(/年|月/g,"/").replace(/日/g,"");
  let roc=false;
  if(/^(民國|民|ROC|R\.O\.C\.?)/i.test(text)){roc=true;text=text.replace(/^(民國|民|ROC|R\.O\.C\.?)/i,"")}
  let year,month,day;
  const compact=text.match(/^(\d{8})$/);
  const parts=text.match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\/?$/);
  if(compact){
    year=Number(compact[1].slice(0,4));month=Number(compact[1].slice(4,6));day=Number(compact[1].slice(6,8));
  }else if(parts){
    year=Number(parts[1]);month=Number(parts[2]);day=Number(parts[3]);
    if(roc||parts[1].length<=3)year+=1911;
  }else{
    return{ok:false,reason:`「${original}」看不懂，請用 2021-01-01 或 2021/1/1`};
  }
  if(roc&&compact)return{ok:false,reason:`民國年請用 110/1/1 這種寫法`};
  if(month<1||month>12)return{ok:false,reason:`「${original}」的月份 ${month} 不存在`};
  if(day<1)return{ok:false,reason:`「${original}」的日期不正確`};
  const limit=daysInMonth(year,month);
  if(day>limit)return{ok:false,reason:`「${original}」不存在，${year} 年 ${month} 月只有 ${limit} 天`};
  if(year<1900||year>2200)return{ok:false,reason:`「${original}」的年份 ${year} 超出合理範圍`};
  return{ok:true,date:new Date(year,month-1,day),year,month,day,label:`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`};
}

/* 逐行解析「日期｜金額」，回傳資料與逐行問題 */
function parseDatedLines(text){
  const flows=[],issues=[];
  String(text||"").split(/\n+/).forEach((line,index)=>{
    const trimmed=line.trim();
    if(trimmed==="")return;
    const row=index+1;
    const pieces=trimmed.split(/[|｜,，\t]+/).map(x=>x.trim()).filter(x=>x!=="");
    if(pieces.length<2)return void issues.push({level:"error",text:`第 ${row} 行：要填「日期｜金額」兩個欄位`});
    const parsed=parseDateText(pieces[0]);
    if(!parsed.ok)return void issues.push({level:"error",text:`第 ${row} 行：${parsed.reason}`});
    const amount=n(pieces[1],Number.NaN);
    if(!Number.isFinite(amount))return void issues.push({level:"error",text:`第 ${row} 行：金額「${pieces[1]}」不是數字`});
    if(amount===0)issues.push({level:"warn",text:`第 ${row} 行：金額是 0，不影響計算`});
    flows.push({date:parsed.date,amount,row,label:parsed.label});
  });
  return{flows,issues};
}

/* 現金流的邏輯檢查 */
function checkDatedFlows(flows){
  const issues=[];
  if(!flows.length)return issues;
  if(flows.length<2){issues.push({level:"error",text:"至少要有 2 筆現金流才能計算 XIRR"});return issues}
  if(!flows.some(x=>x.amount<0)||!flows.some(x=>x.amount>0)){
    issues.push({level:"error",text:"需要同時有投入（負數）與回收（正數），否則求不出報酬率"});
  }
  const seen=new Map();
  flows.forEach(x=>{seen.set(x.label,(seen.get(x.label)||0)+1)});
  [...seen].filter(([,count])=>count>1).forEach(([label,count])=>{
    issues.push({level:"warn",text:`日期 ${label} 重複出現 ${count} 次，計算時會各自列入`});
  });
  const sorted=[...flows].sort((a,b)=>a.date-b.date);
  if(sorted.some((x,i)=>x.row!==flows[i].row))issues.push({level:"info",text:"日期未依序排列，計算時已自動排序"});
  const today=new Date();
  const future=flows.filter(x=>x.date>today);
  if(future.length)issues.push({level:"info",text:`有 ${future.length} 筆是未來日期（最遠 ${sorted.at(-1).label}），結果屬於預估`});
  const span=(sorted.at(-1).date-sorted[0].date)/86400000;
  if(span<30&&span>=0)issues.push({level:"warn",text:`整段期間只有 ${Math.round(span)} 天，年化報酬會被放大，參考價值低`});
  return issues;
}

/* =============================================================================
   數列解析
   ============================================================================= */
const parseCashflows = text => String(text||"").split(/[\n,，;；]+/).map(x=>x.trim()).filter(x=>x!=="").map(x=>n(x,Number.NaN)).filter(Number.isFinite);
const parseSeries = text => String(text||"").split(/[\n,，;；\s]+/).map(x=>x.trim()).filter(x=>x!=="").map(x=>n(x,Number.NaN)).filter(Number.isFinite).map(x=>x/100);
function countBadEntries(text,splitter=/[\n,，;；]+/){
  const items=String(text||"").split(splitter).map(x=>x.trim()).filter(x=>x!=="");
  return{total:items.length,bad:items.filter(x=>!Number.isFinite(n(x,Number.NaN)))};
}

/* =============================================================================
   財務數學（維持原有算法）
   ============================================================================= */
const average = a => a.length?a.reduce((s,x)=>s+x,0)/a.length:Number.NaN;
const std = a => {if(a.length<2)return Number.NaN;const m=average(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
const covariance = (a,b) => {const count=Math.min(a.length,b.length);if(count<2)return Number.NaN;const x=a.slice(0,count),y=b.slice(0,count),xm=average(x),ym=average(y);return x.reduce((s,v,i)=>s+(v-xm)*(y[i]-ym),0)/(count-1);};
const correlation = (a,b) => {const count=Math.min(a.length,b.length),den=std(a.slice(0,count))*std(b.slice(0,count));return den?covariance(a.slice(0,count),b.slice(0,count))/den:Number.NaN;};
const npv = (rate,flows) => rate<=-1||!flows.length?Number.NaN:flows.reduce((s,x,i)=>s+x/(1+rate)**i,0);
const irr = flows => {
  if(flows.length<2||!flows.some(x=>x<0)||!flows.some(x=>x>0))return Number.NaN;
  let low=-.9999,high=10,lv=npv(low,flows),hv=npv(high,flows);
  for(let i=0;i<12&&lv*hv>0;i++){high*=2;hv=npv(high,flows)}
  if(!Number.isFinite(lv)||!Number.isFinite(hv)||lv*hv>0)return Number.NaN;
  for(let i=0;i<220;i++){const mid=(low+high)/2,v=npv(mid,flows);if(Math.abs(v)<EPSILON)return mid;if(lv*v<=0)high=mid;else{low=mid;lv=v}}
  return (low+high)/2;
};
const xnpv = (rate,flows) => {if(rate<=-1||!flows.length)return Number.NaN;const first=flows[0].date.getTime();return flows.reduce((s,x)=>s+x.amount/(1+rate)**((x.date.getTime()-first)/86400000/365),0)};
const xirr = flows => {if(flows.length<2||!flows.some(x=>x.amount<0)||!flows.some(x=>x.amount>0))return Number.NaN;const sorted=[...flows].sort((a,b)=>a.date-b.date);let low=-.9999,high=10,lv=xnpv(low,sorted),hv=xnpv(high,sorted);for(let i=0;i<12&&lv*hv>0;i++){high*=2;hv=xnpv(high,sorted)}if(!Number.isFinite(lv)||!Number.isFinite(hv)||lv*hv>0)return Number.NaN;for(let i=0;i<220;i++){const mid=(low+high)/2,v=xnpv(mid,sorted);if(Math.abs(v)<EPSILON)return mid;if(lv*v<=0)high=mid;else{low=mid;lv=v}}return(low+high)/2};
const futureValue=(principal,monthly,annualRate,years)=>{const periods=Math.max(0,Math.round(years*12)),r=annualRate/12;return principal*(1+r)**periods+(Math.abs(r)<EPSILON?monthly*periods:monthly*((1+r)**periods-1)/r)};
const presentValue=(future,rate,years)=>future/(1+rate)**years;
const monthlyForTarget=(target,principal,rate,years)=>{const periods=Math.max(1,Math.round(years*12)),r=rate/12,grown=principal*(1+r)**periods;return Math.abs(r)<EPSILON?(target-grown)/periods:(target-grown)*r/((1+r)**periods-1)};
const yearsToTarget=(target,principal,monthly,rate)=>{if(target<=principal)return 0;for(let month=1;month<=1200;month++)if(futureValue(principal,monthly,rate,month/12)>=target)return month/12;return Number.NaN};
const payment=(principal,rate,months)=>{const count=Math.max(1,Math.round(months)),r=rate/12;return Math.abs(r)<EPSILON?principal/count:principal*r/(1-(1+r)**-count)};
const amortize=(principal,rate,months,extra=0)=>{const scheduled=payment(principal,rate,months),r=rate/12;let balance=principal,totalInterest=0,count=0;while(balance>.01&&count<2400){const interest=balance*r,paid=Math.min(balance+interest,scheduled+Math.max(0,extra));balance=Math.max(0,balance+interest-paid);totalInterest+=interest;count++}return{scheduled,months:count,totalInterest,totalPaid:principal+totalInterest}};
const maxDrawdown=returns=>{let value=1,peak=1,drawdown=0;returns.forEach(r=>{value*=1+r;peak=Math.max(peak,value);drawdown=Math.min(drawdown,value/peak-1)});return drawdown};

/* =============================================================================
   圖表：純手寫 SVG，不引用外部套件（符合本頁 CSP，且完全離線可用）
   依容器實際寬度重繪，字級維持真實像素，手機縮小後仍然清楚
   ============================================================================= */
function niceTicks(min,max,count){
  if(!Number.isFinite(min)||!Number.isFinite(max))return[0,1];
  if(min===max){const pad=Math.abs(min)||1;min-=pad;max+=pad}
  const step0=(max-min)/Math.max(1,count);
  const mag=10**Math.floor(Math.log10(Math.abs(step0)||1));
  const norm=step0/mag;
  const step=(norm<=1?1:norm<=2?2:norm<=5?5:10)*mag;
  const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;
  const ticks=[];
  for(let v=lo;v<=hi+step/2;v+=step)ticks.push(Number(v.toPrecision(12)));
  return ticks.length>1?ticks:[lo,lo+step];
}
const shortNum=value=>{
  if(!Number.isFinite(value))return"";
  const abs=Math.abs(value);
  if(abs>=1e8)return`${nf(value/1e8,1)}億`;
  if(abs>=1e4)return`${nf(value/1e4,abs>=1e6?0:1)}萬`;
  return nf(value,abs<10?1:0);
};
const shortPct=value=>Number.isFinite(value)?`${nf(value*100,abs2(value*100))}%`:"";
const abs2=value=>Math.abs(value)<10?1:0;

const chart=(id,title="")=>`<figure class="chart-wrap"><figcaption>${title}</figcaption><div class="chart-box" id="${id}"></div></figure>`;

function drawChart(id,{labels=[],series=[],formatY=shortNum,xTitle="",empty="輸入資料後會顯示圖表"}){
  const host=$("#"+id);
  if(!host)return;
  const usable=series.filter(s=>s.values&&s.values.some(v=>Number.isFinite(v)));
  if(!labels.length||!usable.length){host.innerHTML=`<p class="chart-empty">${escapeHtml(empty)}</p>`;return}

  const width=Math.max(260,Math.round(host.clientWidth||panelEl.clientWidth||600));
  const compact=width<440;
  const height=compact?variableHeight(labels.length):265;
  const pad={t:12,r:compact?12:18,b:compact?42:36,l:compact?48:64};
  const plotW=Math.max(40,width-pad.l-pad.r);
  const plotH=Math.max(40,height-pad.t-pad.b);

  const all=usable.flatMap(s=>s.values.filter(Number.isFinite));
  const hasBar=usable.some(s=>s.kind==="bar");
  let lo=Math.min(...all),hi=Math.max(...all);
  if(hasBar){lo=Math.min(lo,0);hi=Math.max(hi,0)}
  const ticks=niceTicks(lo,hi,compact?3:5);
  const yMin=ticks[0],yMax=ticks[ticks.length-1];
  const yOf=value=>pad.t+plotH-((value-yMin)/((yMax-yMin)||1))*plotH;
  const band=plotW/labels.length;
  const centre=index=>pad.l+band*(index+.5);

  const parts=[];
  ticks.forEach(tick=>{
    const y=yOf(tick);
    parts.push(`<line class="chart-grid${Math.abs(tick)<1e-9?" zero":""}" x1="${pad.l}" y1="${y.toFixed(1)}" x2="${(pad.l+plotW).toFixed(1)}" y2="${y.toFixed(1)}"/>`);
    parts.push(`<text class="chart-axis" x="${pad.l-8}" y="${(y+4).toFixed(1)}" text-anchor="end">${escapeHtml(formatY(tick))}</text>`);
  });

  const step=Math.ceil(labels.length/(compact?4:8));
  labels.forEach((label,index)=>{
    if(index%step!==0&&index!==labels.length-1)return;
    parts.push(`<text class="chart-axis" x="${centre(index).toFixed(1)}" y="${(pad.t+plotH+18).toFixed(1)}" text-anchor="middle">${escapeHtml(label)}</text>`);
  });

  const bars=usable.filter(s=>s.kind==="bar");
  bars.forEach((s,order)=>{
    const slot=(band*.68)/bars.length;
    s.values.forEach((value,index)=>{
      if(!Number.isFinite(value))return;
      const x=centre(index)-(band*.68)/2+slot*order;
      const y0=yOf(0),y1=yOf(value);
      parts.push(`<rect class="chart-bar ${s.cls||"s-a"}${value<0?" neg":""}" x="${x.toFixed(1)}" y="${Math.min(y0,y1).toFixed(1)}" width="${Math.max(1,slot-2).toFixed(1)}" height="${Math.max(1,Math.abs(y1-y0)).toFixed(1)}"><title>${escapeHtml(`${labels[index]}｜${s.name}：${formatY(value)}`)}</title></rect>`);
    });
  });

  usable.filter(s=>s.kind!=="bar").forEach(s=>{
    const points=s.values.map((value,index)=>Number.isFinite(value)?`${centre(index).toFixed(1)},${yOf(value).toFixed(1)}`:null).filter(Boolean);
    if(points.length<2)return;
    if(s.fill)parts.push(`<polygon class="chart-area ${s.cls||"s-a"}" points="${pad.l+band*.5},${yOf(Math.max(yMin,0)).toFixed(1)} ${points.join(" ")} ${(pad.l+plotW-band*.5).toFixed(1)},${yOf(Math.max(yMin,0)).toFixed(1)}"/>`);
    parts.push(`<polyline class="chart-line ${s.cls||"s-a"}${s.dashed?" dashed":""}" points="${points.join(" ")}"/>`);
    const last=s.values.reduce((keep,value,index)=>Number.isFinite(value)?index:keep,-1);
    if(last>=0)parts.push(`<circle class="chart-dot ${s.cls||"s-a"}" cx="${centre(last).toFixed(1)}" cy="${yOf(s.values[last]).toFixed(1)}" r="3.5"><title>${escapeHtml(`${labels[last]}｜${s.name}：${formatY(s.values[last])}`)}</title></circle>`);
  });

  const legend=usable.map(s=>`<span><i class="${s.cls||"s-a"}${s.kind==="bar"?" box":""}"></i>${escapeHtml(s.name)}</span>`).join("");
  host.innerHTML=`<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" tabindex="0" aria-label="${escapeHtml(usable.map(s=>s.name).join("、"))}走勢圖，可用左右方向鍵逐點查看數值">${parts.join("")}<g class="chart-cursor"></g></svg>`
    +(xTitle?`<p class="chart-x">${escapeHtml(xTitle)}</p>`:"")
    +`<p class="chart-readout" aria-live="polite">點一下或滑過圖表可看該點數值</p>`
    +`<div class="chart-legend">${legend}</div>`;

  host._chart={labels,series:usable,pad,plotH,band,width,formatY,centre,yOf};
  bindChartCursor(host);
  if(host._index!=null&&host._index<labels.length)highlightChart(host,host._index);
}
const variableHeight=count=>count>18?230:210;

/* 圖表互動：滑過、點擊或用方向鍵，顯示該位置所有數列的數值 */
function indexFromClientX(host,clientX){
  const svg=host.querySelector("svg"),config=host._chart;
  if(!svg||!config)return-1;
  const box=svg.getBoundingClientRect();
  if(!box.width)return-1;
  const x=(clientX-box.left)*(config.width/box.width);
  return Math.max(0,Math.min(config.labels.length-1,Math.round((x-config.pad.l)/config.band-.5)));
}
function highlightChart(host,index){
  const config=host._chart,svg=host.querySelector("svg"),cursor=svg?.querySelector(".chart-cursor");
  if(!config||!cursor||index<0||index>=config.labels.length)return;
  host._index=index;
  const x=config.centre(index);
  const marks=config.series.map(s=>{
    const value=s.values[index];
    if(!Number.isFinite(value))return"";
    return `<circle class="cursor-dot ${s.cls||"s-a"}" cx="${x.toFixed(1)}" cy="${config.yOf(value).toFixed(1)}" r="4.5"/>`;
  }).join("");
  cursor.innerHTML=`<line class="cursor-line" x1="${x.toFixed(1)}" y1="${config.pad.t}" x2="${x.toFixed(1)}" y2="${(config.pad.t+config.plotH).toFixed(1)}"/>${marks}`;
  const values=config.series.map(s=>{
    const value=s.values[index];
    return Number.isFinite(value)?`<span><i class="${s.cls||"s-a"}"></i>${escapeHtml(s.name)} <b>${escapeHtml(config.formatY(value))}</b></span>`:"";
  }).join("");
  const readout=host.querySelector(".chart-readout");
  if(readout)readout.innerHTML=`<strong>${escapeHtml(config.labels[index])}</strong>${values}`;
}
function clearChartCursor(host){
  const cursor=host.querySelector(".chart-cursor");
  if(cursor)cursor.innerHTML="";
  const readout=host.querySelector(".chart-readout");
  if(readout)readout.textContent="點一下或滑過圖表可看該點數值";
  host._index=null;
}
function bindChartCursor(host){
  if(host._bound)return;
  host._bound=true;
  host.addEventListener("pointermove",event=>{
    if(event.pointerType==="mouse")highlightChart(host,indexFromClientX(host,event.clientX));
  },{passive:true});
  host.addEventListener("pointerdown",event=>highlightChart(host,indexFromClientX(host,event.clientX)),{passive:true});
  host.addEventListener("pointerleave",()=>{if(host._index!=null)clearChartCursor(host)},{passive:true});
  host.addEventListener("keydown",event=>{
    const config=host._chart;
    if(!config)return;
    const keys={ArrowLeft:-1,ArrowRight:1,Home:"first",End:"last",Escape:"clear"};
    if(!(event.key in keys))return;
    event.preventDefault();
    const move=keys[event.key];
    if(move==="clear")return clearChartCursor(host);
    const current=host._index==null?-1:host._index;
    const next=move==="first"?0:move==="last"?config.labels.length-1:Math.max(0,Math.min(config.labels.length-1,(current<0?0:current)+move));
    highlightChart(host,next);
  });
}

/* =============================================================================
   版型元件：欄位一律留空，範例值只做灰色提示（placeholder）
   ============================================================================= */
const field=(id,label,example,suffix="",hint="")=>`<label class="field"><span>${label}</span><div class="input-wrap"><input id="${id}" type="number" inputmode="decimal" placeholder="${example}" autocomplete="off">${suffix?`<b>${suffix}</b>`:""}</div>${hint?`<small>${hint}</small>`:""}</label>`;
const area=(id,label,example,hint="")=>`<label class="field wide"><span>${label}</span><textarea id="${id}" rows="5" placeholder="${String(example).replace(/\n/g,"&#10;")}" autocomplete="off" spellcheck="false"></textarea>${hint?`<small>${hint}</small>`:""}</label>`;
const result=(id,label,note="")=>`<article class="result-card"><span>${label}</span><strong id="${id}">${DASH}</strong>${note?`<small>${note}</small>`:""}<small class="formula" id="${id}-formula"></small></article>`;
const check=id=>`<div class="input-check" id="${id}" hidden></div>`;
/* 並排比較：左右兩欄輸入 + 差異表 */
const compare=(title,intro,colA,colB,tableId,heads)=>
`<div class="subsection"><h3>${title}</h3>${intro}
<div class="compare-grid">
  <section class="compare-col" aria-label="方案 A"><h4><span class="tag-a">A</span>方案 A</h4>${colA}</section>
  <section class="compare-col" aria-label="方案 B"><h4><span class="tag-b">B</span>方案 B</h4>${colB}</section>
</div>
<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody id="${tableId}"></tbody></table></div></div>`;
/* 差異值：正負都標示顏色，並附上「哪個比較划算」的方向 */
/* 差異欄。better 只在「方向明確」時才給判讀：
   "lower"＝越低越好、"higher"＝越高越好、null＝這是取捨，不下結論。
   例如貸款期數短總利息少但月付高，沒有客觀的好壞，就不標。 */
const diffCell=(value,formatter,better=null)=>{
  if(!Number.isFinite(value))return `<td data-label="差異（B − A）">${DASH}</td>`;
  if(Math.abs(value)<1e-9)return `<td data-label="差異（B − A）">相同</td>`;
  /* 正負號一定要標出來，否則「少付 41 萬」會被誤讀成「多付 41 萬」 */
  const sign=value>0?"+":"−";
  const text=`${sign}${formatter(value)}`;
  if(!better)return `<td data-label="差異（B − A）">${text}</td>`;
  const good=better==="lower"?(value<0):(value>0);
  return `<td data-label="差異（B − A）" class="${good?"positive":"negative"}">${text}<small>${good?"B 較有利":"A 較有利"}</small></td>`;
};
/* 較長的欄位說明：解釋這個欄位在做什麼、什麼時候該用 */
const note=(title,body)=>`<div class="field-note"><strong>${title}</strong><p>${body}</p></div>`;
const set=(id,value)=>{const node=$("#"+id);if(node)node.textContent=value};
const setFormula=(id,text)=>{const node=$("#"+id+"-formula");if(node)node.textContent=text||""};
const heading=(eyebrow,title,description)=>`<div class="panel-heading"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><p>${description}</p></div><div class="panel-tools"><button type="button" class="formula-toggle" id="formula-toggle" aria-pressed="false">顯示計算式</button><button type="button" class="panel-action" data-export="report">列印／存 PDF</button><button type="button" class="panel-action" data-export="copy">複製結果</button><button type="button" class="panel-action" data-export="csv">下載 CSV</button><span class="export-status" id="export-status" role="status" aria-live="polite"></span></div>${check("panel-check")}`;

function setCheck(id,items){
  const node=$("#"+id);
  if(!node)return;
  const list=(items||[]).filter(Boolean);
  if(!list.length){node.innerHTML="";node.hidden=true;return}
  node.hidden=false;
  const rank={error:0,warn:1,info:2};
  node.innerHTML=list.sort((a,b)=>rank[a.level]-rank[b.level]).slice(0,8)
    .map(item=>`<p class="chk ${item.level}"><b>${item.level==="error"?"需修正":item.level==="warn"?"注意":"說明"}</b>${escapeHtml(item.text)}</p>`).join("");
}

/* 自動偵測本頁哪些數字欄位還沒填 */
function blankFieldNotice(){
  const inputs=[...panelEl.querySelectorAll(".field input")];
  if(!inputs.length)return[];
  const blanks=inputs.filter(input=>input.value.trim()==="");
  if(!blanks.length)return[];
  if(blanks.length===inputs.length)return[{level:"info",text:"欄位中的灰色數字只是範例，點一下就能直接輸入自己的數字；每格下方都有說明。"}];
  const names=blanks.map(input=>input.closest(".field").querySelector("span").textContent);
  return[{level:"info",text:`尚未填寫：${names.join("、")}。利率、稅率這類欄位留空會當作 0；關鍵欄位沒填的結果會顯示「—」。`}];
}

/* =============================================================================
   八組試算面板
   ============================================================================= */
const panels={

returns:{html:()=>`${heading("RETURN LAB","報酬與現金流","金額視為同一幣別；負數代表投入或支出，正數代表回收或收入。")}<div class="form-grid">${field("r-start","期初投入",100000,"元","一開始投入的成本，例如買進金額。")}${field("r-end","期末價值",150000,"元","現在或結束時的價值，含已領回的部分。")}${field("r-years","持有期間",5,"年","從投入到期末經過幾年，可填小數，如 2.5。")}${field("r-inflation","通膨率",2,"%","年平均物價上漲率，填 2 代表 2%。留空視為 0。")}${field("r-tax","稅率",10,"%","獲利要繳稅的比率，填 10 代表 10%。留空視為 0。")}${field("r-discount","NPV 折現率",5,"%","你要求的最低年報酬率，用來把未來的錢換算成現在的價值。")}</div><div class="results-grid">${result("r-roi","ROI 投資報酬率","整段期間總共賺賠幾 %，不分幾年")}${result("r-cagr","CAGR／年化報酬率","把總報酬換算成每年平均賺幾 %")}${result("r-real","通膨後實質報酬","扣掉物價上漲後，實際增加的購買力")}${result("r-after","簡化稅後報酬","正報酬乘上稅後比例")}</div>

${note("等期間現金流：每筆間隔一樣長時用這個","適用「每年（或每月、每季）固定發生一次」的情況，例如定存到期領息、每年配息、租金收入。<br>第一個數字是期初投入，用<b>負數</b>；之後每一期收到的錢用<b>正數</b>，沒有現金進出就填 0。數字之間用逗號分隔，順序就是第 0 期、第 1 期、第 2 期…<br>例：<code>-100000, 20000, 25000, 30000</code> 表示先投入 10 萬，之後三期分別回收 2 萬、2.5 萬、3 萬。")}
<div class="split-input">${area("r-flows","等期間現金流","-100000, 20000, 25000, 30000, 35000, 40000","以逗號分隔；第一個通常是負數（投入）。")}<div class="mini-results">${result("r-irr","IRR 內部報酬率","讓這串現金流剛好回本的年報酬率")}${result("r-npv","NPV 淨現值","用折現率換算後，這筆投資現在值多少；大於 0 代表划算")}</div></div>${check("r-flows-check")}

${note("不定期現金流：每筆時間不規則時用這個","適用「想到就加碼、隨時部分贖回」這種時間不固定的情況，例如零股定期不定額、保單不定期繳費、房地產分次投入。<br>每行一筆，格式是 <code>日期｜金額</code>。投入的錢用<b>負數</b>、拿回來的錢用<b>正數</b>。<br>日期寫法很寬鬆，這些都可以：<code>2021-01-01</code>、<code>2021/1/1</code>、<code>2021.1.1</code>、<code>20210101</code>、<code>2021年1月1日</code>、<code>民國110/1/1</code>。<br>與上面的差別：等期間用「第幾期」計算，這裡是用<b>實際天數</b>計算，所以更精準。")}
<div class="split-input">${area("r-dated","不定期現金流","2021-01-01｜-100000\n2022-06-30｜25000\n2024-03-15｜35000\n2026-01-01｜70000","每行一筆：日期｜金額。投入填負數、回收填正數。")}<div class="mini-results">${result("r-xirr","XIRR 不定期年化報酬","考慮每筆實際發生日期後的年化報酬率")}${result("r-xstate","判讀","整段投資到目前為止是賺還是賠")}</div></div>${check("r-dated-check")}${chart("r-chart","等期間現金流與累計回收")}`,
calc:()=>{
  const start=val("r-start"),end=val("r-end"),yearsRaw=val("r-years"),years=Math.max(.0001,yearsRaw),
    inflation=val("r-inflation")/100,tax=val("r-tax")/100,discount=val("r-discount")/100,
    roi=start?(end-start)/start:Number.NaN,
    cagr=start>0&&end>=0?(end/start)**(1/years)-1:Number.NaN,
    real=(1+cagr)/(1+inflation)-1,
    after=roi*(1-tax);
  const core=["r-start","r-end"];
  set("r-roi",pct(req(core,roi)));setFormula("r-roi",`ROI =（期末 − 期初）÷ 期初 =（${g(end,0)} − ${g(start,0)}）÷ ${g(start,0)}`);
  set("r-cagr",pct(req([...core,"r-years"],cagr)));setFormula("r-cagr",`CAGR =（期末 ÷ 期初）^(1 ÷ 年數) − 1 =（${g(end,0)} ÷ ${g(start,0)}）^(1 ÷ ${g(years,2)}) − 1`);
  set("r-real",pct(req([...core,"r-years"],real)));setFormula("r-real",`實質 =（1 + CAGR）÷（1 + 通膨）− 1 =（1 + ${gp(cagr*100)}）÷（1 + ${gp(inflation*100)}）− 1`);
  set("r-after",pct(req(core,after)));setFormula("r-after",`稅後 = ROI ×（1 − 稅率）= ${gp(roi*100)} ×（1 − ${gp(tax*100)}）`);

  const flowCheck=countBadEntries(raw("r-flows"));
  const flows=parseCashflows(raw("r-flows"));
  const flowIssues=[];
  if(flowCheck.bad.length)flowIssues.push({level:"error",text:`等期間現金流有 ${flowCheck.bad.length} 個項目不是數字：${flowCheck.bad.slice(0,4).join("、")}`});
  if(flows.length&&flows.length<2)flowIssues.push({level:"error",text:"至少要 2 期現金流才能算 IRR"});
  if(flows.length>=2&&(!flows.some(x=>x<0)||!flows.some(x=>x>0)))flowIssues.push({level:"error",text:"需要同時有投入（負數）與回收（正數），否則 IRR 無解"});
  setCheck("r-flows-check",flowIssues);
  const irrValue=irr(flows),npvValue=npv(discount,flows);
  set("r-irr",pct(irrValue));setFormula("r-irr",flows.length?`解 r 使 Σ CF‹t› ÷ (1+r)^t = 0，共 ${flows.length} 期（二分法逼近）`:"請先輸入現金流");
  set("r-npv",money(npvValue));setFormula("r-npv",flows.length?`NPV = Σ CF‹t› ÷ (1 + ${gp(discount*100)})^t，t = 0…${flows.length-1}`:"請先輸入現金流");

  const dated=parseDatedLines(raw("r-dated"));
  const datedIssues=[...dated.issues,...checkDatedFlows(dated.flows)];
  setCheck("r-dated-check",datedIssues);
  const xr=dated.flows.length>=2?xirr(dated.flows):Number.NaN;
  set("r-xirr",pct(xr));
  setFormula("r-xirr",dated.flows.length?`解 r 使 Σ CF ÷ (1+r)^((該日 − 首日) ÷ 365) = 0，共 ${dated.flows.length} 筆`:"請先輸入日期與金額");
  const blocking=datedIssues.some(x=>x.level==="error");
  set("r-xstate",blocking?"請先修正上方問題":Number.isFinite(xr)?(xr>=0?"正報酬":"負報酬"):DASH);
  setFormula("r-xstate","依 XIRR 結果的正負判斷");

  let running=0;
  const cumulative=flows.map(x=>running+=x);
  drawChart("r-chart",{
    labels:flows.map((_,index)=>`第${index}期`),
    series:[
      {name:"每期現金流",kind:"bar",cls:"s-a",values:flows},
      {name:"累計淨回收",kind:"line",cls:"s-b",values:cumulative}
    ],
    xTitle:"期數（第 0 期為期初投入）",
    empty:"輸入「等期間現金流」後會畫出每期收支與累計回收曲線"
  });
  setCheck("panel-check",blankFieldNotice());
}},

growth:{html:()=>`${heading("COMPOUND GROWTH","複利與投入規劃","假設報酬率固定且每月底投入；實際市場報酬不會固定。")}${note("這組工具在算什麼","給定「現在有多少、每月再投入多少、報酬率多少、投資幾年」，算出最後會累積到多少；也可以反過來，從目標金額回推每月要投入多少。<br>所有計算都假設每月底投入、報酬率固定不變，實際市場會上下波動，請當成長期平均的概略估算。")}<div class="form-grid">${field("g-principal","目前本金",200000,"元","現在已經有、要一次投入的金額。沒有就留空。")}${field("g-monthly","每月投入",10000,"元","之後每個月固定再投入的金額，假設在月底投入。")}${field("g-rate","預期年報酬率",6,"%","你假設的年化報酬，填 6 代表 6%。")}${field("g-dividend","配息率（全數再投入）",3,"%","額外的年配息率，假設全部再投入。留空視為 0。")}${field("g-years","投資期間",10,"年","打算持續投資幾年。")}${field("g-target","目標金額",3000000,"元","你想達到的金額，用來反推需要投入多少或要花多久。")}</div><div class="results-grid">${result("g-lump","單筆投資終值","只靠目前本金、不再投入的結果")}${result("g-total","定期定額終值","本金加上每月投入後的總結果")}${result("g-reinvest","配息再投入情境","以報酬率與配息率相加簡化估算")}${result("g-present","目標金額現在價值","目標金額換算成今天的價值")}${result("g-monthly-need","達標所需每月投入","要達成目標，每月得投入多少")}${result("g-principal-need","達標所需期初本金","若不改月投入，期初還缺多少本金")}${result("g-years-need","依目前投入達標時間","照現在的投入速度要多久達標")}${result("g-cost","預估投入本金","期間內你實際掏出來的錢，不含報酬")}</div>${chart("g-chart","資產成長：累積投入 vs 帳戶價值")}`,
calc:()=>{
  const p=val("g-principal"),m=val("g-monthly"),r=val("g-rate")/100,d=val("g-dividend")/100,y=val("g-years"),t=val("g-target");
  const months=Math.max(0,Math.round(y*12)),i=r/12;
  const need=presentValue(t-futureValue(0,m,r,y),r,y),when=yearsToTarget(t,p,m,r);
  set("g-lump",money(req(["g-principal","g-years"],futureValue(p,0,r,y))));setFormula("g-lump",`終值 = 本金 ×（1 + 年報酬 ÷ 12）^(年 × 12) = ${g(p,0)} ×（1 + ${gp(r*100)} ÷ 12）^${months}`);
  set("g-total",money(req(["g-years"],futureValue(p,m,r,y))));setFormula("g-total",`終值 = 本金×(1+i)^n + 月投入×((1+i)^n − 1) ÷ i，i = ${gp(i*100,4)}、n = ${months}`);
  set("g-reinvest",money(req(["g-years"],futureValue(p,m,r+d,y))));setFormula("g-reinvest",`同上但 i =（年報酬 + 配息）÷ 12 =（${gp(r*100)} + ${gp(d*100)}）÷ 12`);
  set("g-present",money(req(["g-target","g-years"],presentValue(t,r,y))));setFormula("g-present",`現值 = 目標 ÷ (1 + 年報酬)^年 = ${g(t,0)} ÷ (1 + ${gp(r*100)})^${g(y,2)}`);
  set("g-monthly-need",money(req(["g-target","g-years"],Math.max(0,monthlyForTarget(t,p,r,y)))));setFormula("g-monthly-need",`每月 =（目標 − 本金×(1+i)^n）× i ÷ ((1+i)^n − 1)`);
  set("g-principal-need",money(req(["g-target","g-years"],Math.max(0,need))));setFormula("g-principal-need",`期初 =（目標 − 定期定額累積終值）÷ (1 + 年報酬)^年`);
  set("g-years-need",isBlank("g-target")?DASH:(Number.isFinite(when)?`${num(when,1)} 年`:"超過 100 年／無法達標"));setFormula("g-years-need","以現有本金與月投入逐月試算，找出首次達標的月份");
  set("g-cost",money(req(["g-years"],p+m*y*12)));setFormula("g-cost",`投入本金 = 目前本金 + 月投入 × 年 × 12 = ${g(p,0)} + ${g(m,0)} × ${g(y,2)} × 12`);

  const span=isBlank("g-years")?0:Math.min(60,Math.max(1,Math.round(y)||0));
  const labels=[],invested=[],balance=[],targetLine=[];
  for(let year=0;span&&year<=span;year++){
    labels.push(`${year}年`);
    invested.push(p+m*year*12);
    balance.push(futureValue(p,m,r,year));
    targetLine.push(t>0?t:Number.NaN);
  }
  drawChart("g-chart",{
    labels,
    series:[
      {name:"帳戶價值",kind:"line",cls:"s-a",fill:true,values:balance},
      {name:"累積投入本金",kind:"line",cls:"s-b",values:invested},
      {name:"目標金額",kind:"line",cls:"s-c",dashed:true,values:targetLine}
    ],
    xTitle:"投資年數",
    empty:"填入投資期間後會畫出逐年成長曲線"
  });
  setCheck("panel-check",blankFieldNotice());
}},

policy:{html:()=>`${heading("POLICY VALUE","保單價值分析","依保單年度輸入保費與解約金；只做現金流試算，不代表商品建議。")}${note("這兩欄怎麼填","打開保單條款或建議書裡的「保單價值表」，會有一張逐年的表格。<br><b>每年度保費</b>：第 1 年到第 N 年各繳多少，依年度順序用逗號分隔。每年一樣多就重複填；躉繳（一次繳清）只填第一年、其餘填 0。<br><b>各年度末解約金</b>：同一張表上「解約金」或「保單價值準備金」欄位的數字，第 1 個對應第 1 年年末，以此類推。<br>兩欄的<b>筆數要一樣</b>，第 N 個數字要對到第 N 個保單年度，否則年度會對不齊。")}<div class="split-input">${area("p-premiums","每年度保費","100000,100000,100000,100000,100000,100000,100000,100000,100000,100000","第 1 年到第 N 年，依序用逗號分隔。")}${area("p-values","各年度末解約金／保單價值","20000,80000,160000,260000,380000,510000,650000,800000,960000,1130000","對應各年度末的解約金，筆數要與保費相同。")}</div>${check("p-check")}<div class="form-grid compact">${field("p-benefit","保障金額",3000000,"元","身故或全殘可領的保額，用來看保障是已繳保費的幾倍。")}<label class="field"><span>保費繳納時點</span><select id="p-timing"><option value="begin">年初繳（一般壽險，預設）</option><option value="end">年末繳</option></select><small>保險公司的建議書多以年初繳計算。選錯會讓 IRR 差好幾個百分點。</small></label></div><div class="results-grid">${result("p-paid","最新年度累積保費","到目前為止總共繳了多少")}${result("p-value","最新解約金","現在解約可以拿回多少")}${result("p-irr","最新年度解約金 IRR","若現在解約，這張保單的年化報酬率")}${result("p-leverage","保障／累積保費倍數","每繳 1 元保費換到幾元保障")}${result("p-break","解約金損益兩平年度","第幾年解約金才追上已繳保費")}</div><div class="table-wrap"><table><thead><tr><th>年度</th><th>累積保費</th><th>保單價值</th><th>年度 IRR</th></tr></thead><tbody id="p-table"></tbody></table></div>${chart("p-chart","累積保費 vs 保單價值")}${compare(
"保單並排比較",
note("兩張保單擺在一起看","<b>保單 A</b> 直接沿用你在上方輸入的資料，只要再填<b>保單 B</b> 就能比較。<br>下方會列出累積保費、解約金、年化 IRR 與損益兩平年度的差異；<b>綠色代表保單 B 較有利</b>。<br>比較的是同一個保單年度（取兩張都有資料的最後一年），保障內容與條款差異請另外檢視，不是只看 IRR。"),
`<p class="compare-hint">使用上方已輸入的「每年度保費」與「各年度末解約金」。</p><div class="form-grid compact">${field("p-benefit-a","保障金額",3000000,"元","留空沿用上方的保障金額")}</div>`,
`${area("p-premiums-b","每年度保費","120000,120000,120000,120000,120000,120000,120000,120000,120000,120000","第 1 年到第 N 年，依序用逗號分隔。")}${area("p-values-b","各年度末解約金","30000,110000,210000,330000,470000,630000,800000,980000,1180000,1390000","筆數要與保費相同。")}<div class="form-grid compact">${field("p-benefit-b","保障金額",3600000,"元","")}</div>`,
"cmp-policy-table",["項目","保單 A","保單 B","差異（B − A）"])}`,
calc:()=>{
  const premiumCheck=countBadEntries(raw("p-premiums")),valueCheck=countBadEntries(raw("p-values"));
  const premiums=parseCashflows(raw("p-premiums")).map(Math.abs),values=parseCashflows(raw("p-values"));
  const issues=[];
  if(premiumCheck.bad.length)issues.push({level:"error",text:`保費有 ${premiumCheck.bad.length} 個項目不是數字：${premiumCheck.bad.slice(0,4).join("、")}`});
  if(valueCheck.bad.length)issues.push({level:"error",text:`解約金有 ${valueCheck.bad.length} 個項目不是數字：${valueCheck.bad.slice(0,4).join("、")}`});
  if(premiums.length&&values.length&&premiums.length!==values.length)issues.push({level:"warn",text:`保費 ${premiums.length} 筆、解約金 ${values.length} 筆，筆數不一致；只會算到第 ${Math.min(premiums.length,values.length)} 年`});
  if(values.length>premiums.length&&premiums.length)issues.push({level:"warn",text:"解約金筆數多於保費，超出的年度會缺少對應保費"});
  setCheck("p-check",issues);

  /* 保費繳納時點會顯著影響 IRR：
     年初繳（業界慣例）→ 第 1…N 年保費落在 t = 0…N−1，第 N 年末解約金落在 t = N
     年末繳             → 保費落在 t = 1…N，解約金與最後一期保費同時點 */
  const atBegin=(textOf("p-timing")||"begin")!=="end";
  const rows=values.map((value,index)=>{
    const used=premiums.slice(0,index+1);
    const paid=used.reduce((sum,x)=>sum+x,0);
    let flows;
    if(atBegin){
      flows=[...used.map(x=>-x),value];
    }else{
      flows=[0,...used.map(x=>-x)];
      flows[flows.length-1]+=value;
    }
    return{year:index+1,value,paid,rate:irr(flows)};
  });
  const latest=rows.at(-1),breakeven=rows.find(x=>x.value>=x.paid)?.year;
  const leverage=latest?.paid?val("p-benefit")/latest.paid:Number.NaN;
  set("p-paid",money(latest?.paid));setFormula("p-paid",latest?`累積保費 = 第 1…${latest.year} 年保費相加`:"請先輸入保費");
  set("p-value",money(latest?.value));setFormula("p-value",latest?`第 ${latest.year} 年度末的解約金`:"請先輸入解約金");
  set("p-irr",pct(latest?.rate));setFormula("p-irr",latest?`現金流：第 1…${latest.year} 年保費（負）落在 t = ${atBegin?`0…${latest.year-1}`:`1…${latest.year}`}，第 ${latest.year} 年末解約金（正）落在 t = ${latest.year}，解 Σ CF ÷ (1+r)^t = 0`:"請先輸入保費與解約金");
  const leverageValue=req(["p-benefit"],leverage);
  set("p-leverage",Number.isFinite(leverageValue)?`${num(leverageValue)} 倍`:DASH);setFormula("p-leverage",`倍數 = 保障金額 ÷ 累積保費 = ${g(val("p-benefit"),0)} ÷ ${g(latest?.paid,0)}`);
  set("p-break",breakeven?`第 ${breakeven} 年`:(rows.length?"輸入期間內尚未達成":DASH));setFormula("p-break","第一個「解約金 ≥ 累積保費」的年度");
  const table=$("#p-table");
  if(table)table.innerHTML=rows.slice(0,30).map(x=>`<tr><td data-label="年度">第 ${x.year} 年</td><td data-label="累積保費">${money(x.paid)}</td><td data-label="保單價值">${money(x.value)}</td><td data-label="年度 IRR">${pct(x.rate)}</td></tr>`).join("");
  drawChart("p-chart",{
    labels:rows.map(x=>`第${x.year}年`),
    series:[
      {name:"累積保費",kind:"line",cls:"s-b",values:rows.map(x=>x.paid)},
      {name:"保單價值",kind:"line",cls:"s-a",fill:true,values:rows.map(x=>x.value)}
    ],
    xTitle:"保單年度（兩線交叉處即為損益兩平）",
    empty:"輸入每年度保費與解約金後會畫出兩條曲線"
  });

  /* ---- 保單並排比較 ---- */
  const buildRows=(prem,vals)=>vals.map((value,index)=>{
    const used=prem.slice(0,index+1);
    const paid=used.reduce((sum,x)=>sum+x,0);
    let flows;
    if(atBegin){flows=[...used.map(x=>-x),value]}
    else{flows=[0,...used.map(x=>-x)];flows[flows.length-1]+=value}
    return{year:index+1,value,paid,rate:irr(flows)};
  });
  const premB=parseCashflows(raw("p-premiums-b")).map(Math.abs);
  const valsB=parseCashflows(raw("p-values-b"));
  const rowsB=buildRows(premB,valsB);
  const cmpTable=$("#cmp-policy-table");
  if(cmpTable){
    const span=Math.min(rows.length,rowsB.length);
    if(span<1){
      cmpTable.innerHTML=`<tr><td data-label="狀態" colspan="4">在上方輸入保單 A、並在右欄輸入保單 B 的保費與解約金後，會顯示比較結果。</td></tr>`;
    }else{
      const a=rows[span-1],b=rowsB[span-1];
      const benefitA=isBlank("p-benefit-a")?val("p-benefit"):val("p-benefit-a");
      const benefitB=val("p-benefit-b");
      const levA=a.paid?benefitA/a.paid:Number.NaN, levB=b.paid?benefitB/b.paid:Number.NaN;
      const beA=rows.find(x=>x.value>=x.paid)?.year, beB=rowsB.find(x=>x.value>=x.paid)?.year;
      const rowsOut=[
        [`比較年度`,`第 ${span} 年`,`第 ${span} 年`,`<td data-label="差異（B − A）">—</td>`],
        /* 保費與解約金金額本身沒有絕對好壞（繳得多本來就領得多），不下判讀；
           IRR、保障倍數、損益兩平年度是已標準化的效率指標，方向才明確。 */
        ["累積保費",money(a.paid),money(b.paid),diffCell(b.paid-a.paid,v=>money(Math.abs(v)))],
        ["解約金",money(a.value),money(b.value),diffCell(b.value-a.value,v=>money(Math.abs(v)))],
        ["年化 IRR",pct(a.rate),pct(b.rate),diffCell(b.rate-a.rate,v=>pct(Math.abs(v)),"higher")],
        ["保障金額",money(benefitA),money(benefitB),diffCell(benefitB-benefitA,v=>money(Math.abs(v)))],
        ["保障／保費倍數",Number.isFinite(levA)?`${num(levA)} 倍`:DASH,Number.isFinite(levB)?`${num(levB)} 倍`:DASH,diffCell(levB-levA,v=>`${num(Math.abs(v))} 倍`,"higher")],
        ["損益兩平年度",beA?`第 ${beA} 年`:"期間內未達成",beB?`第 ${beB} 年`:"期間內未達成",
         (beA&&beB)?diffCell(beB-beA,v=>`${num(Math.abs(v),0)} 年`,"lower"):`<td data-label="差異（B − A）">${DASH}</td>`]
      ];
      cmpTable.innerHTML=rowsOut.map(r=>
        `<tr><td data-label="項目">${r[0]}</td><td data-label="保單 A">${r[1]}</td><td data-label="保單 B">${r[2]}</td>${r[3]}</tr>`
      ).join("");
    }
  }
  setCheck("panel-check",blankFieldNotice());
}},

retirement:{html:()=>`${heading("RETIREMENT MAP","年金與退休規劃","以實質報酬率估算退休支出現值，未納入稅負、醫療與市場順序風險。")}${note("這組工具在算什麼","比較兩件事：<b>退休那天你會存到多少</b>，以及<b>退休後要花掉多少</b>，兩者相減就是資金缺口。<br>生活費請用<b>現在的物價</b>填，工具會自動依通膨換算成退休當時的金額。未納入勞保勞退、稅負、重大醫療與市場報酬順序風險，屬於粗估。")}<div class="form-grid">${field("t-age","目前年齡",35,"歲","填整數即可。")}${field("t-retire","預計退休年齡",65,"歲","打算幾歲不再工作，需大於目前年齡。")}${field("t-life","規劃至年齡",90,"歲","退休金要支撐到幾歲，一般抓 85–95 歲較保守。")}${field("t-saved","目前退休準備",500000,"元","已經存下、專門用於退休的金額。")}${field("t-monthly","每月投入",15000,"元","退休前每月還會再存進去的金額。")}${field("t-rate","預期年報酬率",5,"%","退休前這筆錢的年化報酬假設。")}${field("t-inflation","預期通膨率",2,"%","年平均物價上漲率，台灣長期約 1–2%。留空視為 0。")}${field("t-expense","目前每月生活費",40000,"元","以現在物價計算，退休後每月要花多少。")}</div>${check("t-check")}<div class="results-grid">${result("t-years","距離退休","還有幾年可以準備")}${result("t-after-years","退休後規劃期間","退休金要撐幾年")}${result("t-real","通膨後實質報酬率","扣掉通膨後真正的成長率")}${result("t-future-expense","退休時每月生活費","同樣的生活品質，退休當時要花多少")}${result("t-projected","預估退休準備終值","照現在的存法，退休時會有多少")}${result("t-needed","退休所需資金現值","退休當天需要準備好的總金額")}${result("t-gap","退休資金缺口","還差多少；0 代表已足夠")}${result("t-ready","準備完成度","目前規劃可以覆蓋所需的幾 %")}</div>${chart("t-chart","退休準備累積 vs 所需資金")}`,
calc:()=>{
  const age=val("t-age"),retire=val("t-retire"),life=val("t-life");
  const issues=[];
  const filled=id=>!isBlank(id);
  if(filled("t-age")&&(age<0||age>120))issues.push({level:"error",text:`目前年齡 ${g(age,0)} 歲超出合理範圍（0–120）`});
  if(filled("t-retire")&&(retire<0||retire>120))issues.push({level:"error",text:`退休年齡 ${g(retire,0)} 歲超出合理範圍（0–120）`});
  if(filled("t-life")&&(life<0||life>130))issues.push({level:"error",text:`規劃至年齡 ${g(life,0)} 歲超出合理範圍（0–130）`});
  if(filled("t-age")&&filled("t-retire")&&retire<=age)issues.push({level:"error",text:`退休年齡（${g(retire,0)}）需大於目前年齡（${g(age,0)}）`});
  if(filled("t-retire")&&filled("t-life")&&life<=retire)issues.push({level:"error",text:`規劃至年齡（${g(life,0)}）需大於退休年齡（${g(retire,0)}）`});
  if(filled("t-age")&&filled("t-retire")&&retire-age>60)issues.push({level:"warn",text:`距離退休 ${g(retire-age,0)} 年偏長，長期預估誤差會很大`});
  if(!Number.isInteger(age)&&filled("t-age"))issues.push({level:"warn",text:"年齡建議填整數"});
  setCheck("t-check",issues);

  const years=Math.max(0,retire-age),after=Math.max(1,life-retire);
  const r=val("t-rate")/100,inflation=val("t-inflation")/100,real=(1+r)/(1+inflation)-1;
  const projected=futureValue(val("t-saved"),val("t-monthly"),r,years);
  const expense=val("t-expense")*(1+inflation)**years,annual=expense*12;
  const needed=Math.abs(real)<EPSILON?annual*after:annual*(1-(1+real)**-after)/real;
  const gap=needed-projected;
  const ages=["t-age","t-retire"],full=["t-age","t-retire","t-life","t-expense"];
  set("t-years",Number.isFinite(req(ages,years))?`${num(years,0)} 年`:DASH);setFormula("t-years",`距離退休 = 退休年齡 − 目前年齡 = ${g(retire,0)} − ${g(age,0)}`);
  set("t-after-years",Number.isFinite(req(["t-retire","t-life"],after))?`${num(after,0)} 年`:DASH);setFormula("t-after-years",`規劃期間 = 規劃至年齡 − 退休年齡 = ${g(life,0)} − ${g(retire,0)}`);
  set("t-real",pct(real));setFormula("t-real",`實質報酬 =（1 + 名目）÷（1 + 通膨）− 1 =（1 + ${gp(r*100)}）÷（1 + ${gp(inflation*100)}）− 1`);
  set("t-future-expense",money(req([...ages,"t-expense"],expense)));setFormula("t-future-expense",`退休時月支出 = 現在月支出 ×（1 + 通膨）^年 = ${g(val("t-expense"),0)} ×（1 + ${gp(inflation*100)}）^${g(years,0)}`);
  set("t-projected",money(req(ages,projected)));setFormula("t-projected",`終值 = 現有準備×(1+i)^n + 月投入×((1+i)^n − 1) ÷ i，i = ${gp(r/12*100,4)}、n = ${g(Math.round(years*12),0)}`);
  set("t-needed",money(req(full,needed)));setFormula("t-needed",`年金現值 = 年支出 ×（1 −（1 + 實質）^−期間）÷ 實質 = ${g(annual,0)} × …（期間 ${g(after,0)} 年）`);
  set("t-gap",money(req(full,Math.max(0,gap))));setFormula("t-gap",`缺口 = 所需資金 − 預估準備 = ${g(needed,0)} − ${g(projected,0)}`);
  set("t-ready",pct(req(full,needed?Math.min(1,projected/needed):Number.NaN)));setFormula("t-ready",`完成度 = 預估準備 ÷ 所需資金 = ${g(projected,0)} ÷ ${g(needed,0)}`);

  const span=(isBlank("t-age")||isBlank("t-retire"))?0:Math.min(70,Math.max(1,Math.round(years)||0));
  const labels=[],accumulated=[],requirement=[];
  for(let step=0;span&&step<=span;step++){
    labels.push(`${num(age+step,0)}歲`);
    accumulated.push(futureValue(val("t-saved"),val("t-monthly"),r,step));
    requirement.push(Number.isFinite(needed)?needed:Number.NaN);
  }
  drawChart("t-chart",{
    labels,
    series:[
      {name:"預估累積準備",kind:"line",cls:"s-a",fill:true,values:accumulated},
      {name:"退休所需資金",kind:"line",cls:"s-c",dashed:true,values:requirement}
    ],
    xTitle:"年齡（兩線交會代表準備到位）",
    empty:"填入目前年齡與退休年齡後會畫出累積曲線"
  });
  setCheck("panel-check",blankFieldNotice());
}},

risk:{html:()=>`${heading("RISK SIGNALS","投資風險指標","範例以每月報酬率計算；請輸入相同期間、相同頻率的資產與指標報酬。")}${note("這兩欄怎麼填","填的是<b>每一期的報酬率（%）</b>，不是價格也不是金額。<br><b>資產每月報酬率</b>：你要分析的標的，每個月漲跌幾 %。填 2.1 代表 +2.1%，虧損填負數如 -1.2。至少 3 期，建議 12 期以上才有參考價值。<br><b>比較指標</b>：拿來對照的基準，例如台股大盤、0050 或你的原本組合，<b>同期間、同順序</b>的報酬率，期數要和上面一致。<br>Beta、Alpha、R² 都是「相對於這個指標」算出來的；只想看波動與回撤的話，指標欄可以留空。")}<div class="split-input">${area("k-asset","資產每月報酬率（%）","2.1,-1.2,3.4,0.8,-2.0,4.1,1.5,0.2,2.7,-0.6,1.8,2.2","以逗號分隔。填 2.1 代表 +2.1%，虧損填負數。")}${area("k-market","比較指標每月報酬率（%）","1.7,-0.8,2.8,0.5,-1.5,3.2,1.1,0.1,2.0,-0.4,1.3,1.6","同期間、同順序，期數需與資產相同。")}</div>${check("k-check")}<div class="form-grid compact">${field("k-rf","無風險利率",1.5,"%","定存或短期公債的年利率，用來計算夏普值與 Alpha。")}</div><div class="results-grid">${result("k-count","資料期數","實際採用的資料筆數")}${result("k-return","估計年化報酬率","把每月報酬換算成年化")}${result("k-volatility","標準差／年化波動率","上下震盪的幅度，越大越顛簸")}${result("k-sharpe","夏普值","每承擔 1 單位風險換到多少超額報酬，越高越好")}${result("k-beta","Beta","指標漲 1%，這個資產大約跟著漲幾 %")}${result("k-alpha","Alpha","扣掉隨大盤的部分後，額外的超額報酬")}${result("k-r2","R²","漲跌有多少比例能被指標解釋，0–100%")}${result("k-drawdown","最大回撤","期間內從高點下跌的最大幅度")}${result("k-score","風險報酬比","報酬除以波動，另一種效率指標")}${result("k-market-return","比較指標年化報酬","指標本身的年化表現")}</div>${chart("k-chart","累積淨值走勢（起始 = 1）")}`,
calc:()=>{
  const assetCheck=countBadEntries(raw("k-asset"),/[\n,，;；\s]+/),marketCheck=countBadEntries(raw("k-market"),/[\n,，;；\s]+/);
  const a=parseSeries(raw("k-asset")),b=parseSeries(raw("k-market"));
  const issues=[];
  if(assetCheck.bad.length)issues.push({level:"error",text:`資產報酬有 ${assetCheck.bad.length} 個項目不是數字：${assetCheck.bad.slice(0,4).join("、")}`});
  if(marketCheck.bad.length)issues.push({level:"error",text:`指標報酬有 ${marketCheck.bad.length} 個項目不是數字：${marketCheck.bad.slice(0,4).join("、")}`});
  if(a.length&&a.length<3)issues.push({level:"error",text:"至少需要 3 期報酬率才能估計波動度"});
  if(a.length&&b.length&&a.length!==b.length)issues.push({level:"warn",text:`資產 ${a.length} 期、指標 ${b.length} 期，Beta 與 R² 只會用前 ${Math.min(a.length,b.length)} 期`});
  if(a.some(x=>Math.abs(x)>1))issues.push({level:"warn",text:"有單期報酬超過 ±100%，請確認是否誤把小數當成百分比"});
  setCheck("k-check",issues);

  const mean=average(a),annual=(1+mean)**12-1,vol=std(a)*Math.sqrt(12);
  const marketAnnual=(1+average(b))**12-1,variance=std(b)**2;
  const beta=variance?covariance(a,b)/variance:Number.NaN,rf=val("k-rf")/100;
  const alpha=annual-(rf+beta*(marketAnnual-rf)),corr=correlation(a,b);
  set("k-count",a.length?`${a.length} 期`:DASH);setFormula("k-count","可用的資產報酬筆數");
  set("k-return",pct(annual));setFormula("k-return",`年化 =（1 + 月平均）^12 − 1 =（1 + ${gp(mean*100,3)}）^12 − 1`);
  set("k-volatility",pct(vol));setFormula("k-volatility",`年化波動 = 月標準差 × √12 = ${gp(std(a)*100,3)} × 3.464`);
  set("k-sharpe",num(vol?(annual-rf)/vol:Number.NaN));setFormula("k-sharpe",`夏普 =（年化報酬 − 無風險）÷ 年化波動 =（${gp(annual*100)} − ${gp(rf*100)}）÷ ${gp(vol*100)}`);
  set("k-beta",num(beta));setFormula("k-beta",`Beta = Cov(資產, 指標) ÷ Var(指標)`);
  set("k-alpha",pct(alpha));setFormula("k-alpha",`Alpha = 年化報酬 −（無風險 + Beta ×（指標年化 − 無風險））`);
  set("k-r2",pct(corr*corr));setFormula("k-r2",`R² = 相關係數² = ${g(corr,3)}²`);
  set("k-drawdown",pct(a.length?maxDrawdown(a):Number.NaN));setFormula("k-drawdown","最大回撤 = min（累積淨值 ÷ 期間最高點 − 1）");
  set("k-score",num(vol?annual/vol:Number.NaN));setFormula("k-score",`風險報酬比 = 年化報酬 ÷ 年化波動 = ${gp(annual*100)} ÷ ${gp(vol*100)}`);
  set("k-market-return",pct(marketAnnual));setFormula("k-market-return",`（1 + 指標月平均）^12 − 1`);

  const growthOf=list=>{let value=1;return[1,...list.map(x=>value*=1+x)]};
  const assetCurve=a.length?growthOf(a):[];
  const marketCurve=b.length?growthOf(b):[];
  const length=Math.max(assetCurve.length,marketCurve.length);
  drawChart("k-chart",{
    labels:Array.from({length},(_,index)=>index===0?"起始":`第${index}期`),
    series:[
      {name:"資產累積淨值",kind:"line",cls:"s-a",fill:true,values:assetCurve},
      {name:"比較指標",kind:"line",cls:"s-b",values:marketCurve}
    ],
    formatY:value=>nf(value,2),
    xTitle:"期數",
    empty:"輸入每期報酬率後會畫出累積淨值走勢"
  });
  setCheck("panel-check",blankFieldNotice());
}},

loan:{html:()=>`${heading("DEBT LAB","貸款與分期","本息平均攤還採固定利率估算；實際費用仍應包含開辦費、帳管費與違約金。")}${note("這組工具在算什麼","採「本息平均攤還」——每月還款金額固定，前期還的多半是利息，後期才主要還到本金。<br>採固定利率估算，實際房貸多為機動利率，且未包含開辦費、帳管費、提前清償違約金，實際總成本會更高。")}<div class="form-grid">${field("l-principal","貸款本金",5000000,"元","實際跟銀行借的金額，不含自備款。")}${field("l-rate","貸款年利率",2.2,"%","銀行給的年利率，填 2.2 代表 2.2%。")}${field("l-months","貸款期數",360,"月","單位是「月」。20 年 = 240、30 年 = 360、40 年 = 480。")}${field("l-extra","每月額外還款",5000,"元","每月在正常月付之外多還的錢，用來看能提前多久還完。留空視為 0。")}${field("l-alt","比較方案年利率",2.6,"%","另一家銀行或另一個方案的利率，用來比較月付差多少。")}</div>${check("l-check")}<div class="results-grid">${result("l-payment","每月本息攤還","固定利率下每月要繳的金額")}${result("l-interest","原方案總利息","整段期間總共付出的利息")}${result("l-faster","額外還款後期數","每月多還之後，幾個月可以還完")}${result("l-save","預估節省利息","提前還款省下的利息總額")}${result("l-alt-payment","比較方案月付金","改用比較利率的每月金額")}${result("l-diff","兩方案月付差額","正數代表比較方案比較貴")}</div>${chart("l-chart","剩餘本金與累計利息")}<div class="subsection"><h3>分期付款實質利率</h3>${note("用來看「零利率分期」是不是真的零利率","很多分期方案標榜免利息，但現金價會比較便宜。把兩個價格填進去，就能算出你其實付了多少年化利率。")}<div class="form-grid compact">${field("l-cash","現金價",100000,"元","一次付清的價格。")}${field("l-total","分期總價",108000,"元","分期付款最後總共要付的金額（每期金額 × 期數）。")}${field("l-install-months","分期期數",12,"月","總共分幾期，通常等於幾個月。")}</div><div class="results-grid">${result("l-install-rate","估計年化實質利率","換算成年利率後，這個分期實際多付多少")}</div></div><div class="subsection"><h3>信用卡循環利息</h3>${note("卡費沒繳清時會產生的利息","只繳最低應繳金額時，剩下的未繳金額就會開始以循環利率按日計息。")}<div class="form-grid compact">${field("l-card","循環餘額",50000,"元","這期沒有繳清、留在卡上的金額。")}${field("l-card-rate","循環年利率",15,"%","帳單上的循環信用利率，台灣上限為 15%。")}${field("l-days","計息天數",30,"天","從入帳到還款經過幾天，通常抓一個帳單週期 30 天。")}</div><div class="results-grid">${result("l-card-interest","本期估計循環利息","這段期間會被收多少利息")}</div></div>${compare(
"方案並排比較",
note("兩個貸款方案擺在一起看","分別填入兩家銀行、或兩種年期的條件，下方會直接列出月付金、總利息與總支出的差額。<br><b>綠色代表方案 B 比較划算，紅色代表方案 A 比較划算。</b>欄位留空會沿用上方「貸款本金／年利率／貸款期數」的數值。"),
`<div class="form-grid compact">${field("cmp-a-principal","貸款本金",5000000,"元","留空沿用上方")}${field("cmp-a-rate","年利率",2.2,"%","留空沿用上方")}${field("cmp-a-months","貸款期數",360,"月","留空沿用上方")}</div>`,
`<div class="form-grid compact">${field("cmp-b-principal","貸款本金",5000000,"元","")}${field("cmp-b-rate","年利率",2.6,"%","")}${field("cmp-b-months","貸款期數",240,"月","")}</div>`,
"cmp-loan-table",["項目","方案 A","方案 B","差異（B − A）"])}`,
calc:()=>{
  const principal=val("l-principal"),rate=val("l-rate")/100,months=val("l-months");
  const issues=[];
  if(!isBlank("l-months")&&months<=0)issues.push({level:"error",text:"貸款期數要大於 0"});
  if(!isBlank("l-months")&&months>600)issues.push({level:"warn",text:`貸款期數 ${g(months,0)} 月（約 ${g(months/12,1)} 年）偏長，請確認單位是「月」`});
  if(!isBlank("l-rate")&&rate<0)issues.push({level:"error",text:"貸款年利率不可為負"});
  if(!isBlank("l-rate")&&val("l-rate")>20)issues.push({level:"warn",text:`年利率 ${gp(val("l-rate"))} 偏高，請確認是否誤填月利率`});
  if(!isBlank("l-cash")&&!isBlank("l-total")&&val("l-total")<val("l-cash"))issues.push({level:"warn",text:"分期總價低於現金價，實質利率會是負值"});
  if(!isBlank("l-days")&&(val("l-days")<0||val("l-days")>365))issues.push({level:"warn",text:"計息天數建議填 0–365"});
  setCheck("l-check",issues);

  const base=amortize(principal,rate,months),faster=amortize(principal,rate,months,val("l-extra"));
  const alt=payment(principal,val("l-alt")/100,months);
  const count=Math.max(1,Math.round(val("l-install-months")));
  const monthly=val("l-total")/count;
  const monthlyRate=irr([val("l-cash"),...Array.from({length:count},()=>-monthly)]);
  const annualRate=(1+monthlyRate)**12-1;
  const cardInterest=val("l-card")*val("l-card-rate")/100*val("l-days")/365;
  const i=rate/12;
  const loanCore=["l-principal","l-months"];
  set("l-payment",money(req(loanCore,base.scheduled)));setFormula("l-payment",`月付 = 本金 × i ÷（1 −（1 + i）^−n），i = ${gp(i*100,4)}、n = ${g(months,0)}`);
  set("l-interest",money(req(loanCore,base.totalInterest)));setFormula("l-interest","總利息 = 逐月（餘額 × 月利率）累加");
  set("l-faster",Number.isFinite(req(loanCore,months))&&months>0?`${faster.months} 月`:DASH);setFormula("l-faster",`每月多還 ${g(val("l-extra"),0)} 元後，逐月攤還至清償所需期數`);
  set("l-save",money(req(loanCore,base.totalInterest-faster.totalInterest)));setFormula("l-save",`節省 = 原總利息 − 加速後總利息 = ${g(base.totalInterest,0)} − ${g(faster.totalInterest,0)}`);
  set("l-alt-payment",money(req([...loanCore,"l-alt"],alt)));setFormula("l-alt-payment",`同月付公式，i = ${gp(val("l-alt")/12,4)}（比較方案年利率 ÷ 12）`);
  set("l-diff",money(req([...loanCore,"l-alt"],alt-base.scheduled)));setFormula("l-diff",`差額 = 比較方案月付 − 原方案月付 = ${g(alt,0)} − ${g(base.scheduled,0)}`);
  set("l-install-rate",pct(req(["l-cash","l-total","l-install-months"],annualRate)));setFormula("l-install-rate",`先解月利率：現金價 ${g(val("l-cash"),0)}（正）對上 ${count} 期各 ${g(monthly,0)}（負），再年化 (1 + 月利率)^12 − 1`);
  set("l-card-interest",money(req(["l-card","l-days"],cardInterest)));setFormula("l-card-interest",`利息 = 餘額 × 年利率 × 天數 ÷ 365 = ${g(val("l-card"),0)} × ${gp(val("l-card-rate"))} × ${g(val("l-days"),0)} ÷ 365`);

  const totalMonths=Math.min(600,Math.max(0,Math.round(months)));
  const labels=[],remaining=[],paidInterest=[];
  if(totalMonths>0&&principal>0){
    let balance=principal,accumulated=0;
    const scheduled=base.scheduled;
    const stride=Math.max(1,Math.round(totalMonths/48));
    for(let month=0;month<=totalMonths;month++){
      if(month%stride===0||month===totalMonths){
        labels.push(month%12===0?`${month/12}年`:`${month}月`);
        remaining.push(Math.max(0,balance));
        paidInterest.push(accumulated);
      }
      const interest=balance*i;
      const paid=Math.min(balance+interest,scheduled);
      accumulated+=interest;
      balance=Math.max(0,balance+interest-paid);
    }
  }
  drawChart("l-chart",{
    labels,
    series:[
      {name:"剩餘本金",kind:"line",cls:"s-a",fill:true,values:remaining},
      {name:"累計已付利息",kind:"line",cls:"s-c",values:paidInterest}
    ],
    xTitle:"還款進度",
    empty:"填入貸款本金、利率與期數後會畫出攤還曲線"
  });

  /* ---- 方案並排比較 ---- */
  const pick=(cmpId,fallbackId)=>isBlank(cmpId)?val(fallbackId):val(cmpId);
  const planOf=(prefix)=>{
    const p=pick(prefix+"-principal","l-principal"),
          r=pick(prefix+"-rate","l-rate")/100,
          m=pick(prefix+"-months","l-months");
    if(!(p>0&&m>0))return null;
    const a=amortize(p,r,m);
    return{principal:p,rate:r,months:m,monthly:a.scheduled,interest:a.totalInterest,total:p+a.totalInterest};
  };
  const A=planOf("cmp-a"),B=planOf("cmp-b");
  const table2=$("#cmp-loan-table");
  if(table2){
    if(!A||!B){
      table2.innerHTML=`<tr><td data-label="狀態" colspan="4">兩個方案都填入「貸款本金」與「貸款期數」後，會顯示比較結果。</td></tr>`;
    }else{
      const sameLoan=Math.abs(A.principal-B.principal)<1e-9;
      const rows=[
        ["貸款本金",money(A.principal),money(B.principal),diffCell(B.principal-A.principal,v=>money(Math.abs(v)))],
        ["年利率",pct(A.rate),pct(B.rate),diffCell(B.rate-A.rate,v=>pct(Math.abs(v)),"lower")],
        ["貸款期數",`${num(A.months,0)} 月`,`${num(B.months,0)} 月`,diffCell(B.months-A.months,v=>`${num(Math.abs(v),0)} 月`)],
        ["每月月付金",money(A.monthly),money(B.monthly),diffCell(B.monthly-A.monthly,v=>money(Math.abs(v)))],
        /* 只有在本金相同時，比較總利息／總支出才有明確的好壞 */
        ["總利息",money(A.interest),money(B.interest),diffCell(B.interest-A.interest,v=>money(Math.abs(v)),sameLoan?"lower":null)],
        ["總支出（本金＋利息）",money(A.total),money(B.total),diffCell(B.total-A.total,v=>money(Math.abs(v)),sameLoan?"lower":null)]
      ];
      table2.innerHTML=rows.map(r=>
        `<tr><td data-label="項目">${r[0]}</td><td data-label="方案 A">${r[1]}</td><td data-label="方案 B">${r[2]}</td>${r[3]}</tr>`
      ).join("");
    }
  }
  setCheck("panel-check",blankFieldNotice());
}},

currency:{html:()=>`${heading("FX & TAX","匯率與稅後報酬","稅額採自訂有效稅率簡化估算，不代表個人實際申報結果。")}${note("這組工具在算什麼","投資外幣資產時，最後賺賠是<b>資產本身漲跌</b>加上<b>匯率變化</b>兩件事疊起來。這裡把兩者拆開，讓你看到就算資產賺錢，也可能被匯率吃掉。<br>匯率請填「1 單位外幣 = 幾元台幣」，例如美金 32 就填 32。稅額為簡化估算，實際申報請以國稅局規定為準。")}<div class="form-grid">${field("c-amount","外幣金額",10000,"","當初換到的外幣數量，例如 10000 美元就填 10000。")}${field("c-buy","買入匯率",32,"","把台幣換成外幣時的匯率，1 外幣 = 幾元台幣。")}${field("c-sell","賣出匯率",33,"","換回台幣時的匯率；比買入高代表匯率有賺。")}${field("c-return","外幣資產報酬率",8,"%","這筆外幣資產本身賺賠幾 %，不含匯率。留空視為 0。")}${field("c-tax","獲利有效稅率",20,"%","獲利要繳稅的比率。留空視為 0。")}</div>${check("c-check")}<div class="results-grid">${result("c-cost","原始台幣成本","當初總共花掉多少台幣")}${result("c-final","換回台幣價值","現在全部換回台幣有多少")}${result("c-fx","純匯率損益","只看匯率變動賺賠多少")}${result("c-profit","合計損益","資產漲跌加匯率的總結果")}${result("c-total-return","含匯率總報酬率","以台幣計算的實際報酬率")}${result("c-tax-value","估計稅額","獲利要繳的稅")}${result("c-after","稅後損益","繳完稅實際入袋多少")}</div>${chart("c-chart","台幣成本、換回價值與損益拆解")}<div class="subsection"><h3>配息所得稅簡化試算</h3>${note("領到配息後實際剩下多少","填入年度領到的配息與你適用的稅率或抵減率，快速看扣完之後的淨額。")}<div class="form-grid compact">${field("c-dividend","年度配息",100000,"元","一整年領到的股利或配息總額。")}${field("c-dividend-tax","自訂有效稅率／抵減率",8.5,"%","你適用的稅率；台灣股利可選 28% 分開計稅或 8.5% 抵減。")}</div><div class="results-grid">${result("c-dividend-tax-value","估計稅額或抵減額","配息乘上你填的比率")}${result("c-dividend-net","配息扣除後金額","扣掉之後剩下多少")}</div></div>`,
calc:()=>{
  const issues=[];
  if(!isBlank("c-buy")&&val("c-buy")<=0)issues.push({level:"error",text:"買入匯率要大於 0"});
  if(!isBlank("c-sell")&&val("c-sell")<=0)issues.push({level:"error",text:"賣出匯率要大於 0"});
  if(!isBlank("c-tax")&&(val("c-tax")<0||val("c-tax")>100))issues.push({level:"error",text:"稅率請填 0–100"});
  if(!isBlank("c-amount")&&val("c-amount")<0)issues.push({level:"warn",text:"外幣金額是負數，結果會反向"});
  setCheck("c-check",issues);

  const foreign=val("c-amount"),buy=val("c-buy"),sell=val("c-sell"),ret=val("c-return")/100;
  const cost=foreign*buy,final=foreign*(1+ret)*sell,profit=final-cost;
  const tax=Math.max(0,profit)*val("c-tax")/100,divTax=val("c-dividend")*val("c-dividend-tax")/100;
  const fx=["c-amount","c-buy","c-sell"];
  set("c-cost",money(req(["c-amount","c-buy"],cost)));setFormula("c-cost",`成本 = 外幣 × 買入匯率 = ${g(foreign,0)} × ${g(buy,4)}`);
  set("c-final",money(req(["c-amount","c-sell"],final)));setFormula("c-final",`換回 = 外幣 ×（1 + 報酬率）× 賣出匯率 = ${g(foreign,0)} ×（1 + ${gp(ret*100)}）× ${g(sell,4)}`);
  set("c-fx",money(req(fx,foreign*(sell-buy))));setFormula("c-fx",`匯率損益 = 外幣 ×（賣出 − 買入）= ${g(foreign,0)} ×（${g(sell,4)} − ${g(buy,4)}）`);
  set("c-profit",money(req(fx,profit)));setFormula("c-profit",`損益 = 換回台幣 − 台幣成本 = ${g(final,0)} − ${g(cost,0)}`);
  set("c-total-return",pct(req(fx,cost?profit/cost:Number.NaN)));setFormula("c-total-return",`總報酬率 = 損益 ÷ 成本 = ${g(profit,0)} ÷ ${g(cost,0)}`);
  set("c-tax-value",money(req(fx,tax)));setFormula("c-tax-value",`稅額 = max(0, 損益) × 稅率 = ${g(Math.max(0,profit),0)} × ${gp(val("c-tax"))}`);
  set("c-after",money(req(fx,profit-tax)));setFormula("c-after",`稅後 = 損益 − 稅額 = ${g(profit,0)} − ${g(tax,0)}`);
  set("c-dividend-tax-value",money(req(["c-dividend"],divTax)));setFormula("c-dividend-tax-value",`= 年度配息 × 稅率 = ${g(val("c-dividend"),0)} × ${gp(val("c-dividend-tax"))}`);
  set("c-dividend-net",money(req(["c-dividend"],val("c-dividend")-divTax)));setFormula("c-dividend-net",`= 年度配息 − 稅額 = ${g(val("c-dividend"),0)} − ${g(divTax,0)}`);

  const anyInput=fx.every(id=>!isBlank(id));
  drawChart("c-chart",{
    labels:["台幣成本","換回價值","匯率損益","合計損益","稅後損益"],
    series:[{name:"金額（台幣）",kind:"bar",cls:"s-a",values:anyInput?[cost,final,foreign*(sell-buy),profit,profit-tax]:[]}],
    empty:"填入外幣金額與買賣匯率後會畫出金額拆解"
  });
  setCheck("panel-check",blankFieldNotice());
}},

cashflow:{html:()=>`${heading("CASH & ALLOCATION","現金流與資產配置","用每月收支與目前資產，確認儲蓄率、配置比例及再平衡差額。")}${note("這組工具在算什麼","上半部看<b>每個月能存下多少</b>，下半部看<b>手上的錢怎麼分配</b>，以及要調整多少才會回到你設定的目標比例（再平衡）。")}<div class="form-grid">${field("f-income","每月收入",70000,"元","稅後實際入帳的月收入。")}${field("f-fixed","固定支出",25000,"元","房租、房貸、保費、學費等每月幾乎不變的支出。")}${field("f-variable","變動支出",18000,"元","伙食、交通、購物、娛樂等每月會浮動的支出。")}${field("f-debt","貸款／分期支出",5000,"元","車貸、信貸、卡費分期等每月還款。留空視為 0。")}</div><div class="results-grid">${result("f-net","每月可用現金流","收入扣掉所有支出後剩下的錢")}${result("f-rate","儲蓄率","存下來的錢占收入幾 %")}${result("f-total","目前總資產","下方各項資產加總")}${result("f-return","投資組合預期報酬","依目前比例加權後的年報酬")}</div>

${note("資產配置怎麼填","每一行一項資產，用直線 ｜ 或逗號分成四個欄位：<code>資產名稱｜目前金額｜目標比例%｜預期報酬率%</code><br><b>目前金額</b>填實際的錢（例如 800000），<b>目標比例</b>填你希望它佔整體的百分比（填 35 代表 35%），<b>預期報酬率</b>填你假設它一年賺幾 %。<br>所有<b>目標比例加起來應該是 100</b>，否則「建議調整」會失真，工具會提醒你。<br>例：<code>台股｜800000｜35｜7</code> 表示台股現有 80 萬、目標佔 35%、預期年報酬 7%。")}
${area("f-assets","資產配置","現金｜300000｜15｜1\n台股｜800000｜35｜7\n全球股票｜900000｜40｜8\n債券｜200000｜10｜3","每行：資產名稱｜目前金額｜目標比例%｜預期報酬率%")}${check("f-check")}<div class="table-wrap"><table><thead><tr><th>資產</th><th>目前比例</th><th>目標比例</th><th>建議調整</th></tr></thead><tbody id="f-table"></tbody></table></div>${chart("f-chart","目前比例 vs 目標比例")}`,
calc:()=>{
  const income=val("f-income"),net=income-val("f-fixed")-val("f-variable")-val("f-debt");
  const issues=[];
  const rows=[];
  String(raw("f-assets")||"").split(/\n+/).forEach((line,index)=>{
    const trimmed=line.trim();
    if(trimmed==="")return;
    const row=index+1;
    const [name,value,target,expected]=trimmed.split(/[|｜,，\t]+/).map(x=>x.trim());
    if(!name)return void issues.push({level:"error",text:`第 ${row} 行：缺少資產名稱`});
    if(value===undefined||!Number.isFinite(n(value,Number.NaN)))return void issues.push({level:"error",text:`第 ${row} 行「${name}」：目前金額「${value??""}」不是數字`});
    if(target!==undefined&&target!==""&&!Number.isFinite(n(target,Number.NaN)))issues.push({level:"warn",text:`第 ${row} 行「${name}」：目標比例「${target}」不是數字`});
    if(expected!==undefined&&expected!==""&&!Number.isFinite(n(expected,Number.NaN)))issues.push({level:"warn",text:`第 ${row} 行「${name}」：預期報酬「${expected}」不是數字`});
    rows.push({name,value:n(value,Number.NaN),target:n(target,Number.NaN)/100,expected:n(expected,Number.NaN)/100});
  });
  const total=rows.reduce((sum,x)=>sum+x.value,0);
  const targetSum=rows.reduce((sum,x)=>sum+(Number.isFinite(x.target)?x.target:0),0);
  if(rows.length&&Math.abs(targetSum-1)>0.005)issues.push({level:"warn",text:`目標比例合計 ${gp(targetSum*100)}，不是 100%；建議調整金額會失真`});
  if(!isBlank("f-income")&&income<0)issues.push({level:"error",text:"每月收入不可為負"});
  if(!isBlank("f-income")&&income>0&&net<0)issues.push({level:"warn",text:`支出大於收入，每月短少 ${money(Math.abs(net))}`});
  setCheck("f-check",issues);

  const allocation=rows.map(x=>({...x,current:total?x.value/total:0,difference:x.target*total-x.value}));
  const portfolio=allocation.reduce((sum,x)=>sum+x.current*(Number.isFinite(x.expected)?x.expected:0),0);
  set("f-net",money(req(["f-income"],net)));setFormula("f-net",`可用 = 收入 − 固定 − 變動 − 貸款 = ${g(income,0)} − ${g(val("f-fixed"),0)} − ${g(val("f-variable"),0)} − ${g(val("f-debt"),0)}`);
  set("f-rate",pct(req(["f-income"],income?net/income:Number.NaN)));setFormula("f-rate",`儲蓄率 = 可用現金流 ÷ 收入 = ${g(net,0)} ÷ ${g(income,0)}`);
  set("f-total",rows.length?money(total):DASH);setFormula("f-total",rows.length?`總資產 = ${rows.length} 項目前金額相加`:"請先輸入資產配置");
  set("f-return",rows.length?pct(portfolio):DASH);setFormula("f-return","組合報酬 = Σ（該項目前比例 × 該項預期報酬）");
  const table=$("#f-table");
  if(table)table.innerHTML=allocation.map(x=>`<tr><td data-label="資產">${escapeHtml(x.name)}</td><td data-label="目前比例">${pct(x.current)}</td><td data-label="目標比例">${pct(x.target)}</td><td data-label="建議調整" class="${x.difference>=0?"positive":"negative"}">${Number.isFinite(x.difference)?`${x.difference>=0?"增加":"減少"} ${money(Math.abs(x.difference))}`:DASH}</td></tr>`).join("");
  drawChart("f-chart",{
    labels:allocation.map(x=>x.name),
    series:[
      {name:"目前比例",kind:"bar",cls:"s-a",values:allocation.map(x=>x.current*100)},
      {name:"目標比例",kind:"bar",cls:"s-b",values:allocation.map(x=>Number.isFinite(x.target)?x.target*100:0)}
    ],
    formatY:value=>`${nf(value,0)}%`,
    empty:"輸入資產配置後會比較目前與目標比例"
  });
  setCheck("panel-check",blankFieldNotice());
}}
};

/* =============================================================================
   介面控制：可滑動工具輪播、面板滑動切換、手機結果浮動列、網址深連結
   ============================================================================= */
const rail=document.querySelector(".tool-rail");
const nav=$("#tool-nav");
const panelEl=$("#calculator");
const peek=$("#result-peek");
const search=$("#tool-search");
const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smooth=reduceMotion?"auto":"smooth";
const isTool=id=>tools.some(tool=>tool.id===id);
let active=isTool(decodeURIComponent(location.hash.slice(1)))?decodeURIComponent(location.hash.slice(1)):"returns";
let showFormula=false;

function renderNav(query=""){
  const term=query.trim().toLowerCase();
  const list=tools.filter(tool=>(tool.title+tool.subtitle+tool.tags.join(" ")).toLowerCase().includes(term));
  nav.innerHTML=list.map(tool=>`<button type="button" role="tab" data-tool="${tool.id}" class="${tool.id===active?"active":""}" aria-selected="${tool.id===active}" tabindex="${tool.id===active?0:-1}"><span>${tool.number}</span><div><strong>${tool.title}</strong><small>${tool.subtitle}</small></div></button>`).join("")||`<p class="rail-empty">找不到符合的工具。</p>`;
  requestAnimationFrame(updateRail);
}

function updateRail(){
  if(!rail)return;
  const max=nav.scrollWidth-nav.clientWidth;
  const overflow=max>4;
  rail.classList.toggle("has-overflow",overflow);
  rail.classList.toggle("at-start",nav.scrollLeft<=2);
  rail.classList.toggle("at-end",!overflow||nav.scrollLeft>=max-2);
  const bar=$("#rail-bar");
  if(bar){
    const ratio=Math.min(1,nav.clientWidth/Math.max(nav.scrollWidth,1));
    const progress=max>0?nav.scrollLeft/max:0;
    bar.style.width=`${ratio*100}%`;
    bar.style.transform=`translateX(${ratio>0?progress*(100/ratio-100):0}%)`;
  }
  rail.querySelectorAll(".rail-arrow").forEach(button=>{
    button.hidden=!overflow;
    button.disabled=button.dataset.dir==="-1"?nav.scrollLeft<=2:nav.scrollLeft>=max-2;
  });
}
function scrollActiveIntoView(){
  const button=nav.querySelector("button.active");
  if(!button)return;
  const left=button.offsetLeft-(nav.clientWidth-button.offsetWidth)/2;
  nav.scrollTo({left:Math.max(0,left),behavior:smooth});
}

function recalc(){panels[active].calc();updatePeek()}
function applyFormulaState(){
  panelEl.classList.toggle("show-formula",showFormula);
  const button=$("#formula-toggle");
  if(button){button.textContent=showFormula?"隱藏計算式":"顯示計算式";button.setAttribute("aria-pressed",String(showFormula))}
}
function renderPanel(){
  const tool=tools.find(item=>item.id===active);
  const paint=()=>{
    panelEl.innerHTML=`<div class="tool-tags">${tool.tags.map(tag=>`<span>${tag}</span>`).join("")}</div>${panels[active].html()}`;
    panelEl.setAttribute("aria-label",`${tool.number} ${tool.title}`);
    panelEl.oninput=recalc;
    applyFormulaState();
    recalc();
    watchResults();
    requestAnimationFrame(()=>panelEl.classList.remove("is-loading"));
  };
  if(reduceMotion){paint();return}
  panelEl.classList.add("is-loading");
  requestAnimationFrame(paint);
}
function selectTool(id,{scrollToPanel=false}={}){
  if(!isTool(id))return;
  active=id;
  try{history.replaceState(null,"",`#${id}`)}catch(error){/* file:// 環境忽略 */}
  renderNav(search.value);
  renderPanel();
  scrollActiveIntoView();
  if(scrollToPanel)panelEl.scrollIntoView({behavior:smooth,block:"start"});
}
function shiftTool(step,options){
  const index=tools.findIndex(tool=>tool.id===active)+step;
  if(index<0||index>=tools.length)return false;
  selectTool(tools[index].id,options);
  return true;
}

let resultWatcher=null;
function updatePeek(){
  const card=panelEl.querySelector(".result-card");
  if(!card||!peek)return;
  peek.innerHTML=`<span>${escapeHtml(card.querySelector("span")?.textContent||"")}</span><strong>${escapeHtml(card.querySelector("strong")?.textContent||"")}</strong>`;
}
function watchResults(){
  if(!peek)return;
  if(resultWatcher){resultWatcher.disconnect();resultWatcher=null}
  peek.classList.remove("show");
  const grid=panelEl.querySelector(".results-grid,.mini-results");
  if(!grid||!("IntersectionObserver" in window))return;
  resultWatcher=new IntersectionObserver(entries=>{
    peek.classList.toggle("show",!entries[0].isIntersecting&&window.innerWidth<860);
  },{rootMargin:"-80px 0px -80px 0px"});
  resultWatcher.observe(grid);
}

let dragging=false,dragStartX=0,dragStartScroll=0,dragDistance=0;
nav.addEventListener("pointerdown",event=>{
  if(event.pointerType!=="mouse"||event.button!==0)return;
  dragging=true;dragDistance=0;dragStartX=event.clientX;dragStartScroll=nav.scrollLeft;
  rail?.classList.add("touched");
});
nav.addEventListener("pointermove",event=>{
  if(!dragging)return;
  const delta=event.clientX-dragStartX;
  dragDistance=Math.max(dragDistance,Math.abs(delta));
  if(dragDistance>5)rail?.classList.add("dragging");
  nav.scrollLeft=dragStartScroll-delta;
});
["pointerup","pointercancel","pointerleave"].forEach(type=>nav.addEventListener(type,()=>{
  if(!dragging)return;
  dragging=false;
  setTimeout(()=>rail?.classList.remove("dragging"),0);
}));

nav.addEventListener("click",event=>{
  const button=event.target.closest("button[data-tool]");
  if(!button||dragDistance>5)return;
  selectTool(button.dataset.tool,{scrollToPanel:window.innerWidth<860});
});
nav.addEventListener("keydown",event=>{
  const keys={ArrowLeft:-1,ArrowRight:1,Home:"first",End:"last"};
  if(!(event.key in keys))return;
  const buttons=[...nav.querySelectorAll("button[data-tool]")];
  const current=buttons.findIndex(button=>button===document.activeElement);
  if(current<0)return;
  event.preventDefault();
  const step=keys[event.key];
  const target=step==="first"?0:step==="last"?buttons.length-1:Math.min(buttons.length-1,Math.max(0,current+step));
  selectTool(buttons[target].dataset.tool);
  nav.querySelector("button.active")?.focus();
});
nav.addEventListener("scroll",()=>{rail?.classList.add("touched");updateRail()},{passive:true});
rail?.querySelectorAll(".rail-arrow").forEach(button=>button.addEventListener("click",()=>{
  nav.scrollBy({left:Number(button.dataset.dir)*nav.clientWidth*.85,behavior:smooth});
}));

/* 顯示／隱藏計算式 */
panelEl.addEventListener("click",event=>{
  if(!event.target.closest("#formula-toggle"))return;
  showFormula=!showFormula;
  applyFormulaState();
});

/* -------- 匯出：複製為文字、下載 CSV（都在本機處理，不會送出任何資料）-------- */
function collectPanelData(){
  const tool=tools.find(item=>item.id===active);
  const inputs=[...panelEl.querySelectorAll(".field")].map(node=>{
    const control=node.querySelector("input,textarea,select");
    if(!control)return null;
    const label=node.querySelector("span")?.textContent||"";
    const unit=node.querySelector(".input-wrap b")?.textContent||"";
    const value=control.tagName==="SELECT"?(control.selectedOptions[0]?.textContent||""):control.value.trim();
    return{label,unit,value,filled:value!=="",list:control.tagName==="TEXTAREA"};
  }).filter(Boolean);
  const results=[...panelEl.querySelectorAll(".result-card")].map(card=>({
    label:card.querySelector("span")?.textContent||"",
    value:card.querySelector("strong")?.textContent||"",
    formula:card.querySelector(".formula")?.textContent||""
  }));
  const notices=[...panelEl.querySelectorAll(".input-check .chk")].map(node=>node.textContent.trim());
  const tableNode=panelEl.querySelector(".table-wrap table");
  const table=tableNode?{
    head:[...tableNode.querySelectorAll("thead th")].map(th=>th.textContent),
    body:[...tableNode.querySelectorAll("tbody tr")].map(tr=>[...tr.querySelectorAll("td")].map(td=>td.textContent))
  }:null;
  const stamp=new Date();
  const time=`${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,"0")}-${String(stamp.getDate()).padStart(2,"0")} ${String(stamp.getHours()).padStart(2,"0")}:${String(stamp.getMinutes()).padStart(2,"0")}`;
  return{tool,inputs,results,notices,table,time};
}
function panelAsText(){
  const {tool,inputs,results,notices,table,time}=collectPanelData();
  const lines=[`${tool.number} ${tool.title}｜EliNotebook 金融工具中心`,`試算時間：${time}`,"","【輸入條件】"];
  inputs.forEach(x=>{
    if(x.filled&&x.list)return lines.push(`  ${x.label}：`,...x.value.split(/\n/).map(line=>`      ${line}`));
    lines.push(`  ${x.label}：${x.filled?x.value+(x.unit||""):(x.list?"（未填）":"（未填，以 0 計算）")}`);
  });
  lines.push("","【試算結果】");
  results.forEach(x=>{
    lines.push(`  ${x.label}：${x.value}`);
    if(x.formula)lines.push(`      算式：${x.formula}`);
  });
  if(table&&table.body.length){
    lines.push("",`【${table.head.join("／")}】`);
    table.body.forEach(row=>lines.push("  "+row.join("｜")));
  }
  if(notices.length){lines.push("","【提醒】");notices.forEach(x=>lines.push("  "+x))}
  lines.push("","※ 一般財務數學試算，不構成投資、稅務、授信或保險建議；請以金融機構正式文件為準。");
  return lines.join("\n");
}
function panelAsCsv(){
  const {tool,inputs,results,notices,table,time}=collectPanelData();
  const cell=value=>`"${String(value).replace(/"/g,'""')}"`;
  const rows=[["項目","名稱","數值","單位／算式"]];
  rows.push(["工具",`${tool.number} ${tool.title}`,"",""]);
  rows.push(["試算時間",time,"",""]);
  inputs.forEach(x=>rows.push(["輸入",x.label,x.filled?x.value.replace(/\n/g," ; "):"(未填)",x.unit]));
  results.forEach(x=>rows.push(["結果",x.label,x.value,x.formula]));
  if(table&&table.body.length){
    rows.push([]);
    rows.push(["明細",...table.head]);
    table.body.forEach(row=>rows.push(["明細",...row]));
  }
  notices.forEach(x=>rows.push(["提醒",x,"",""]));
  rows.push(["聲明","一般財務數學試算，不構成投資、稅務、授信或保險建議","",""]);
  return "\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
function exportStatus(message){
  const node=$("#export-status");
  if(!node)return;
  node.textContent=message;
  clearTimeout(exportStatus.timer);
  exportStatus.timer=setTimeout(()=>{if($("#export-status"))$("#export-status").textContent=""},3200);
}
function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(()=>exportStatus("已複製到剪貼簿")).catch(()=>fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}
function fallbackCopy(text){
  try{
    const box=document.createElement("textarea");
    box.value=text;box.setAttribute("readonly","");
    box.style.cssText="position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(box);box.select();
    const ok=document.execCommand("copy");
    document.body.removeChild(box);
    exportStatus(ok?"已複製到剪貼簿":"複製失敗，請改用下載 CSV");
  }catch(error){exportStatus("複製失敗，請改用下載 CSV")}
}
function downloadCsv(){
  const {tool}=collectPanelData();
  const stamp=new Date();
  const name=`EliNotebook_${tool.number}_${tool.title}_${stamp.getFullYear()}${String(stamp.getMonth()+1).padStart(2,"0")}${String(stamp.getDate()).padStart(2,"0")}.csv`;
  try{
    const blob=new Blob([panelAsCsv()],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download=name;
    document.body.appendChild(link);link.click();
    document.body.removeChild(link);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    exportStatus("已下載 CSV");
  }catch(error){exportStatus("此瀏覽器不支援下載，請改用複製結果")}
}
/* -------- 客戶版列印報告：帶顧問資訊、輸入條件、結果、計算式與圖表 -------- */
const ADVISOR={
  name:"葉秀庭",
  title:"保險經紀人｜風險規劃顧問",
  org:"大誠保險經紀人股份有限公司",
  contact:"https://line.me/ti/p/gpFhzbhd6U"
};
function buildReport(){
  const {tool,inputs,results,notices,table,time}=collectPanelData();
  const esc=escapeHtml;
  const inputRows=inputs.map(x=>{
    const v=x.filled?esc(x.value)+(x.unit?" "+esc(x.unit):""):"<i>未填</i>";
    return `<tr><th>${esc(x.label)}</th><td>${x.list?`<pre>${v}</pre>`:v}</td></tr>`;
  }).join("");
  const resultCards=results.map(x=>
    `<div class="r"><span>${esc(x.label)}</span><strong>${esc(x.value)}</strong>${x.formula?`<em>${esc(x.formula)}</em>`:""}</div>`
  ).join("");
  const tableHtml=table&&table.body.length
    ? `<h2>明細</h2><table class="grid"><thead><tr>${table.head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        table.body.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  const charts=[...panelEl.querySelectorAll(".chart-wrap")].map(fig=>{
    const cap=fig.querySelector("figcaption")?.textContent||"";
    const svg=fig.querySelector("svg");
    return svg?`<figure><figcaption>${esc(cap)}</figcaption>${svg.outerHTML}</figure>`:"";
  }).join("");
  const noticeHtml=notices.length
    ? `<h2>提醒</h2><ul>${notices.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>` : "";

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<title>${esc(tool.title)}試算報告｜${esc(ADVISOR.name)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:28px 30px;color:#222;background:#fff;
 font-family:-apple-system,"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
 font-size:12px;line-height:1.65}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;
 border-bottom:2px solid #454e47;padding-bottom:14px;margin-bottom:20px}
.head h1{margin:0 0 4px;font-size:20px;font-weight:600}
.head .sub{color:#666;font-size:11px}
.who{text-align:right;font-size:11px;line-height:1.7}
.who b{display:block;font-size:13px;color:#454e47}
.who span{color:#666}
h2{font-size:13px;margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid #ccc;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th,td{text-align:left;padding:6px 9px;border-bottom:1px solid #e2e2e2;vertical-align:top}
table:not(.grid) th{width:38%;color:#555;font-weight:500;background:#f6f5f2}
.grid th{background:#eceae5;font-weight:600}
pre{margin:0;font:inherit;white-space:pre-wrap}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:8px}
.r{border:1px solid #ddd;border-top:3px solid #454e47;padding:9px 10px;break-inside:avoid}
.r span{display:block;font-size:10px;color:#666}
.r strong{display:block;font-size:15px;margin-top:3px}
.r em{display:block;font-size:9.5px;color:#777;font-style:normal;margin-top:5px;
 padding-top:4px;border-top:1px dashed #ddd;line-height:1.5}
figure{margin:12px 0 0;break-inside:avoid}
figcaption{font-size:11px;color:#555;margin-bottom:5px}
svg{width:100%;height:auto;max-width:640px}
.chart-grid{stroke:#ddd;stroke-width:1}.chart-grid.zero{stroke:#999}
.chart-axis{fill:#666;font-size:10px}
.chart-line{fill:none;stroke-width:2}
.chart-line.s-a,.chart-dot.s-a{stroke:#454e47}.chart-line.s-b,.chart-dot.s-b{stroke:#8a7a55}
.chart-line.s-c,.chart-dot.s-c{stroke:#8e5c52}.chart-line.dashed{stroke-dasharray:5 4}
.chart-area{opacity:.12}.chart-area.s-a{fill:#454e47}.chart-area.s-b{fill:#8a7a55}.chart-area.s-c{fill:#8e5c52}
.chart-bar.s-a{fill:#454e47}.chart-bar.s-b{fill:#8a7a55}.chart-bar.s-c{fill:#8e5c52}
.chart-dot.s-a{fill:#454e47}.chart-dot.s-b{fill:#8a7a55}.chart-dot.s-c{fill:#8e5c52}
.cursor-line,.cursor-dot,.chart-cursor{display:none}
ul{margin:6px 0;padding-left:18px}li{margin:2px 0}
.foot{margin-top:24px;padding-top:12px;border-top:1px solid #ccc;font-size:10px;color:#666;line-height:1.7}
.positive{color:#2c6b45}.negative{color:#9c463a}
td small{display:block;font-size:9.5px;color:#777}
@page{margin:14mm}
@media print{body{padding:0}.noprint{display:none}}
.noprint{margin:0 0 18px;padding:10px 12px;background:#f2efe9;border:1px solid #ddd;font-size:11px}
</style></head><body>
<p class="noprint">請使用瀏覽器的「列印」功能（Ctrl/⌘ + P），目的地選「另存為 PDF」即可產生檔案。這段提示不會被印出來。</p>
<div class="head">
  <div><h1>${esc(tool.number)} ${esc(tool.title)}　試算報告</h1>
    <div class="sub">試算時間：${esc(time)}</div></div>
  <div class="who"><b>${esc(ADVISOR.name)}</b><span>${esc(ADVISOR.title)}</span>
    <span>${esc(ADVISOR.org)}</span><span>${esc(ADVISOR.contact)}</span></div>
</div>
<h2>輸入條件</h2><table>${inputRows}</table>
<h2>試算結果</h2><div class="cards">${resultCards}</div>
${charts?`<h2>圖表</h2>${charts}`:""}
${tableHtml}
${noticeHtml}
<div class="foot">
本報告由 EliNotebook 金融工具中心產生，屬一般財務數學試算，<b>不構成投資、稅務、授信或保險之建議、要約或保證</b>。
市場報酬、利率、匯率、稅負與保單條款均可能變動；實際商品內容、費率、承保條件與除外責任，
以各金融機構及保險公司正式文件與契約為準，核保與理賠結果由該機構依個案審核。
</div></body></html>`;
}
function openReport(){
  try{
    const win=window.open("","_blank");
    if(!win){exportStatus("瀏覽器封鎖了新視窗，請允許彈出視窗");return}
    win.document.open();
    win.document.write(buildReport());
    win.document.close();
    exportStatus("報告已開啟，可直接列印或存成 PDF");
  }catch(error){exportStatus("無法開啟報告視窗")}
}

panelEl.addEventListener("click",event=>{
  const button=event.target.closest("[data-export]");
  if(!button)return;
  const kind=button.dataset.export;
  if(kind==="copy")copyText(panelAsText());
  else if(kind==="report")openReport();
  else downloadCsv();
});

/* 面板左右滑動切換工具（僅觸控，避開輸入框與可捲動表格） */
let swipeX=0,swipeY=0,swiping=false;
panelEl.addEventListener("touchstart",event=>{
  swiping=false;
  if(event.touches.length!==1)return;
  if(event.target.closest("input,textarea,select,button,.table-wrap"))return;
  swiping=true;swipeX=event.touches[0].clientX;swipeY=event.touches[0].clientY;
},{passive:true});
panelEl.addEventListener("touchend",event=>{
  if(!swiping)return;
  swiping=false;
  const touch=event.changedTouches[0];
  const deltaX=touch.clientX-swipeX,deltaY=touch.clientY-swipeY;
  if(Math.abs(deltaX)<70||Math.abs(deltaY)>55)return;
  if(shiftTool(deltaX<0?1:-1))panelEl.scrollIntoView({behavior:smooth,block:"start"});
},{passive:true});

search.addEventListener("input",event=>renderNav(event.target.value));

/* 視窗尺寸或方向改變時重畫圖表，讓圖表永遠符合當下版面寬度 */
let resizeTimer=0,lastWidth=window.innerWidth;
window.addEventListener("resize",()=>{
  updateRail();
  if(window.innerWidth>=860)peek?.classList.remove("show");
  if(Math.abs(window.innerWidth-lastWidth)<8)return;
  lastWidth=window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{if(panels[active])recalc()},180);
},{passive:true});
window.addEventListener("orientationchange",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(recalc,260)});
window.addEventListener("hashchange",()=>{
  const id=decodeURIComponent(location.hash.slice(1));
  if(isTool(id)&&id!==active)selectTool(id);
});

renderNav();
renderPanel();
scrollActiveIntoView();
