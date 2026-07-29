// function printMany(){
//     for(let i = 1;i<=100 ;i++){
//     console.log(i);
//     }
// }

// printMany();


// function printMany2(){
//     for(let i = 1;i<=88 ;i+=3){
//     console.log(i);
//     }
// }

// printMany2();

// function printMany3(){
//     let i = 1;
//     while(i<=88){
//         console.log(i);
//         i+=3
//    }
// }

// printMany3();


// function stars(n){
//     let result ="";
//     for(let i = 0;i<n;i++){
//         result += "*";
//     }
//     return result
// }

// console.log(stars(3));
// console.log(stars(10));

// function isUpperCase(str){
//     if(str.length ==0){
//     return false;
// }

//     if(str[0]== str[0].toUpperCase()){
//         return true;
//     }else{
//         return false;
//     }
// }


// console.log(isUpperCase("ABCD"));

// console.log(isUpperCase("aBBCD"));

// console.log(isUpperCase(""));

// function isUpperCase(str){

// if(str[0] ==str[0].toUpperCase())   /* 先判斷字串是不是大寫 */
// {
//     return true;
// }else {
//     return false;
// }
// }
// function isAllUpperCase(str){
//     if(str.length== 0){
//         return false ;
//     }
//     let allUpperCase = true;

//     for (let i=0;i<str.length;i++){
//         if(str[i]!=str[i].toUpperCase()){
//             allUpperCase =false;
//         }  
//     }
//     return allUpperCase;
// }

// console.log(isAllUpperCase("ABCD"));

// console.log(isAllUpperCase("aBBCD"));

// console.log(isAllUpperCase(""));


// function findBiggest(arr){
//     if(arr.length == 0){
//         return undefined;
//     }
//     let biggestNumber = -10000000;

//     for(let i=0;i<arr.length ;i++){
//         if(arr[i] > biggestNumber){
//         biggestNumber = arr[i];
//         }
//     }
//     return biggestNumber;
// }

// console.log(findBiggest([]));

// console.log(findBiggest([1,2,3,4,5,6,7,999]));
// console.log(findBiggest([-11,0,-3,-4,-5,-999]));


// function findBiggest(arr){
//     if(arr.length == 0 ){
//         return undefined;
//     }
//     let biggestNumber = -10000000;

//     for(let i=0 ;i<arr.length;i++){
//         if(arr[i] >biggestNumber){
//             biggestNumber =arr[i];
//         }
//     }
//     return biggestNumber;
// }

// console.log(findBiggest([9,45,866,445423,452,4534,5245]));
// console.log(findBiggest([8,995,5456,3251,5864,852123,12]));

