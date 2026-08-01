/* =============================================================================
   日夜切換：自動（跟隨系統）／白天／夜間
   本檔須在 <head> 中「同步」載入，於首次繪製前套用主題，避免畫面閃白。
   只在本機 localStorage 記住偏好，不會傳送任何資料。
   ============================================================================= */
(function(){
  "use strict";
  var KEY="eli-theme";
  var ORDER=["auto","light","dark"];
  var LABEL={auto:"自動",light:"白天",dark:"夜間"};
  var NEXT={auto:"切換為白天模式",light:"切換為夜間模式",dark:"切換為跟隨系統"};
  var ICON={
    auto:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z" class="fill"/></svg>',
    light:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.6" class="fill"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1"/></svg>',
    dark:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 14.6A8.8 8.8 0 0 1 9.4 3.5a8.8 8.8 0 1 0 11.1 11.1z" class="fill"/></svg>'
  };

  function stored(){
    try{
      var v=localStorage.getItem(KEY);
      return ORDER.indexOf(v)>-1?v:"auto";
    }catch(e){return "auto"}
  }
  var mode=stored();

  function systemDark(){
    return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function resolved(){ return mode==="auto"?(systemDark()?"dark":"light"):mode; }

  function apply(){
    var actual=resolved();
    var root=document.documentElement;
    root.setAttribute("data-theme",actual);
    root.style.colorScheme=actual;
    var meta=document.querySelector('meta[name="theme-color"]:not([media])');
    if(meta)meta.setAttribute("content",actual==="dark"?"#20211f":"#e8e4dd");
    paint();
  }

  function paint(){
    var buttons=document.querySelectorAll("[data-theme-toggle]");
    for(var i=0;i<buttons.length;i++){
      var b=buttons[i];
      b.innerHTML=ICON[mode]+'<span class="theme-label">'+LABEL[mode]+"</span>";
      b.setAttribute("aria-label","目前為"+LABEL[mode]+"模式，點擊"+NEXT[mode]);
      b.setAttribute("title","目前："+LABEL[mode]+"（點擊"+NEXT[mode].replace("切換為","切換為")+"）");
      b.setAttribute("data-mode",mode);
    }
  }

  function cycle(){
    mode=ORDER[(ORDER.indexOf(mode)+1)%ORDER.length];
    try{ localStorage.setItem(KEY,mode) }catch(e){}
    apply();
  }

  /* 先套用主題（此時 <body> 可能還不存在，故只動 documentElement） */
  var actual=resolved();
  document.documentElement.setAttribute("data-theme",actual);
  document.documentElement.style.colorScheme=actual;

  /* 系統主題變動時，若使用者選的是「自動」就跟著變 */
  if(window.matchMedia){
    var mq=window.matchMedia("(prefers-color-scheme: dark)");
    var onChange=function(){ if(mode==="auto")apply() };
    if(mq.addEventListener)mq.addEventListener("change",onChange);
    else if(mq.addListener)mq.addListener(onChange);
  }

  function init(){
    apply();
    document.addEventListener("click",function(e){
      var t=e.target.closest?e.target.closest("[data-theme-toggle]"):null;
      if(t){ e.preventDefault(); cycle(); }
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
})();
