/* 축의 장부 — 서비스워커 (앱 셸 오프라인 캐시)
   앱 데이터(localStorage/IndexedDB)는 기기에 그대로 있음. 이 워커는 '페이지 자체'를 캐시해
   오프라인에서도 열리게 함. 광고 등 외부(교차 출처) 요청은 건드리지 않는다.
   ※ 배포 시 앱 셸을 강제 갱신하려면 CACHE 뒤 숫자를 올리세요(예: v2 → v3). */
"use strict";

var CACHE = 'wg-shell-v2';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'privacy.html', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 개별 add + catch → 선택 파일이 없어도 설치가 통째로 실패하지 않게
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

function putIfOk(req, res){
  try{
    if(res && res.ok && res.type === 'basic' && res.status === 200){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
    }
  }catch(err){}
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return;   // 광고/외부 리소스는 그대로 통과

  // 페이지 이동: 네트워크 우선 + 성공 시 최신 index.html 을 캐시에 갱신(오프라인 복사본 최신화)
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        try{ if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put('index.html', copy); }).catch(function(){}); } }catch(err){}
        return res;
      }).catch(function(){
        return caches.match('index.html').then(function(r){ return r || caches.match('./'); }).then(function(r){
          return r || new Response('<!doctype html><meta charset="utf-8"><title>오프라인</title><p style="font-family:sans-serif;padding:24px">오프라인 상태예요. 네트워크에 한 번 연결하면 이후에는 오프라인에서도 열립니다.',
            { headers:{ 'Content-Type':'text/html; charset=utf-8' } });
        });
      })
    );
    return;
  }

  // 그 외 동일 출처 GET: stale-while-revalidate (캐시 즉시 응답 + 뒤에서 최신화)
  e.respondWith(
    caches.match(req).then(function(cached){
      var fetching = fetch(req).then(function(res){ putIfOk(req, res); return res; }).catch(function(){ return cached; });
      return cached || fetching;
    })
  );
});
