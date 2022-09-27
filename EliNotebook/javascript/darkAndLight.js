


const bodyA =document.querySelector('body');

const toggleA = document.querySelector('#toggle');
toggleA.onclick = function(){
    toggleA.classList.toggle('active');
    bodyA.classList.toggle('active');
}