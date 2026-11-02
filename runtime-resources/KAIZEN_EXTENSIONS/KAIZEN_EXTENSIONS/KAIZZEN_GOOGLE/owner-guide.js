"use strict";
document.getElementById("password-manager").addEventListener("click",()=>{
  const message=document.getElementById("message");
  try{
    chrome.tabs.create({url:"chrome://password-manager/passwords"},tab=>{
      if(chrome.runtime.lastError){
        message.textContent="Abre chrome://password-manager/passwords en la barra del navegador.";
        return;
      }
      message.textContent="El gestor de contraseñas se abrió en otra pestaña.";
    });
  }catch{
    message.textContent="Abre chrome://password-manager/passwords manualmente en Chromium.";
  }
});
