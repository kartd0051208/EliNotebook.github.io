/* =============================================================================
   匿名流量統計（GoatCounter）

   ★ 設定方式：把下面的 SITE_CODE 換成你在 GoatCounter 註冊時取的代碼。
     例如你的網址是 https://elinotebook.goatcounter.com
     就把 SITE_CODE 改成 "elinotebook"。

   在還沒填入代碼之前，這支程式什麼都不會做，也不會發出任何連線。

   統計內容：
     - 頁面瀏覽、來源網站、裝置、國家（GoatCounter 自動記錄）
     - LINE 按鈕點擊，並區分是從哪個位置點的
     - 金融工具的使用與匯出行為
   不會記錄：cookie、個人身分、你在試算工具輸入的任何數字。
   ============================================================================= */
(function(){
  "use strict";

  var SITE_CODE = "YOUR-CODE-HERE";   /* ← 改這裡 */

  if(!SITE_CODE || SITE_CODE === "YOUR-CODE-HERE") return;   /* 未設定就完全不啟用 */

  /* ---- 載入 GoatCounter ---- */
  var endpoint = "https://" + SITE_CODE + ".goatcounter.com/count";
  window.goatcounter = { endpoint: endpoint };
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", endpoint);
  document.head.appendChild(s);

  /* ---- 送出事件（GoatCounter 尚未載入完成時安靜略過）---- */
  function track(path, title){
    try{
      if(window.goatcounter && typeof window.goatcounter.count === "function"){
        window.goatcounter.count({ path: path, title: title, event: true });
      }
    }catch(e){/* 統計失敗不影響網站運作 */}
  }

  /* ---- 判斷這個連結位在頁面的哪個區塊 ---- */
  function whereIs(el){
    if(el.closest("header")) return "導覽列";
    if(el.closest("footer")) return "頁尾";
    var section = el.closest("section[id], section[class]");
    if(!section) return "其他";
    var id = section.getAttribute("id");
    var map = {
      hero: "首屏", services: "服務項目", approach: "規劃方式",
      partners: "合作夥伴", about: "關於我", contact: "聯絡區"
    };
    if(id && map[id]) return map[id];
    var cls = section.className || "";
    if(cls.indexOf("hero") > -1) return "首屏";
    if(cls.indexOf("contact") > -1) return "聯絡區";
    if(cls.indexOf("services") > -1 || cls.indexOf("cards") > -1) return "服務項目";
    if(cls.indexOf("strip") > -1) return "橫幅";
    return id || "其他";
  }

  document.addEventListener("click", function(event){
    var target = event.target;
    if(!target || !target.closest) return;

    /* LINE 預約按鈕：記錄是從哪個位置點的 */
    var line = target.closest('a[href*="line.me"]');
    if(line){
      var place = whereIs(line);
      track("line-click/" + place, "LINE 預約點擊｜" + place);
      return;
    }

    /* 金融工具：切換到哪一組工具 */
    var tool = target.closest("#tool-nav button[data-tool]");
    if(tool){
      var name = tool.querySelector("strong");
      track("tool/" + tool.dataset.tool, "使用工具｜" + (name ? name.textContent : tool.dataset.tool));
      return;
    }

    /* 金融工具：匯出行為 */
    var exp = target.closest("[data-export]");
    if(exp){
      var labels = { copy: "複製結果", csv: "下載 CSV", report: "列印／存 PDF" };
      var kind = exp.dataset.export;
      track("export/" + kind, "匯出｜" + (labels[kind] || kind));
      return;
    }

    /* 金融工具：連到工具頁的入口 */
    var toToolPage = target.closest('a[href*="financial-tools"]');
    if(toToolPage){
      track("open-tools/" + whereIs(toToolPage), "進入金融工具｜" + whereIs(toToolPage));
    }
  }, true);
})();
