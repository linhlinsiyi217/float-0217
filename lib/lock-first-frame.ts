// 首帧锁屏决策的内联脚本（layout 的 <head> 里同步执行，先于任何渲染）。
//
// 「跳过开屏动画」开着时，锁屏页就是第一帧 —— 而主 bundle 与 IndexedDB 都还没
// 到位，只能靠 localStorage 里那份同步镜像（float.lock / float.lock.wall，由
// lib/lock-screen.ts 每次保存时同步写）。镜像只认 on + skipBoot 都为真才接管，
// 拿不准就什么都不做：最坏结果是这一次先放开屏动画，绝不会锁错。
//
// 注入的静态首帧与 React 锁屏层共用 styles/lock-screen.css 的同一套类；
// React 锁屏层挂载后由 components/lock-screen-overlay.tsx 移除这个节点。
// 时钟文字在注入时同步算好，与真锁屏首帧是同一分钟，切换不闪。

export const LOCK_FIRST_FRAME_SCRIPT = `(function(){
try{
  var c=null;
  try{c=JSON.parse(window.localStorage.getItem('float.lock')||'null')}catch(e){c=null}
  if(!c||!c.on||!c.skipBoot)return;
  var w='';
  try{w=window.localStorage.getItem('float.lock.wall')||''}catch(e){w=''}
  if(!/^data:image\\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\\/=]+$/i.test(w))w='';
  var f=function(n){return (n<10?'0':'')+n};
  var now=new Date();
  var t=f(now.getHours())+':'+f(now.getMinutes());
  var d=(now.getMonth()+1)+'月'+now.getDate()+'日 星期'+'日一二三四五六'.charAt(now.getDay());
  var el=document.createElement('div');
  el.id='lock-first-frame';
  el.className='lock-layer';
  if(w){
    var wall=document.createElement('div');
    wall.className='lock-wall';
    wall.style.backgroundImage='url("'+w+'")';
    el.appendChild(wall);
    el.className='lock-layer has-wall';
  }
  var body=document.createElement('div');
  body.className='lock-body';
  var time=document.createElement('div');
  time.className='lock-time';
  time.textContent=t;
  var date=document.createElement('div');
  date.className='lock-date';
  date.textContent=d;
  body.appendChild(time);
  body.appendChild(date);
  el.appendChild(body);
  document.documentElement.appendChild(el);
}catch(e){}
})();`;
