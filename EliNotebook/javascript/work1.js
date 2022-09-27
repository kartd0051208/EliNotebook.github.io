
// 1.抓取按鈕
// document.querySelector("#btn_send_add")
function addDataa(){


// 2.抓取輸入值，獲取輸入框的內容

// classroom
let classroomElement = document.querySelector('#classroom');
let classroom =  classroomElement.value;

// ID
let IDElement = document.querySelector('#ID');
let ID = IDElement.value;

// name
let nameElement = document.querySelector('#name');
let name = nameElement.value;

// score
let scoreElement = document.querySelector('#score');
let score = scoreElement.value;
// console.log(score,name,ID,classroom);
ｂ


//3.創建td,賦td的標籤 的內容（賦值）


// class
let td_ClassroomA = document.createElement("td"); 
let text_ClassroomA = document.createTextNode(classroom);
td_ClassroomA.appendChild(text_ClassroomA);
console.log(td_ClassroomA)
// ID
let td_IDElement = document.createElement("td");
let text_ID = document.createTextNode(ID);
td_IDElement.appendChild(text_ID);

// name
let td_Name = document.createElement("td");
let text_Name = document.createTextNode(name);
td_Name.appendChild(text_Name);

// score
let td_Score = document.createElement("td");
let text_Score = document.createTextNode(score);
td_Score.appendChild(text_Score);


// 4.創建tr
let tr =document.createElement("tr");

// 5.添加td到tr中
tr.appendChild(td_ClassroomA);
tr.appendChild(td_IDElement);
tr.appendChild(td_Name);
tr.appendChild(td_Score);


// 6.獲取table
let tableA = document.querySelector("#table")[0];
tableA.appendChild(tr);
}
