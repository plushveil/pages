(()=>{var u=null;function s(){p(),window.addEventListener("scroll",h),h()}function h(){let o=[];for(let a of document.querySelectorAll("h1, h2, h3, h4, h5, h6"))if(a.getBoundingClientRect().top<window.innerHeight*.3)o.push(a);else break;u!==o[o.length-1]&&(u=o[o.length-1],w(b(u)))}function w(o){let a=document.querySelector("header"),e=a.querySelector('nav[aria-label="breadcrumb"]').querySelector("ol");for(let r=e.children.length-1;r>=1;r--)e.children[r].remove();function n(r){return r.tagName==="A"?r:r.parentElement?n(r.parentElement):null}let c=a.querySelector("template");o.forEach((r,g)=>{let d=c.content.cloneNode(!0),l=d.querySelector("a"),i=r.querySelector("a")||n(r);l.textContent=r.textContent,i&&i.href?(l.href=i.href,i.getAttribute("target")&&l.setAttribute("target",i.getAttribute("target")),i.getAttribute("rel")&&l.setAttribute("rel",i.getAttribute("rel")),i.getAttribute("title")&&l.setAttribute("title",i.getAttribute("title"))):l.href=`#${r.id}`,e.appendChild(d)})}function p(){document.querySelector("header").querySelector('nav[aria-label="breadcrumb"]').querySelector("select").addEventListener("change",t=>{let e=document.querySelector(`link[rel="alternate"][hreflang="${t.target.value}"]`)?.getAttribute("href");e&&e!==window.location.href&&(window.location.href=e)})}function b(o){let a=[...document.querySelectorAll("h1, h2, h3, h4, h5, h6")],t=a.slice(0,a.indexOf(o)+1),e=[],n=0;return t.forEach(c=>{let r=parseInt(c.tagName[1]);if(r>n)e.push(c);else if(r<n){for(e=[...e];e.length>0&&parseInt(e[e.length-1].tagName[1])>=r;)e.pop();e.push(c)}else e.pop(),e.push(c);n=r}),e}y();async function y(){f()?m():new window.MutationObserver((a,t)=>{for(let e of a)if(e.type==="childList"&&e.target.tagName==="HEAD"&&f()){t.disconnect(),m();break}}).observe(document.documentElement,{childList:!0,subtree:!0}),window.addEventListener("load",S)}function f(){if(!document.head)return!1;let o=document.head.lastChild?.getAttribute("src");if(!o)return!0;let a=new URL(o,window.location.origin),t=new URL(document.currentScript?.src||"",window.location.origin);return a.pathname!==t.pathname}async function m(){o();function o(){let a=document.documentElement.lang;if(!a)return;let t=document.querySelector(`link[rel="alternate"][hreflang="${a}"]`),e=t?.href,n=e?new URL(e):null;if(n&&window.location.pathname!==n.pathname){for(let[c,r]of new URLSearchParams(window.location.search))n.searchParams.set(c,r);n.hash=window.location.hash,window.location.replace(n.toString())}else if(n){let c=document.querySelector('link[rel="canonical"]');c?new URL(c.href).pathname===n.pathname&&t.remove():console.warn('The <link rel="canonical"> tag is missing.')}}}async function S(){let o=document.getElementById("main-menu");if(o){let t=o.querySelector('button[aria-controls="main-menu"]'),e=o.querySelectorAll('*[aria-hidden="true"]');t.addEventListener("click",()=>{let n=t.getAttribute("aria-expanded")==="true";t.setAttribute("aria-expanded",!n),e.forEach(c=>{c.setAttribute("aria-hidden",n)})})}document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(t=>{if(t.id)return;let e=t.textContent.toLowerCase().replace(/[äöüß]/g,n=>({\u00E4:"ae",\u00F6:"oe",\u00FC:"ue",\u00DF:"ss"})[n]).replace(/[^a-z0-9]+/g,"-");for(;document.getElementById(e);)e.match(/--\d+$/)?e=e.replace(/--\d+$/,n=>`--${parseInt(n.slice(2))+1}`):e+="--1";t.id=e}),window.addEventListener("hashchange",a),window.location.hash&&a(),s();function a(){let t=document.getElementById(window.location.hash.slice(1));if(t&&(t&&t.scrollIntoView(),document.querySelector("header"))){let e=document.querySelector("header"),n=window.getComputedStyle(e).position;if(n==="fixed"||n==="sticky"){let c=parseInt(window.getComputedStyle(e).height);window.scrollBy(0,-c)}}}}})();
//# sourceMappingURL=https://plushveil.github.io/pages/preview/1/scripts/core.map.js
