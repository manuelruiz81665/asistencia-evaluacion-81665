class ScannerController{
  constructor(){
    this.scanner=null;
    this.locked=false;
  }

  async start(onScan){
    if(this.scanner)return;

    if(typeof Html5Qrcode==="undefined"){
      throw new Error("No se cargó la biblioteca del escáner. Revise la conexión.");
    }

    this.scanner=new Html5Qrcode("reader");

    try{
      const cameras=await Html5Qrcode.getCameras();

      if(!cameras.length){
        throw new Error("No se encontró ninguna cámara.");
      }

      const rear=
        cameras.find(c=>/back|rear|environment|trasera/i.test(c.label))
        || cameras[cameras.length-1];

      await this.scanner.start(
        rear.id,
        {
          fps:10,
          qrbox:{width:250,height:250},
          aspectRatio:1
        },
        async text=>{
          if(this.locked)return;

          this.locked=true;

          try{
            await onScan(text);
          }finally{
            setTimeout(()=>{
              this.locked=false;
            },4000);
          }
        },
        ()=>{}
      );

    }catch(e){
      this.scanner=null;
      throw new Error(this.friendlyError(e));
    }
  }

  async stop(){
    if(!this.scanner)return;

    try{
      await this.scanner.stop();
      await this.scanner.clear();
    }catch(e){}

    this.scanner=null;
  }

  friendlyError(e){
    const m=e?.message||String(e);

    if(/NotAllowed|Permission|denied/i.test(m)){
      return "Permiso de cámara denegado. Abra la configuración del sitio y permita la cámara.";
    }

    if(/NotFound|camera/i.test(m)){
      return "No se encontró una cámara disponible.";
    }

    return m;
  }
}

export const scannerController=new ScannerController();
