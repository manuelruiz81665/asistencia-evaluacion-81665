import { storage } from "./storage.js";
export const api={
  async call(action,payload={}){
    const {apiUrl,apiKey}=storage.getConfig();
    if(!apiUrl)throw new Error("Primero configure la URL de Apps Script.");
    const body={action,payload,apiKey};
    const response=await fetch(apiUrl,{
      method:"POST",
      redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(body)
    });
    if(!response.ok)throw new Error(`Error HTTP ${response.status}`);
    const text=await response.text();
    try{return JSON.parse(text)}catch{throw new Error("La respuesta del servidor no es válida.");}
  }
};