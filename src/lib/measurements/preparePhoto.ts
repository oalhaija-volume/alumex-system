export async function preparePhoto(file:File){
 if(!file.type.startsWith('image/')||file.size>25*1024*1024)throw new Error('Choose a photo smaller than 25 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable. Try another photo.');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.8,0.65,0.45]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=700000)return result;}
  throw new Error('Photo processing is unavailable. Try another photo.');
 }finally{URL.revokeObjectURL(url);}
}
