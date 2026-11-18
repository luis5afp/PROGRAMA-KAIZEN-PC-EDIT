"use strict";
/* Local user-interface ONLY. There are no network or storage APIs here. */
(() => {
  const core=globalThis.Kaizen233Lab;
  if(!core)throw new Error("Falta el núcleo del laboratorio");
  const byId=id=>document.getElementById(id);
  const nodes={
    mode:byId("mode"),list:byId("card-list"),
    received:byId("received"),authorized:byId("authorized"),
    restricted:byId("restricted"),pairs:byId("pairs"),
    selectedInfo:byId("selected-info"),result:byId("result"),
    email:byId("fake-email"),password:byId("fake-pass")
  };
  let cards=[],selected=null;

  function show(message){nodes.result.textContent=message;}
  function clearForm(){
    nodes.email.value="";
    nodes.password.value="";
  }
  function select(card){
    selected=card;
    clearForm();
    nodes.selectedInfo.textContent="Seleccionada: "+card.name+" ("+card.id+")";
    for(const element of nodes.list.children)
      element.setAttribute("aria-pressed",String(element.dataset.id===card.id));
    show("Tarjeta de laboratorio seleccionada. Sin ninguna solicitud a Internet.");
  }
  function redraw(){
    cards=core.makeCatalog(nodes.mode.value);
    const metrics=core.metrics(cards);
    nodes.received.textContent=String(metrics.received);
    nodes.authorized.textContent=String(metrics.authorized);
    nodes.restricted.textContent=String(metrics.restricted);
    nodes.pairs.textContent=String(metrics.credentialPairs);
    nodes.list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const card of cards){
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="item";
      btn.dataset.id=card.id;
      btn.setAttribute("aria-pressed","false");
      const name=document.createElement("span");
      name.textContent=card.name;
      const badge=document.createElement("span");
      badge.className="tag"+(card.isLock?" locked":"");
      badge.textContent=card.isLock?"Bloqueada (ficticia)":"Autorizada (ficticia)";
      btn.append(name,badge);
      btn.addEventListener("click",()=>select(card));
      fragment.append(btn);
    }
    nodes.list.append(fragment);
    select(cards[0]);
  }
  function tryFill(){
    if(!selected)return;
    const target=new URL(selected.d).origin;
    const session=core.beginAutofill(selected,target);
    if(!session.ok){
      clearForm();
      show("Sin autocompletado: "+session.reason+
        ". No se inventan credenciales ausentes ni se usan datos reales.");
      return;
    }
    const res=core.fillFakeForm({
      email:nodes.email,password:nodes.password
    },session,target);
    show(res.ok
      ?"Prueba correcta: 2 campos rellenados con datos 100% ficticios. No se envió ningún formulario."
      :"Prueba fallida: "+res.reason);
  }
  function tryAll(){
    let completed=0,skipped=0,failed=0;
    for(const card of cards){
      const target=new URL(card.d).origin;
      const session=core.beginAutofill(card,target);
      if(!session.ok){skipped++;continue;}
      const fields={email:{value:""},password:{value:""}};
      const result=core.fillFakeForm(fields,session,target);
      if(result.ok&&fields.email.value===card.e&&fields.password.value===card.k)
        completed++;
      else failed++;
    }
    show(
      "RESULTADO DEL LABORATORIO · "+cards.length+" tarjetas\n"+
      "Autocompletados ficticios: "+completed+"\n"+
      "Omitidos por bloqueo/datos ausentes: "+skipped+"\n"+
      "Fallos técnicos: "+failed+"\n"+
      "Modo: "+nodes.mode.value+"\n"+
      "No se consultó ni modificó tu servidor. No hay credenciales reales."
    );
  }
  nodes.mode.addEventListener("change",redraw);
  byId("fill").addEventListener("click",tryFill);
  byId("test-all").addEventListener("click",tryAll);
  byId("reset").addEventListener("click",()=>{
    clearForm();
    show("Formulario restablecido. No se almacenaron datos.");
  });
  byId("fake-form").addEventListener("submit",e=>e.preventDefault());
  redraw();
})();
