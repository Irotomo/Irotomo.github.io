/* ══════════════════════════════════════════════════════════════
   이로토모 관리자 기능 — 2026-10-02 index.html 에서 분리
   일반 방문자는 이 파일을 받지 않습니다(첫 화면을 가볍게 하려고).
   관리자 진입(주소 끝 #irotomo-admin, 푸터 모임 이름 5번 탭, PC 는 Shift+클릭) 때 index.html 이 받아서
   큰 스크립트 함수 안의 adminEval 에서 eval 로 실행합니다. 그래서 index.html 쪽 변수
   (API, SCHED, CLOSED, ADMIN, editing, DEFAULTS, readEl, langOf 등)를 그대로 함께 씁니다.
   이 파일만 따로 열거나 <script src> 로 넣으면 동작하지 않습니다. 고친 뒤에는 index.html 과 함께 올립니다.
   ══════════════════════════════════════════════════════════════ */
  function apiPost(payload){
    return fetch(API, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload), redirect:'follow' }).then(function(r){ return r.json(); });
  }

  var $a = function(id){ return document.getElementById(id); };
  function openDim(el){ el.classList.add('on'); }
  function closeDim(el){ el.classList.remove('on'); }
  document.querySelectorAll('[data-adm-close]').forEach(function(b){
    b.addEventListener('click', function(){ closeDim(b.closest('.adm-dim')); });
  });
  document.querySelectorAll('.adm-dim').forEach(function(d){
    d.addEventListener('click', function(e){ if (e.target === d) closeDim(d); });
  });

  /* 로그인 */
  /* 숨은 진입로 ─ ① 주소 끝에 #irotomo-admin  ② 푸터의 모임 이름을 5번 연속 탭 */
  function openLogin(){ openDim($a('adm-login')); setTimeout(function(){ $a('adm-id').focus(); }, 60); }
  /* 진입로(#irotomo-admin · 푸터 5번 탭 · Shift+클릭)는 index.html 에 있습니다. 이 파일을 받은 뒤 openLogin 을 부릅니다. */
  function tryLogin(){
    var id = $a('adm-id').value.trim(), pw = $a('adm-pw').value.trim();
    if (!id || !pw) { $a('adm-msg').textContent = '아이디와 비밀번호를 입력해 주세요.'; return; }
    $a('adm-go').disabled = true; $a('adm-msg').textContent = '';
    apiPost({ action:'login', id:id, pw:pw }).then(function(d){
      if (!d.ok) {
        $a('adm-msg').textContent = d.locked
          ? '로그인 실패가 많아 15분간 잠겼습니다. 잠시 뒤 다시 시도해 주세요.'
          : '아이디 또는 비밀번호가 맞지 않습니다.';
        return;
      }
      ADMIN = { token: d.token || '' };        /* 비밀번호는 여기서 버린다 */
      id = pw = '';
      closeDim($a('adm-login'));
      $a('adm-id').value = ''; $a('adm-pw').value = '';
      startEdit();
      checkDeploy();
      if (d.weakPw) warnBar('⚠ 관리자 비밀번호가 짧습니다 — Code.gs 의 ADMIN_PW 를 12자 이상으로 바꿔 주세요');
    }).catch(function(){
      $a('adm-msg').textContent = '서버에 연결하지 못했습니다.';
    }).then(function(){ $a('adm-go').disabled = false; });
  }
  $a('adm-go').addEventListener('click', tryLogin);
  $a('adm-pw').addEventListener('keydown', function(e){ if (e.key === 'Enter') tryLogin(); });

  /* 배포된 스크립트가 최신인지 확인 — 사진 업로드가 안 될 때 원인이 바로 보이도록 */
  function checkDeploy(){
    fetch(API + '?action=ping&t=' + Date.now(), { redirect:'follow' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.ok && d.actions && d.actions.indexOf('stats') >= 0) {
          var ok = document.createElement('span');
          ok.className = 'ver';
          ok.textContent = '서버 ' + (d.version || '?') + ' · …' + API.slice(-8);
          $a('admin-bar').insertBefore(ok, $a('admin-bar').querySelector('.sp'));
          return;
        }
        throw new Error('old');
      })
      .catch(function(){
        warnBar('⚠ Apps Script 가 옛 버전입니다 — 새 버전으로 다시 배포해야 사진·통계가 동작합니다 (…' + API.slice(-8) + ')');
      });
  }

  function warnBar(msg){
    var b = $a('admin-bar');
    var w = document.createElement('span');
    w.className = 'warn';
    w.textContent = msg;
    b.insertBefore(w, b.querySelector('.sp'));
  }

  /* 편집 모드 */
  function fitBar(){
    var h = editing ? $a('admin-bar').offsetHeight : 0;
    document.body.style.paddingTop = h ? h + 'px' : '';
    if (nav) nav.style.top = h ? h + 'px' : '';
  }
  window.addEventListener('resize', fitBar);

  function startEdit(){
    try { restoreLastTpl(); } catch (e) {}
    editing = true;
    document.body.classList.add('admin-on');
    document.querySelectorAll('details').forEach(function(d){ d.open = true; });
    document.querySelectorAll('[data-c]').forEach(function(el){
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      mark(el);
    });
    syncSizeInput(); renderGallery();
    if ($a('archive-refresh')) $a('archive-refresh').click();
    $a('adm-reset').disabled = true;
    fitBar(); count();
  }
  function stopEdit(){
    setTimeout(function(){ try { paintLast(); } catch (e) {} }, 60);
    if (dirty() && !confirm('저장하지 않은 수정이 있습니다. 그대로 나가시겠습니까?')) return;
    location.reload();
  }
  $a('adm-exit').addEventListener('click', stopEdit);

  /* ── 선택한 문구만 초기화 ──────────────────────────────────
     관리자 화면에서 마지막으로 누른 문구 한 칸만 파일의 기본값으로
     되돌립니다. 다른 문구와 반대 언어 문구는 건드리지 않으며,
     위의 「저장」을 눌러야 서버에 반영됩니다. */
  function selectEditable(el){
    if (!editing || !el || !el.hasAttribute('data-c')) return;
    if (ACTIVE_EDITABLE && ACTIVE_EDITABLE !== el) ACTIVE_EDITABLE.classList.remove('adm-selected');
    ACTIVE_EDITABLE = el;
    el.classList.add('adm-selected');
    var L = langOf(el) === 'ja' ? '일본어' : '한국어';
    var btn = $a('adm-reset');
    btn.disabled = false;
    btn.title = '선택한 ' + L + ' 문구만 기본값으로 되돌립니다';
  }

  document.addEventListener('focusin', function(e){
    var el = e.target.closest && e.target.closest('[data-c]');
    if (el) selectEditable(el);
  });
  document.addEventListener('pointerdown', function(e){
    var el = e.target.closest && e.target.closest('[data-c]');
    if (el) selectEditable(el);
  }, true);

  on('adm-reset', 'click', function(){
    var el = ACTIVE_EDITABLE;
    if (!el || !document.body.contains(el)) {
      alert('초기화할 문구를 페이지에서 먼저 눌러 주세요.');
      return;
    }
    var k = el.getAttribute('data-c'), L = langOf(el);
    var before = readEl(el), base = DEFAULTS[k] && DEFAULTS[k][L];
    if (typeof base !== 'string') return;
    if (before === base) {
      $a('adm-state').textContent = '선택한 문구는 이미 기본값입니다';
      el.focus();
      return;
    }
    el.innerHTML = esc(base);
    mark(el); count();
    $a('adm-state').textContent += ' · 선택 문구 초기화됨 · 저장 필요';
    el.focus();
  });

  function mark(el){
    var k = el.getAttribute('data-c'), L = langOf(el);
    el.classList.toggle('chg', readEl(el) !== DEFAULTS[k][L]);
  }
  function dirty(){
    var n = 0;
    document.querySelectorAll('[data-c]').forEach(function(el){
      var k = el.getAttribute('data-c');
      if (readEl(el) !== DEFAULTS[k][langOf(el)]) n++;
    });
    return n;
  }
  function count(){
    var n = dirty();
    var L = document.body.dataset.lang === 'ja' ? '일본어' : '한국어';
    $a('adm-state').textContent = (n ? '고친 곳 ' + n + '군데 · ' : '') + L + ' 화면 편집 중';
  }

  document.addEventListener('input', function(e){
    if (!editing) return;
    var el = e.target.closest && e.target.closest('[data-c]');
    if (!el) return;
    mark(el); count();
  });
  document.addEventListener('keydown', function(e){
    if (!editing) return;
    var el = e.target.closest && e.target.closest('[data-c]');
    if (el && e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
  });
  document.addEventListener('paste', function(e){
    if (!editing) return;
    var el = e.target.closest && e.target.closest('[data-c]');
    if (!el) return;
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, t);
  });
  document.addEventListener('click', function(e){
    if (!editing) return;
    if (e.target.closest('#admin-bar') || e.target.closest('.adm-dim')) return;
    if (e.target.closest('summary') && e.target.closest('[data-c]')) e.preventDefault();
    var a = e.target.closest('a');
    /* 파일 내려받기 링크(download)는 편집 중에도 막지 않습니다 — 원본 CSV·자리배정 파일이 저장되지 않던 문제 (2026-10-02) */
    if (a && a.getAttribute('href') && !a.hasAttribute('download')) e.preventDefault();
  }, true);
  document.addEventListener('submit', function(e){ if (editing) e.preventDefault(); }, true);
  document.querySelectorAll('.lang button').forEach(function(b){
    b.addEventListener('click', function(){ if (editing) setTimeout(count, 0); });
  });
  window.addEventListener('beforeunload', function(e){
    if (editing && dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* 일정 편집 UI 제거됨 — 매주 일요일 자동 생성만 사용합니다 */

  /* ── 신청자 관리 ─────────────────────────────────────
     불러오기 → 날짜별 묶음 → 칸을 눌러 바로 수정 → 자동 저장   */
  var SG = { rows: [], filter: 'soon', q: '' };
  /* 관리자에서 불러온 향후 모임 날짜.
     신청자가 0명이어도 스탭을 미래 날짜에 미리 넣을 수 있게 씁니다. */
  var ADMIN_MEETUP_DATES = [];
  var SG_COLS = [
    ['name','이름'], ['nat','국적'], ['email','이메일'], ['date','참가일'],
    ['drink','음료'], ['sns','SNS'], ['src','경로'], ['memo','메모']
  ];
  /* 2차 참가 표시 — 메모에 붙는 꼬리표입니다 */
  var AFTER_TAG = '#2차';
  var AFTER_RE  = /#2차/;

  /* 2차 참가 선택은 화면이 직접 들고 있습니다.
     메모에도 함께 저장하지만, 목록을 다시 불러올 때 화면과 데이터가
     어긋나 «0명 선택» 이 되는 일을 막기 위해 이 값을 기준으로 씁니다.
     { '2026-09-06': { 'id1':1, 'id2':1 } } */
  var AFTER_SET = {};
  function afterKey(){ return ($a('seat-date') && $a('seat-date').value) || ''; }
  function afterMap(d){ d = d || afterKey(); if (!AFTER_SET[d]) AFTER_SET[d] = {}; return AFTER_SET[d]; }
  function afterHas(r){ return !!afterMap(r.date)[String(r.id)]; }
  function afterSet(r, on){
    var m = afterMap(r.date);
    if (on) m[String(r.id)] = 1; else delete m[String(r.id)];
  }
  /* 서버에서 새로 받은 메모를 화면 상태에 합칩니다.
     한 번이라도 화면에서 고른 날짜는 화면 값을 그대로 둡니다. */
  var AFTER_SEEDED = {};
  function afterSeed(){
    (SG.rows || []).forEach(function(r){
      if (!r.date) return;
      if (AFTER_SEEDED[r.date]) return;
      if (AFTER_RE.test(r.memo || '')) afterMap(r.date)[String(r.id)] = 1;
    });
    (SG.rows || []).forEach(function(r){ if (r.date) AFTER_SEEDED[r.date] = 1; });
  }

  var SG_DRINK = { dutch:'더치커피', milk:'밀크티', lime:'분다버그 라임', grape:'분다버그 핑크자몽' };
  var ADMIN_DRINK_CATALOG=[];
  function drinkAdminError(e){
    var code=e && e.message || String(e);
    return code==='drink_limit' ? '등록 가능한 음료는 최대 100종입니다.'
      : code==='duplicate_drink' ? '같은 이름의 음료가 이미 있습니다. 삭제한 음료라면 아래에서 복구해 주세요.' : code;
  }
  function adminApplyCatalog(items){
    if (!Array.isArray(items) || !items.length) return;
    ADMIN_DRINK_CATALOG=items.slice(); SG_DRINK={};
    items.forEach(function(d){ SG_DRINK[d.id]=d.ko; });
    if (window.iroApplyDrinkCatalog) window.iroApplyDrinkCatalog(items);
    paintCatalog();
  }
  function paintCatalog(){
    var box=$a('drink-catalog-list'); if(!box) return;
    var archive=$a('drink-archive'), archiveBox=$a('drink-archive-list');
    box.textContent='';archiveBox.textContent='';
    archive.hidden=!ADMIN_DRINK_CATALOG.some(function(d){return d.archived;});
    ADMIN_DRINK_CATALOG.forEach(function(d){
      if(d.archived){
        var oldWrap=document.createElement('div');oldWrap.className='drink-catalog-entry is-off';
        var oldLabel=document.createElement('span');oldLabel.textContent=d.ko+' / '+d.ja;
        var restore=document.createElement('button');restore.type='button';restore.textContent='복구';
        restore.addEventListener('click',function(){
          restore.disabled=true;
          apiPost({action:'drink_restore',token:ADMIN.token,id:d.id})
          .then(function(x){if(!x||!x.ok) throw Error(x&&x.error||'fail');adminApplyCatalog(x.drinks);loadMeetups();})
          .catch(function(e){restore.disabled=false;alert('음료를 복구하지 못했습니다: '+drinkAdminError(e));});
        });
        oldWrap.appendChild(oldLabel);oldWrap.appendChild(restore);archiveBox.appendChild(oldWrap);
        return;
      }
      var wrap=document.createElement('div'); wrap.className='drink-catalog-entry'+(d.enabled?'':' is-off');
      var label=document.createElement('span');label.textContent=d.ko+' / '+d.ja+(d.preorder?' · 금 12시 마감':'');
      var btn=document.createElement('button');btn.type='button';
      btn.textContent=d.enabled?'신청 숨기기':'다시 신청받기';
      btn.addEventListener('click',function(){
        btn.disabled=true;
        apiPost({action:'drink_update',token:ADMIN.token,id:d.id,enabled:!d.enabled})
        .then(function(x){if(!x||!x.ok) throw Error(x&&x.error||'fail');adminApplyCatalog(x.drinks);loadMeetups();})
        .catch(function(e){btn.disabled=false;alert('음료 상태를 변경하지 못했습니다: '+e.message);});
      });
      wrap.appendChild(label);wrap.appendChild(btn);
      var edit=document.createElement('button');edit.type='button';edit.textContent='이름 변경';
      edit.addEventListener('click',function(){
        var controls=Array.prototype.slice.call(wrap.children);
        controls.forEach(function(el){el.hidden=true;});
        var fields=document.createElement('div');fields.className='drink-rename-fields';
        var koInput=document.createElement('input');koInput.type='text';koInput.maxLength=45;
        koInput.value=d.ko;koInput.setAttribute('aria-label','음료 이름 한국어');
        var jaInput=document.createElement('input');jaInput.type='text';jaInput.maxLength=45;
        jaInput.value=d.ja;jaInput.setAttribute('aria-label','음료 이름 일본어');
        var save=document.createElement('button');save.type='button';save.textContent='저장';
        var cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
        var state=document.createElement('span');state.className='drink-rename-state';state.setAttribute('role','status');
        function closeEdit(){fields.remove();controls.forEach(function(el){el.hidden=false;});}
        cancel.addEventListener('click',closeEdit);
        save.addEventListener('click',function(){
          var ko=koInput.value.trim(),ja=jaInput.value.trim();
          if(!ko||!ja){state.textContent='한국어·일본어 이름을 모두 입력해 주세요.';return;}
          if(ko===d.ko&&ja===d.ja){closeEdit();return;}
          if(ADMIN_DRINK_CATALOG.some(function(other){return other.id!==d.id&&(other.ko===ko||other.ja===ja);})){state.textContent='같은 이름의 음료가 이미 있습니다.';return;}
          save.disabled=true;cancel.disabled=true;state.textContent='저장 중…';
          apiPost({action:'drink_update',token:ADMIN.token,id:d.id,ko:ko,ja:ja})
          .then(function(x){if(!x||!x.ok) throw Error(x&&x.error||'fail');adminApplyCatalog(x.drinks);loadMeetups();if(SG.rows.length) paintSg();})
          .catch(function(e){state.textContent='저장 실패: '+drinkAdminError(e);save.disabled=false;cancel.disabled=false;});
        });
        [koInput,jaInput].forEach(function(input){input.addEventListener('keydown',function(e){
          if(e.key==='Enter'){e.preventDefault();save.click();}
          if(e.key==='Escape'){e.preventDefault();cancel.click();}
        });});
        fields.appendChild(koInput);fields.appendChild(jaInput);fields.appendChild(save);fields.appendChild(cancel);fields.appendChild(state);
        wrap.appendChild(fields);koInput.focus();koInput.select();
      });
      wrap.appendChild(edit);
      if(!d.builtin){
        var del=document.createElement('button');del.type='button';del.className='drink-delete';del.textContent='삭제';
        del.addEventListener('click',function(){
          if(!confirm('「'+d.ko+'」 음료를 삭제할까요?\n새 신청에서는 사라지지만 기존 신청 내역은 유지됩니다. 나중에 복구할 수 있습니다.')) return;
          del.disabled=true;btn.disabled=true;
          apiPost({action:'drink_delete',token:ADMIN.token,id:d.id})
          .then(function(x){if(!x||!x.ok) throw Error(x&&x.error||'fail');adminApplyCatalog(x.drinks);loadMeetups();})
          .catch(function(e){del.disabled=false;btn.disabled=false;alert('음료를 삭제하지 못했습니다: '+e.message);});
        });
        wrap.appendChild(del);
      }
      box.appendChild(wrap);
    });
  }
  window.addEventListener('iro-drinks-updated',function(e){
    if(Array.isArray(e.detail) && e.detail.length){
      ADMIN_DRINK_CATALOG=e.detail.slice(); SG_DRINK={};
      e.detail.forEach(function(d){SG_DRINK[d.id]=d.ko;});paintCatalog();
    }
  });
  onDrinkAddedInit();
  function onDrinkAddedInit(){
    var btn=$a('drink-add-btn'); if(!btn) return;
    btn.addEventListener('click',function(){
      var ko=$a('drink-add-ko').value.trim(),ja=$a('drink-add-ja').value.trim();
      var status=$a('drink-add-state');
      if(!ko||!ja){status.textContent='한국어·일본어 이름을 모두 입력해 주세요.';return;}
      btn.disabled=true;status.textContent='추가 중…';
      apiPost({action:'drink_add',token:ADMIN.token,ko:ko,ja:ja,preorder:$a('drink-add-pre').checked})
      .then(function(x){
        if(!x||!x.ok) throw Error(x&&x.error||'fail');
        adminApplyCatalog(x.drinks);loadMeetups();
        $a('drink-add-ko').value='';$a('drink-add-ja').value='';$a('drink-add-pre').checked=false;
        status.textContent='음료가 추가되었습니다.';
      }).catch(function(e){status.textContent='추가 실패: '+drinkAdminError(e);}).finally(function(){btn.disabled=false;});
    });
  }

  on('adm-signups-open', 'click', function(){
    openDim($a('adm-signups')); loadSignups();
  });
  on('sg-reload', 'click', loadSignups);
  on('ops-reload', 'click', function(){ loadDashboard(true); });
  on('sg-q', 'input', function(){ SG.q = this.value.trim().toLowerCase(); paintSg(); });
  document.querySelectorAll('#sg-filter button').forEach(function(b){
    b.addEventListener('click', function(){
      SG.filter = b.dataset.f;
      document.querySelectorAll('#sg-filter button').forEach(function(x){
        x.setAttribute('aria-pressed', String(x === b));
      });
      paintSg();
    });
  });

  /* 요소가 없을 때 스크립트 전체가 멈추지 않도록 감싸는 헬퍼 */
  function on(id, ev, fn){ var el = $a(id); if (el) el.addEventListener(ev, fn); return el; }

  /* ── 모임 날짜 ─────────────────────────────────────── */
  /* 탭 전환 — 한 번에 하나만 보여줍니다 */
  (function(){
    var tabs = $a('sg-tabs'); if (!tabs) return;
    var loaded = {};
    tabs.addEventListener('click', function(e){
      var b = e.target.closest('button[data-t]'); if (!b) return;
      var t = b.dataset.t;
      tabs.querySelectorAll('button').forEach(function(x){
        x.setAttribute('aria-pressed', String(x === b));
      });
      document.querySelectorAll('#adm-signups .sg-pane').forEach(function(p){
        p.hidden = (p.dataset.p !== t);
      });
      if (t === 'dash') { loadDashboard(); }
      if (t === 'dates' && !loaded.dates) { loaded.dates = true; loadMeetups(); }
      if (t === 'checkin') { checkinFillDates(); checkinPaint(); }
      if (t === 'seat') { seatFillDates(); seatLoadStatus(); }
      if (t === 'after') { afterFillDates(); afterPaint(); afterLoadOrder(afterDate()); }
    });
  })();

  /* ── 모임 시간 ────────────────────────────────────────────
     요약 카드의 「일시」 아랫줄은 서버에 저장된 SCHED.time 을 씁니다.
     이 값을 고칠 자리가 없어 예전 값이 그대로 남아 있던 것을 되살립니다. */
  function syncTimeInput(){
    var el = document.getElementById('mt-time');   /* $a 는 아직 없을 수 있습니다 */
    if (el && document.activeElement !== el) el.value = SCHED.time || '';
  }
  on('mt-time', 'input', function(){
    SCHED.time = this.value;
    applySchedule();                       /* 뒤쪽 카드가 바로 바뀝니다 */
    var st = $a('mt-time-state'); if (st) st.textContent = '«시간 저장»을 눌러 주세요';
  });
  on('mt-time-save', 'click', function(){
    var st = $a('mt-time-state'); if (st) st.textContent = '저장 중…';
    /* 관리자 바의 저장과 같은 경로로 보냅니다.
       (문구 저장 로직을 그대로 쓰므로 다른 내용이 지워지지 않습니다) */
    var save = $a('adm-save');
    if (save) save.click();
    setTimeout(function(){ if (st) st.textContent = '저장했습니다'; }, 900);
  });


  /* ── 지난 회차 실적 (관리자) ─────────────────────────── */
  function lsFill(v){
    LAST = v || LAST;
    var d = $a('ls-date'), j = $a('ls-ja'), k = $a('ls-ko'), st = $a('ls-state');
    if (!d) return;
    if (!LAST) { d.value = ''; if (st) st.textContent = '지난 회차가 없습니다'; return; }
    d.value = LAST.date || '';
    j.value = LAST.ja;
    k.value = LAST.ko;
    if (st) st.textContent = LAST.auto ? '입금 확인 인원으로 자동 계산됨' : '직접 넣은 값';
    try { paintLast(); } catch (e) {}
  }
  function lsSend(body, msg){
    var st = $a('ls-state'); if (st) st.textContent = '저장 중…';
    apiPost(body).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
      lsFill(d.last);
      if (st) st.textContent = msg;
    }).catch(function(e){ if (st) st.textContent = fail(e).slice(0, 30); });
  }
  on('ls-save', 'click', function(){
    if (!LAST || !LAST.date) return;
    lsSend({ action:'laststat_save', token: ADMIN.token, date: LAST.date,
             ja: +$a('ls-ja').value || 0, ko: +$a('ls-ko').value || 0 }, '저장했습니다');
  });
  on('ls-auto', 'click', function(){
    if (!LAST || !LAST.date) return;
    lsSend({ action:'laststat_save', token: ADMIN.token, date: LAST.date, clear: true },
           '자동 계산으로 되돌렸습니다');
  });

  function loadMeetups(){
    syncTimeInput();
    apiPost({ action:'laststat', token: ADMIN.token })
      .then(function(d){ if (d && d.ok) lsFill(d.last); })
      .catch(function(){});
    if (!$a('mt-list')) return;
    $a('mt-list').innerHTML = '<p class="sg-dg-note">여는 중…</p>';
    apiPost({ action:'meetups', token: ADMIN.token }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
      if (d.drinks) adminApplyCatalog(d.drinks);
      paintMeetups(d.dates || []);
    }).catch(function(e){
      $a('mt-list').innerHTML = '<p class="sg-dg-note">불러오지 못했습니다 (' + e.message + ')</p>';
    });
  }

  function paintMeetups(list){
    ADMIN_MEETUP_DATES = (list || [])
      .filter(function(m){ return m && /^\d{4}-\d{2}-\d{2}$/.test(String(m.date||'')) && !m.off; })
      .map(function(m){ return String(m.date); });
    var WD = ['일','월','화','수','목','금','토'];
    var box = $a('mt-list'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="sg-dg-note">표시할 날짜가 없습니다.</p>'; return; }
    list.forEach(function(m){
      var wd = WD[new Date(m.date + 'T00:00:00').getDay()];
      var row = document.createElement('div');
      row.className = 'mt-row' + (m.off ? ' off' : '');
      row.innerHTML =
        '<b>' + m.date.replace(/-/g, '.') + ' (' + wd + ')</b>' +
        '<span class="mt-n">' + (m.n ? m.n + '명' : '0명') + ' / ' + (+m.capacity || 61) + '명 (스탭 ' + (+m.staff_n || 0) + '명 포함)' + (m.wait_n ? ' · 대기 '+m.wait_n : '') + '</span>' +
        (m.auto ? '' : '<span class="mt-tag">추가</span>');

      var note = document.createElement('input');
      note.type = 'text'; note.placeholder = '메모'; note.value = m.note || '';
      note.className = 'mt-note';
      note.addEventListener('change', function(){ saveMeetup(m.date, m.off, note.value); });
      row.appendChild(note);

      /* 수량이 정해진 음료를 손으로 닫습니다.
         누르면 그 날짜의 신청 화면에서 «품절» 로 잠깁니다. */
      var shut = (m.closed || []).slice();
      var dbox = document.createElement('div'); dbox.className = 'mt-drinks';
      ADMIN_DRINK_CATALOG.filter(function(d){return !d.archived;}).forEach(function(drinkItem){
        var p=[drinkItem.id,drinkItem.ko];
        var b = document.createElement('button');
        b.type = 'button';
        var paint = function(){
          var on = shut.indexOf(p[0]) >= 0;
          b.classList.toggle('shut', on);
          b.textContent = p[1] + (on ? ' 품절' : '');
          b.title = on ? '누르면 다시 받습니다' : '누르면 품절 처리합니다';
        };
        paint();
        b.addEventListener('click', function(){
          var i = shut.indexOf(p[0]);
          if (i >= 0) shut.splice(i, 1); else shut.push(p[0]);
          b.disabled=true;
          var requested=shut.slice();
          apiPost({action:'meetup_save',token:ADMIN.token,date:m.date,closed:requested})
          .then(function(x){
            if(!x||!x.ok) throw Error(x&&x.error||'fail');
            m.closed=requested.slice();
            if(requested.length) CLOSED[m.date]=requested.slice(); else delete CLOSED[m.date];
            paint();try{syncDrinks();}catch(e){}
          }).catch(function(e){
            shut=(m.closed||[]).slice();paint();alert('품절 상태 저장 실패: '+e.message);
          }).finally(function(){b.disabled=false;});
        });
        dbox.appendChild(b);
      });
      row.appendChild(dbox);

      var cap=document.createElement('input');
      cap.type='number';cap.min='1';cap.max='999';cap.value=+m.capacity||61;cap.className='mt-cap';cap.title='스탭 포함 총정원 (기본 61명)';
      cap.addEventListener('change',function(){m.capacity=Math.max(1,+cap.value||61);cap.value=m.capacity;saveMeetup(m.date,m.off,note.value,false,shut,m.capacity,m.waitlist_on);});
      row.appendChild(cap);

      var wait=document.createElement('button');wait.type='button';wait.className='mt-wait'+(+m.waitlist_on===0?'':' on');
      function paintWait(){wait.textContent=(+m.waitlist_on===0?'대기 OFF':'대기 ON');wait.classList.toggle('on',+m.waitlist_on!==0);}
      paintWait();
      wait.addEventListener('click',function(){m.waitlist_on=(+m.waitlist_on===0?1:0);paintWait();saveMeetup(m.date,m.off,note.value,false,shut,m.capacity,m.waitlist_on);});
      row.appendChild(wait);

      /* cf-67: 모임 전 금요일이 공휴일이면 켭니다 — 사전 준비 음료 선택·음료비 환불이 목요일 정오에 마감됩니다 */
      var hol=document.createElement('button');hol.type='button';hol.className='mt-wait mt-hol';
      function paintHol(){var on=+m.fri_holiday===1;hol.textContent=on?'목 정오 마감 (금 휴일)':'금 정오 마감';hol.classList.toggle('on',on);
        hol.title=on?'누르면 금요일 정오 마감으로 되돌립니다':'모임 전 금요일이 공휴일이면 누르세요 (목요일 정오 마감)';}
      paintHol();
      hol.addEventListener('click',function(){
        var next=+m.fri_holiday===1?0:1;hol.disabled=true;$a('mt-state').textContent='저장 중…';
        apiPost({action:'meetup_save',token:ADMIN.token,date:m.date,fri_holiday:next}).then(function(x){
          if(!x||!x.ok) throw Error(x&&x.error||'fail');
          m.fri_holiday=next;paintHol();
          if(next) EARLY[m.date]=1; else delete EARLY[m.date];
          window.IRO_EARLY=EARLY;try{syncDrinks();}catch(e){}
          $a('mt-state').textContent='저장했습니다';
        }).catch(function(e){$a('mt-state').textContent='저장하지 못했습니다 ('+e.message+')';}).finally(function(){hol.disabled=false;});
      });
      row.appendChild(hol);

      var tog = document.createElement('button');
      tog.type = 'button'; tog.className = 'mt-tog';
      tog.textContent = m.off ? '휴무' : '진행';
      tog.addEventListener('click', function(){
        m.off = !m.off; saveMeetup(m.date, m.off, note.value, true, shut);
      });
      row.appendChild(tog);
      box.appendChild(row);
    });
  }

  function saveMeetup(date, off, note, repaint, closed, capacity, waitlistOn){
    $a('mt-state').textContent = '저장 중…';
    var body = { action:'meetup_save', token: ADMIN.token, date: date, off: !!off, note: note || '' };
    if (Array.isArray(closed)) body.closed = closed;
    if (capacity !== undefined) body.capacity = capacity;
    if (waitlistOn !== undefined) body.waitlist_on = waitlistOn;
    apiPost(body)
      .then(function(d){
        $a('mt-state').textContent = (d && d.ok) ? '저장했습니다' : '저장하지 못했습니다';
        if (d && d.ok && repaint) loadMeetups();
      }).catch(function(){ $a('mt-state').textContent = '저장하지 못했습니다'; });
  }

  on('mt-add', 'click', function(){
    var v = $a('mt-new').value;
    if (!v) { $a('mt-state').textContent = '날짜를 고르세요'; return; }
    saveMeetup(v, false, '', true); $a('mt-new').value = '';
  });

  /* 정기 발송 설정 */
  var pad2 = function(n){ return (n < 10 ? '0' : '') + n; };

  /* 요일 버튼 (0=일 … 6=토) */
  (function(){
    var box = $a('dg-days'); if (!box) return;
    ['일','월','화','수','목','금','토'].forEach(function(w, i){
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.d = i; b.textContent = w;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function(){
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      });
      box.appendChild(b);
    });
  })();

  function dgDays(){
    return [].slice.call(document.querySelectorAll('#dg-days button'))
      .filter(function(b){ return b.getAttribute('aria-pressed') === 'true'; })
      .map(function(b){ return +b.dataset.d; });
  }

  function fillDigest(d){
    if (!$a('dg-on')) return;
    d = d || {};
    $a('dg-on').checked = !!d.on;
    $a('dg-to').value   = d.to || '';
    $a('dg-time').value = pad2(d.hour || 0) + ':' + pad2(d.minute || 0);
    var on = d.days || [];
    document.querySelectorAll('#dg-days button').forEach(function(b){
      b.setAttribute('aria-pressed', String(on.indexOf(+b.dataset.d) >= 0));
    });
  }

  on('dg-save', 'click', function(){
    $a('dg-state').textContent = '저장 중…';
    apiPost({ action:'digest_save', token: ADMIN.token,
      on: $a('dg-on').checked, to: $a('dg-to').value.trim(),
      hour: +(($a('dg-time').value || '09:00').split(':')[0]),
      minute: +(($a('dg-time').value || '09:00').split(':')[1]),
      days: dgDays()
    }).then(function(d){
      if (!d || !d.ok) return $a('dg-state').textContent = '저장하지 못했습니다';
      $a('dg-state').textContent = dgDays().length
        ? '저장했습니다' : '저장했습니다 — 요일을 하나도 안 고르면 발송되지 않습니다';
    }).catch(function(){ $a('dg-state').textContent = '저장하지 못했습니다'; });
  });

  on('dg-test', 'click', function(){
    $a('dg-state').textContent = '보내는 중…';
    apiPost({ action:'digest_test', token: ADMIN.token,
              to: $a('dg-to').value.trim() }).then(function(d){
      if (d && d.ok) {
        $a('dg-state').textContent =
          d.date.replace(/-/g, '.') + (d.past ? ' (지난 모임) ' : ' ') + d.n + '명 명단을 보냈습니다';
        return;
      }
      $a('dg-state').textContent =
        d && d.error === 'no_rows'  ? '신청 자료가 아직 없습니다'
      : d && d.error === 'no_to'    ? '받는 주소를 적어 주세요'
      : d && d.error === 'mail_off' ? 'BREVO_KEY 가 설정되지 않았습니다'
      : '보내지 못했습니다 (' + ((d && d.error) || '?') + ')';
    }).catch(function(){ $a('dg-state').textContent = '보내지 못했습니다'; });
  });

  function loadSignups(){
    if (!$a('sg-body')) return;
    $a('sg-body').innerHTML = '<p class="st-empty">불러오는 중…</p>';
    apiPost({ action:'signups', token: ADMIN.token }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
      SG.rows = d.rows || [];
      try { afterSeed(); } catch (e) {}
      if (d.closed) CLOSED = d.closed;   /* 품절 버튼 상태 */
      if (d.drinks) adminApplyCatalog(d.drinks);
      fillDigest(d.digest); paintSg(); seatFillDates();
    }).catch(function(e){
      $a('sg-body').innerHTML = '<p class="st-empty">불러오지 못했습니다 (' + e.message + ')</p>';
    });
  }

  function sgVisible(){
    var today = new Date(); today.setHours(0,0,0,0);
    return SG.rows.filter(function(r){
      if (SG.filter === 'soon' && r.date) {
        if (new Date(r.date + 'T00:00:00') < today) return false;
      }
      if (!SG.q) return true;
      return SG_COLS.some(function(c){
        return String(r[c[0]] || '').toLowerCase().indexOf(SG.q) >= 0;
      });
    });
  }

  function opsDateLabel(d){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))) return d||'';
    var dt=new Date(d+'T00:00:00'), wd=['일','월','화','수','목','금','토'];
    return d.replace(/-/g,'.')+' ('+wd[dt.getDay()]+')';
  }
  function opsPct(a,b){ return b > 0 ? Math.round(a * 1000 / b) / 10 : null; }

  /* ── 남은 시간 ────────────────────────────────────────────
     모임까지 며칠인지, 음료 마감(금요일 정오 · 금 휴일 회차는 목요일 정오)까지 몇 시간인지.
     기준 시각은 SCHED.time 과 PREORDER_LEAD_HOURS 를 그대로 씁니다. */
  function opsCountdown(date){
    var start = (typeof meetStartMs === 'function') ? meetStartMs(date) : NaN;
    if (isNaN(start)) return null;
    var now = Date.now();
    var toMeet = start - now;
    var toPre  = start - (preorderLeadHours(date) * 3600000) - now;
    /* 남은 «시간»이 아니라 «날짜»로 셉니다.
       50시간 남았을 때 D-3 이 되면 하루를 더 있는 것처럼 보입니다. */
    var kst = new Date(Date.now() + 9 * 3600000);
    var today = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
    var a = String(date).split('-');
    var target = Date.UTC(+a[0], +a[1] - 1, +a[2]);
    var days = Math.round((target - today) / 86400000);
    return {
      dday: days <= 0 ? '오늘' : ('D-' + days),
      preOpen: toPre > 0,
      preHours: Math.floor(toPre / 3600000),
      meetHours: Math.floor(toMeet / 3600000)
    };
  }

  /* ── 오늘 할 일 ──────────────────────────────────────────
     숫자만 보고 매번 판단하지 않도록, 지금 손대야 하는 것만 남깁니다. */
  function opsTodos(d){
    var out = [], next = (d && d.next) || [], recent = (d && d.recent) || [];

    /* 지난 회차 평균 신청 — 모객이 부족한지 견줄 기준 */
    var base = recent.slice(0, 4).map(function(x){ return +x.guests || 0; });
    var avg = base.length ? base.reduce(function(a,b){return a+b;},0) / base.length : 0;

    next.forEach(function(x){
      var c = opsCountdown(x.date), when = opsDateLabel(x.date).slice(5);
      var total = +x.guests || 0, onsite = +x.onsite || 0, unpaid = total - (+x.paid || 0) - onsite, waiting=+x.waitlist_count||0;
      if(waiting>0) out.push(['warn', when+' · 대기 '+waiting+'명 — 취소 자리 발생 시 참가 전환']);

      if (unpaid > 0 && c && c.preOpen && c.preHours <= 36)
        out.push(['urgent', when + ' · 미입금 ' + unpaid + '명 — 음료 마감 '
          + (c.preHours >= 1 ? c.preHours + '시간' : '1시간 미만') + ' 전, 오늘 안내를 보내세요']);
      else if (unpaid > 0)
        out.push(['warn', when + ' · 미입금 ' + unpaid + '명']);

      if (+x.seat_published !== 1 && c && c.meetHours <= 72 && total > 0)
        out.push([c.meetHours <= 24 ? 'urgent' : 'warn',
          when + ' · 자리배정 ' + (+x.seat_saved === 1 ? '저장만 되어 공개 전' : '아직 안 함')
          + ' — 모임까지 ' + c.dday]);

      if (avg > 0 && total < avg * 0.4 && c && c.meetHours <= 24 * 10 && c.meetHours > 0)
        out.push(['warn', when + ' · ' + total + '명 (최근 평균 '
          + Math.round(avg) + '명) — 모객이 필요합니다']);
    });

    if (!out.length) out.push(['ok', '지금 처리할 일이 없습니다.']);
    return out;
  }
  function opsSeatText(x){
    if(+x.seat_published===1) return ['참가자 공개 중','pub'];
    if(+x.seat_saved===1) return ['배정 저장됨','saved'];
    return ['좌석 미배정',''];
  }
  function paintDashboard(){
    var nextBox=$a('ops-next'), avgBox=$a('ops-avg'), histBox=$a('ops-history');
    if(!nextBox || !avgBox || !histBox) return;
    var d=SG.dashboard;
    if(!d){ nextBox.innerHTML='<div class="ops-empty">운영 현황을 불러오는 중…</div>'; avgBox.innerHTML=''; histBox.innerHTML=''; return; }

    /* 오늘 할 일 — 카드 위에 먼저 보여줍니다 */
    var todoBox=$a('ops-todo');
    if(todoBox) todoBox.innerHTML=opsTodos(d).map(function(t){
      return '<li class="ops-todo-'+t[0]+'">'+esc(t[1])+'</li>';
    }).join('');

    var next=d.next||[];
    if(!next.length) nextBox.innerHTML='<div class="ops-empty">다가오는 모임이 없습니다.</div>';
    else nextBox.innerHTML=next.map(function(x){
      var seat=opsSeatText(x), total=+x.guests||0, ja=+x.ja||0, ko=+x.ko||0;
      /* 자리배정은 스탭을 포함해 짜므로, 국적 균형도 스탭까지 넣어 봅니다.
         스탭 국적을 따로 세지 않으므로 전체 인원만 더해 보여줍니다. */
      var withStaff=total+(+x.staff||0);
      var cd=opsCountdown(x.date);
      var jaPct=total ? Math.round(ja*100/total) : 0, koPct=Math.max(0,100-jaPct);
      var confirmed=(+x.paid||0)+(+x.onsite||0);
      var paidPct=opsPct(confirmed,total);
      var repPct=opsPct(+x.repeat_count||0,total);
      var drinks=[];
      if(+x.dutch) drinks.push('더치 '+x.dutch);
      if(+x.milk) drinks.push('밀크티 '+x.milk);
      if(+x.lime) drinks.push('라임 '+x.lime);
      if(+x.grape) drinks.push('자몽 '+x.grape);
      return '<article class="ops-card">'
        +'<div class="ops-card-head"><div><div class="ops-date">'+esc(opsDateLabel(x.date))
        +(cd?' <em class="ops-dday">'+cd.dday+'</em>':'')+'</div>'
        +(cd?'<div class="ops-deadline'+(cd.preOpen?'':' over')+'">'
            +(cd.preOpen
              ? '음료 마감까지 '+(cd.preHours>=1?cd.preHours+'시간':'1시간 미만')
              : '음료 마감 지남 · 분다버그만 선택 가능')+'</div>':'')
        +(x.note?'<div class="ops-note">'+esc(x.note)+'</div>':'')+'</div><span class="ops-seat '+seat[1]+'">'+seat[0]+'</span></div>'
        +'<div class="ops-big"><b>'+total+'</b><span>명 신청</span></div>'
        +'<div class="ops-kpis">'
        +'<div class="ops-kpi"><span>국적</span><b>🇯🇵 '+ja+' / 🇰🇷 '+ko+'</b></div>'
        +'<div class="ops-kpi"><span>결제/확정</span><b>입금 '+x.paid+(+x.onsite?' · 현장 '+x.onsite:'')+' / '+total+(paidPct!==null?' · '+paidPct+'%':'')+'</b></div>'
        +'<div class="ops-kpi"><span>신규</span><b>'+x.new_count+'명</b></div>'
        +'<div class="ops-kpi"><span>재참가</span><b>'+x.repeat_count+'명'+(repPct!==null?' · '+repPct+'%':'')+'</b></div>'
        +'</div><div class="ops-balance"><i class="ja" style="width:'+jaPct+'%"></i><i class="ko" style="width:'+koPct+'%"></i></div>'
        +(drinks.length?'<div class="ops-drinks">음료 · '+drinks.join(' · ')+'</div>':'')
        +'</article>';
    }).join('');

    var recent=d.recent||[], marked=recent.filter(function(x){return (+x.attended||0)>0;});
    var sumGuests=0,sumPaid=0,sumAtt=0,sumNo=0;
    marked.forEach(function(x){var conf=(+x.paid||0)+(+x.onsite||0);sumGuests+=+x.guests||0;sumPaid+=conf;sumAtt+=+x.attended||0;sumNo+=Math.max(0,conf-(+x.attended||0));});
    var ar=opsPct(sumAtt,sumGuests), cr=opsPct(sumAtt,sumPaid);
    var nr=opsPct(sumNo,sumPaid);
    avgBox.innerHTML='<div><span>최근 평균 출석</span><b>'+(marked.length?(Math.round(sumAtt/marked.length*10)/10)+'명':'—')+'</b></div>'
      +'<div><span>신청 → 출석률</span><b>'+(ar===null?'—':ar+'%')+'</b></div>'
      +'<div><span>참가확정 → 출석률</span><b>'+(cr===null?'—':cr+'%')+'</b></div>'
      +'<div><span>노쇼율</span><b>'+(nr===null?'—':nr+'%')+'</b></div>';

    if(!recent.length){ histBox.innerHTML='<div class="ops-empty">지난 모임 기록이 없습니다.</div>'; return; }
    histBox.innerHTML='<div class="ops-table-wrap"><table class="ops-table"><thead><tr>'
      +'<th>날짜</th><th>신청</th><th>입금/현장</th><th>출석</th><th>노쇼</th><th>출석률</th><th>신규/재참가</th>'
      +'</tr></thead><tbody>'+recent.map(function(x){
        var confirmed=(+x.paid||0)+(+x.onsite||0);
        var recorded=(+x.attended||0)>0, no=recorded?Math.max(0,confirmed-(+x.attended||0)):null;
        var r1=recorded?opsPct(+x.attended||0,+x.guests||0):null, r2=recorded?opsPct(+x.attended||0,confirmed):null;
        var noRate=recorded?opsPct(no,confirmed):null;
        return '<tr><td>'+esc(opsDateLabel(x.date))+'</td><td data-l="신청">'+x.guests+'</td><td data-l="입금/현장">'+x.paid+' / '+(+x.onsite||0)+'</td>'
          +'<td data-l="출석" class="'+(recorded?'':'muted')+'">'+(recorded?x.attended:'미기록')+'</td>'
          +'<td data-l="노쇼" class="'+(recorded?'':'muted')+'">'+(recorded?no:'—')
          +(noRate===null?'':' <i class="ops-sub">'+noRate+'%</i>')+'</td>'
          +'<td data-l="출석률">'+(r1===null?'—':r1+'%')+'</td>'
          +'<td data-l="신규/재참가">'+x.new_count+' / '+x.repeat_count+'</td></tr>';
      }).join('')+'</tbody></table></div>';
  }
  function loadDashboard(force){
    if(!ADMIN.token) return;
    if(SG.dashboard && !force){ paintDashboard(); return; }
    SG.dashboard=null; paintDashboard();
    apiPost({action:'admin_dashboard',token:ADMIN.token}).then(function(d){
      if(!d || !d.ok) throw new Error((d&&d.error)||'fail');
      SG.dashboard=d; paintDashboard();
    }).catch(function(e){
      var b=$a('ops-next'); if(b) b.innerHTML='<div class="ops-empty">운영 현황을 불러오지 못했습니다 ('+esc(e.message)+')</div>';
    });
  }

  function loadSignups(){
    if (!$a('sg-body')) return;
    $a('sg-body').innerHTML = '<p class="st-empty">불러오는 중…</p>';
    apiPost({ action:'signups', token: ADMIN.token }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
      SG.rows = d.rows || [];
      try { afterSeed(); } catch (e) {}
      if (d.closed) CLOSED = d.closed;   /* 품절 버튼 상태 */
      if (d.drinks) adminApplyCatalog(d.drinks);
      fillDigest(d.digest); sgFillDays(); paintSg(); seatFillDates(); checkinFillDates(); checkinPaint(); loadDashboard(true);
    }).catch(function(e){
      $a('sg-body').innerHTML = '<p class="st-empty">불러오지 못했습니다 (' + e.message + ')</p>';
    });
  }

  function sgVisible(){
    var today = new Date(); today.setHours(0,0,0,0);
    return SG.rows.filter(function(r){
      if (SG.filter === 'soon' && r.date) {
        if (new Date(r.date + 'T00:00:00') < today) return false;
      }
      if (SG.filter === 'day' && r.date !== SG.day) return false;
      if (!SG.q) return true;
      return SG_COLS.some(function(c){
        return String(r[c[0]] || '').toLowerCase().indexOf(SG.q) >= 0;
      });
    });
  }

  function fallbackFutureMeetups(){
    var out=[], d=new Date(); d.setHours(0,0,0,0);
    /* 기본 운영일(일요일) 12주. 관리자 모임 날짜가 아직 안 불러와졌을 때의 안전망 */
    var add=(7-d.getDay())%7;
    d.setDate(d.getDate()+add);
    for(var i=0;i<12;i++){
      var y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
      out.push(y+'-'+m+'-'+day);
      d.setDate(d.getDate()+7);
    }
    return out;
  }

  function staffQuickBox(){
    var box=document.createElement('div');
    box.className='stf';
    box.style.marginBottom='14px';

    var head=document.createElement('p');
    head.className='stf-h';
    head.textContent='스탭 빠른 추가';
    box.appendChild(head);

    var note=document.createElement('p');
    note.className='sg-dg-note';
    note.style.margin='0 0 8px';
    note.textContent='신청자가 아직 0명인 미래 날짜에도 스탭을 미리 추가할 수 있습니다.';
    box.appendChild(note);

    var row=document.createElement('div');
    row.className='stf-add';

    var dateSel=document.createElement('select');
    dateSel.setAttribute('aria-label','스탭 참가 날짜');
    var dates=(ADMIN_MEETUP_DATES && ADMIN_MEETUP_DATES.length ? ADMIN_MEETUP_DATES.slice() : fallbackFutureMeetups())
      .filter(function(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d); });
    dates.forEach(function(d){
      var o=document.createElement('option');
      o.value=d; o.textContent=d.replace(/-/g,'.');
      dateSel.appendChild(o);
    });

    var name=document.createElement('input');
    name.type='text'; name.placeholder='이름'; name.maxLength=60;

    var nat=document.createElement('select');
    [['日本 / 일본','일본'],['韓国 / 한국','한국']].forEach(function(p){
      var o=document.createElement('option'); o.value=p[0]; o.textContent=p[1]; nat.appendChild(o);
    });

    var pick=document.createElement('select');
    var blank=document.createElement('option'); blank.value=''; blank.textContent='음료 없음'; pick.appendChild(blank);
    ADMIN_DRINK_CATALOG.filter(function(d){return !d.archived;}).forEach(function(d){var id=d.id;
      var o=document.createElement('option'); o.value=id; o.textContent=SG_DRINK[id]; pick.appendChild(o);
    });

    var add=document.createElement('button');
    add.type='button'; add.className='stf-go'; add.textContent='추가';

    function submit(){
      var d=dateSel.value, v=name.value.trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ alert('추가할 모임 날짜를 선택해 주세요.'); return; }
      if(!v){ name.focus(); return; }
      add.disabled=true;
      apiPost({action:'staff_add',token:ADMIN.token,date:d,name:v,nat:nat.value,drink:pick.value})
        .then(function(x){
          add.disabled=false;
          if(!x || !x.ok) throw new Error((x&&x.error)==='full'?'스탭 포함 정원에 도달해 추가할 수 없습니다.':((x&&x.error)||'fail'));
          name.value='';
          loadSignups();
        })
        .catch(function(e){
          add.disabled=false;
          alert('추가하지 못했습니다. ('+fail(e)+')');
        });
    }
    add.addEventListener('click',submit);
    name.addEventListener('keydown',function(e){
      if(e.key==='Enter'){ e.preventDefault(); submit(); }
    });

    row.appendChild(dateSel); row.appendChild(name); row.appendChild(nat); row.appendChild(pick); row.appendChild(add);
    box.appendChild(row);
    return box;
  }

  function paintSg(){
    var rows = sgVisible(), box = $a('sg-body');
    box.innerHTML = '';
    box.appendChild(staffQuickBox());
    if (!rows.length) {
      var empty=document.createElement('p');
      empty.className='st-empty';
      empty.textContent='해당하는 신청이 없습니다.';
      box.appendChild(empty);
      return;
    }

    var groups = {}, order = [];
    rows.forEach(function(r){
      var k = r.date || '날짜 미정';
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });
    order.sort();
    if (SG.filter === 'all') order.reverse();   /* 전체 보기는 최근 모임부터 */

    var WD = ['일','월','화','수','목','금','토'];
    order.forEach(function(k){
      var list = groups[k];
      var wrap = document.createElement('section'); wrap.className = 'sg-day';

      var h = document.createElement('div'); h.className = 'sg-day-h';
      var label = k;
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        var dt = new Date(k + 'T00:00:00');
        label = k.replace(/-/g, '.') + ' (' + WD[dt.getDay()] + ')';
      }
      var sN = list.filter(function(x){ return +x.staff === 1; }).length;
      var gN = list.length - sN;
      var paidN = list.filter(function(x){ return +x.staff !== 1 && +x.paid === 1; }).length;
      var onsiteN = list.filter(function(x){ return +x.staff !== 1 && +x.onsite === 1; }).length;
      var attN = list.filter(function(x){ return +x.staff !== 1 && +x.attended === 1; }).length;
      var jaN = list.filter(function(x){ return /日本|일본/.test(x.nat || ''); }).length;
      h.innerHTML = '<b>' + label + '</b><span>전체 ' + list.length
                  + ' · 일본 ' + jaN + ' · 한국 ' + (list.length - jaN)
                  + '</span><span>입금 ' + paidN + '/' + gN
                  + (onsiteN ? ' · 현장 ' + onsiteN : '')
                  + ' · 출석 ' + attN + '/' + gN
                  + (sN ? ' · 스탭 ' + sN : '') + '</span>';

      /* 주 2회 이상 운영해도 날짜별 명단이 섞이지 않도록
         각 날짜 제목에서 바로 그 날짜 명단표를 받을 수 있게 합니다. */
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        var rb = document.createElement('a');
        rb.className = 'sg-day-roster';
        rb.textContent = '명단표';
        rb.setAttribute('role', 'button');
        prepareRosterLink(rb, k, list.slice());
        h.appendChild(rb);
        /* 미입금 안내(독촉) 메일 — 다가오는 모임에 입금·현장지불 처리가 안 된 사람이 있을 때만 (2026-10-02) */
        var unpaid = list.filter(remindEligible);
        if (unpaid.length) {
          var rmb = document.createElement('button');
          rmb.type = 'button'; rmb.className = 'sg-day-remind';
          rmb.textContent = '미입금 ' + unpaid.length + '명 안내 메일';
          rmb.addEventListener('click', function(){ remindOpen(unpaid, k); });
          h.appendChild(rmb);
        }
      }
      wrap.appendChild(h);

      /* 카페에 미리 알려주실 잔 수 */
      var tally = document.createElement('p');
      tally.className = 'sg-tally';
      tally.textContent = sgDrinkTally(list);
      wrap.appendChild(tally);

      /* 수량이 정해진 음료를 그 날짜에 한해 닫습니다 */
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) wrap.appendChild(soldoutRow(k));

      var guests = list.filter(function(r){ return +r.staff !== 1; });
      var staff  = list.filter(function(r){ return +r.staff === 1; });
      guests.forEach(function(r){ wrap.appendChild(sgRow(r)); });
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        wrap.appendChild(staffBox(k, staff));
      } else if (staff.length) {
        /* 날짜가 비어 있는 과거/비정상 데이터는 표시만 하고, bad_date가 나는 추가 폼은 만들지 않습니다. */
        var legacy=document.createElement('p');
        legacy.className='sg-dg-note';
        legacy.textContent='날짜가 없는 기존 스탭 데이터입니다. 새 스탭은 위의 「스탭 빠른 추가」에서 날짜를 선택해 추가해 주세요.';
        wrap.appendChild(legacy);
      }
      box.appendChild(wrap);
    });
  }

  /* ── 스탭 ─────────────────────────────────────────────────
     이름과 음료만 넣습니다. 참가 인원에는 세지 않고,
     음료 잔 수와 명단·CSV 에는 함께 들어갑니다. */
  function staffBox(date, list){
    var box = document.createElement('div');
    box.className = 'stf';

    var head = document.createElement('p');
    head.className = 'stf-h';
    head.textContent = '스탭' + (list.length ? ' ' + list.length + '명' : '');
    box.appendChild(head);

    if (list.length) {
      var chips = document.createElement('div');
      chips.className = 'stf-list';
      list.forEach(function(r){
        var c = document.createElement('span');
        c.className = 'stf-chip';
        var natShort = /日本|일본/.test(r.nat || '') ? '일본'
                     : (/韓国|한국/.test(r.nat || '') ? '한국' : '');
        c.appendChild(document.createTextNode(
          r.name
          + (natShort ? ' · ' + natShort : '')
          + (r.drink ? ' · ' + (SG_DRINK[r.drink] || r.drink) : '')));

        var x = document.createElement('button');
        x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', '빼기');
        x.addEventListener('click', function(){
          if (!confirm(r.name + ' 님을 스탭 명단에서 뺍니다.')) return;
          x.disabled = true;
          apiPost({ action:'signup_del', token: ADMIN.token, id: r.id })
            .then(function(d){
              if (!d || !d.ok) throw new Error('fail');
              loadSignups();
            })
            .catch(function(){ x.disabled = false; alert('빼지 못했습니다.'); });
        });
        c.appendChild(x);
        chips.appendChild(c);
      });
      box.appendChild(chips);
    }

    /* 추가 줄 */
    var row = document.createElement('div');
    row.className = 'stf-add';

    var name = document.createElement('input');
    name.type = 'text'; name.placeholder = '이름'; name.maxLength = 60;

    var nat = document.createElement('select');
    [['日本 / 일본','일본'],['韓国 / 한국','한국']].forEach(function(p){
      var o = document.createElement('option');
      o.value = p[0]; o.textContent = p[1];
      nat.appendChild(o);
    });

    var pick = document.createElement('select');
    var blank = document.createElement('option');
    blank.value = ''; blank.textContent = '음료 없음';
    pick.appendChild(blank);
    ADMIN_DRINK_CATALOG.filter(function(d){return !d.archived;}).forEach(function(d){var id=d.id;
      var o = document.createElement('option');
      o.value = id; o.textContent = SG_DRINK[id];
      pick.appendChild(o);
    });

    var add = document.createElement('button');
    add.type = 'button'; add.className = 'stf-go'; add.textContent = '추가';
    function submit(){
      var v = name.value.trim();
      if (!v) { name.focus(); return; }
      add.disabled = true;
      apiPost({ action:'staff_add', token: ADMIN.token,
                date: date, name: v, nat: nat.value, drink: pick.value })
        .then(function(d){
          add.disabled = false;
          if (!d || !d.ok) throw new Error((d&&d.error)==='full'?'스탭 포함 정원에 도달해 추가할 수 없습니다.':((d && d.error) || 'fail'));
          loadSignups();
        })
        .catch(function(e){ add.disabled = false; alert('추가하지 못했습니다. (' + fail(e) + ')'); });
    }
    add.addEventListener('click', submit);
    name.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    row.appendChild(name); row.appendChild(nat); row.appendChild(pick); row.appendChild(add);
    box.appendChild(row);
    return box;
  }

  /* ── 품절 버튼 ────────────────────────────────────────── */
  function soldoutRow(date){
    var box = document.createElement('div');
    box.className = 'so-row';
    var lab = document.createElement('span');
    lab.className = 'so-lab'; lab.textContent = '품절 처리';
    box.appendChild(lab);

    ADMIN_DRINK_CATALOG.filter(function(d){return !d.archived;}).forEach(function(d){var id=d.id;
      var on = ((CLOSED[date] || []).indexOf(id) >= 0);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'so-chip' + (on ? ' on' : '');
      b.textContent = SG_DRINK[id] + (on ? ' 품절' : '');
      b.addEventListener('click', function(){
        var cur = (CLOSED[date] || []).slice();
        var i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        b.disabled = true;
        apiPost({ action:'meetup_save', token: ADMIN.token, date: date, closed: cur })
          .then(function(d){
            b.disabled = false;
            if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
            if (cur.length) CLOSED[date] = cur; else delete CLOSED[date];
            paintSg();
            try { syncDrinks(); } catch (e) {}
          })
          .catch(function(){ b.disabled = false; alert('바꾸지 못했습니다.'); });
      });
      box.appendChild(b);
    });
    return box;
  }

  function sgDrinkTally(list){
    var out = [], none = 0;
    Object.keys(SG_DRINK).forEach(function(k){
      var n = list.filter(function(x){ return x.drink === k; }).length;
      if (n) out.push(SG_DRINK[k] + ' ' + n);
    });
    none = list.filter(function(x){ return !x.drink; }).length;
    if (none) out.push('미선택 ' + none);
    return out.length
      ? '음료 — ' + out.join(' · ') + '  (모두 ' + list.length + '잔)'
      : '음료 — 없음';
  }
  function paintSgTally(){ paintSg(); }

  function sgNormName(v){
    try{return String(v||'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ko-KR');}
    catch(e){return String(v||'').replace(/\s+/g,'').toLowerCase();}
  }
  function sgSameNameCount(r){
    if(!r || !r.date || +r.staff===1) return 0;
    var k=sgNormName(r.name);
    return (SG.rows||[]).filter(function(x){
      return +x.staff!==1 && x.date===r.date && sgNormName(x.name)===k;
    }).length;
  }

  function sgNatCanonical(v){
    var t=String(v||'').trim();
    if(/日本|일본|^jp$|^ja$/i.test(t)) return '日本 / 일본';
    if(/韓国|한국|^kr$|^ko$/i.test(t)) return '韓国 / 한국';
    if(t) return 'その他 / 그 외';
    return '';
  }

  function sgCreatedText(v){
    if(v===undefined || v===null || v==='') return '—';
    var n=Number(v);
    /* 예전 데이터가 초 단위 timestamp인 경우도 같이 처리 */
    if(Number.isFinite(n) && n>0 && n<1000000000000) n*=1000;
    var d=Number.isFinite(n) && n>0 ? new Date(n) : new Date(v);
    if(!d || isNaN(d.getTime())) return '—';
    try{
      return d.toLocaleString('ko-KR',{
        timeZone:'Asia/Seoul',
        year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',
        hour12:false
      }).replace(/\.$/,'');
    }catch(e){
      return d.toLocaleString('ko-KR');
    }
  }

  function sgRow(r){
    var row = document.createElement('div'); row.className = 'sg-row' + (+r.waitlisted===1 ? ' waitlisted' : '');
    SG_COLS.forEach(function(c){
      var f = document.createElement('label'); f.className = 'sg-f';
      var s = document.createElement('span'); s.textContent = c[1];
      var inp;
      if (c[0] === 'drink') {
        /* 오타로 집계가 어긋나지 않도록 고르는 방식으로 둡니다 */
        inp = document.createElement('select');
        var blank = document.createElement('option');
        blank.value = ''; blank.textContent = '—';
        inp.appendChild(blank);
        Object.keys(SG_DRINK).forEach(function(k){
          var o = document.createElement('option');
          var def=ADMIN_DRINK_CATALOG.find(function(d){return d.id===k;});
          var hidden=def && (!def.enabled || def.archived);
          var soldout=((CLOSED[r.date]||[]).indexOf(k)>=0);
          var late=def && def.preorder && r.date && (function(){
            var t=Date.parse(r.date+'T15:00:00+09:00');return Number.isFinite(t) && t-Date.now()<51*3600000;
          })();
          var unavailable=hidden || soldout || late;
          o.value=k;
          o.textContent=SG_DRINK[k]+(def && def.archived?' · 삭제됨':hidden?' · 신청 숨김':soldout?' · 품절':late?' · 접수 마감':'');
          /* 이미 선택한 음료는 품절 이후에도 기존 예약으로 유지하고, 다른 품절 음료로 변경하지는 못하도록 합니다. */
          o.disabled=(hidden || soldout) && k!==(r.drink||'');
          inp.appendChild(o);
        });
      } else if (c[0] === 'nat') {
        /* 국적도 고르는 방식으로 통일합니다.
           기존 데이터의 표기가 달라도 한국/일본/기타로 자동 매칭합니다. */
        inp = document.createElement('select');
        [
          ['', '—'],
          ['韓国 / 한국', '🇰🇷 한국'],
          ['日本 / 일본', '🇯🇵 일본'],
          ['その他 / 그 외', '기타']
        ].forEach(function(x){
          var o=document.createElement('option');
          o.value=x[0]; o.textContent=x[1];
          inp.appendChild(o);
        });
      } else {
        inp = document.createElement(c[0] === 'memo' ? 'textarea' : 'input');
        if (c[0] === 'memo') inp.rows = 2;
        if (c[0] === 'date') {
          inp.type = 'date';
          inp.required = true;
          inp.title = '참가일을 선택해 주세요.';
        }
      }
      inp.value = c[0] === 'nat' ? sgNatCanonical(r[c[0]]) : (r[c[0]] || '');
      inp.addEventListener('change', function(){
        var before = r[c[0]] || '';
        if (c[0] === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) {
          alert('참가일을 선택해 주세요.');
          inp.value = before;
          return;
        }
        if (c[0] === 'drink' && before !== inp.value) {
          var nowName=SG_DRINK[inp.value]||'미선택';
          var chosen=ADMIN_DRINK_CATALOG.find(function(x){return x.id===inp.value;});
          var cutoff=chosen && chosen.preorder && r.date && Date.parse(r.date+'T15:00:00+09:00')-Date.now()<51*3600000;
          var extraWarning=cutoff?'\n\n※ 사전 준비 음료 신청 마감 후 관리자 변경입니다. 카페 제공 가능 여부를 먼저 확인해 주세요.':'';
          if(!confirm((r.name||'참가자')+' 님 음료를 '+(SG_DRINK[before]||'미선택')+' → '+nowName+'(으)로 변경할까요?\n\n저장 후 참가자에게 한국어/일본어 음료 변경 안내 메일이 자동 발송됩니다.'+extraWarning)) {
            inp.value=before;return;
          }
        }
        var patch = { action:'signup_save', token: ADMIN.token, id: r.id };
        patch[c[0]] = inp.value;
        inp.classList.add('saving');
        apiPost(patch).then(function(d){
          inp.classList.remove('saving');
          if (!d || !d.ok) {
            inp.classList.add('bad');
            inp.value=before;
            alert((d.error==='drink_unavailable'?'해당 음료가 품절·숨김·신청 마감 상태입니다. 다른 음료를 선택해 주세요.':'변경사항을 저장하지 못했습니다. ('+(d.error||'fail')+')'));
            return;
          }
          inp.classList.remove('bad'); r[c[0]] = inp.value;
          if(c[0]==='drink' && before!==inp.value && +r.staff!==1){
            if(d.drink_change_mail_attempted && d.drink_change_mail===false) alert('음료 변경은 저장됐지만 안내 메일 발송에 실패했습니다. 참가자에게 별도로 안내해 주세요.');
            else if(!d.drink_change_mail_attempted) alert('음료는 변경됐지만 안내 메일을 보낼 수 있는 이메일이 없습니다. 참가자에게 별도로 안내해 주세요.');
          }
          if (c[0] === 'date' || c[0] === 'nat') {
            /* 날짜/국적을 바꾸면 그룹, 국적비율, 자리배정 기준까지 달라지므로
               서버에서 다시 불러와 관리자 화면 전체를 즉시 맞춥니다. */
            loadSignups();
            loadDashboard(true);
            return;
          }
          inp.classList.add('saved'); setTimeout(function(){ inp.classList.remove('saved'); }, 900);
        }).catch(function(){
          inp.classList.remove('saving'); inp.classList.add('bad');
          inp.value = before;
          alert('변경사항을 저장하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
        });
      });
      f.appendChild(s); f.appendChild(inp); row.appendChild(f);
    });

    /* 신청시간 — 서버에 저장된 createdAt을 한국시간으로 표시합니다.
       수정용 값이 아니라 접수 순서/시각 확인용 read-only 항목입니다. */
    var created=document.createElement('div');
    created.className='sg-f sg-created';
    var createdLab=document.createElement('span');
    createdLab.textContent='신청시간';
    var createdVal=document.createElement('div');
    createdVal.className='sg-created-value';
    createdVal.textContent=sgCreatedText(r.createdAt);
    createdVal.title='신청 접수 시각 · 한국시간';
    created.appendChild(createdLab);
    created.appendChild(createdVal);
    row.appendChild(created);

    /* 신규 / 재참가 — 과거 전체 D1 신청 이력 기준 */
    if (+r.staff !== 1) {
      var vc = document.createElement('span');
      var prior = +r.prior_visit_count || 0;
      vc.className = 'sg-visit ' + (prior > 0 ? 'repeat' : 'new');
      vc.textContent = prior > 0 ? ('재참가 · ' + prior + '회') : '신규';
      vc.title = prior > 0
        ? '이 모임 날짜보다 앞선 신청 기록이 ' + prior + '회 있습니다.'
        : '이 모임 날짜보다 앞선 신청 기록이 없습니다.';
      row.appendChild(vc);
      if (sgSameNameCount(r) > 1) {
        var dup=document.createElement('span'); dup.className='sg-dup'; dup.textContent='동명이인/중복 확인';
        dup.title='같은 날짜에 같은 이름이 2명 이상 있습니다. 이메일을 확인해 주세요.';
        row.appendChild(dup);
      }
      if (+r.waitlisted===1) {
        var wb=document.createElement('span'); wb.className='sg-wait'; wb.textContent='대기';
        row.appendChild(wb);
        var wp=document.createElement('button'); wp.type='button'; wp.className='sg-wait-promote'; wp.textContent='참가 전환';
        wp.addEventListener('click',function(){
          if(!confirm((r.name||'이 신청')+' 님을 대기에서 일반 참가로 전환할까요?\n입금 안내 메일이 자동 발송됩니다.')) return;
          wp.disabled=true;
          apiPost({action:'signup_save',token:ADMIN.token,id:r.id,waitlisted:0}).then(function(d){
            if(!d||!d.ok) throw new Error((d&&d.error)||'fail');
            if(d.mail_attempted && d.mail===false) alert('참가 전환은 저장됐지만 입금 안내 메일 발송에 실패했습니다.');
            loadSignups();
          }).catch(function(e){wp.disabled=false;alert('전환하지 못했습니다. ('+fail(e)+')');});
        });
        row.appendChild(wp);
      }
    }


    /* 결제 상태 — 입금 / 현장지불 / 미입금을 분리 관리합니다. */
    var pay = document.createElement('label'); pay.className = 'sg-paid';
    var cb = document.createElement('input'); cb.type = 'checkbox';
    var pt = document.createElement('span');
    var onsite = document.createElement('button'); onsite.type = 'button'; onsite.className = 'sg-onsite';

    /* 미입금 안내(독촉) 메일 — 입금·현장지불이 아닌 다가오는 모임 참가자만 보입니다 (2026-10-02) */
    var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'sg-remind';
    rm.addEventListener('click', function(){ remindOpen([r], r.date); });
    function paintRemindBtn(){
      rm.hidden = !remindEligible(r);
      rm.textContent = +r.remind_n > 0 ? ('독촉 다시 · ' + r.remind_n + '회') : '독촉 메일';
      rm.title = +r.remind_n > 0 ? ('마지막 발송 ' + sgCreatedText(r.remind_at)) : '미입금 안내 메일 보내기';
    }
    function paintPaymentState(){
      cb.checked = +r.paid === 1;
      cb.disabled = +r.waitlisted === 1;
      pt.textContent = +r.paid === 1 ? '입금' : '미입금';
      pay.classList.toggle('on', +r.paid === 1);
      onsite.classList.toggle('on', +r.onsite === 1);
      onsite.textContent = +r.onsite === 1 ? '현장지불 ✓' : '현장지불';
      onsite.disabled = +r.waitlisted === 1;
      paintRemindBtn();
    }
    paintPaymentState();

    cb.addEventListener('change', function(){
      var v = cb.checked ? 1 : 0;
      cb.disabled = true; onsite.disabled = true;
      apiPost({action:'signup_save', token:ADMIN.token, id:r.id, paid:v, onsite:v ? 0 : r.onsite})
        .then(function(d){
          if(!d || !d.ok) throw new Error((d&&d.error)||'fail');
          r.paid=+d.paid||0; r.onsite=+d.onsite||0; paintPaymentState();
          if(v && d.paid_confirmed){
            if(d.mail_attempted && d.mail===false) alert('입금 확인은 저장됐지만 참가 확정 메일 발송에 실패했습니다.');
            else if(!d.mail_attempted) alert('입금 확인은 저장됐지만 이메일 주소가 없어 메일은 발송되지 않았습니다.');
          }
          paintSgTally(); checkinPaint(); loadDashboard(true);
        })
        .catch(function(){ cb.checked=!cb.checked; paintPaymentState(); });
    });

    onsite.addEventListener('click', function(){
      var turningOn = +r.onsite !== 1;
      if(turningOn && !confirm((r.name||'이 참가자')+' 님을 「현장지불」로 확정할까요?\n현장지불 안내 메일이 자동 발송됩니다.')) return;
      cb.disabled=true; onsite.disabled=true;
      apiPost({action:'signup_save', token:ADMIN.token, id:r.id, onsite:turningOn?1:0, paid:turningOn?0:r.paid})
        .then(function(d){
          if(!d || !d.ok) throw new Error((d&&d.error)||'fail');
          r.paid=+d.paid||0; r.onsite=+d.onsite||0; paintPaymentState();
          if(turningOn && d.onsite_confirmed){
            if(d.mail_attempted && d.mail===false) alert('현장지불 상태는 저장됐지만 안내 메일 발송에 실패했습니다.');
            else if(!d.mail_attempted) alert('현장지불 상태는 저장됐지만 이메일 주소가 없어 안내 메일은 발송되지 않았습니다.');
          }
          paintSgTally(); checkinPaint(); loadDashboard(true);
        })
        .catch(function(e){ paintPaymentState(); alert('현장지불 상태를 저장하지 못했습니다. ('+fail(e)+')'); });
    });

    pay.appendChild(cb); pay.appendChild(pt); row.appendChild(pay); row.appendChild(onsite); row.appendChild(rm);

    /* 실제 출석 여부 — 현장에서 체크하면 D1에 바로 저장됩니다. */
    var att = document.createElement('label'); att.className = 'sg-att';
    var acb = document.createElement('input'); acb.type = 'checkbox';
    acb.checked = +r.attended === 1; acb.disabled = +r.waitlisted === 1;
    var at = document.createElement('span'); at.textContent = acb.checked ? '출석' : '미출석';
    att.classList.toggle('on', acb.checked);
    acb.addEventListener('change', function(){
      var v = acb.checked ? 1 : 0;
      acb.disabled = true;
      apiPost({ action:'signup_save', token: ADMIN.token, id: r.id, attended: v })
        .then(function(d){
          acb.disabled = false;
          if (!d || !d.ok) { acb.checked = !acb.checked; return; }
          r.attended = v;
          at.textContent = v ? '출석' : '미출석';
          att.classList.toggle('on', !!v);
          paintSg();
        })
        .catch(function(){ acb.disabled = false; acb.checked = !acb.checked; });
    });
    att.appendChild(acb); att.appendChild(at); row.appendChild(att);

    var del = document.createElement('button');
    del.type = 'button'; del.className = 'sg-del'; del.textContent = '삭제';
    del.addEventListener('click', function(){
      if (!confirm((r.name || '이 신청') + ' — 삭제할까요? 되돌릴 수 없습니다.')) return;
      apiPost({ action:'signup_del', token: ADMIN.token, id: r.id }).then(function(d){
        if (!d || !d.ok) return alert('삭제하지 못했습니다.');
        SG.rows = SG.rows.filter(function(x){ return x.id !== r.id; });
        paintSg();
      });
    });
    row.appendChild(del);
    return row;
  }



  /* ── 당일 체크인 ─────────────────────────────────────────── */
  function checkinFillDates(){
    var sel=$a('checkin-date'); if(!sel) return;
    var cur=sel.value, days={};
    (SG.rows||[]).forEach(function(r){if(r.date && +r.waitlisted!==1)days[r.date]=1;});
    var arr=Object.keys(days).sort(); sel.innerHTML='';
    arr.forEach(function(d){var o=document.createElement('option');o.value=d;o.textContent=d.replace(/-/g,'.');sel.appendChild(o);});
    if(cur&&days[cur])sel.value=cur;
    else{
      var today=new Date();today.setHours(0,0,0,0);
      var t=arr.find(function(d){return new Date(d+'T00:00:00')>=today;});
      if(t)sel.value=t;else if(arr.length)sel.value=arr[arr.length-1];
    }
  }
  function checkinPaint(){
    var box=$a('checkin-list'),sum=$a('checkin-summary'),d=$a('checkin-date')&&$a('checkin-date').value;
    if(!box||!sum)return;
    var q=(($a('checkin-q')&&$a('checkin-q').value)||'').trim().toLowerCase();
    var rows=(SG.rows||[]).filter(function(r){
      return r.date===d && +r.waitlisted!==1 && (!q || String(r.name||'').toLowerCase().indexOf(q)>=0);
    });
    rows=rows.slice().sort(function(a,b){
      if(+a.attended!==+b.attended)return +b.attended-+a.attended;
      return String(a.name||'').localeCompare(String(b.name||''),'ko');
    });
    var all=(SG.rows||[]).filter(function(r){return r.date===d&&+r.waitlisted!==1;});
    var done=all.filter(function(r){return +r.attended===1;}).length;
    var confirmed=all.filter(function(r){return +r.staff===1||+r.paid===1||+r.onsite===1;}).length;
    sum.innerHTML='<span>출석 '+done+'/'+all.length+'</span><span>참가확정 '+confirmed+'/'+all.length+'</span>';
    box.innerHTML='';
    if(!rows.length){box.innerHTML='<p class="seat-empty">표시할 참가자가 없습니다.</p>';return;}
    rows.forEach(function(r){
      var row=document.createElement('div');row.className='checkin-row'+(+r.attended===1?' done':'');
      var info=document.createElement('div');
      var n=document.createElement('div');n.className='checkin-name';n.textContent=r.name||'이름 없음';
      var meta=document.createElement('div');meta.className='checkin-meta';
      meta.textContent=(+r.staff===1?'스탭 · ':'')+(seatIsJa(r)?'일본':'한국');
      info.appendChild(n);info.appendChild(meta);
      var pay=document.createElement('span');
      pay.className='checkin-pay'+((+r.staff===1||+r.paid===1)?' ok':(+r.onsite===1?' onsite':''));
      pay.textContent=(+r.staff===1?'스탭':(+r.paid===1?'입금':(+r.onsite===1?'현장지불':'미입금')));
      var go=document.createElement('button');go.type='button';go.className='checkin-go';
      go.textContent=+r.attended===1?'출석 완료':'출석 체크';
      go.addEventListener('click',function(){
        var v=+r.attended===1?0:1;go.disabled=true;
        apiPost({action:'signup_save',token:ADMIN.token,id:r.id,attended:v}).then(function(x){
          go.disabled=false;if(!x||!x.ok)throw new Error('fail');
          r.attended=v;checkinPaint();loadDashboard(true);
        }).catch(function(){go.disabled=false;alert('출석 상태를 저장하지 못했습니다.');});
      });
      row.appendChild(info);row.appendChild(pay);row.appendChild(go);box.appendChild(row);
    });
  }
  on('checkin-date','change',checkinPaint);
  on('checkin-q','input',checkinPaint);

  /* ── 자리 배정 ─────────────────────────────────────────────
     국적 비율을 최대한 일정하게 유지하고, 스탭을 먼저 흩어 놓은 뒤
     같은 조합의 반복이 적도록 여러 회차를 랜덤 배정합니다. */
  var SEAT = { result:null, serial:0 };

  function seatIsJa(r){ return /日本|일본/.test(String(r && r.nat || '')); }
  function seatNat(r){ return seatIsJa(r) ? '일본' : '한국'; }
  function seatShuffle(a){
    a = a.slice();
    for (var i=a.length-1;i>0;i--){
      var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t;
    }
    return a;
  }
  function seatId(r){ return String(r && r.id || (r.name+'|'+r.createdAt)); }
  /* 자리표에서도 처음 오신 분을 알아볼 수 있게 표시합니다.
     신규는 되도록 재참가자 사이에 섞이는 편이 좋습니다. */
  function seatVisitTag(r){
    if (+r.staff === 1) return null;
    if (+r.prior_visit_count < 0) return null;   /* 이력을 알 수 없는 경우 */
    var prior = +r.prior_visit_count || 0;
    var el = document.createElement('em');
    el.className = 'seat-visit ' + (prior > 0 ? 'repeat' : 'new');
    el.textContent = prior > 0 ? '재' : '新';
    el.title = prior > 0 ? ('재참가 · 이전 기록 ' + prior + '회') : '신규 참가';
    return el;
  }
  function seatPairKey(a,b){ a=seatId(a); b=seatId(b); return a < b ? a+'§'+b : b+'§'+a; }

  function seatFillDates(){
    var sel=$a('seat-date'); if (!sel || !SG.rows) return;
    var current=sel.value, days={};
    SG.rows.forEach(function(r){ if (r.date) days[r.date]=1; });
    var arr=Object.keys(days).sort();
    sel.innerHTML='';
    arr.forEach(function(d){ var o=document.createElement('option'); o.value=d; o.textContent=d.replace(/-/g,'.'); sel.appendChild(o); });
    if (current && days[current]) sel.value=current;
    else {
      var today=new Date(); today.setHours(0,0,0,0);
      var next=arr.find(function(d){ return new Date(d+'T00:00:00')>=today; });
      if (next) sel.value=next; else if (arr.length) sel.value=arr[arr.length-1];
    }
  }

  function seatRows(){
    var d=$a('seat-date') && $a('seat-date').value;
    var paidOnly=$a('seat-paid') && $a('seat-paid').value==='paid';
    return (SG.rows||[]).filter(function(r){
      if (r.date!==d || +r.waitlisted===1) return false;
      if (!paidOnly) return true;
      return +r.staff===1 || +r.paid===1 || +r.onsite===1;
    });
  }

  /* ── 2차 전용 탭: 참가 체크 + 랜덤번호 ────────────────────
     참가 체크는 신청자 메모 #2차, 랜덤번호 결과는 D1에 날짜별 저장합니다. */
  var AFTER_ORDER = {};

  function afterDate(){ return ($a('after-date') && $a('after-date').value) || ''; }
  function afterRows(d){
    d = d || afterDate();
    return (SG.rows || []).filter(function(r){ return r.date === d && +r.waitlisted!==1; });
  }
  function afterSelected(d){ return afterRows(d).filter(function(r){ return afterHas(r); }); }
  function afterOrderGet(d){ return AFTER_ORDER[d] || []; }

  function afterFillDates(){
    var sel=$a('after-date'); if(!sel) return;
    var current=sel.value, days={};
    (SG.rows||[]).forEach(function(r){ if(r.date && +r.waitlisted!==1) days[r.date]=1; });
    var arr=Object.keys(days).sort(); sel.innerHTML='';
    arr.forEach(function(d){ var o=document.createElement('option'); o.value=d; o.textContent=d.replace(/-/g,'.'); sel.appendChild(o); });
    if(current && days[current]) sel.value=current;
    else {
      var today=new Date(); today.setHours(0,0,0,0);
      var next=arr.find(function(d){ return new Date(d+'T00:00:00')>=today; });
      if(next) sel.value=next; else if(arr.length) sel.value=arr[arr.length-1];
    }
  }

  function afterMeta(r){ if(+r.staff===1) return '스탭'; return seatIsJa(r) ? '일본' : '한국'; }

  function afterLoadOrder(d){
    d=d||afterDate(); if(!d||!ADMIN.token) return Promise.resolve();
    var note=$a('after-result-note'); if(note) note.textContent='저장된 랜덤번호 불러오는 중…';
    return apiPost({action:'after_status',token:ADMIN.token,date:d}).then(function(x){
      if(!x||!x.ok) throw new Error((x&&x.error)||'fail');
      AFTER_ORDER[d]=(x.assignments||[]).sort(function(a,b){return +a.rand_no-+b.rand_no;})
        .map(function(a){return String(a.signup_id);});
      afterRenderResult();
    }).catch(function(){
      if(note) note.textContent='저장된 랜덤번호를 불러오지 못했습니다.';
    });
  }

  function afterClearOrder(d){
    d=d||afterDate(); if(!d) return Promise.resolve();
    delete AFTER_ORDER[d]; afterRenderResult();
    return apiPost({action:'after_clear',token:ADMIN.token,date:d}).catch(function(){});
  }

  function afterSaveOrder(d,ids){
    var assignments=(ids||[]).map(function(id,i){return {signup_id:String(id),rand_no:i+1};});
    return apiPost({action:'after_save',token:ADMIN.token,date:d,assignments:assignments}).then(function(x){
      if(!x||!x.ok) throw new Error((x&&x.error)||'fail');
      AFTER_ORDER[d]=ids.slice();
      afterRenderResult();
      return x;
    });
  }

  function afterSetAndSave(r,on){
    afterSet(r,on);
    var cur=String(r.memo||'');
    var next=on ? (AFTER_RE.test(cur) ? cur : (cur ? cur+' '+AFTER_TAG : AFTER_TAG))
                : cur.replace(AFTER_RE,'').replace(/\s{2,}/g,' ').trim();
    r.memo=next;
    return apiPost({action:'signup_save',token:ADMIN.token,id:r.id,memo:next});
  }

  function afterPaint(){
    var list=$a('after-pick-list'); if(!list) return;
    var d=afterDate(), day=afterRows(d);
    var all=nameSort(day.filter(function(r){return +r.staff!==1 && seatIsJa(r);}),true)
      .concat(nameSort(day.filter(function(r){return +r.staff!==1 && !seatIsJa(r);}),false))
      .concat(nameSort(day.filter(function(r){return +r.staff===1;}),false));
    list.innerHTML='';
    if(!all.length){ list.innerHTML='<p class="seat-empty">이 날짜에 참가자가 없습니다.</p>'; afterRefresh(); return; }
    all.forEach(function(r){
      var b=document.createElement('button'); b.type='button';
      b.className='seat-chip'+(afterHas(r)?' on':'')+(+r.staff===1?' staff':'');
      b.textContent=(r.name||'이름 없음')+' · '+afterMeta(r);
      b.addEventListener('click',function(){
        var on=!afterHas(r); b.disabled=true;
        afterSetAndSave(r,on).then(function(x){
          if(!x||!x.ok) throw new Error('fail');
          b.disabled=false; b.classList.toggle('on',on);
          return afterClearOrder(d);
        }).then(afterRefresh).catch(function(){
          b.disabled=false; afterSet(r,!on); alert('2차 참가 표시를 저장하지 못했습니다.'); afterPaint();
        });
      });
      list.appendChild(b);
    });
    afterRefresh();
  }

  function afterRefresh(){
    var d=afterDate(), selected=afterSelected(d), c=$a('after-count');
    if(c) c.textContent=selected.length+'명 선택';
    afterRenderResult();
  }

  function afterRenderResult(){
    var box=$a('after-result'), note=$a('after-result-note'); if(!box) return;
    var d=afterDate(), selected=afterSelected(d), ids=afterOrderGet(d);
    var byId={}; selected.forEach(function(r){byId[String(r.id)]=r;});
    var selectedIds=selected.map(function(r){return String(r.id);}).sort();
    var orderIds=(ids||[]).map(String), orderSorted=orderIds.slice().sort();
    var valid=selectedIds.length>0 && selectedIds.length===orderSorted.length &&
      selectedIds.every(function(v,i){return v===orderSorted[i];});
    if(!valid){
      box.innerHTML='<p class="seat-empty">'+(selected.length ? selected.length+'명이 선택되었습니다. 「랜덤번호 배정」을 눌러 주세요.' : '참가자를 선택하고 「랜덤번호 배정」을 눌러 주세요.')+'</p>';
      if(note) note.textContent=selected.length ? '1~'+selected.length+'번을 중복 없이 배정합니다.' : '';
      return;
    }
    box.innerHTML='';
    orderIds.forEach(function(id,i){
      var r=byId[id]; if(!r) return;
      var row=document.createElement('div'); row.className='after-order-row';
      var no=document.createElement('span'); no.className='after-order-no'; no.textContent=String(i+1);
      var name=document.createElement('span'); name.className='after-order-name'; name.textContent=r.name||'이름 없음';
      var meta=document.createElement('span'); meta.className='after-order-meta'; meta.textContent=afterMeta(r);
      row.appendChild(no); row.appendChild(name); row.appendChild(meta); box.appendChild(row);
    });
    if(note) note.textContent=orderIds.length+'명 · D1 저장 완료';
  }

  function afterRandomize(){
    var d=afterDate(), arr=afterSelected(d).slice(), note=$a('after-result-note');
    if(!d){ alert('모임 날짜를 선택해 주세요.'); return; }
    if(!arr.length){ alert('먼저 2차 참가자를 선택해 주세요.'); return; }
    for(var i=arr.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)),t=arr[i];arr[i]=arr[j];arr[j]=t; }
    var ids=arr.map(function(r){return String(r.id);});
    if(note) note.textContent='D1에 저장 중…';
    afterSaveOrder(d,ids).catch(function(e){alert('랜덤번호를 저장하지 못했습니다. ('+fail(e)+')');});
  }

  function afterClearAll(){
    var d=afterDate(), list=afterSelected(d);
    if(!list.length) return;
    if(!confirm(list.length+'명의 2차 참가 표시를 모두 해제할까요?')) return;
    Promise.all(list.map(function(r){return afterSetAndSave(r,false);}))
      .then(function(){return afterClearOrder(d);}).then(afterPaint)
      .catch(function(){alert('일부 참가자의 2차 표시를 해제하지 못했습니다. 새로고침 후 확인해 주세요.');afterPaint();});
  }

  function afterCopyResult(){
    var d=afterDate(), ids=afterOrderGet(d), selected=afterSelected(d), byId={};
    selected.forEach(function(r){byId[String(r.id)]=r;});
    if(!ids.length){alert('먼저 랜덤번호를 배정해 주세요.');return;}
    var lines=ids.map(function(id,i){var r=byId[String(id)];return r?((i+1)+'\t'+(r.name||'')+'\t'+afterMeta(r)):'';}).filter(Boolean);
    var txt=lines.join('\n');
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){alert('랜덤번호 결과를 복사했습니다.');}).catch(fallback);
    }else fallback();
    function fallback(){
      var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');alert('랜덤번호 결과를 복사했습니다.');}catch(e){alert('복사하지 못했습니다.');}
      ta.remove();
    }
  }

  on('after-date','change',function(){ afterPaint(); afterLoadOrder(afterDate()); });
  on('after-random','click',afterRandomize);
  on('after-reroll','click',afterRandomize);
  on('after-clear','click',afterClearAll);
  on('after-copy','click',afterCopyResult);

  /* ── 자리 설정 저장 ───────────────────────────────────────
     테이블 구성은 몇 주씩 그대로인 경우가 많습니다.
     본 모임과 2차를 따로 저장해 두고 매주 불러 씁니다.
     2026-10-03부터 서버(D1 meta 'seat_preset')에 저장해 다른 기기에서도 불러옵니다.
     서버에 닿지 않을 때를 대비해 이 브라우저에도 같이 적어 둡니다. */
  var SEAT_KEY = 'irotomo-seat-preset';

  function seatPresetRead(){
    try { return JSON.parse(localStorage.getItem(SEAT_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function seatPresetSave(){
    var scope = seatPickOn() ? 'after' : 'main';
    var all = seatPresetRead();
    all[scope] = {
      size:   +$a('seat-size').value || 6,
      max:    +$a('seat-max').value || 12,
      rounds: +$a('seat-rounds').value || 1,
      mode:   $a('seat-mode') ? $a('seat-mode').value : 'auto',
      paid:   $a('seat-paid') ? $a('seat-paid').value : 'paid',
      sizes:  seatManualSizesRaw()
    };
    var localOk = true;
    try { localStorage.setItem(SEAT_KEY, JSON.stringify(all)); } catch (e) { localOk = false; }
    var st = $a('seat-state'), label = (scope === 'after' ? '2차' : '본 모임');
    if (st) { st.classList.remove('err'); st.textContent = label + ' 설정을 저장하는 중…'; }
    apiPost({ action:'seat_preset_save', token: ADMIN.token, scope: scope, preset: all[scope] })
      .then(function(d){
        if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
        if (st) { st.classList.remove('err'); st.textContent = label + ' 설정을 서버에 저장했습니다. 다른 기기에서도 불러올 수 있습니다.'; }
      })
      .catch(function(){
        if (!st) return;
        st.textContent = localOk ? '서버에 저장하지 못해 이 기기에만 저장했습니다. 잠시 뒤 다시 눌러 주세요.' : '저장하지 못했습니다.';
        st.classList.add('err');
      });
  }
  function seatPresetLoad(){
    var scope = seatPickOn() ? 'after' : 'main';
    var st = $a('seat-state');
    if (st) { st.classList.remove('err'); st.textContent = '설정을 불러오는 중…'; }
    /* 서버 값을 먼저 쓰고, 서버에 없거나 닿지 않으면 이 기기에 남은 값을 씁니다 */
    apiPost({ action:'seat_preset_get', token: ADMIN.token })
      .then(function(d){
        var p = d && d.ok && d.preset && d.preset[scope];
        if (p) seatPresetApply(scope, p, '서버');
        else seatPresetApply(scope, seatPresetRead()[scope], '이 기기');
      })
      .catch(function(){ seatPresetApply(scope, seatPresetRead()[scope], '이 기기'); });
  }
  function seatPresetApply(scope, p, from){
    var st = $a('seat-state');
    if (!p) {
      if (st) { st.textContent = '저장해 둔 ' + (scope === 'after' ? '2차' : '본 모임') + ' 설정이 없습니다.'; st.classList.add('err'); }
      return;
    }
    $a('seat-size').value = p.size || 6;
    $a('seat-max').value  = p.max || 12;
    if (!seatPickOn()) $a('seat-rounds').value = p.rounds || 1;
    if ($a('seat-paid')) $a('seat-paid').value = p.paid || 'paid';
    if ($a('seat-mode')) $a('seat-mode').value = p.mode || 'auto';
    seatManualPaint();
    if ((p.mode === 'manual') && p.sizes && p.sizes.length) {
      var ins = $a('seat-manual-rows').querySelectorAll('input');
      p.sizes.forEach(function(v, i){ if (ins[i]) ins[i].value = v; });
      seatManualSum();
    }
    SEAT.result = null; seatPaint();
    if (st) { st.classList.remove('err');
      st.textContent = (scope === 'after' ? '2차' : '본 모임') + ' 설정을 불러왔습니다' + (from ? ' (' + from + ')' : '') + '.'; }
  }

  /* ── 2차 참가자 고르기 ────────────────────────────────────
     그날 참가자 전원을 이름 칩으로 깔아 두고, 한 번 탭으로 켜고 끕니다.
     신청 내역을 스크롤하며 찾지 않아도 되도록 현장용으로 따로 둡니다. */
  function seatScope(){ return 'main'; }
  /* 2차는 시작 시각을 직접 넣습니다. 길이는 넉넉히 3시간으로 잡습니다. */
  function seatIntervalMin(){ return 50; }

  function seatPickOn(){
    return false;
  }
  /* 2차는 자리를 한 번만 정하므로 회차 입력을 감추고 1로 고정합니다. */
  function seatScopeSync(){
    var f = $a('seat-rounds') && $a('seat-rounds').closest('label');
    var after = seatPickOn();
    if (f) f.hidden = after;
    var sl = $a('seat-start-l'); if (sl) sl.hidden = !after;
    if (after && $a('seat-rounds')) $a('seat-rounds').value = 1;
  }
  function seatPickPaint(){
    var box = $a('seat-pick'), list = $a('seat-pick-list');
    if (!box || !list) return;
    if (!seatPickOn()) { box.hidden = true; return; }
    box.hidden = false;

    var d = $a('seat-date') && $a('seat-date').value;
    /* 2차 후보는 그날 온 사람 전체입니다 — 입금 여부와 무관하게 보여줍니다 */
    var day = (SG.rows || []).filter(function(r){ return r.date === d; });
    /* 일본인 오십음순 → 한국인 가나다순 → 스탭 순으로 세웁니다.
       현장에서 이름을 눈으로 찾기 쉬워집니다. */
    var all = nameSort(day.filter(function(r){ return +r.staff !== 1 &&  seatIsJa(r); }), true)
      .concat(nameSort(day.filter(function(r){ return +r.staff !== 1 && !seatIsJa(r); }), false))
      .concat(nameSort(day.filter(function(r){ return +r.staff === 1; }), false));

    list.innerHTML = '';
    if (!all.length) {
      list.innerHTML = '<p class="seat-empty">이 날짜에 참가자가 없습니다.</p>';
      seatPickCount(); return;
    }

    all.forEach(function(r){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat-chip' + (afterHas(r) ? ' on' : '') + (+r.staff === 1 ? ' staff' : '');
      b.textContent = (r.name || '이름 없음') + (+r.staff === 1 ? ' ·스탭' : '');
      b.addEventListener('click', function(){
        /* 화면을 먼저 바꾸고, 저장은 뒤따라 보냅니다.
           저장이 늦거나 실패해도 현장에서 고른 상태는 그대로 남습니다. */
        var on = !afterHas(r);
        afterSet(r, on);
        b.classList.toggle('on', on);
        seatPickCount();
        try { seatManualSum(); } catch (e) {}

        var cur = String(r.memo || '');
        var next = on
          ? (AFTER_RE.test(cur) ? cur : (cur ? cur + ' ' + AFTER_TAG : AFTER_TAG))
          : cur.replace(AFTER_RE, '').replace(/\s{2,}/g, ' ').trim();
        r.memo = next;
        apiPost({ action:'signup_save', token: ADMIN.token, id: r.id, memo: next })
          .catch(function(){ /* 저장만 실패 — 화면 선택은 유지합니다 */ });
      });
      list.appendChild(b);
    });
    seatPickCount();
  }
  function seatPickCount(){
    var el = $a('seat-pick-n');
    if (!el) return;
    var d = $a('seat-date') && $a('seat-date').value;
    var n = (SG.rows || []).filter(function(r){
      return r.date === d && afterHas(r);
    }).length;
    el.textContent = n + '명 선택';
  }

  /* ── 테이블별 인원 직접 지정 ──────────────────────────────
     현장 테이블 크기가 제각각일 때 그대로 맞춰 넣습니다.
     합계가 실제 인원과 맞아야 배정이 돌아갑니다. */
  function seatManualOn(){
    return $a('seat-mode') && $a('seat-mode').value === 'manual';
  }
  function seatManualPaint(){
    var box=$a('seat-manual'), rowsBox=$a('seat-manual-rows');
    if(!box||!rowsBox) return;
    if(!seatManualOn()){ box.hidden=true; return; }
    box.hidden=false;

    var n=Math.max(1,Math.min(50,+$a('seat-max').value||1));
    var cap=Math.max(2,+$a('seat-size').value||6);
    var prev=[];
    rowsBox.querySelectorAll('input').forEach(function(x){ prev.push(+x.value||0); });

    rowsBox.innerHTML='';
    for(var i=0;i<n;i++){
      var lab=document.createElement('label');
      var t=document.createElement('span'); t.textContent='TABLE '+(i+1);
      var inp=document.createElement('input');
      inp.type='number'; inp.min='0'; inp.max='20';
      inp.value=String(prev[i]!==undefined?prev[i]:cap);
      inp.addEventListener('input', seatManualSum);
      lab.appendChild(t); lab.appendChild(inp); rowsBox.appendChild(lab);
    }
    seatManualSum();
  }
  function seatManualSizesRaw(){
    var out=[];
    var b=$a('seat-manual-rows');
    if(b) b.querySelectorAll('input').forEach(function(x){ out.push(Math.max(0,+x.value||0)); });
    return out;
  }
  function seatManualSizes(){
    var out=[];
    var b=$a('seat-manual-rows');
    if(b) b.querySelectorAll('input').forEach(function(x){ out.push(Math.max(0,+x.value||0)); });
    return out.filter(function(v){ return v>0; });
  }
  function seatManualSum(){
    var el=$a('seat-manual-sum'); if(!el) return;
    var sizes=seatManualSizes();
    var sum=sizes.reduce(function(a,b){return a+b;},0);
    var need=seatRows().length;
    el.textContent='합계 '+sum+'석 · 배정 대상 '+need+'명';
    el.className = sum===need ? 'ok' : 'bad';
  }

  function seatTableSizes(total, cap, tables, fixed){
    /* 직접 지정한 값이 있으면 섞지 않고 TABLE 번호 순서 그대로 씁니다.
       현장 테이블 크기에 맞춰 넣은 숫자이므로 순서가 바뀌면 안 됩니다. */
    if (fixed && fixed.length) return fixed.slice();
    var base=Math.floor(total/tables), more=total%tables, a=[];
    for (var i=0;i<tables;i++) a.push(base+(i<more?1:0));
    return seatShuffle(a);
  }

  /* 정해진 테이블 크기와 이미 들어간 스탭을 고려해 일본인 정원을 정수로 배분합니다. */
  function seatJaQuota(sizes, tables, totalJa){
    var total=sizes.reduce(function(a,b){return a+b;},0), ratio=total ? totalJa/total : 0;
    var q=[], ideal=[], lo=[], hi=[];
    for (var i=0;i<sizes.length;i++){
      var sj=tables[i].filter(seatIsJa).length;
      var sk=tables[i].length-sj;
      ideal[i]=sizes[i]*ratio;
      lo[i]=sj;
      hi[i]=sizes[i]-sk;
      q[i]=Math.max(lo[i],Math.min(hi[i],Math.floor(ideal[i])));
    }
    function sum(){ return q.reduce(function(a,b){return a+b;},0); }
    while(sum()<totalJa){
      var best=-1, bd=Infinity;
      for(var j=0;j<q.length;j++) if(q[j]<hi[j]){
        var d=Math.pow(q[j]+1-ideal[j],2)-Math.pow(q[j]-ideal[j],2)+Math.random()*1e-6;
        if(d<bd){bd=d;best=j;}
      }
      if(best<0) break; q[best]++;
    }
    while(sum()>totalJa){
      var best2=-1, bd2=Infinity;
      for(var k=0;k<q.length;k++) if(q[k]>lo[k]){
        var d2=Math.pow(q[k]-1-ideal[k],2)-Math.pow(q[k]-ideal[k],2)+Math.random()*1e-6;
        if(d2<bd2){bd2=d2;best2=k;}
      }
      if(best2<0) break; q[best2]--;
    }
    return q;
  }

  function seatRepeatPenalty(person, members, pairs){
    var p=0;
    members.forEach(function(m){ p += pairs[seatPairKey(person,m)] || 0; });
    return p;
  }

  function seatChooseTable(person, candidates, tables, pairs){
    var best=[], score=Infinity;
    candidates.forEach(function(i){
      var s=seatRepeatPenalty(person,tables[i],pairs)*1000 + tables[i].length*0.01 + Math.random()*0.005;
      if(s<score-1e-9){score=s;best=[i];}
      else if(Math.abs(s-score)<1e-9) best.push(i);
    });
    return best.length ? best[Math.floor(Math.random()*best.length)] : -1;
  }

  function seatOneRound(rows, cap, maxTables, pairs, fixed){
    var n=rows.length;
    /* 테이블별 인원을 직접 넣었으면 그 개수가 곧 테이블 수입니다 */
    var tableCount=(fixed && fixed.length) ? fixed.length : Math.ceil(n/cap);
    if(tableCount>maxTables) return {error:'capacity', need:tableCount};
    if(!n) return {error:'empty'};
    var sizes=seatTableSizes(n,cap,tableCount,fixed);
    var tables=[]; for(var i=0;i<tableCount;i++) tables.push([]);

    var staff=seatShuffle(rows.filter(function(r){return +r.staff===1;}));
    var guests=rows.filter(function(r){return +r.staff!==1;});

    /* 스탭은 모든 테이블에 1명씩 들어가기 전에는 같은 테이블에 두지 않습니다. */
    var tableOrder=seatShuffle(Array.from({length:tableCount},function(_,x){return x;}));
    staff.forEach(function(st,idx){
      var candidates=[];
      var minStaff=Infinity;
      for(var t=0;t<tableCount;t++){
        if(tables[t].length>=sizes[t]) continue;
        var sc=tables[t].filter(function(x){return +x.staff===1;}).length;
        if(sc<minStaff){minStaff=sc;candidates=[t];}
        else if(sc===minStaff)candidates.push(t);
      }
      /* 첫 바퀴는 랜덤한 서로 다른 테이블을 우선 */
      if(idx<tableCount){
        var pref=tableOrder[idx];
        if(candidates.indexOf(pref)>=0) candidates=[pref];
      }
      var ti=seatChooseTable(st,candidates,tables,pairs);
      if(ti>=0) tables[ti].push(st);
    });

    var totalJa=rows.filter(seatIsJa).length;
    var quota=seatJaQuota(sizes,tables,totalJa);
    var ja=seatShuffle(guests.filter(seatIsJa));
    var ko=seatShuffle(guests.filter(function(r){return !seatIsJa(r);}));

    function fill(pool,isJaPool){
      pool.forEach(function(p){
        var cand=[];
        for(var t=0;t<tableCount;t++){
          if(tables[t].length>=sizes[t]) continue;
          var curJa=tables[t].filter(seatIsJa).length;
          if(isJaPool ? curJa<quota[t] : (tables[t].length-curJa)<(sizes[t]-quota[t])) cand.push(t);
        }
        /* 수치상 슬롯이 어긋난 예외에는 빈 자리 어디든 사용 */
        if(!cand.length) for(var x=0;x<tableCount;x++) if(tables[x].length<sizes[x]) cand.push(x);
        var ti=seatChooseTable(p,cand,tables,pairs);
        if(ti>=0) tables[ti].push(p);
      });
    }
    /* 더 적은 국적부터 넣으면 비율 슬롯이 안정적으로 맞습니다 */
    if(ja.length<=ko.length){fill(ja,true);fill(ko,false);} else {fill(ko,false);fill(ja,true);}

    /* 테이블 안 표시 순서도 매번 랜덤 */
    tables=tables.map(seatShuffle);
    return {tables:tables,sizes:sizes};
  }

  function seatGenerate(){
    var rows=seatRows(), cap=+$a('seat-size').value||0, maxT=+$a('seat-max').value||0,
        rounds=Math.max(1,Math.min(6,+$a('seat-rounds').value||1));
    var st=$a('seat-state'); if(st){st.textContent='';st.classList.remove('err');}
    if(cap<2 || maxT<1){ if(st){st.textContent='테이블 인원과 최대 테이블 수를 확인해 주세요.';st.classList.add('err');} return; }
    if(!rows.length){ if(st){st.textContent='이 날짜에 배정할 사람이 없습니다.';st.classList.add('err');} return; }
    /* 테이블별로 직접 넣은 인원이 있으면 그대로 씁니다 */
    var manual=null;
    if(seatManualOn()){
      manual=seatManualSizes();
      var msum=manual.reduce(function(a,b){return a+b;},0);
      if(!manual.length){ if(st){st.textContent='테이블별 인원을 넣어 주세요.';st.classList.add('err');} return; }
      if(msum!==rows.length){
        if(st){st.textContent='테이블별 인원 합계가 '+msum+'석인데 배정 대상은 '+rows.length+'명입니다. 숫자를 맞춰 주세요.';st.classList.add('err');}
        return;
      }
    }

    var need=Math.ceil(rows.length/cap);
    if(!manual && need>maxT){
      if(st){st.textContent='현재 '+rows.length+'명 / 테이블당 '+cap+'명 기준으로 최소 '+need+'테이블이 필요합니다. 최대 테이블 수를 늘려 주세요.';st.classList.add('err');}
      $a('seat-body').innerHTML='<p class="seat-empty">정원이 부족해 배정하지 않았습니다.</p>';
      return;
    }

    var pairs={}, out=[];
    for(var r=0;r<rounds;r++){
      /* 여러 후보를 만들어 반복 조합이 가장 적은 것을 고릅니다. */
      var best=null,bestScore=Infinity;
      for(var trial=0;trial<60;trial++){
        var one=seatOneRound(rows,cap,maxT,pairs,manual); if(one.error){best=one;break;}
        var sc=0;
        one.tables.forEach(function(tb){
          for(var i=0;i<tb.length;i++) for(var j=i+1;j<tb.length;j++) sc += pairs[seatPairKey(tb[i],tb[j])]||0;
        });
        sc += Math.random()*0.01;
        if(sc<bestScore){bestScore=sc;best=one;}
      }
      if(!best || best.error){ if(st){st.textContent='배정 중 오류가 생겼습니다.';st.classList.add('err');} return; }
      out.push(best.tables);
      best.tables.forEach(function(tb){
        for(var i=0;i<tb.length;i++) for(var j=i+1;j<tb.length;j++){
          var k=seatPairKey(tb[i],tb[j]); pairs[k]=(pairs[k]||0)+1;
        }
      });
    }
    SEAT.result={date:$a('seat-date').value, rows:rows, rounds:out, cap:cap, maxTables:maxT, serial:++SEAT.serial};
    seatPaint();
    if(st) st.textContent='배정했습니다. 「다시 섞기」를 누르면 같은 조건으로 새로 뽑습니다.';
  }

  function seatPaint(){
    var box=$a('seat-body'), sm=$a('seat-summary'), res=SEAT.result;
    if(!box || !sm) return;
    if(!res){ box.innerHTML='<p class="seat-empty">날짜와 설정을 고른 뒤 「랜덤 배정」을 눌러 주세요.</p>'; sm.innerHTML=''; return; }
    var rows=res.rows, ja=rows.filter(seatIsJa).length, staff=rows.filter(function(r){return +r.staff===1;}).length;
    sm.innerHTML='<span>총 '+rows.length+'명</span><span>일본 '+ja+'명</span><span>한국 '+(rows.length-ja)+'명</span>'+
      '<span>스탭 '+staff+'명</span>'+
      '<span>신규 '+rows.filter(function(r){return +r.staff!==1 && +r.prior_visit_count===0;}).length+'명</span>'+
      '<span>'+res.rounds[0].length+'테이블</span><span>'+res.rounds.length+'회차</span>';
    box.innerHTML='';
    res.rounds.forEach(function(tables,ri){
      var sec=document.createElement('section'); sec.className='seat-round';
      var h=document.createElement('div'); h.className='seat-round-h';
      h.innerHTML='<b>'+(ri+1)+'회차</b><span>같은 조합 반복을 줄여 랜덤 배정</span>'; sec.appendChild(h);
      var grid=document.createElement('div'); grid.className='seat-grid';
      tables.forEach(function(tb,ti){
        var c=document.createElement('article'); c.className='seat-table';
        var jn=tb.filter(seatIsJa).length, sn=tb.filter(function(r){return +r.staff===1;}).length;
        var ch=document.createElement('div'); ch.className='seat-table-h';
        var nw=tb.filter(function(r){return +r.staff!==1 && +r.prior_visit_count===0;}).length;
        ch.innerHTML='<b>TABLE '+(ti+1)+'</b><span>'+tb.length+'명 · 日 '+jn+' / 韓 '+(tb.length-jn)
          +(sn?' · STAFF '+sn:'')+(nw?' · 新 '+nw:'')+'</span>'; c.appendChild(ch);
        var ul=document.createElement('ul'); ul.className='seat-members';
        /* 테이블 안에서도 일본인 → 한국인 순으로 세워 부르기 쉽게 합니다 */
        var ordered=nameSort(tb.filter(function(r){ return seatIsJa(r); }), true)
          .concat(nameSort(tb.filter(function(r){ return !seatIsJa(r); }), false));
        ordered.forEach(function(p){
          var li=document.createElement('li');
          var nm=document.createElement('span'); nm.className='nm'; nm.textContent=p.name||'이름 없음'; li.appendChild(nm);
          var nat=document.createElement('span'); nat.className='nat'; nat.textContent=seatNat(p); li.appendChild(nat);
          if(+p.staff===1){var b=document.createElement('span');b.className='staff';b.textContent='STAFF';li.appendChild(b);}
          var vt=seatVisitTag(p); if(vt) li.appendChild(vt);
          ul.appendChild(li);
        });
        c.appendChild(ul); grid.appendChild(c);
      });
      sec.appendChild(grid); box.appendChild(sec);
    });
  }

  /* ── 자리배정 XLSX : 외부 라이브러리 없이 직접 생성 ────────
     XLSX는 ZIP 안에 XML 파일들이 들어 있는 구조입니다.
     여기서는 필요한 최소 XLSX 구조를 브라우저에서 직접 만들어
     CDN/SheetJS 로딩 없이 바로 다운로드합니다. */

  function seatOrderedTable(tb){
    return nameSort(tb.filter(function(r){return seatIsJa(r);}),true)
      .concat(nameSort(tb.filter(function(r){return !seatIsJa(r);}),false));
  }

  function seatXmlEsc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');
  }

  function seatColName(n){
    var s='';
    while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26); }
    return s;
  }

  function seatInlineCell(ref, value, style){
    return '<c r="'+ref+'" s="'+(style||0)+'" t="inlineStr"><is><t xml:space="preserve">'
      +seatXmlEsc(value)+'</t></is></c>';
  }

  function seatNumberCell(ref, value, style){
    return '<c r="'+ref+'" s="'+(style||0)+'"><v>'+Number(value||0)+'</v></c>';
  }

  function seatRoundSheetXml(tables, roundNo, date){
    var rows=[];
    var merges=['A1:C1'];
    var r=1;

    rows.push(
      '<row r="1" ht="25" customHeight="1">'
      +seatInlineCell('A1',date+' · '+roundNo+'회차 자리배정',1)
      +'</row>'
    );

    r=2;
    rows.push(
      '<row r="2" ht="20" customHeight="1">'
      +seatInlineCell('A2','테이블',2)
      +seatInlineCell('B2','No.',2)
      +seatInlineCell('C2','이름',2)
      +'</row>'
    );

    r=3;
    tables.forEach(function(tb,ti){
      var ordered=seatOrderedTable(tb);
      if(!ordered.length) return;

      var startRow=r;
      ordered.forEach(function(p,pi){
        var cells='';
        if(pi===0) cells+=seatInlineCell('A'+r,'테이블 '+(ti+1),3);
        cells+=seatNumberCell('B'+r,pi+1,4);
        cells+=seatInlineCell('C'+r,p.name||'이름 없음',5);
        rows.push('<row r="'+r+'" ht="22" customHeight="1">'+cells+'</row>');
        r++;
      });

      if(ordered.length>1){
        merges.push('A'+startRow+':A'+(r-1));
      }
    });

    var mergeXml='<mergeCells count="'+merges.length+'">'
      +merges.map(function(m){return '<mergeCell ref="'+m+'"/>';}).join('')
      +'</mergeCells>';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      +'<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
      +'<sheetFormatPr defaultRowHeight="15"/>'
      +'<cols>'
      +'<col min="1" max="1" width="14" customWidth="1"/>'
      +'<col min="2" max="2" width="7" customWidth="1"/>'
      +'<col min="3" max="3" width="22" customWidth="1"/>'
      +'</cols>'
      +'<sheetData>'+rows.join('')+'</sheetData>'
      +mergeXml
      +'<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
      +'</worksheet>';
  }

  function seatStylesXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      +'<fonts count="3">'
      +'<font><sz val="11"/><name val="Arial"/></font>'
      +'<font><b/><sz val="14"/><color rgb="FF172033"/><name val="Arial"/></font>'
      +'<font><b/><sz val="11"/><color rgb="FF172033"/><name val="Arial"/></font>'
      +'</fonts>'
      +'<fills count="5">'
      +'<fill><patternFill patternType="none"/></fill>'
      +'<fill><patternFill patternType="gray125"/></fill>'
      +'<fill><patternFill patternType="solid"><fgColor rgb="FFF6F1E6"/><bgColor indexed="64"/></patternFill></fill>'
      +'<fill><patternFill patternType="solid"><fgColor rgb="FFF7F8FA"/><bgColor indexed="64"/></patternFill></fill>'
      +'<fill><patternFill patternType="solid"><fgColor rgb="FFFFF9ED"/><bgColor indexed="64"/></patternFill></fill>'
      +'</fills>'
      +'<borders count="2">'
      +'<border><left/><right/><top/><bottom/><diagonal/></border>'
      +'<border>'
      +'<left style="thin"><color rgb="FFB8BDC7"/></left>'
      +'<right style="thin"><color rgb="FFB8BDC7"/></right>'
      +'<top style="thin"><color rgb="FFB8BDC7"/></top>'
      +'<bottom style="thin"><color rgb="FFB8BDC7"/></bottom>'
      +'<diagonal/>'
      +'</border>'
      +'</borders>'
      +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      +'<cellXfs count="6">'
      +'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
      +'<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
      +'<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
      +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
      +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
      +'</cellXfs>'
      +'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      +'</styleSheet>';
  }

  function seatWorkbookXml(roundCount){
    var sheets=[];
    for(var i=1;i<=roundCount;i++){
      sheets.push('<sheet name="'+i+'회차" sheetId="'+i+'" r:id="rId'+i+'"/>');
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      +'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      +'<bookViews><workbookView/></bookViews>'
      +'<sheets>'+sheets.join('')+'</sheets>'
      +'</workbook>';
  }

  function seatWorkbookRelsXml(roundCount){
    var rels=[];
    for(var i=1;i<=roundCount;i++){
      rels.push(
        '<Relationship Id="rId'+i+'" '
        +'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        +'Target="worksheets/sheet'+i+'.xml"/>'
      );
    }
    rels.push(
      '<Relationship Id="rId'+(roundCount+1)+'" '
      +'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
      +'Target="styles.xml"/>'
    );
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +rels.join('')
      +'</Relationships>';
  }

  function seatContentTypesXml(roundCount){
    var sheets='';
    for(var i=1;i<=roundCount;i++){
      sheets+='<Override PartName="/xl/worksheets/sheet'+i+'.xml" '
        +'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      +'<Default Extension="xml" ContentType="application/xml"/>'
      +'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      +'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      +sheets
      +'</Types>';
  }

  function seatRootRelsXml(){
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      +'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      +'<Relationship Id="rId1" '
      +'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
      +'Target="xl/workbook.xml"/>'
      +'</Relationships>';
  }

  var SEAT_CRC_TABLE=null;
  function seatCrc32(bytes){
    if(!SEAT_CRC_TABLE){
      SEAT_CRC_TABLE=[];
      for(var n=0;n<256;n++){
        var c=n;
        for(var k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
        SEAT_CRC_TABLE[n]=c>>>0;
      }
    }
    var crc=0xFFFFFFFF;
    for(var i=0;i<bytes.length;i++){
      crc=SEAT_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);
    }
    return (crc^0xFFFFFFFF)>>>0;
  }

  function seatWriteU16(view,off,v){ view.setUint16(off,v,true); }
  function seatWriteU32(view,off,v){ view.setUint32(off,v>>>0,true); }

  function seatZipBlob(files){
    var enc=new TextEncoder();
    var localParts=[];
    var centralParts=[];
    var offset=0;
    var centralSize=0;

    files.forEach(function(file){
      var nameBytes=enc.encode(file.name);
      var dataBytes=typeof file.data==='string' ? enc.encode(file.data) : file.data;
      var crc=seatCrc32(dataBytes);

      var local=new Uint8Array(30+nameBytes.length);
      var lv=new DataView(local.buffer);
      seatWriteU32(lv,0,0x04034b50);
      seatWriteU16(lv,4,20);
      seatWriteU16(lv,6,0x0800); /* UTF-8 */
      seatWriteU16(lv,8,0);      /* STORE */
      seatWriteU16(lv,10,0);
      seatWriteU16(lv,12,0);
      seatWriteU32(lv,14,crc);
      seatWriteU32(lv,18,dataBytes.length);
      seatWriteU32(lv,22,dataBytes.length);
      seatWriteU16(lv,26,nameBytes.length);
      seatWriteU16(lv,28,0);
      local.set(nameBytes,30);

      var central=new Uint8Array(46+nameBytes.length);
      var cv=new DataView(central.buffer);
      seatWriteU32(cv,0,0x02014b50);
      seatWriteU16(cv,4,20);
      seatWriteU16(cv,6,20);
      seatWriteU16(cv,8,0x0800);
      seatWriteU16(cv,10,0);
      seatWriteU16(cv,12,0);
      seatWriteU16(cv,14,0);
      seatWriteU32(cv,16,crc);
      seatWriteU32(cv,20,dataBytes.length);
      seatWriteU32(cv,24,dataBytes.length);
      seatWriteU16(cv,28,nameBytes.length);
      seatWriteU16(cv,30,0);
      seatWriteU16(cv,32,0);
      seatWriteU16(cv,34,0);
      seatWriteU16(cv,36,0);
      seatWriteU32(cv,38,0);
      seatWriteU32(cv,42,offset);
      central.set(nameBytes,46);

      localParts.push(local,dataBytes);
      centralParts.push(central);
      offset += local.length + dataBytes.length;
      centralSize += central.length;
    });

    var end=new Uint8Array(22);
    var ev=new DataView(end.buffer);
    seatWriteU32(ev,0,0x06054b50);
    seatWriteU16(ev,4,0);
    seatWriteU16(ev,6,0);
    seatWriteU16(ev,8,files.length);
    seatWriteU16(ev,10,files.length);
    seatWriteU32(ev,12,centralSize);
    seatWriteU32(ev,16,offset);
    seatWriteU16(ev,20,0);

    return new Blob(
      localParts.concat(centralParts).concat([end]),
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
    );
  }

  function seatBuildXlsxBlob(res){
    var files=[
      {name:'[Content_Types].xml',data:seatContentTypesXml(res.rounds.length)},
      {name:'_rels/.rels',data:seatRootRelsXml()},
      {name:'xl/workbook.xml',data:seatWorkbookXml(res.rounds.length)},
      {name:'xl/_rels/workbook.xml.rels',data:seatWorkbookRelsXml(res.rounds.length)},
      {name:'xl/styles.xml',data:seatStylesXml()}
    ];

    res.rounds.forEach(function(tables,ri){
      files.push({
        name:'xl/worksheets/sheet'+(ri+1)+'.xml',
        data:seatRoundSheetXml(tables,ri+1,res.date)
      });
    });

    return seatZipBlob(files);
  }

  function seatOfferDownload(blob,filename){
    /* 아이폰·아이패드는 공유 시트(파일 앱에 저장·카톡 전송)로, 공유를 못 열면 아래 링크 방식으로 (2026-10-02) */
    var shared=iroShareFile(blob,filename);
    if(shared){ shared.catch(function(err){ if(!err || err.name!=='AbortError') seatOfferLink(blob,filename); }); return; }
    seatOfferLink(blob,filename);
  }
  function seatOfferLink(blob,filename){
    /* «다운로드 다시 클릭» 링크는 지금 보고 있는 탭(신청 내역/자리 배정)에 띄웁니다 */
    var listPane=$a('sg-body') && $a('sg-body').closest('.sg-pane');
    var link=$a(listPane && !listPane.hidden ? 'sg-download-link' : 'seat-download-link');
    var url=URL.createObjectURL(blob);

    if(link){
      var old=link.dataset.url;
      if(old){ try{URL.revokeObjectURL(old);}catch(e){} }
      link.href=url;
      link.download=filename;
      link.dataset.url=url;
      link.hidden=false;
      link.style.display='inline-flex';
      link.textContent='다운로드 다시 클릭';
    }

    var a=document.createElement('a');
    a.href=url;
    a.download=filename;
    a.rel='noopener';
    a.style.display='none';
    /* 편집 모드의 «링크 막기»에 걸리지 않도록 열려 있는 관리자 창 안에서 누릅니다 */
    (document.querySelector('.adm-dim.on') || document.body).appendChild(a);
    a.click();
    setTimeout(function(){try{a.remove();}catch(e){}},300);
  }

  function seatXlsx(){
    var res=SEAT.result;
    if(!res) return alert('먼저 자리 배정을 해 주세요.');

    var btn=$a('seat-xlsx');
    var oldText=btn?btn.textContent:'';
    try{
      if(btn){btn.disabled=true;btn.textContent='XLSX 만드는 중…';}
      var blob=seatBuildXlsxBlob(res);
      seatOfferDownload(blob,'irotomo-자리배정-'+res.date+'.xlsx');
    }catch(err){
      console.error('native xlsx export failed',err);
      alert('XLSX 파일을 만들지 못했습니다.\n\n'+(err&&err.message?err.message:String(err)));
    }finally{
      if(btn){btn.disabled=false;btn.textContent=oldText||'테이블표 XLSX';}
    }
  }

  /* ── 운영용 테이블표 CSV ─────────────────────────────────
     엑셀에서 바로 열었을 때 아래처럼 보이도록 만듭니다.

       1회차
       테이블 1 | 1 | 김개똥
                | 2 | 이아무개
                | 3 | 상구
       테이블 2 | 1 | ...

     CSV는 셀 병합 자체를 저장할 수 없으므로,
     테이블명은 각 테이블의 첫 번째 행에만 쓰고 아래 행은 비웁니다.
     회차는 실제 생성된 회차 수만큼(1~6회) 자동 출력됩니다. */
  function seatTableCsv(){
    var res=SEAT.result;
    if(!res) return alert('먼저 자리 배정을 해 주세요.');

    var lines=[];
    lines.push([res.date+' 자리배정','',''].map(csvQuote).join(','));
    lines.push('');

    res.rounds.forEach(function(tables,ri){
      lines.push([String(ri+1)+'회차','',''].map(csvQuote).join(','));

      tables.forEach(function(tb,ti){
        /* 관리자 화면과 동일하게 일본 → 한국 순, 각 그룹 안 이름순 */
        var ordered=seatOrderedTable(tb);

        ordered.forEach(function(p,pi){
          lines.push([
            pi===0 ? ('테이블 '+(ti+1)) : '',
            pi+1,
            p.name || '이름 없음'
          ].map(csvQuote).join(','));
        });
      });

      /* 회차 사이 한 줄 비우기 */
      if(ri < res.rounds.length-1) lines.push('');
    });

    triggerCsvDownload(
      'irotomo-테이블표-'+res.date+'.csv',
      lines.join('\r\n')
    );
  }

  function seatCsv(){
    var res=SEAT.result; if(!res) return alert('먼저 자리 배정을 해 주세요.');
    var lines=[['날짜','회차','테이블','구분','이름','국적'].map(csvQuote).join(',')];
    res.rounds.forEach(function(tables,ri){
      tables.forEach(function(tb,ti){
        tb.forEach(function(p){
          lines.push([res.date,ri+1,ti+1,(+p.staff===1?'스탭':'참가자'),p.name||'',seatNat(p)].map(csvQuote).join(','));
        });
      });
    });
    triggerCsvDownload(
      'irotomo-자리배정-'+res.date+'.csv',
      lines.join('\r\n')
    );
  }

  function seatStartMin(){
    if (seatPickOn()) {
      var v = ($a('seat-start') && $a('seat-start').value) || '18:00';
      var a = v.split(':');
      return Math.max(0, Math.min(1439, (+a[0] || 18) * 60 + (+a[1] || 0)));
    }
    var m=/(\d{1,2})\s*:\s*(\d{2})/.exec(String((window.SCHED && SCHED.time) || '15:00'));
    return m ? (+m[1]*60 + +m[2]) : 900;
  }

  function seatLoadStatus(){
    var d=$a('seat-date') && $a('seat-date').value, box=$a('seat-public-state');
    if(!d || !box || !ADMIN.token) return;
    box.className='off'; box.textContent='저장된 자리배정을 불러오는 중…';
    apiPost({action:'seat_status',token:ADMIN.token,date:d,scope:seatScope()}).then(function(x){
      if(!x || !x.ok) throw new Error((x&&x.error)||'fail');
      var st=x.setting, saved=x.assignment_rows||[];

      /* 날짜별 자리배정 조건도 같이 복원합니다. */
      if(st){
        if($a('seat-size')) $a('seat-size').value=+st.table_size||6;
        if($a('seat-max')) $a('seat-max').value=+st.max_tables||12;
        if($a('seat-rounds')) $a('seat-rounds').value=+st.rounds||3;
        if($a('seat-paid')) $a('seat-paid').value=(+st.paid_only===0?'all':'paid');
      }

      if(st && +st.published===1){
        box.className='on';
        box.textContent='현재 참가자에게 공개 중 · 저장된 배정 '+(x.assignments||0)+'건 · '+(+st.rounds||1)+'회차'+(+st.has_pass===1?' · 비밀번호 설정됨':'');
      }else if(st){
        box.className='off';
        box.textContent='현재 비공개 · 저장된 배정 '+(x.assignments||0)+'건'+(+st.has_pass===1?' · 비밀번호 설정됨':'');
      }else{
        box.className='off'; box.textContent='아직 저장된 자리배정이 없습니다.';
      }

      /* 저장된 TABLE 화면을 날짜별로 그대로 복원합니다. */
      if(st && saved.length){
        var roundsN=Math.max(1,+st.rounds||1), rounds=[];
        var people={}, maxTable=0;
        saved.forEach(function(a){
          var t=Math.max(1,+a.table_no||1);
          if(t>maxTable) maxTable=t;
          /* 서버의 seat_status 는 신규/재참가 이력을 돌려주지 않습니다.
             화면에 이미 있는 신청자 목록(SG.rows)에서 같은 사람을 찾아
             prior_visit_count 를 채웁니다. 못 찾으면 뱃지를 숨깁니다. */
          var src=(SG.rows||[]).find(function(x){ return String(x.id)===String(a.signup_id); });
          people[String(a.signup_id)]={
            id:String(a.signup_id), name:a.name || '(삭제된 신청자)', nat:a.nat || '',
            staff:+a.staff||0, paid:+a.paid||0, attended:+a.attended||0, createdAt:+a.createdAt||0,
            prior_visit_count: src ? (+src.prior_visit_count||0) : -1
          };
        });
        for(var ri=0;ri<roundsN;ri++){
          rounds[ri]=Array.from({length:maxTable},function(){return [];});
        }
        saved.forEach(function(a){
          var ri=(+a.round||1)-1, ti=(+a.table_no||1)-1;
          if(rounds[ri] && rounds[ri][ti]) rounds[ri][ti].push(people[String(a.signup_id)]);
        });
        var uniq=Object.keys(people).map(function(k){return people[k];});
        SEAT.result={
          date:d, rows:uniq, rounds:rounds,
          cap:+st.table_size||6, maxTables:+st.max_tables||maxTable,
          serial:++SEAT.serial, saved:true
        };
        seatPaint();
        var msg=$a('seat-state');
        if(msg){
          msg.classList.remove('err');
          msg.textContent='저장된 자리배정을 불러왔습니다. 날짜를 바꿨다가 돌아와도 이 배정이 그대로 표시됩니다.';
        }
      }else{
        SEAT.result=null; seatPaint();
      }
    }).catch(function(){
      box.className='off'; box.textContent='저장된 자리배정을 불러오지 못했습니다.';
      SEAT.result=null; seatPaint();
    });
  }

  function seatAssignmentsPayload(res){
    var a=[];
    res.rounds.forEach(function(tables,ri){
      tables.forEach(function(tb,ti){
        tb.forEach(function(p){ if(p && p.id) a.push({signup_id:String(p.id),round:ri+1,table_no:ti+1}); });
      });
    });
    return a;
  }

  function seatPublish(){
    var res=SEAT.result, st=$a('seat-state'), pass=($a('seat-pass').value||'').trim();
    /* cf-67: 참가자 비밀번호는 참가 날짜(월일 4자리, 예 1012)로 고정합니다. 서버도 날짜를 그대로 받아 줍니다. */
    if(!pass && res && res.date){ pass=res.date.slice(5).replace('-',''); $a('seat-pass').value=pass; }
    if(!res){ alert('먼저 자리 배정을 해 주세요.'); return; }
    if(res.date!==$a('seat-date').value){ alert('현재 선택한 날짜로 다시 자리 배정을 해 주세요.'); return; }
    if(pass.length<3){ $a('seat-pass').focus(); alert('참가자 조회 비밀번호를 3자 이상 입력해 주세요.'); return; }
    var assignments=seatAssignmentsPayload(res);
    if(!assignments.length){ alert('저장할 배정 결과가 없습니다.'); return; }
    if(!confirm(res.date+' 자리배정을 저장하고 참가자에게 공개할까요?\n\n조회 페이지: irotomo.com/seat.html')) return;
    st.classList.remove('err'); st.textContent='저장·공개 중…';
    apiPost({action:'seat_save',token:ADMIN.token,date:res.date,password:pass,scope:seatScope(),
      rounds:res.rounds.length,start_min:seatStartMin(),interval_min:seatIntervalMin(),
      table_size:+$a('seat-size').value||6,max_tables:+$a('seat-max').value||12,
      paid_only:($a('seat-paid').value==='paid'?1:0),assignments:assignments})
      .then(function(d){
        if(!d || !d.ok) throw new Error((d&&d.error)||'fail');
        st.textContent='저장하고 공개했습니다. 날짜별 TABLE 배정도 D1에 보관됩니다.';
        seatLoadStatus();
      }).catch(function(e){
        st.textContent='저장하지 못했습니다 ('+e.message+')'; st.classList.add('err');
      });
  }

  function seatHide(){
    var d=$a('seat-date').value, st=$a('seat-state');
    if(!d) return;
    if(!confirm(d+' 자리 조회를 참가자에게 비공개로 바꿀까요?')) return;
    st.classList.remove('err'); st.textContent='공개 중지 중…';
    apiPost({action:'seat_unpublish',token:ADMIN.token,date:d,scope:seatScope()}).then(function(x){
      if(!x || !x.ok) throw new Error((x&&x.error)||'fail');
      st.textContent='참가자 공개를 중지했습니다.'; seatLoadStatus();
    }).catch(function(e){ st.textContent='공개 중지에 실패했습니다 ('+e.message+')';st.classList.add('err'); });
  }

  on('seat-mode','change',function(){seatManualPaint();SEAT.result=null;seatPaint();});
  on('seat-max','input',function(){if(seatManualOn())seatManualPaint();});
  on('seat-size','input',function(){if(seatManualOn())seatManualPaint();});
  on('seat-save-set','click',seatPresetSave);
  on('seat-load-set','click',seatPresetLoad);
  on('seat-run','click',seatGenerate);
  on('seat-reroll','click',seatGenerate);
  on('seat-xlsx','click',seatXlsx);
  on('seat-table-csv','click',seatTableCsv);
  on('seat-csv','click',seatCsv);
  on('seat-publish','click',seatPublish);
  on('seat-hide','click',seatHide);
  on('seat-date','change',function(){
    setTimeout(function(){ seatManualSum(); },0);
    SEAT.result=null;
    var b=$a('seat-body'); if(b) b.innerHTML='<p class="seat-empty">저장된 자리배정을 불러오는 중…</p>';
    seatLoadStatus();
  });
  on('seat-paid','change',function(){SEAT.result=null;seatManualSum();seatPaint();});

  /* ── 명단표 CSV ───────────────────────────────────────────
     XLSX 방식은 제거하고, 사용자가 쓰던 명단표 형식으로 CSV를 생성합니다.
     일본인 참가자 → 합계 → 한국인 참가자 → 합계 → 스탭 → 합계
     마지막 열에는 출석 여부를 함께 넣습니다. */
  /* ── 이름 정렬 ────────────────────────────────────────────
     한국인은 가나다순, 일본인은 오십음순으로 세웁니다.

     일본어는 카타카나를 히라가나로 바꿔 통일한 뒤 비교합니다.
     한자 이름은 읽는 법을 알 수 없어 오십음순으로 세울 수 없으므로,
     가나로 시작하는 이름을 먼저 두고 한자 이름을 뒤에 붙입니다. */
  function nameKana(v){
    return String(v || '').replace(/[\u30a1-\u30f6]/g, function(c){
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  /* 첫 글자로 갈래를 나눕니다 — 0 가나 · 1 한글 · 2 한자(그 외) */
  function nameGroup(v){
    var c = String(v || '').trim().charAt(0);
    if (/[\u3041-\u3096\u30a1-\u30f6]/.test(c)) return 0;
    if (/[\uac00-\ud7a3]/.test(c)) return 1;
    return 2;
  }
  function nameSort(list, ja){
    return list.slice().sort(function(a, b){
      var x = String(a.name || ''), y = String(b.name || '');
      if (!ja) return x.localeCompare(y, 'ko');
      /* 일본인 명단은 «가나 → 한글 → 한자» 순으로 묶고 각 묶음 안에서 정렬합니다.
         한자는 읽는 법을 알 수 없어 오십음순으로 세울 수 없으므로 뒤에 둡니다. */
      var gx = nameGroup(x), gy = nameGroup(y);
      if (gx !== gy) return gx - gy;
      if (gx === 1) return x.localeCompare(y, 'ko');
      return nameKana(x).localeCompare(nameKana(y), 'ja');
    });
  }

  function csvQuote(v){
    var t = String(v == null ? '' : v);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function rosterCsvLines(rows){
    var HEAD = ['No.','구분','이름','국적','음료','결제상태','메모','출석'];
    var isJa = function(r){ return /日本|일본/.test(String(r.nat || '')); };
    /* 일본인은 오십음순, 한국인은 가나다순으로 세웁니다 */
    var blocks = [
      ['일본인참가자', nameSort(rows.filter(function(r){ return +r.staff !== 1 &&  isJa(r); }), true)],
      ['한국인참가자', nameSort(rows.filter(function(r){ return +r.staff !== 1 && !isJa(r); }), false)],
      ['스탭합계',     nameSort(rows.filter(function(r){ return +r.staff === 1; }), false)]
    ];

    var out = [];
    blocks.forEach(function(b){
      var label = b[0], list = b[1];
      if (!list.length) return;

      out.push(HEAD.map(csvQuote).join(','));

      list.forEach(function(r, idx){
        out.push([
          String(idx + 1),
          (+r.staff === 1 ? '스탭' : '참가자'),
          r.name || '',
          r.nat || '',
          SG_DRINK[r.drink] || '',
          (+r.paid === 1 ? '입금' : (+r.onsite === 1 ? '현장지불' : '미입금')),
          r.memo || '',
          (+r.attended === 1 ? '출석' : '')
        ].map(csvQuote).join(','));
      });

      /* 사용자가 쓰던 합계 행 형태를 유지 */
      out.push(['','','','',label,'합계',String(list.length),''].map(csvQuote).join(','));
    });

    return out;
  }

  /* 명단표는 브라우저의 실제 <a download> 링크로 내려받습니다.
     숨겨진 링크를 JS로 강제 클릭하지 않아 Edge/Chrome에서 더 안정적입니다. */
  function rosterCsvText(rows){
    return '\ufeff' + rosterCsvLines(rows).join('\r\n');
  }

  function rosterDataUrl(rows){
    return 'data:text/csv;charset=utf-8,' + encodeURIComponent(rosterCsvText(rows));
  }

  function prepareRosterLink(a, date, rows){
    var list = (rows || SG.rows || []).filter(function(r){
      return !date || r.date === date;
    });

    if (!list.length) {
      a.href = '#';
      a.removeAttribute('download');
      return false;
    }

    a.href = rosterDataUrl(list);
    a.download = 'irotomo-명단표-' + date + '.csv';
    return true;
  }

  on('sg-roster', 'click', function(e){
    var rows = sgVisible();
    if (!rows.length) {
      e.preventDefault();
      alert('내려받을 신청이 없습니다.');
      return;
    }

    var days = {};
    rows.forEach(function(r){ if (r.date) days[r.date] = 1; });
    var keys = Object.keys(days).sort();

    if (!keys.length) {
      e.preventDefault();
      alert('날짜가 지정된 신청자가 없습니다.');
      return;
    }

    /* 여러 날짜가 표시되어도 가장 가까운 앞으로의 모임을 선택합니다. */
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth()+1).padStart(2,'0');
    var d = String(today.getDate()).padStart(2,'0');
    var todayKey = y + '-' + m + '-' + d;

    var target = keys.find(function(k){ return k >= todayKey; }) || keys[keys.length - 1];

    /* 중요한 점: preventDefault 하지 않습니다.
       이 클릭 자체의 기본 동작으로 브라우저가 CSV를 내려받습니다. */
    prepareRosterLink(this, target, rows);
  });

  /* 원본 CSV는 기존 기능을 유지하되 공용 helper는 별도로 둡니다. */
  function triggerCsvDownload(filename, text){
    try {
      var blob = new Blob(['\ufeff', String(text || '')], {
        type:'text/csv;charset=utf-8'
      });
      seatOfferDownload(blob,filename);
      return true;
    } catch (e) {
      console.error('csv download failed', e);
      alert('파일을 만들지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      return false;
    }
  }

  on('sg-csv', 'click', function(){
    var rows = sgVisible();
    if (!rows.length) return alert('내려받을 신청이 없습니다.');
    var head = ['날짜','구분','이름','국적','이메일','음료','입금','출석','SNS','경로','메모','신청시각'];
    var q = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(q).join(',')];
    rows.forEach(function(r){
      lines.push([r.date, (+r.staff === 1 ? '스탭' : '참가자'), r.name, r.nat, r.email,
        SG_DRINK[r.drink] || '', (+r.paid === 1 ? '입금' : (+r.onsite === 1 ? '현장지불' : '미입금')),
        (+r.attended === 1 ? '출석' : '미출석'), r.sns, r.src, r.memo,
        new Date(r.createdAt).toLocaleString('ko-KR')].map(q).join(','));
    });
    /* BOM 을 붙여야 엑셀에서 한글이 깨지지 않습니다 */
    triggerCsvDownload(
      'irotomo-signups-' + (SG.filter === 'day' ? SG.day : new Date().toISOString().slice(0,10)) + '.csv',
      lines.join('\r\n')
    );
  });



  /* ══ 2026-10-02 명단 날짜별 보기 · 파일 받기 보완 · 미입금 안내(독촉) 메일 ══ */

  /* 오늘(한국 시각) — 서버의 «지난 모임» 판단과 같은 기준입니다 */
  function kstToday(){ return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }

  /* ── 날짜별 명단 보기 (지난 모임 포함) ──────────────────── */
  function sgPressFilter(f){
    document.querySelectorAll('#sg-filter button').forEach(function(x){
      x.setAttribute('aria-pressed', String(x.dataset.f === f));
    });
  }
  function sgFillDays(){
    var sel = $a('sg-day'); if (!sel) return;
    var cur = sel.value, days = {}, today = kstToday();
    (SG.rows || []).forEach(function(r){
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) return;
      var d = days[r.date] || (days[r.date] = { n: 0 });
      if (+r.staff !== 1) d.n++;
    });
    var keys = Object.keys(days).sort().reverse();
    sel.innerHTML = '';
    var first = document.createElement('option');
    first.value = ''; first.textContent = '날짜별 보기 (지난 모임 포함)';
    sel.appendChild(first);
    keys.forEach(function(k){
      var o = document.createElement('option');
      o.value = k;
      o.textContent = opsDateLabel(k) + (k >= today ? ' · 예정' : '') + ' · ' + days[k].n + '명';
      sel.appendChild(o);
    });
    if (cur && days[cur]) sel.value = cur;
    else if (SG.filter === 'day') { SG.filter = 'soon'; sgPressFilter('soon'); }
  }
  on('sg-day', 'change', function(){
    if (this.value) { SG.filter = 'day'; SG.day = this.value; sgPressFilter(''); }
    else { SG.filter = 'soon'; sgPressFilter('soon'); }
    paintSg();
  });
  document.querySelectorAll('#sg-filter button').forEach(function(b){
    b.addEventListener('click', function(){ var s = $a('sg-day'); if (s) s.value = ''; });
  });

  /* ── 아이폰·아이패드: <a download> 가 잘 안 되므로 공유 시트로 저장(파일 앱·카톡 등) ── */
  function iroIsIOS(){
    return /iP(hone|ad|od)/.test(navigator.userAgent || '') ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function iroShareFile(blob, filename){
    try {
      if (!iroIsIOS() || !navigator.share || !navigator.canShare || typeof File !== 'function') return false;
      var f = new File([blob], filename, { type: blob.type || 'text/csv' });
      if (!navigator.canShare({ files: [f] })) return false;
      return navigator.share({ files: [f], title: filename });
    } catch (e) { return false; }
  }
  /* 명단표 링크(data: 주소)도 아이폰에서는 공유 시트로 넘깁니다 */
  on('adm-signups', 'click', function(e){
    var a = e.target.closest && e.target.closest('a[download]');
    if (!a || e.defaultPrevented || !iroIsIOS()) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('data:text/csv') !== 0) return;
    var name = a.getAttribute('download') || 'irotomo.csv';
    var text = decodeURIComponent(href.slice(href.indexOf(',') + 1));
    var shared = iroShareFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), name);
    if (!shared) return;
    e.preventDefault();
    shared.catch(function(err){
      if (err && err.name === 'AbortError') return;
      var t = document.createElement('a'); t.href = href; t.download = name; t.style.display = 'none';
      (document.querySelector('.adm-dim.on') || document.body).appendChild(t); t.click(); t.remove();
    });
  });

  /* ── 미입금 안내(독촉) 메일 ──────────────────────────────
     입금·현장지불 처리가 안 된 «다가오는 모임» 참가자에게 보냅니다.
     문구는 보내기 전에 고칠 수 있고, 고친 문구는 이 기기(브라우저)에 저장됩니다.
     {name} → 참가자 이름, {date} → 모임 날짜. 일본인은 일본어, 그 외는 한국어 메일이 나갑니다.
     서버(remind_unpaid, Worker cf-63)가 입금·현장지불·스탭·대기·지난 모임을 한 번 더 걸러 냅니다. */
  /* v2 (2026-10-02): 기본 문구를 ドリンク代 로 바꿔서, 예전에 저장된 문구 대신 새 기본 문구가 나오도록 키를 올렸습니다 */
  var REMIND_KEY = 'irotomo-remind-tpl-v2';
  var REMIND_DEFAULT = {
    ja: {
      subject: '【いろとも】ドリンク代のお振込みについて（{date}）',
      body: [
        '{name}様',
        'お世話になっております。',
        '日韓交流会いろともです。',
        '',
        'この度は、交流会にお申し込みいただきありがとうございます。',
        '',
        '現在、ドリンク代のご入金がまだ確認できていないため、ご連絡いたしました。',
        '恐れ入りますが、お申し込み時の自動返信メールに記載されている口座へ、ドリンク代のお振込みをお願いいたします。',
        '',
        'なお、ご入金後のキャンセル・返金につきましては、{deadline}までとさせていただいております。',
        'それ以降のキャンセルにつきましては、返金ができませんので、あらかじめご了承ください。',
        '',
        'また、韓国の口座をお持ちでないなど、お振込みが難しい場合は、別途このメールにご返信ください。',
        '当日、現金でのお支払いも可能です。',
        '',
        '会場のカフェは週末は通常営業を行っておらず、参加人数に合わせて事前に準備をお願いしておりますため、当日現金でお支払いいただく場合も、予約確定後のキャンセルはできる限りお控えいただけますと幸いです。',
        '',
        'お手数をおかけいたしますが、何卒よろしくお願いいたします。',
        '',
        '日韓交流会いろとも'
      ].join('\n')
    },
    ko: {
      subject: '[이로토모] 음료비 입금 안내 ({date})',
      body: [
        '{name}님',
        '안녕하세요, 한일교류회 이로토모입니다.',
        '',
        '이번 교류회에 신청해 주셔서 감사합니다.',
        '',
        '현재 음료비 입금이 아직 확인되지 않아 연락드립니다.',
        '번거로우시겠지만 신청 시 받으신 자동 회신 메일에 안내된 계좌로 음료비를 입금해 주세요.',
        '',
        '입금 후 취소·환불은 {deadline}까지 가능합니다.',
        '그 이후의 취소는 환불이 어려운 점 미리 양해 부탁드립니다.',
        '',
        '입금이 어려우신 경우에는 이 메일에 답장으로 알려 주세요.',
        '당일 현금 결제도 가능합니다.',
        '',
        '모임 장소인 카페는 주말에 일반 영업을 하지 않고, 참가 인원에 맞춰 미리 준비를 부탁드리고 있습니다. 당일 현금으로 결제하시는 경우에도 예약 확정 후 취소는 가급적 삼가 주시면 감사하겠습니다.',
        '',
        '번거롭게 해 드려 죄송합니다. 잘 부탁드립니다.',
        '',
        '한일교류회 이로토모'
      ].join('\n')
    }
  };
  var REMIND_CHUNK = 25;   /* Worker 의 REMIND_MAX 와 같게 */
  var RM = { rows: [], date: '', lang: 'ja', tpl: null };

  function remindIsJa(r){ return /日本|일본|japan/i.test(String(r.nat || '')); }
  function remindEligible(r){
    return +r.staff !== 1 && +r.waitlisted !== 1 && +r.paid !== 1 && +r.onsite !== 1 &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(r.email || '').trim()) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) && r.date >= kstToday();
  }
  function remindLoadTpl(){
    try {
      var t = JSON.parse(localStorage.getItem(REMIND_KEY) || 'null');
      if (t && t.ja && t.ko && t.ja.body && t.ko.body) return t;
    } catch (e) {}
    return JSON.parse(JSON.stringify(REMIND_DEFAULT));
  }
  function remindBox(){
    var box = $a('adm-remind'); if (box) return box;
    box = document.createElement('div');
    box.className = 'adm-dim'; box.id = 'adm-remind';
    box.innerHTML =
      '<div class="adm-card remind-card" role="dialog" aria-modal="true" aria-labelledby="rm-title">' +
        '<div class="stats-head"><h3 id="rm-title">미입금 안내 메일</h3>' +
          '<button class="x" type="button" data-rm-close aria-label="닫기" style="margin-left:auto">&#10005;</button></div>' +
        '<p class="rm-sub" id="rm-sub"></p>' +
        '<div class="rm-list" id="rm-list"></div>' +
        '<div class="rm-tabs" id="rm-tabs">' +
          '<button type="button" data-l="ja" aria-pressed="true">일본어 메일</button>' +
          '<button type="button" data-l="ko" aria-pressed="false">한국어 메일</button></div>' +
        '<label class="rm-f"><span>제목</span><input type="text" id="rm-subj" maxlength="150"></label>' +
        '<label class="rm-f"><span>본문</span><textarea id="rm-body" rows="14"></textarea></label>' +
        '<p class="rm-hint">{name} 은 참가자 이름, {date} 는 모임 날짜, {deadline} 은 환불 마감(금요일 12:00 · 금 휴일 회차는 목요일 12:00)으로 바뀝니다. 고친 문구는 이 기기에 저장되어 다음에도 그대로 나옵니다.</p>' +
        '<label class="rm-bank"><input type="checkbox" id="rm-bank"> 입금 계좌 안내 상자도 메일 아래에 함께 넣기</label>' +
        '<div class="rm-actions"><button type="button" id="rm-reset">기본 문구로</button><span class="rm-sp"></span>' +
          '<button type="button" data-rm-close>닫기</button>' +
          '<button type="button" class="primary" id="rm-send">보내기</button></div>' +
        '<p class="rm-state" id="rm-state" role="status"></p>' +
      '</div>';
    document.body.appendChild(box);
    box.addEventListener('click', function(e){
      if (e.target === box || (e.target.closest && e.target.closest('[data-rm-close]'))) closeDim(box);
    });
    box.querySelectorAll('#rm-tabs button').forEach(function(b){
      b.addEventListener('click', function(){ remindKeep(); RM.lang = b.dataset.l; remindPaintText(); });
    });
    $a('rm-reset').addEventListener('click', function(){
      if (!confirm('일본어·한국어 메일 문구를 기본 문구로 되돌릴까요?')) return;
      RM.tpl = JSON.parse(JSON.stringify(REMIND_DEFAULT));
      try { localStorage.removeItem(REMIND_KEY); } catch (e) {}
      remindPaintText();
    });
    $a('rm-list').addEventListener('change', remindPaintCount);
    $a('rm-send').addEventListener('click', remindSend);
    return box;
  }
  function remindKeep(){
    if (!RM.tpl) return;
    RM.tpl[RM.lang] = { subject: $a('rm-subj').value, body: $a('rm-body').value };
  }
  function remindPaintText(){
    $a('rm-subj').value = RM.tpl[RM.lang].subject;
    $a('rm-body').value = RM.tpl[RM.lang].body;
    document.querySelectorAll('#rm-tabs button').forEach(function(b){
      b.setAttribute('aria-pressed', String(b.dataset.l === RM.lang));
    });
  }
  function remindChecked(){
    var ids = {};
    document.querySelectorAll('#rm-list input[type=checkbox]').forEach(function(c){
      if (c.checked && !c.disabled) ids[c.value] = 1;
    });
    return RM.rows.filter(function(r){ return ids[String(r.id)]; });
  }
  function remindPaintCount(){
    var sel = remindChecked(), ja = sel.filter(remindIsJa).length;
    var tabs = document.querySelectorAll('#rm-tabs button');
    tabs[0].textContent = '일본어 메일 · ' + ja + '명';
    tabs[1].textContent = '한국어 메일 · ' + (sel.length - ja) + '명';
    var b = $a('rm-send');
    b.textContent = sel.length + '명에게 보내기';
    b.disabled = !sel.length;
  }
  function remindOpen(rows, date){
    var box = remindBox();
    RM.rows = (rows || []).filter(remindEligible);
    RM.date = date || '';
    RM.tpl = remindLoadTpl();
    RM.lang = (RM.rows.length && !RM.rows.some(remindIsJa)) ? 'ko' : 'ja';
    $a('rm-sub').textContent = (date ? opsDateLabel(date) + ' 모임 · ' : '') +
      '입금·현장지불 처리가 안 된 참가자에게 보냅니다. 받을 사람을 확인해 주세요.';
    var list = $a('rm-list');
    list.innerHTML = '';
    if (!RM.rows.length) list.innerHTML = '<p class="st-empty">보낼 대상이 없습니다.</p>';
    RM.rows.forEach(function(r){
      var lab = document.createElement('label'); lab.className = 'rm-who';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.value = String(r.id);
      var t = document.createElement('span');
      t.textContent = (r.name || '(이름 없음)') + ' · ' + (remindIsJa(r) ? '일본어' : '한국어') + ' · ' + String(r.email || '').trim() +
        (+r.remind_n > 0 ? ' · 이미 ' + r.remind_n + '회 보냄 (' + sgCreatedText(r.remind_at) + ')' : '');
      lab.appendChild(cb); lab.appendChild(t); list.appendChild(lab);
    });
    $a('rm-bank').checked = false;
    $a('rm-state').textContent = '';
    remindPaintText(); remindPaintCount();
    openDim(box);
  }
  function remindSend(){
    remindKeep();
    var sel = remindChecked();
    if (!sel.length) return;
    var jaN = sel.filter(remindIsJa).length, koN = sel.length - jaN;
    var miss = [];
    if (jaN && (!String(RM.tpl.ja.subject).trim() || !String(RM.tpl.ja.body).trim())) miss.push('일본어');
    if (koN && (!String(RM.tpl.ko.subject).trim() || !String(RM.tpl.ko.body).trim())) miss.push('한국어');
    if (miss.length) return alert(miss.join('·') + ' 메일의 제목과 본문을 채워 주세요.');
    if (!confirm(sel.length + '명에게 미입금 안내 메일을 보낼까요?\n(일본어 ' + jaN + '명 · 한국어 ' + koN + '명)')) return;
    try { localStorage.setItem(REMIND_KEY, JSON.stringify(RM.tpl)); } catch (e) {}

    var btn = $a('rm-send'), st = $a('rm-state');
    btn.disabled = true; st.textContent = '보내는 중…';
    var ids = sel.map(function(r){ return r.id; }), chunks = [];
    for (var i = 0; i < ids.length; i += REMIND_CHUNK) chunks.push(ids.slice(i, i + REMIND_CHUNK));
    var res = { sent: [], skipped: [], failed: [], at: Date.now() };
    var base = {
      action: 'remind_unpaid', token: ADMIN.token, bank: $a('rm-bank').checked,
      ja: { subject: RM.tpl.ja.subject, body: RM.tpl.ja.body },
      ko: { subject: RM.tpl.ko.subject, body: RM.tpl.ko.body }
    };
    var WHY = { gone: '삭제된 신청', staff: '스탭', waitlisted: '대기', paid: '이미 입금·현장지불',
                past: '지난 모임', no_email: '이메일 없음', no_text: '문구 비어 있음' };
    function apply(){
      var sent = {};
      res.sent.forEach(function(id){ sent[String(id)] = 1; });
      (SG.rows || []).forEach(function(r){
        if (sent[String(r.id)]) { r.remind_at = res.at; r.remind_n = (+r.remind_n || 0) + 1; }
      });
      document.querySelectorAll('#rm-list .rm-who').forEach(function(lab){
        var c = lab.querySelector('input');
        if (c && sent[c.value]) {
          c.checked = false; c.disabled = true; lab.classList.add('sent');
          if (!/보냄 ✓$/.test(lab.lastChild.textContent)) lab.lastChild.textContent += ' · 보냄 ✓';
        }
      });
      remindPaintCount();
      try { paintSg(); } catch (e) {}
    }
    chunks.reduce(function(p, part){
      return p.then(function(){
        var payload = {}; for (var k in base) payload[k] = base[k];
        payload.ids = part;
        return apiPost(payload).then(function(d){
          if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
          res.sent = res.sent.concat(d.sent || []);
          res.skipped = res.skipped.concat(d.skipped || []);
          res.failed = res.failed.concat(d.failed || []);
          if (d.at) res.at = d.at;
        });
      });
    }, Promise.resolve()).then(function(){
      apply();
      var msg = '보냄 ' + res.sent.length + '명';
      if (res.skipped.length) {
        var why = [];
        res.skipped.forEach(function(x){ var w = WHY[x.why] || x.why; if (why.indexOf(w) < 0) why.push(w); });
        msg += ' · 건너뜀 ' + res.skipped.length + '명 (' + why.join(', ') + ')';
      }
      if (res.failed.length) msg += '\n실패 ' + res.failed.length + '명 — 메일 서버 오류입니다. 잠시 뒤 다시 보내 주세요.';
      st.textContent = msg;
    }).catch(function(e){
      apply();
      var m = String((e && e.message) || e);
      st.textContent =
        m === 'unknown_action' ? 'Worker 가 아직 이전 버전입니다. worker.js(cf-63)를 Cloudflare 에 먼저 배포해 주세요.' :
        m === 'mail_off' ? 'BREVO_KEY 가 설정되지 않아 메일을 보낼 수 없습니다.' :
        m === 'auth' ? '로그인이 만료되었습니다. 새로고침한 뒤 다시 로그인해 주세요.' :
        '보내지 못했습니다 (' + m + ')' + (res.sent.length ? '\n그 전에 ' + res.sent.length + '명에게는 보냈습니다.' : '');
    }).then(function(){ btn.disabled = !remindChecked().length; });
  }

  /* ── 데이터 백업 메일 — 지금 보내기 (Worker cf-64 backup_now) ── */
  on('bk-now', 'click', function(){
    var b = this, st = $a('bk-state');
    if (!confirm('지금 데이터 백업 메일을 보낼까요?\n신청자 명단 등 운영 데이터가 CSV 파일로 첨부됩니다.')) return;
    b.disabled = true; st.textContent = '보내는 중…';
    apiPost({ action: 'backup_now', token: ADMIN.token }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || 'fail');
      var list = d.tables || [];
      var files = list.filter(function(t){ return +t.rows > 0 && t.note !== 'too_big'; }).length;
      var rows = list.reduce(function(n, t){ return n + (+t.rows || 0); }, 0);
      st.textContent = d.to + ' 로 보냈습니다 · CSV ' + files + '개 · ' + rows + '행' +
        (list.some(function(t){ return t.note === 'too_big'; }) ? ' · 용량이 큰 표는 빠짐(메일 본문 참고)' : '');
    }).catch(function(e){
      var m = String((e && e.message) || e);
      st.textContent =
        m === 'unknown_action' ? 'Worker 가 아직 이전 버전입니다. worker.js(cf-64)를 먼저 배포해 주세요.' :
        m === 'mail_off' ? 'BREVO_KEY 가 설정되지 않아 보낼 수 없습니다.' :
        m === 'auth' ? '로그인이 만료되었습니다. 새로고침한 뒤 다시 로그인해 주세요.' :
        m === 'mail_fail' ? '메일 서버(Brevo)가 받지 않았습니다. 잠시 뒤 다시 시도해 주세요.' :
        '보내지 못했습니다 (' + m + ')';
    }).then(function(){ b.disabled = false; });
  });

  /* ── PC 메인 대표 이미지 ───────────────────────────────────
     모바일(960px 이하)에서는 CSS에서 숨겨 갤러리와 중복되지 않게 합니다. */
  function setHeroState(msg, isErr){
    var el=$a('hero-state'); if(!el) return;
    el.textContent=msg||'';
    el.classList.toggle('err',!!isErr);
    if(msg && !isErr && /저장|완료/.test(msg)){
      setTimeout(function(){ if(el.textContent===msg) el.textContent=''; },1800);
    }
  }

  function pushHero(uri, remove){
    var body={
      action:'hero_image', token:ADMIN.token,
      heroAr:HERO_AR, heroPos:HERO_POS
    };
    if(remove===true){
      body.remove=true;
    }else if(typeof uri==='string'){
      body.b64=uri.split(',')[1]||'';
      body.mime=uri.indexOf('image/png')>=0?'image/png':
                uri.indexOf('image/webp')>=0?'image/webp':'image/jpeg';
    }
    return apiPost(body).then(function(d){
      if(!d || !d.ok) throw new Error((d&&d.error)||'서버가 응답하지 않았습니다');
      return d;
    });
  }

  $a('hero-pick').addEventListener('click',function(e){
    e.stopPropagation(); $a('hero-file').click();
  });

  $a('hero-pos').addEventListener('click',function(e){e.stopPropagation();});
  $a('hero-pos').addEventListener('change',function(){
    HERO_POS=this.value||'center';
    applyHero();
    if(!HERO_ID) return;
    setHeroState('위치 저장 중…');
    pushHero().then(function(){setHeroState('저장됨');})
      .catch(function(e){setHeroState(fail(e).slice(0,48),true);});
  });

  $a('hero-remove').addEventListener('click',function(e){
    e.stopPropagation();
    if(!HERO_ID) return;
    if(!confirm('메인 대표 이미지를 제거하고 기존 로고 화면으로 되돌릴까요?')) return;
    setHeroState('제거 중…');
    pushHero('',true).then(function(){
      HERO_ID=''; HERO_AR='';
      applyHero();
      setHeroState('완료');
    }).catch(function(err){
      setHeroState(fail(err).slice(0,48),true);
    });
  });

  $a('hero-file').addEventListener('change',function(e){
    var file=e.target.files&&e.target.files[0];
    if(!file) return;
    setHeroState('이미지 준비 중…');

    /* 메인 이미지는 실제 화면보다 큰 1800px까지만 남기고 JPEG로 압축합니다.
       생성형 일러스트 PNG도 그대로 수 MB 올리지 않게 합니다. */
    fitImage(
      file,
      [[1800,0.90],[1500,0.88],[1300,0.86],[1100,0.84]],
      1500000,
      false
    ).then(function(r){
      if(!r.uri) throw new Error('이 이미지는 열 수 없습니다.');
      HERO_AR=r.ar;
      setHeroState('업로드 중… '+kb(r.uri));
      return pushHero(r.uri,false);
    }).then(function(d){
      if(d&&d.id) HERO_ID=d.id;
      applyHero();
      setHeroState('저장됨');
    }).catch(function(err){
      setHeroState(fail(err).slice(0,48),true);
      alert('대표 이미지를 저장하지 못했습니다.\n\n'+fail(err));
    }).then(function(){
      $a('hero-file').value='';
    });
  });

  /* ── 로고: 고르는 즉시 따로 저장한다 ─────────────────────── */
  function setState(id, msg, isErr){
    var el = $a(id); if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('on', !!msg);
    el.classList.toggle('err', !!isErr);
    if (msg && !isErr && /저장|완료/.test(msg)) setTimeout(function(){ setState(id, ''); }, 1800);
  }
  function fail(err){
    var m = String((err && err.message) || err || '알 수 없는 오류');
    if (/unknown_action/.test(m)) {
      return 'Apps Script 가 옛 버전입니다.\n새 Code.gs 를 붙여넣고 저장한 뒤,\n배포 → 배포 관리 → 연필 → 버전 «새 버전» → 배포 를 해주세요.';
    }
    if (/로그인이 만료/.test(m)) m += '\n페이지를 새로고침한 뒤 다시 로그인해 주세요.';
    return m;
  }

  function pushLogo(uri){
    var body = { action:'logo', token:ADMIN.token, logoAr:LOGO_AR, logoSize:LOGO_SIZE };
    if (typeof uri === 'string') {
      body.b64 = uri ? uri.split(',')[1] : '';
      body.mime = uri.indexOf('image/png') >= 0 ? 'image/png' : 'image/jpeg';
    }
    return apiPost(body).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || '서버가 응답하지 않았습니다');
      return d;
    });
  }

  $a('logo-size').addEventListener('click', function(e){ e.stopPropagation(); });
  $a('logo-size').addEventListener('input', function(){ LOGO_SIZE = this.value; applyLogo(); });
  $a('logo-size').addEventListener('change', function(){
    setState('logo-state', '크기 저장 중…');
    pushLogo().then(function(){ setState('logo-state', '저장됨'); })
      .catch(function(e){ setState('logo-state', fail(e).slice(0, 50), true); });
  });

  $a('logo-pick').addEventListener('click', function(e){ e.stopPropagation(); $a('logo-file').click(); });

  $a('logo-reset').addEventListener('click', function(e){
    e.stopPropagation();
    if (!confirm('기본 로고로 되돌릴까요?')) return;
    LOGO = ''; LOGO_ID = ''; LOGO_AR = ''; LOGO_SIZE = '';
    applyLogo(); syncSizeInput();
    setState('logo-state', '되돌리는 중…');
    pushLogo('').then(function(){ setState('logo-state', '완료'); })
      .catch(function(e2){ setState('logo-state', fail(e2).slice(0, 50), true); });
  });

  $a('logo-file').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setState('logo-state', '사진 여는 중…');
    fitImage(file, [[1200,0.92],[900,0.88],[700,0.84]], 1000000, true).then(function(r){
      if (!r.uri) throw new Error('이 사진은 열 수 없습니다. JPG 나 PNG 로 저장한 뒤 다시 시도해 주세요.');
      LOGO = r.uri; LOGO_AR = r.ar;
      if (!LOGO_SIZE) LOGO_SIZE = '380';
      applyLogo(); syncSizeInput();
      setState('logo-state', '올리는 중… ' + kb(r.uri));
      return pushLogo(r.uri);
    }).then(function(d){
      if (d && d.id) { LOGO_ID = d.id; LOGO = ''; applyLogo(); }
      setState('logo-state', '저장됨');
    }).catch(function(err){
      setState('logo-state', fail(err).slice(0, 50), true);
      alert('로고를 저장하지 못했습니다.\n\n' + fail(err) + '\n\n연결된 서버: …' + API.slice(-10));
    }).then(function(){ $a('logo-file').value = ''; });
  });

  function syncSizeInput(){
    $a('logo-size').value = parseInt(LOGO_SIZE, 10) || 380;
  }

  /* ── 활동 사진: 고르는 즉시 한 장씩 올린다 ────────────────── */
  var galSlot = 0;

  function pushGallery(){
    var list = GALLERY.filter(function(x){ return x && (x.id || x.b64); })
      .map(function(x){ return x.id ? { id:x.id } : { b64:x.b64 }; });
    return apiPost({ action:'gallery', token:ADMIN.token, gallery:list }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || '서버가 응답하지 않았습니다');
      GALLERY = (d.ids || []).map(function(id){ return { id:id }; });   /* 다음엔 다시 안 올리도록 */
      renderGallery();
      return d;
    });
  }

  document.querySelectorAll('[data-gal-pick]').forEach(function(b2){
    b2.addEventListener('click', function(e){
      e.stopPropagation(); galSlot = +b2.dataset.galPick; $a('gal-file').click();
    });
  });

  document.querySelectorAll('[data-gal-del]').forEach(function(b2){
    b2.addEventListener('click', function(e){
      e.stopPropagation();
      if (!confirm('이 사진을 지울까요?')) return;
      GALLERY[+b2.dataset.galDel] = null;
      renderGallery();
      setState('gal-state', '지우는 중…');
      pushGallery().then(function(){ setState('gal-state', '완료'); })
        .catch(function(err){ setState('gal-state', fail(err).slice(0, 50), true); });
    });
  });

  $a('gal-file').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    setState('gal-state', '사진 여는 중…');
    /* 모바일 데이터 절약: 1280px·품질 0.8부터, 약 190KB를 넘으면 한 단계씩 줄임 (2026-09-29) */
    fitImage(file, [[1280,0.8],[1100,0.77],[960,0.74]], 260000, false).then(function(r){
      if (!r.uri) throw new Error('이 사진은 열 수 없습니다. JPG 나 PNG 로 저장한 뒤 다시 시도해 주세요.');
      GALLERY[galSlot] = { b64: r.uri.split(',')[1], uri: r.uri };
      renderGallery();
      setState('gal-state', '올리는 중… ' + kb(r.uri));
      return pushGallery();
    }).then(function(){
      setState('gal-state', '저장됨');
    }).catch(function(err){
      setState('gal-state', fail(err).slice(0, 50), true);
      alert('사진을 저장하지 못했습니다.\n\n' + fail(err) + '\n\n연결된 서버: …' + API.slice(-10));
    }).then(function(){ $a('gal-file').value = ''; });
  });

  /* ── 누적 갤러리: 별도 보관함 / 기존 12장 대표사진은 그대로 ─── */
  (function(){
    var dateEl=$a('archive-date'), pick=$a('archive-pick'), importBtn=$a('archive-import');
    var filesEl=$a('archive-files'), status=$a('archive-progress'), area=$a('archive-manage-list');
    var refresh=$a('archive-refresh'), more=$a('archive-manage-more');
    var cursor=null, busy=false, listing=false, requestNo=0, pendingRefresh=false;
    if(!dateEl || !pick) return;
    function today(){
      try {
        var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        var v={};parts.forEach(function(x){v[x.type]=x.value;});
        return v.year+'-'+v.month+'-'+v.day;
      }catch(e){return new Date().toISOString().slice(0,10);}
    }
    dateEl.value=today();
    var legacyBox=$a('archive-legacy-select');
    window.iroRefreshArchiveLegacy=function(){
      if(!legacyBox)return;
      var selected=new Set(Array.from(legacyBox.querySelectorAll('input:checked')).map(function(x){return x.value;}));
      legacyBox.textContent='';
      GALLERY.forEach(function(g,i){
        if(!g||!g.id)return;
        var lab=document.createElement('label'),im=document.createElement('img'),cb=document.createElement('input'),txt=document.createElement('span');
        im.src=driveUrl(g.id,300);im.alt='대표사진 '+(i+1);im.loading='lazy';
        cb.type='checkbox';cb.value=g.id;cb.setAttribute('data-archive-legacy','');cb.checked=selected.has(g.id);
        txt.textContent=(i+1)+'번 사진 선택';
        lab.appendChild(im);lab.appendChild(cb);lab.appendChild(txt);legacyBox.appendChild(lab);
      });
      if(!legacyBox.children.length)legacyBox.textContent='현재 대표사진이 없습니다.';
    };
    window.iroRefreshArchiveLegacy();
    function say(txt){status.textContent=txt||'';}
    function post(data){
      data.token=ADMIN.token;
      return apiPost(data).then(function(d){if(!d||!d.ok)throw new Error(d&&d.error||'서버 오류');return d;});
    }
    function fetchArchive(extra){
      var q=new URLSearchParams({action:'gallery_archive_list',date:dateEl.value,limit:'24'});
      if(extra)q.set('cursor',extra);
      return fetch(API+'?'+q.toString(),{cache:'no-store'}).then(function(r){return r.json();})
        .then(function(d){if(!d||!d.ok)throw new Error(d&&d.error||'조회 실패');return d;});
    }
    function drawItems(items){
      items.forEach(function(item){
        var fig=document.createElement('figure'),img=document.createElement('img'),del=document.createElement('button');
        img.loading='lazy';img.alt=item.date+' 교류회 사진';img.src=driveUrl(item.key,500);
        del.type='button';del.textContent='보관함에서 삭제';
        del.onclick=function(){
          if(busy||!confirm('이 사진을 누적 보관함에서 삭제할까요?'))return;
          del.disabled=true;
          post({action:'gallery_archive_delete',id:item.id}).then(function(){fig.remove();say('보관함에서 삭제했습니다.');if(window.iroRefreshLatestGallery)window.iroRefreshLatestGallery();})
            .catch(function(e){del.disabled=false;say('삭제 실패: '+fail(e));});
        };
        fig.appendChild(img);fig.appendChild(del);area.appendChild(fig);
      });
    }
    function loadManage(append){
      if(listing){if(!append)pendingRefresh=true;return Promise.resolve();}
      var request=++requestNo,old=append?cursor:null, selectedDate=dateEl.value;
      listing=true;
      if(!append){area.textContent='불러오는 중…';more.hidden=true;}
      return fetchArchive(old).then(function(d){
        if(request!==requestNo || selectedDate!==dateEl.value){pendingRefresh=true;return;}
        if(!append)area.textContent='';
        drawItems(d.items||[]);cursor=d.next_cursor||null;
        more.hidden=!cursor;
        if(!area.children.length)area.textContent='이 날짜의 보관 사진이 없습니다.';
      }).catch(function(e){say('보관함 조회 실패: '+fail(e));})
        .then(function(){listing=false;if(pendingRefresh){pendingRefresh=false;loadManage(false);}});
    }
    dateEl.addEventListener('change',function(){cursor=null;loadManage(false);});
    refresh.addEventListener('click',function(){cursor=null;loadManage(false);});
    more.addEventListener('click',function(){if(cursor)loadManage(true);});
    pick.addEventListener('click',function(){if(!busy)filesEl.click();});
    filesEl.addEventListener('change',async function(){
      var selected=Array.from(filesEl.files||[]);filesEl.value='';
      if(!selected.length)return;
      var date=dateEl.value;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){say('먼저 모임 날짜를 선택해 주세요.');return;}
      if(selected.length>20){say('한 번에 최대 20장까지 선택해 주세요. 나눠서 올리면 계속 누적됩니다.');return;}
      if(!confirm(date+' 모임 사진 '+selected.length+'장을 누적 갤러리에 공개할까요?\n얼굴 및 개인정보 가림 여부를 확인해 주세요.'))return;
      busy=true;pick.disabled=true;importBtn.disabled=true;dateEl.disabled=true;
      var success=0,failed=0;
      try{
        for(var i=0;i<selected.length;i++){
          say('업로드 '+(i+1)+'/'+selected.length+' · '+selected[i].name+' · 성공 '+success+'장');
          try{
            var r=await fitImage(selected[i],[[1280,.8],[1100,.77],[960,.74]],260000,false);   /* 약 190KB 이하로 (2026-09-29) */
            if(!r.uri)throw new Error('지원하지 않는 이미지입니다 (JPG/PNG 권장)');
            var mime=r.uri.slice(5,r.uri.indexOf(';base64'))||'image/jpeg';
            await post({action:'gallery_archive_add',date:date,item:{mime:mime,b64:r.uri.split(',')[1]}});
            success++;
          }catch(e){failed++;console.error('archive photo upload failed:',selected[i].name,e);}
        }
        say('업로드 완료: '+success+'장 성공'+(failed?' · '+failed+'장 실패 (실패 사진만 다시 선택해 주세요)':'')+'.');
      }finally{
        busy=false;pick.disabled=false;importBtn.disabled=false;dateEl.disabled=false;
        cursor=null;loadManage(false);
        if(window.iroRefreshLatestGallery)window.iroRefreshLatestGallery();
      }
    });
    importBtn.addEventListener('click',function(){
      if(busy||!dateEl.value)return;
      var ids=Array.from(legacyBox.querySelectorAll('input[data-archive-legacy]:checked')).map(function(x){return x.value;});
      if(!ids.length){say('먼저 위에서 기존 사진을 선택해 주세요.');return;}
      if(!confirm('선택한 기존 사진 '+ids.length+'장을 '+dateEl.value+' 날짜에 보관할까요?\n원본 대표 갤러리 사진은 그대로 유지됩니다.'))return;
      busy=true;importBtn.disabled=true;
      post({action:'gallery_archive_import',date:dateEl.value,ids:ids}).then(function(d){
        say('기존 사진 '+d.added+'장 보관 · 이미 보관된 '+d.existing+'장'+(d.unsupported?' · 가져오지 못한 '+d.unsupported+'장':''));
        cursor=null;loadManage(false);
        if(window.iroRefreshLatestGallery)window.iroRefreshLatestGallery();
      }).catch(function(e){say('가져오기 실패: '+fail(e));})
        .then(function(){busy=false;importBtn.disabled=false;});
    });
  })();

  /* ── 통계 ────────────────────────────────────────────────── */
  var statDays = 30, STAT = null;

  $a('adm-stats-open').addEventListener('click', function(){ openDim($a('adm-stats')); loadStats(); });
  document.querySelectorAll('.st-range button').forEach(function(b2){
    b2.addEventListener('click', function(){
      statDays = +b2.dataset.d;
      document.querySelectorAll('.st-range button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b2)); });
      loadStats();
    });
  });

  function loadStats(){
    $a('stats-body').innerHTML = '<p class="st-empty">불러오는 중…</p>';
    apiPost({ action:'stats', token: ADMIN.token, days: statDays }).then(function(d){
      if (!d || !d.ok) throw new Error((d && d.error) || '불러오지 못했습니다');
      STAT = d; renderStats(d);
    }).catch(function(e){
      $a('stats-body').innerHTML = '<p class="st-empty">' + fail(e) + '</p>';
    });
  }

  function esc2(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function barRows(list, total){
    if (!list || !list.length) return '<p class="st-empty" style="padding:18px 0">기록 없음</p>';
    var max = list[0].n || 1;
    return list.slice(0, 8).map(function(x){
      var pct = Math.round(x.n / (total || max) * 100);
      return '<div class="st-row"><span>' + esc2(x.k) + '</span>' +
             '<span class="bar"><i style="width:' + Math.max(2, Math.round(x.n / max * 100)) + '%"></i></span>' +
             '<span class="n">' + x.n + (total ? ' · ' + pct + '%' : '') + '</span></div>';
    }).join('');
  }

  function convTable(d){
    var rows = (d.convert || []).filter(function(x){ return x.v >= 1; }).slice(0, 8);
    if (!rows.length) return '';
    var maxR = rows.reduce(function(m, x){ return Math.max(m, x.r); }, 0) || 1;
    return '<div class="st-sec"><h4>유입 경로별 신청 전환</h4><table class="st-tbl">' +
      '<tr><th>경로</th><th class="num">방문</th><th class="num">신청 클릭</th><th class="rate">전환율</th></tr>' +
      rows.map(function(x){
        return '<tr' + (x.v < 5 ? ' class="dim"' : '') + '><td>' + esc2(x.k) + '</td>' +
          '<td class="num">' + x.v + '</td><td class="num">' + x.c + '</td>' +
          '<td class="rate"><span><i><b style="width:' + Math.round(x.r / maxR * 100) + '%"></b></i>' +
          '<strong>' + x.r + '%</strong></span></td></tr>';
      }).join('') +
      '</table><p style="font-size:.76rem;color:var(--muted);margin-top:9px">' +
      '연한 줄은 방문이 5회 미만이라 비율을 믿기 어려운 경로입니다.</p></div>';
  }

  function insight(d){
    if (!d.total) return '아직 쌓인 기록이 없습니다. 방문이 생기면 여기에 요약이 나타납니다.';
    var out = [];
    var avg = (d.total / d.days).toFixed(1);
    out.push('최근 <b>' + d.days + '일</b> 동안 <b>' + d.visitors + '명</b>이 <b>' + d.total + '회</b> 방문했고, 하루 평균 <b>' + avg + '회</b>입니다.');
    if (d.visitors) out.push('이 가운데 <b>' + d.returning + '명</b>이 이틀 이상 다시 찾았습니다(재방문율 <b>' + Math.round(d.returning / d.visitors * 100) + '%</b>).');
    var best = (d.convert || []).filter(function(x){ return x.v >= 5; }).sort(function(a, b2){ return b2.r - a.r; })[0];
    if (best) out.push('전환이 가장 좋은 경로는 <b>' + best.k + '</b>로, 방문 ' + best.v + '회 중 ' + best.c + '회가 신청으로 이어졌습니다(<b>' + best.r + '%</b>).');
    if (d.lang.length) {
      var ja = (d.lang.filter(function(x){ return x.k === '일본어'; })[0] || {n:0}).n;
      out.push('일본어 화면 비중은 <b>' + Math.round(ja / d.total * 100) + '%</b>입니다.');
    }
    if (d.ref.length) out.push('가장 많은 유입은 <b>' + d.ref[0].k + '</b>(' + d.ref[0].n + '회)입니다.');
    if (d.device.length) out.push('기기는 <b>' + d.device[0].k + '</b>가 ' + Math.round(d.device[0].n / d.total * 100) + '%로 가장 많습니다.');
    var top = 0, ti = 0;
    d.hour.forEach(function(v, i){ if (v > top) { top = v; ti = i; } });
    if (top) out.push('접속이 몰리는 시간대는 <b>' + ti + '시대</b>입니다.');
    if (d.newVisitors) out.push('처음 온 사람은 <b>' + d.newVisitors + '명</b>입니다.');
    return out.join(' ');
  }

  function renderStats(d){
    var daily = d.daily || [];
    var maxD = daily.reduce(function(m, x){ return Math.max(m, x.n); }, 1);
    var bars = daily.map(function(x){
      var h = Math.max(2, Math.round(x.n / maxD * 100));
      var u = x.n ? Math.round((x.u || 0) / x.n * 100) : 0;
      return '<i style="height:' + h + '%" title="' + x.k + ' · 방문 ' + x.n + '회 / 순 방문자 ' + (x.u || 0) + '명">' +
             '<u style="height:' + u + '%"></u></i>';
    }).join('');
    var DOW = ['일','월','화','수','목','금','토'];
    var dowList = (d.dow || []).map(function(n, i){ return { k: DOW[i] + '요일', n: n }; })
      .sort(function(a, b2){ return b2.n - a.n; });
    var hourList = (d.hour || []).map(function(n, i){ return { k: i + '시', n: n }; })
      .filter(function(x){ return x.n; }).sort(function(a, b2){ return b2.n - a.n; });

    $a('stats-body').innerHTML =
      '<div class="st-kpi">' +
        '<div><b>' + d.total + '</b><span>방문</span></div>' +
        '<div><b>' + d.visitors + '</b><span>순 방문자</span></div>' +
        '<div><b>' + (d.visitors ? Math.round(d.returning / d.visitors * 100) : 0) + '%</b><span>재방문율</span></div>' +
        '<div><b>' + (d.total / d.days).toFixed(1) + '</b><span>하루 평균</span></div>' +
      '</div>' +
      (daily.length ? '<div class="st-sec"><h4>일별 방문</h4><div class="st-bars">' + bars + '</div>' +
        '<div class="st-xlab"><span>' + daily[0].k + '</span><span>' + daily[daily.length-1].k + '</span></div>' +
        '<div class="st-legend"><span><em style="background:#C9CEDE"></em>방문</span>' +
        '<span><em style="background:var(--navy)"></em>순 방문자</span></div></div>' : '') +
      convTable(d) +
      '<div class="st-sec st-grid">' +
        '<div><h4>언어</h4>' + barRows(d.lang, d.total) + '</div>' +
        '<div><h4>지역(시간대 기준)</h4>' + barRows(d.region, d.total) + '</div>' +
        '<div><h4>유입 경로</h4>' + barRows(d.ref, d.total) + '</div>' +
        '<div><h4>기기</h4>' + barRows(d.device, d.total) + '</div>' +
        '<div><h4>페이지</h4>' + barRows(d.page, d.total) + '</div>' +
        '<div><h4>버튼 클릭</h4>' + barRows(d.event, 0) + '</div>' +
        '<div><h4>요일</h4>' + barRows(dowList, d.total) + '</div>' +
        '<div><h4>시간대</h4>' + barRows(hourList, d.total) + '</div>' +
      '</div>' +
      '<div class="st-sec"><h4>요약</h4><p class="st-note">' + insight(d) + '</p></div>' +
      '<div class="st-ai"><h4 style="font-size:.76rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:11px">AI 분석</h4>' +
        '<div class="row">' +
          '<button class="btn btn-primary" type="button" id="ai-run">분석 받기</button>' +
          '<button class="btn btn-ghost" type="button" id="ai-copy">데이터 복사</button>' +
        '</div><div id="ai-out"></div></div>';

    $a('ai-run').addEventListener('click', runAi);
    $a('ai-copy').addEventListener('click', function(){
      copyText(aiPrompt());
      alert('통계를 복사했습니다. Claude 나 ChatGPT 에 그대로 붙여넣으면 분석해 줍니다.');
    });
  }

  function aiPrompt(){
    var d = STAT; if (!d) return '';
    var fmt = function(t, l){ return t + ': ' + (l || []).map(function(x){ return x.k + ' ' + x.n; }).join(', '); };
    return [
      '아래는 서울에서 매주 일요일에 열리는 한일 언어교류회 "이로토모"의 소개 사이트 방문 통계입니다.',
      '이 모임은 한국인과 일본인이 한 테이블에 앉아 대화하는 자리이고, 사이트는 한국어·일본어 두 언어로 되어 있습니다.',
      '신청은 한국인은 소모임 앱, 일본인은 사이트 안의 구글 폼으로 받습니다.',
      '',
      '기간: 최근 ' + d.days + '일',
      '총 방문 ' + d.total + '회 / 순 방문자 ' + d.visitors + '명 / 처음 온 사람 ' + d.newVisitors + '명 / 이틀 이상 재방문 ' + d.returning + '명',
      '유입 경로별 (경로: 방문수, 신청클릭수, 전환율%): ' + (d.convert || []).map(function(x){ return x.k + ' ' + x.v + '/' + x.c + '/' + x.r + '%'; }).join(', '),
      fmt('언어', d.lang),
      fmt('지역(브라우저 시간대 기준)', d.region),
      fmt('유입 경로', d.ref),
      fmt('기기', d.device),
      fmt('페이지', d.page),
      fmt('버튼 클릭', d.event),
      '일별 (날짜 방문수/순방문자): ' + (d.daily || []).map(function(x){ return x.k + ' ' + x.n + '/' + (x.u || 0); }).join(', '),
      '요일별(일~토): ' + (d.dow || []).join(', '),
      '시간대별(0~23시): ' + (d.hour || []).join(', '),
      '',
      '다음을 한국어로 답해 주세요.',
      '1) 눈에 띄는 흐름 세 가지 — 숫자를 근거로',
      '2) 일본인 참가자를 늘리기 위해 지금 당장 해볼 만한 것 두 가지',
      '3) 이 데이터만으로는 알 수 없어서 추가로 봐야 할 지표',
      '추측은 추측이라고 밝히고, 표본이 적으면 그 점을 먼저 지적해 주세요.'
    ].join('\n');
  }

  function copyText(t){
    try { navigator.clipboard.writeText(t); }
    catch (e) {
      var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a);
      a.select(); document.execCommand('copy'); a.remove();
    }
  }

  function runAi(){
    var btn = $a('ai-run'), out = $a('ai-out');
    btn.disabled = true; btn.textContent = '분석 중…';
    out.classList.add('on'); out.textContent = 'Claude 가 통계를 읽고 있습니다…';
    apiPost({ action:'ai', token: ADMIN.token, prompt: aiPrompt() }).then(function(d){
      if (d && d.ok) { out.textContent = d.text; return; }
      if (d && d.error === 'nokey') {
        out.textContent = 'AI 분석을 쓰려면 Apps Script 의 ANTHROPIC_KEY 에 API 키를 넣고 다시 배포해 주세요.\n' +
          '키 없이 쓰시려면 옆의 «데이터 복사» 를 눌러 Claude 나 ChatGPT 에 붙여넣으시면 됩니다.';
        return;
      }
      throw new Error((d && d.error) || '분석에 실패했습니다');
    }).catch(function(e){ out.textContent = fail(e); })
      .then(function(){ btn.disabled = false; btn.textContent = '분석 받기'; });
  }

  /* 저장 */
  $a('adm-save').addEventListener('click', function(){
    var out = {};
    document.querySelectorAll('[data-c]').forEach(function(el){
      var k = el.getAttribute('data-c'), L = langOf(el), v = readEl(el);
      if (v === DEFAULTS[k][L]) return;
      out[k] = out[k] || { ko:'', ja:'' };
      out[k][L] = v;
    });
    var body = { action:'save', token:ADMIN.token, content:out, schedule:SCHED };
    var btn = this; btn.disabled = true; btn.textContent = '저장 중…';
    apiPost(body)
      .then(function(d){
        if (!d.ok) throw new Error(d.error || 'fail');
        btn.textContent = '저장됨';
        setTimeout(function(){ btn.textContent = '저장'; }, 1800);
      })
      .catch(function(err){ alert('저장하지 못했습니다.\n\n' + fail(err)); btn.textContent = '저장'; })
      .then(function(){ btn.disabled = false; });
  });

  /* index.html 쪽에서 부를 수 있게 내보냅니다 */
  ADMIN_JS.api = { openLogin: openLogin, syncTimeInput: syncTimeInput };
