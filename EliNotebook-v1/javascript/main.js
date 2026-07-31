

// ==================== 導覽列功能 ====================
// 找出導覽列中所有帶有 .list 類別的選項，之後才能逐一處理點擊效果。
const list = document.querySelectorAll('.list');

// 當使用者點擊某個導覽選項時，先移除全部選項的 active 狀態，
// 再把 active 加到目前被點擊的選項，確保畫面一次只會標示一個所在位置。
function activeLink() {
    list.forEach((item) =>
        item.classList.remove('active'));
    this.classList.add('active');
}

// 將上面的 activeLink 點擊處理函式綁定到每一個導覽選項。
// 如果沒有這段，點擊導覽選項時就不會切換 active 的視覺效果。
list.forEach((item) =>
    item.addEventListener('click', activeLink));




// ==================== 備忘錄留存功能 ====================
//
// ==================== 新版新增功能、特性與使用範例 ====================
//
// 1.【功能】localStorage 本機留存
//   【特性】資料保存在目前裝置與瀏覽器的網站儲存空間，重新整理或關閉後再開仍可讀取。
//   【範例】今天新增「星期五聯絡王先生」，關閉 Chrome 後，明天用同一個 Chrome 開啟仍會看到。
//   【限制】換手機、換瀏覽器、使用無痕模式或清除網站資料時，備忘錄不會自動同步或保留。
//
// 2.【功能】有版本的儲存名稱
//   【特性】使用 eliNotebook.tasks.v1 當作固定儲存鍵，並用 v1 標記第一版資料格式。
//   【範例】未來若改成同時儲存日期與完成狀態，可使用 v2，避免新格式誤讀舊格式。
//
// 3.【功能】必要元件防呆
//   【特性】表單、輸入框或清單不存在時安全停止，不讓單一功能錯誤影響整個網站。
//   【範例】日後修改 index1.html 時不小心移除 #tasks，程式會停止備忘錄功能，而不是連導覽列都報錯。
//
// 4.【功能】輸入長度與空白檢查
//   【特性】每則最多 300 字，並使用 trim() 移除前後空白，不接受只有空格的內容。
//   【範例】輸入「   申請理賠文件   」會存成「申請理賠文件」；只輸入空格則不會新增。
//
// 5.【功能】JSON 資料轉換
//   【特性】利用 JSON.stringify() 將陣列轉成文字儲存，再用 JSON.parse() 還原成陣列。
//   【範例】["聯絡客戶", "整理保單"] 會先轉成 JSON 字串保存，下次開啟再還原為兩則備忘錄。
//
// 6.【功能】資料格式驗證與錯誤復原
//   【特性】只接受「文字陣列」；資料損壞時改用空陣列，讓網頁仍能正常開啟。
//   【範例】如果儲存內容意外變成無效 JSON，程式會在主控台記錄錯誤，不會讓整個頁面變成空白。
//
// 7.【功能】統一畫面重新產生
//   【特性】renderTasks() 以 tasks 陣列為唯一資料來源，新增、編輯、刪除後都重建清單。
//   【範例】刪除第 2 則後，畫面會依剩餘陣列重新排列，不會留下重複項目或錯誤位置。
//
// 8.【功能】較安全的 DOM 建立方式
//   【特性】使用 createElement()、value 與 textContent 建立內容，不把使用者文字當成 HTML 執行。
//   【範例】備忘錄輸入「<b>重要</b>」時，只會顯示這段文字，不會被解析成粗體 HTML 標籤。
//
// 9.【功能】唯讀與編輯模式切換
//   【特性】備忘錄平時保持唯讀，按 Edit 才可修改，按 Save 後重新鎖定，降低誤觸修改。
//   【範例】第一次按 Edit 會選取整段文字；修改完成按 Save 後，內容立即鎖定並保存。
//
// 10.【功能】編輯後同步留存
//   【特性】修改內容時同時更新 tasks 陣列、localStorage 與畫面，而不是只改目前看到的文字。
//   【範例】把「聯絡客戶」改成「下午三點聯絡客戶」，重新整理後仍會顯示修改後內容。
//
// 11.【功能】Enter 快速儲存
//   【特性】編輯狀態下按 Enter 等同點擊 Save，減少滑鼠操作。
//   【範例】修改完成後直接按 Enter，即可保存並退出編輯狀態。
//
// 12.【功能】刪除後同步留存
//   【特性】Delete 不只移除畫面項目，也會從陣列與 localStorage 永久移除。
//   【範例】刪除「已完成的回電」後重新整理，該項目不會重新出現。
//
// 13.【功能】儲存成功確認
//   【特性】saveTasks() 會回傳成功或失敗；只有成功時才清空輸入框及更新畫面。
//   【範例】若瀏覽器封鎖網站資料，系統會保留輸入文字並顯示警告，而不是假裝已經保存。
//
// 14.【功能】無障礙標示
//   【特性】使用 aria-label 說明輸入框用途，讓螢幕閱讀器能辨認「備忘錄內容」。
//   【範例】視覺輔助工具聚焦輸入框時，會朗讀這是備忘錄內容，而不是只有「文字輸入框」。
//
// 15.【功能】首次載入自動還原
//   【特性】頁面開啟後先讀取 localStorage，再執行 renderTasks()，不需要手動按「載入」。
//   【範例】開啟 index1.html 後，昨天保存的清單會直接顯示在 Tasks 區域。
// ======================================================================
//
// 等待整個網頁載入完成後再執行，確保表單、輸入框和清單都已經存在於頁面中。
window.addEventListener("load", () => {
    // 【特性：固定且可版本化】localStorage 使用「名稱和值」保存資料；這個固定名稱就是備忘錄的儲存位置。
    // 後面的 v1 是資料格式版本，未來若改變資料結構，可以改成 v2，避免新舊格式互相衝突。
    // 【範例】現在從 eliNotebook.tasks.v1 讀寫；未來資料結構改版時可以另外使用 eliNotebook.tasks.v2。
    const STORAGE_KEY = "eliNotebook.tasks.v1";

    // 從 HTML 取得新增備忘錄所需的三個元件：表單、文字輸入框、備忘錄顯示區域。
    const form = document.querySelector("#new-task-form");
    const input = document.querySelector("#new-task-input");
    const listElement = document.querySelector("#tasks");

    // 【特性：安全停止】如果 HTML 中任何一個必要元件不存在，就立刻停止備忘錄程式。
    // 這是防呆機制，可避免 JavaScript 因為找不到元件而報錯，進一步影響其他網頁功能。
    // 【範例】#new-task-form 被移除時會在這裡停止，不會繼續呼叫 form.addEventListener() 而發生錯誤。
    if (!form || !input || !listElement) return;

    // 【特性：限制長度】每一則備忘錄最多輸入 300 個字，避免意外貼入過長內容而影響版面與容量。
    // 【範例】輸入到第 300 個字後，瀏覽器會停止接受更多文字。
    input.maxLength = 300;

    // 網頁開啟時，先從瀏覽器讀取上次儲存的備忘錄，放進 tasks 陣列中供後續操作。
    let tasks = loadTasks();

    // 【特性：自動還原】從 localStorage 讀取並還原備忘錄。
    // 【範例】上次保存兩則內容，loadTasks() 就會回傳包含兩個字串的陣列。
    function loadTasks() {
        try {
            // localStorage 只能保存文字，因此先用 getItem 取得 JSON 字串，
            // 再用 JSON.parse 還原成 JavaScript 陣列；沒有舊資料時使用空陣列 []。
            const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

            // 確認讀出的資料真的是陣列，並只保留文字項目。
            // 這可避免資料毀損或格式錯誤時，整個備忘錄功能無法運作。
            return Array.isArray(savedTasks)
                ? savedTasks.filter((task) => typeof task === "string")
                : [];
        } catch (error) {
            // 若 JSON 資料損壞或瀏覽器拒絕讀取，記錄錯誤並回傳空陣列，讓頁面仍能正常開啟。
            console.error("無法讀取備忘錄：", error);
            return [];
        }
    }

    // 【特性：整批同步】把目前 tasks 陣列中的全部備忘錄寫入 localStorage。
    // 【範例】tasks 有三則內容時，三則會一起轉成 JSON 字串寫入同一個儲存鍵。
    function saveTasks() {
        try {
            // localStorage 只能存文字，因此先用 JSON.stringify 把陣列轉成 JSON 字串再儲存。
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));

            // 回傳 true，讓新增備忘錄的程式知道儲存成功，可以清空輸入框並更新畫面。
            return true;
        } catch (error) {
            // 無痕模式、網站資料遭封鎖或瀏覽器空間不足時可能儲存失敗，
            // 因此同時在開發者工具留下錯誤，並用訊息提醒使用者。
            console.error("無法儲存備忘錄：", error);
            alert("備忘錄無法儲存，請確認瀏覽器沒有封鎖網站資料或使用無痕模式。");
            return false;
        }
    }

    // 【特性：資料驅動畫面】根據 tasks 陣列重新產生畫面上的全部備忘錄。
    // 新增、編輯或刪除後都呼叫同一個函式，可讓畫面和實際儲存資料保持一致。
    // 【範例】tasks 從三則刪成兩則後，renderTasks() 會把畫面重新建立成兩則。
    function renderTasks() {
        // 先清空舊畫面再重建，避免每次更新時重複顯示相同備忘錄。
        listElement.replaceChildren();

        // 逐一處理每一則備忘錄；index 是該項目在陣列中的位置，編輯和刪除時會使用。
        tasks.forEach((task, index) => {
            // 建立每一則備忘錄最外層的容器，並套用原本 CSS 使用的 task 類別。
            const taskElement = document.createElement("div");
            taskElement.classList.add("task");

            // 建立放置備忘錄文字輸入框的內容區塊。
            const taskContentElement = document.createElement("div");
            taskContentElement.classList.add("content");

            // 建立備忘錄文字輸入框，並把陣列中的文字顯示出來。
            const taskInputElement = document.createElement("input");
            taskInputElement.classList.add("text");
            taskInputElement.type = "text";
            taskInputElement.value = task;
            taskInputElement.maxLength = 300;

            // 【特性：防止誤改】預設設為唯讀，避免使用者誤觸時直接改到內容；必須先按 Edit 才能編輯。
            // 【範例】直接點備忘錄文字不會修改；先按 Edit 才會解除唯讀。
            taskInputElement.readOnly = true;

            // 【特性：無障礙辨識】提供螢幕閱讀器可辨識的名稱，改善鍵盤操作與無障礙閱讀體驗。
            // 【範例】輔助工具聚焦時會讀出「備忘錄內容」。
            taskInputElement.setAttribute("aria-label", "備忘錄內容");

            // 建立放置 Edit 與 Delete 按鈕的操作區塊。
            const taskActionsElement = document.createElement("div");
            taskActionsElement.classList.add("actions");

            // 建立編輯按鈕。明確指定 type="button"，避免它被瀏覽器當成送出表單的按鈕。
            const editButton = document.createElement("button");
            editButton.classList.add("edit");
            editButton.type = "button";

            // 【特性：純文字輸出】使用 textContent 放入按鈕文字，不使用 innerHTML，避免內容被當成 HTML 解析。
            // 【範例】即使文字中出現 <script>，也只會被當成普通文字，而不會執行程式碼。
            editButton.textContent = "Edit";

            // 建立刪除按鈕，同樣指定為一般按鈕，避免誤觸發表單送出。
            const deleteButton = document.createElement("button");
            deleteButton.classList.add("delete");
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";

            // 按照 HTML 結構依序組合文字區、操作按鈕與整則備忘錄，最後放進備忘錄清單。
            taskContentElement.appendChild(taskInputElement);
            taskActionsElement.append(editButton, deleteButton);
            taskElement.append(taskContentElement, taskActionsElement);
            listElement.appendChild(taskElement);

            // 處理 Edit／Save 按鈕：同一顆按鈕依目前狀態切換「開始編輯」或「儲存修改」。
            editButton.addEventListener("click", () => {
                // 唯讀狀態下按 Edit：解除唯讀、將游標移到輸入框並選取文字，方便立即修改。
                if (taskInputElement.readOnly) {
                    taskInputElement.readOnly = false;
                    taskInputElement.focus();
                    taskInputElement.select();
                    editButton.textContent = "Save";
                    return;
                }

                // 編輯狀態下按 Save：去除文字前後多餘空白，取得真正需要儲存的內容。
                const updatedTask = taskInputElement.value.trim();

                // 不允許把備忘錄存成空白，避免清單中出現看不到內容的項目。
                if (!updatedTask) {
                    alert("備忘錄內容不能是空白。");
                    taskInputElement.focus();
                    return;
                }

                // 更新陣列中相同位置的內容，寫入 localStorage，再重新產生畫面。
                // 原版只改畫面文字，沒有這三步，所以重新開啟網頁後修改內容會消失。
                tasks[index] = updatedTask;
                saveTasks();
                renderTasks();
            });

            // 【特性：鍵盤快速操作】使用者編輯時按 Enter，等同於點擊 Save，讓操作更方便。
            // 【範例】修改完「整理保單」後按 Enter，就會觸發 editButton.click() 完成儲存。
            taskInputElement.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !taskInputElement.readOnly) {
                    editButton.click();
                }
            });

            // 【特性：永久同步刪除】點擊 Delete 時，使用 splice 從陣列刪除對應位置的備忘錄，
            // 接著同步更新 localStorage 和畫面，確保下次開啟時被刪除的內容不會再出現。
            // 【範例】刪除第 1 則後，該項目會從陣列、瀏覽器儲存及畫面三個地方一起消失。
            deleteButton.addEventListener("click", () => {
                tasks.splice(index, 1);
                saveTasks();
                renderTasks();
            });
        });
    }

    // 監聽新增備忘錄表單的送出事件。
    form.addEventListener("submit", (event) => {
        // 阻止表單的預設重新整理行為；若重新整理發生在儲存之前，剛輸入的內容就可能消失。
        event.preventDefault();

        // 【特性：內容正規化】取得使用者輸入內容，並移除文字前後的多餘空白。
        // 【範例】輸入「  回覆客戶  」時，實際保存為「回覆客戶」。
        const newTask = input.value.trim();

        // 不接受空白備忘錄，並把輸入焦點移回輸入框方便使用者重新輸入。
        if (!newTask) {
            alert("請先輸入備忘錄內容。");
            input.focus();
            return;
        }

        // 先把新內容加入 tasks 陣列，再嘗試寫入 localStorage。
        tasks.push(newTask);

        // 【特性：確認成功再更新】只有成功儲存後才清空輸入框並重畫清單，避免誤以為已保存。
        // 【範例】localStorage 寫入失敗時，輸入框不會被清空，使用者可以複製內容或再次嘗試。
        if (saveTasks()) {
            input.value = "";
            renderTasks();
        }
    });

    // 【特性：開啟即顯示】網頁第一次開啟時立即執行，將 loadTasks 讀到的舊備忘錄顯示回畫面上。
    // 【範例】昨天保存的內容會直接出現在清單中，不需要另外點擊載入按鈕。
    renderTasks();
});
