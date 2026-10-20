// Ouru Superstores backend - Node 18+ / Express
const express=require('express'),fs=require('fs'),path=require('path');
const app=express(); app.use(express.json({limit:'6mb'}));
const PF='products.json',DB='orders.json',ADMIN_KEY=process.env.ADMIN_KEY||'change-me';
const rd=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):d, wr=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2));
const admin=(q,r,n)=>q.get('x-admin-key')===ADMIN_KEY?n():r.status(401).json({error:'Wrong admin key'});
const CATS=['foods','laundry','hardware'];
fs.mkdirSync('public/img',{recursive:true});

// ---- M-Pesa Daraja (set env vars to enable) ----
const M={key:process.env.MPESA_KEY,secret:process.env.MPESA_SECRET,short:process.env.MPESA_SHORTCODE,pass:process.env.MPESA_PASSKEY,cb:process.env.MPESA_CALLBACK_URL,
  base:process.env.MPESA_ENV==='live'?'https://api.safaricom.co.ke':'https://sandbox.safaricom.co.ke'};
const mpesaOn=()=>M.key&&M.secret&&M.short&&M.pass&&M.cb;
async function stk(o){
  const t=(await(await fetch(M.base+'/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:'Basic '+Buffer.from(M.key+':'+M.secret).toString('base64')}})).json()).access_token;
  const ts=new Date().toISOString().replace(/\D/g,'').slice(0,14), ph='254'+o.customer.phone.replace(/\s/g,'').replace(/^(\+?254|0)/,'');
  const r=await fetch(M.base+'/mpesa/stkpush/v1/processrequest',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},
    body:JSON.stringify({BusinessShortCode:M.short,Password:Buffer.from(M.short+M.pass+ts).toString('base64'),Timestamp:ts,TransactionType:process.env.MPESA_TYPE||'CustomerPayBillOnline',Amount:o.total,PartyA:ph,PartyB:process.env.MPESA_PARTYB||M.short,PhoneNumber:ph,CallBackURL:M.cb,AccountReference:o.ref,TransactionDesc:'Ouru order'})});
  return r.json();
}
app.post('/api/mpesa/callback',(q,r)=>{ // Safaricom calls this when the customer pays or cancels
  const c=q.body?.Body?.stkCallback, all=rd(DB,[]), o=all.find(x=>c&&x.checkoutId===c.CheckoutRequestID);
  if(o){o.status=c.ResultCode===0?'PAID':'PAYMENT_FAILED';
    o.receipt=(c.CallbackMetadata?.Item||[]).find(i=>i.Name==='MpesaReceiptNumber')?.Value;wr(DB,all)}
  r.json({ResultCode:0,ResultDesc:'Accepted'});
});
app.get('/api/orders/:ref/status',(q,r)=>{const o=rd(DB,[]).find(x=>x.ref===q.params.ref);r.json({status:o?o.status:'UNKNOWN'})});

// ---- Public ----
app.get('/api/products',(q,r)=>r.json(rd(PF,[])));
app.post('/api/orders',async(req,res)=>{
  const {customer,items,payment}=req.body||{}, PRODUCTS=rd(PF,[]);
  if(!customer?.name||!/^(\+?254|0)\d{9}$/.test((customer.phone||'').replace(/\s/g,''))||!customer.address)
    return res.status(400).json({error:'Name, valid phone and address required'});
  if(!['mpesa','card','bank'].includes(payment)) return res.status(400).json({error:'Invalid payment method'});
  let total=0; const lines=[];
  for(const i of items||[]){ // prices always come from the server
    const p=PRODUCTS.find(x=>x.id===i.id), qty=parseInt(i.qty);
    if(!p||!(qty>0)) return res.status(400).json({error:'Bad item'});
    total+=p.price*qty; lines.push({id:p.id,name:p.name,price:p.price,qty});
  }
  if(!lines.length) return res.status(400).json({error:'Cart empty'});
  const order={ref:'OURU-'+Date.now().toString(36).toUpperCase(),customer,lines,total,payment,status:'PENDING_PAYMENT',at:new Date().toISOString()};
  let message;
  if(payment==='mpesa'&&mpesaOn()){
    try{const d=await stk(order);
      if(d.ResponseCode==='0'){order.checkoutId=d.CheckoutRequestID;message='Check your phone and enter your M-Pesa PIN to pay.'}
      else message='Could not start M-Pesa prompt. We will contact you to complete payment.'}
    catch(e){message='M-Pesa is temporarily unavailable. We will contact you to complete payment.'}
  }
  const all=rd(DB,[]); all.push(order); wr(DB,all);
  res.json({ref:order.ref,total,status:order.status,message});
});

// ---- Admin ----
app.get('/api/admin/check',admin,(q,r)=>r.json({ok:true}));
app.get('/api/orders',admin,(q,r)=>r.json(rd(DB,[]).reverse()));
app.patch('/api/orders/:ref',admin,(q,r)=>{
  const all=rd(DB,[]),o=all.find(x=>x.ref===q.params.ref);
  if(!o||!['PENDING_PAYMENT','PAID','DISPATCHED','DELIVERED','CANCELLED','PAYMENT_FAILED'].includes(q.body.status)) return r.status(400).json({error:'Bad request'});
  o.status=q.body.status; wr(DB,all); r.json(o);
});
const clean=b=>({name:String(b.name||'').trim().slice(0,120),cat:b.cat,price:Math.round(Number(b.price)),icon:b.icon||'📦',img:b.img||''});
const valid=p=>p.name&&CATS.includes(p.cat)&&p.price>0;
app.post('/api/products',admin,(q,r)=>{
  const p=clean(q.body); if(!valid(p)) return r.status(400).json({error:'Name, category and price required'});
  p.id='p'+Date.now().toString(36); const all=rd(PF,[]); all.push(p); wr(PF,all); r.json(p);
});
app.put('/api/products/:id',admin,(q,r)=>{
  const all=rd(PF,[]),i=all.findIndex(x=>x.id===q.params.id), p=clean(q.body);
  if(i<0||!valid(p)) return r.status(400).json({error:'Bad request'});
  all[i]={...all[i],...p}; wr(PF,all); r.json(all[i]);
});
app.delete('/api/products/:id',admin,(q,r)=>{wr(PF,rd(PF,[]).filter(x=>x.id!==q.params.id));r.json({ok:true})});
app.post('/api/upload',admin,(q,r)=>{
  const m=/^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(q.body.data||'');
  if(!m) return r.status(400).json({error:'JPG, PNG or WEBP only'});
  const f='img/'+Date.now()+'.'+(m[1]==='jpeg'?'jpg':m[1]);
  fs.writeFileSync(path.join(__dirname,'public',f),Buffer.from(m[2],'base64')); r.json({url:'/'+f});
});
app.use(express.static(path.join(__dirname,'public')));
app.listen(process.env.PORT||3000,()=>console.log('Ouru store running'));
