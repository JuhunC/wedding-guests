/* 축의 장부 — 서비스워커 (앱 셸 오프라인 캐시)
   앱 데이터(localStorage/IndexedDB)는 이미 기기에 저장됨. 이 워커는 '페이지 자체'를
   캐시해 오프라인에서도 열리게 함. 광고 등 외부(교차 출처) 요청은 건드리지 않는다. */
"use strict";

var CACHE = 'wg-shell-v1';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'privacy.html', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 개별 add + catch → 파일 하나가 없어도 설치가 통째로 실패하지 않게
      return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ return k === CACHE ? null : caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return;   // 광고/외부 리소스는 그대로 통과

  // 페이지 이동: 네트워크 우선, 실패 시 캐시된 index.html
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).catch(function(){
        return caches.match('index.html').then(function(r){ return r || caches.match('./'); });
      })
    );
    return;
  }

  // 그 외 동일 출처 GET: 캐시 우선, 없으면 네트워크(성공 시 런타임 캐시)
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        try{
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        }catch(err){}
        return res;
      }).catch(function(){ return cached; });
    })
  );
});
