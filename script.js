imit;
            $('set-bal-on').checked = balCheckEnabled;
            $('set-cd-on').checked = cdEnabled;
            $('set-cd-streak').value = cdStreak;
            $('set-cd-rounds').value = cdRounds;
        }

        function saveSettings(){
            try {
                localStorage.setItem('goku_settings', JSON.stringify({
                    plEnabled: plEnabled, plProfitTarget: plProfitTarget, plLossTarget: plLossTarget,
                    fixedBaseBet: fixedBaseBet, maxLevelsAllowed: maxLevelsAllowed, martingaleMultiplier: martingaleMultiplier,
                    maxBetLimit: maxBetLimit, balCheckEnabled: balCheckEnabled,
                    cdEnabled: cdEnabled, cdStreak: cdStreak, cdRounds: cdRounds,
                    betMode: betMode
                }));
            } catch(e) {}
        }

        function applySettingsFromInputs(){
            var n = function(id, def){ var v = parseFloat($(id).value); return isNaN(v) ? def : v; };
            plEnabled = $('set-pl-on').checked;
            plProfitTarget = Math.max(1, n('set-profit', plProfitTarget));
            plLossTarget = Math.max(1, n('set-loss', plLossTarget));
            fixedBaseBet = Math.max(1, n('set-bet', fixedBaseBet));
            maxLevelsAllowed = Math.max(1, Math.min(15, Math.floor(n('set-level', maxLevelsAllowed))));
            martingaleMultiplier = Math.max(1, Math.min(10, n('set-mult', martingaleMultiplier)));
            maxBetLimit = Math.max(0, n('set-maxbet', maxBetLimit));
            balCheckEnabled = $('set-bal-on').checked;
            cdEnabled = $('set-cd-on').checked;
            cdStreak = Math.max(1, Math.floor(n('set-cd-streak', cdStreak)));
            cdRounds = Math.max(1, Math.floor(n('set-cd-rounds', cdRounds)));
            if(currentLevel >= maxLevelsAllowed) currentLevel = 0;
            plStopped = false;
            fillSettingsInputs();
            saveSettings();
            updateStatsUI();
        }

        function renderLog(){
            var box = $('goku-log-box'); if(!box) return;
            var list = predictionLogs.slice(0, 20);
            if(!list.length){ box.innerHTML = '<div class="gk-empty">No bets yet</div>'; return; }
            box.innerHTML = list.map(function(l){
                var cls = l.status === 'WIN' ? 'win' : (l.status === 'LOSS' ? 'loss' : (l.status === 'FAILED' ? 'fail' : ''));
                var pred = l.pred; 
                var badge = l.mode === 'COLOR' ? 'C' : 'S'; 
                var label = l.status === 'FAILED' ? 'FAILED' : l.status;
                return '<div class="gk-log ' + cls + '"><span>' + l.time + ' · #' + String(l.period).slice(-4) + ' · ' + badge + '</span><b>' + pred + '</b><em>' + label + '</em></div>';
            }).join('');
        }

        $('set-save').onclick = function(){ 
            applySettingsFromInputs(); 
            showToast('', 'SAVED', 'Settings saved & applied!'); 
        };
        
        function resetStats(){
            stats.profit = 0; stats.wins = 0; stats.losses = 0; stats.total = 0; stats.currentStreak = 0;
            currentLevel = 0; lossRun = 0; cooldownLeft = 0; plStopped = false; predictionLogs = [];
            updateStatsUI(); renderLog();
        }

        $('set-reset').onclick = function(){
            if(!confirm('Reset stats?')) return;
            resetStats();
        };

        function showToast(type, title, desc){
            var t = document.createElement('div'); t.className = 'gk-toast ' + type;
            var icon = type === 'win' ? '✓' : (type === 'loss' ? '✕' : '⚙');
            t.innerHTML = '<div class="ic">' + icon + '</div><div><div class="t">' + title + '</div><div class="d">' + desc + '</div></div>';
            shadow.appendChild(t); setTimeout(function(){ if(t) t.remove(); }, 3500);
        }

        function stopBotWithReason(txt){
            isBotRunning = false;
            var btn = $('goku-bot-btn');
            if(btn){ btn.innerText = 'START'; btn.classList.remove('running'); }
            $('goku-status-bar').classList.remove('active');
            $('goku-status-txt').innerText = txt;
        }

        function generateBetLevels(){
            var arr = [], curr = 0;
            if(isAutoScale){
                var factor = 0; for(var i=0;i<autoScaleLevels;i++) factor += Math.pow(martingaleMultiplier, i);
                curr = Math.max(1, Math.floor(currentBalance / factor)); maxLevelsAllowed = autoScaleLevels;
            } else { curr = fixedBaseBet; }
            for(var j=0;j<maxLevelsAllowed;j++){
                var v = curr;
                if(maxBetLimit > 0 && v > maxBetLimit) v = maxBetLimit;
                arr.push(v); curr = Math.round(curr*martingaleMultiplier);
            }
            return arr;
        }

        function checkProfitLossTarget(){
            if(!plEnabled || plStopped) return false;
            
            if(stats.profit >= plProfitTarget){
                plStopped = true;
                plStopReason = 'Profit reached';
                stopBotWithReason('TARGET HIT');
                
                showGokuModal(
                    'PROFIT TARGET! 🎯',
                    'Profit: <b style="color:#059669">+' + stats.profit.toFixed(2) + '</b><br>Bot stopped automatically.',
                    'RESET & CONTINUE',
                    function() { resetStats(); }
                );
                return true;
            }
            
            if(stats.profit <= -plLossTarget){
                plStopped = true;
                plStopReason = 'Loss limit';
                stopBotWithReason('LOSS LIMIT');
                
                showGokuModal(
                    'STOP LOSS! 🛑',
                    'Loss: <b style="color:#dc2626">-' + Math.abs(stats.profit).toFixed(2) + '</b><br>Bot stopped to protect balance.',
                    'RESET & CONTINUE',
                    function() { resetStats(); }
                );
                return true;
            }
            return false;
        }

        var botBtnUI = $('goku-bot-btn');
        botBtnUI.onclick = function(){
            if(plStopped){
                plStopped = false;
                plStopReason = '';
                resetStats();
            }
            isBotRunning = !isBotRunning;
            if(isBotRunning){
                botBtnUI.innerText = "STOP"; botBtnUI.classList.add("running");
                $('goku-status-bar').classList.add("active");
                $('goku-status-txt').innerText = "RUNNING";
                if(currentPredictionObj && !activeBetPending && !isBetPlacing){ 
                    executeAutoBetSequence(); 
                } else if (!currentPredictionObj) {
                    updatePredictionDisplay(); 
                }
            } else {
                botBtnUI.innerText = "START"; botBtnUI.classList.remove("running");
                $('goku-status-bar').classList.remove("active");
                $('goku-status-txt').innerText = "STOPPED";
                $('goku-pred').innerHTML = "WAITING...";
                $('goku-pred').style.color = "#6d5bd0";
            }
        };

        function getPredictionFromAPI(retry){
            retry = retry || 0;
            var endpoint = (currentApiMode === 'WinGo_30S') ? '30s' : '1m';
            var apiUrl = PREDICTION_API_BASE_URLS[currentServerIndex] + endpoint;
            var fullUrl = apiUrl + '?_t=' + Date.now();

            return fetch(fullUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' })
                .then(function(res){ if(!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
                .then(function(data){
                    if(!data || data.success === false) throw new Error('API invalid');
                    
                    var sizePred = String(data.prediction || data.size || '').toUpperCase().trim();
                    
                    var rawColor = String(data.color || '').toUpperCase().trim();
                    var cleanColor = rawColor;
                    if (cleanColor.indexOf('RED') !== -1) cleanColor = 'RED';
                    else if (cleanColor.indexOf('GREEN') !== -1) cleanColor = 'GREEN';

                    var sizeConf = parseFloat(String(data.confidence || '70').replace('%','')) || 70;
                    var colorConf = parseFloat(String(data.colorConfidence || '70').replace('%','')) || 70;
                    var avgConf = parseFloat(String(data.avgConfidence || '70').replace('%','')) || 70;
                    
                    return {
                        size: sizePred,
                        color: cleanColor,
                        displayColor: rawColor,
                        sizeConf: sizeConf,
                        colorConf: colorConf,
                        avgConf: avgConf,
                        period: data.periodNumber || ''
                    };
                })
                .catch(function(e){ 
                    console.log('GOKU API Error (Server ' + (currentServerIndex+1) + '): ' + e); 
                    if(retry < 2) {
                        return new Promise(function(r){ setTimeout(r, 1000); }).then(function(){ return getPredictionFromAPI(retry+1); });
                    }
                    return null; 
                });
        }

        function updatePredictionDisplay(){
            currentPredictionObj = null;

            var pEl = $('goku-pred');
            var cEl = $('goku-color-pred');
            pEl.innerHTML = "LOADING...";
            pEl.style.fontSize = "15px";
            pEl.style.color = "#6d5bd0";
            cEl.innerHTML = "--";

            getPredictionFromAPI().then(function(result){
                if(!result){
                    pEl.innerHTML = "API ERROR (S" + (currentServerIndex+1) + ")";
                    pEl.style.fontSize = "15px";
                    pEl.style.color = "#ef4444";
                    if(isBotRunning && !activeBetPending) {
                        setTimeout(updatePredictionDisplay, 1000);
                    }
                    return;
                }
                currentPredictionObj = {
                    size: result.size,
                    color: result.color,
                    sizeConf: result.sizeConf,
                    colorConf: result.colorConf,
                    avgConf: result.avgConf
                };

                var sizeWarn = result.sizeConf < 55 ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d5bd0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : '';
                pEl.innerHTML = sizeWarn + result.size + ' <small>' + result.sizeConf + '%</small>';
                pEl.style.fontSize = "24px";
                pEl.style.color = (result.size === "BIG") ? "#dc2626" : "#059669";
                pEl.style.opacity = (betMode === 'SIZE' || (betMode === 'AUTO' && result.sizeConf >= result.colorConf)) ? '1' : '0.55';

                var colorWarn = result.colorConf < 55 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : '';
                cEl.innerHTML = colorWarn + result.displayColor + ' <small>' + result.colorConf + '%</small>';
                cEl.style.color = (result.color === 'RED') ? '#dc2626' : '#059669';
                cEl.style.opacity = (betMode === 'COLOR' || (betMode === 'AUTO' && result.colorConf > result.sizeConf)) ? '1' : '0.55';

                $('goku-acc').innerText = 'Size: ' + result.sizeConf + '% · Color: ' + result.colorConf + '%';

                var activeConf = Math.max(result.sizeConf, result.colorConf); 
                var bd = $('gk-badge');
                bd.className = 'gk-badge ' + (activeConf >= 70 ? 'good' : (activeConf >= 55 ? 'mid' : ''));
                bd.innerText = activeConf >= 70 ? 'STRONG' : (activeConf >= 55 ? 'OK' : '\u26A0\uFE0E WEAK');

                if(isBotRunning && !activeBetPending && !isBetPlacing) {
                    executeAutoBetSequence();
                }
            });
        }

        function fetchApiData(){
            var url = HISTORY_API + currentApiMode + '/GetHistoryIssuePage.json?_t=' + new Date().getTime();
            return fetch(url, { cache: 'no-store' })
                .then(function(res){ return res.json(); })
                .then(function(data){
                    if(!data) return;
                    if(data.code !== undefined && data.code !== 0) return;
                    var rawList = (data && data.data && Array.isArray(data.data.list)) ? data.data.list : [];
                    if(rawList.length === 0) return;

                    var historyList = rawList.map(function(item){
                        var num = parseInt(item.number || item.openNumber || 0);
                        var apiColor = String(item.color || '').toLowerCase();

                        var resolvedColor;
                        if(apiColor.indexOf('red') !== -1) resolvedColor = 'RED';
                        else if(apiColor.indexOf('green') !== -1) resolvedColor = 'GREEN';
                        else resolvedColor = (num % 2 === 0) ? 'RED' : 'GREEN';

                        return {
                            issueNumber: String(item.issueNumber || item.issue || ''),
                            number: num,
                            size: num >= 5 ? 'BIG' : 'SMALL',
                            color: resolvedColor,
                            rawColor: apiColor
                        };
                    });

                    latestHistoryData = historyList;
                    var lastIssue = historyList[0];
                    var currentPeriodStr = (BigInt(lastIssue.issueNumber) + 1n).toString();
                    $('goku-period').innerText = currentPeriodStr;
                    renderHistory(historyList);

                    if(lastPeriodFetched && lastPeriodFetched !== currentPeriodStr){
                        if(activeBetPending){ checkWinLoss(lastIssue); }
                        $('goku-pred').innerHTML = "CHECKING...";
                        $('goku-pred').style.fontSize = "16px";
                        $('goku-pred').style.color = "#6d5bd0";
                        $('goku-color-pred').innerHTML = "--";
                        setTimeout(function(){
                            updatePredictionDisplay();
                        }, 2500); // ✅ UPDATED: 2.5 second wait to prevent 404 site error
                    }
                    lastPeriodFetched = currentPeriodStr;
                })
                .catch(function(e){ console.log('GOKU History API error:', e); });
        }

        function renderHistory(list){
            if(!list.length) return;
            var ln = list[0].number;
            var rawColor = String(list[0].rawColor || '').toLowerCase();
            var lc = $('gk-last');

            var isViolet = (ln === 0 || ln === 5 || rawColor.indexOf('violet') !== -1);
            var mainColor, colorHex;

            if(ln === 0){ mainColor = 'RED'; colorHex = '#dc2626'; }
            else if(ln === 5){ mainColor = 'GREEN'; colorHex = '#059669'; }
            else if(rawColor.indexOf('red') !== -1){ mainColor = 'RED'; colorHex = '#dc2626'; }
            else if(rawColor.indexOf('green') !== -1){ mainColor = 'GREEN'; colorHex = '#059669'; }
            else if(ln % 2 === 0){ mainColor = 'RED'; colorHex = '#dc2626'; }
            else { mainColor = 'GREEN'; colorHex = '#059669'; }

            var violetDot = isViolet
                ? '<span style="display:inline-block;width:9px;height:9px;background:#7c3aed;border-radius:50%;margin-left:6px;vertical-align:middle;box-shadow:0 0 0 2px rgba(124,58,237,.15)"></span>'
                : '';

            lc.innerHTML = mainColor + violetDot;
            lc.style.color = colorHex;
            lc.style.display = 'inline-flex';
            lc.style.alignItems = 'center';
        }

        function startLiveClock(){
            var workerCode = "var t; self.onmessage=function(e){if(e.data==='start')t=setInterval(function(){postMessage('tick');},1000);};";
            var blob = new Blob([workerCode], {type: 'application/javascript'});
            timerWorker = new Worker(URL.createObjectURL(blob));
            timerWorker.onmessage = function(){
                updateBalance();
                var now = new Date(); var s = now.getSeconds(); var m = now.getMinutes(); var secondsLeft = 0;
                if(maxSeconds === 30) secondsLeft = 30 - (s % 30);
                else if(maxSeconds === 60) secondsLeft = 60 - s;
                else if(maxSeconds === 180) secondsLeft = 180 - ((m % 3) * 60 + s);
                else if(maxSeconds === 300) secondsLeft = 300 - ((m % 5) * 60 + s);
                $('goku-time').innerText = String(Math.floor(secondsLeft/60)).padStart(2,'0') + ':' + String(secondsLeft%60).padStart(2,'0');
                fetchApiData();
            };
            timerWorker.postMessage('start');
        }

        function updateBalance(){
            var e = document.querySelector('.Wallet__C-balance-l1 div, .balance-amount, #balance, .balance, .money');
            var v = e ? e.innerText.replace(/[^\d.]/g, '') : "0.00";
            currentBalance = parseFloat(v) || 0;
            $('goku-bal-val').innerText = balHidden ? '••••' : (e ? '₹' + currentBalance.toFixed(2) : 'Scanning...');
        }

        function getColorFromNumber(n){
            if(n === 0) return 'RED';
            if(n === 5) return 'GREEN';
            return (n % 2 === 0) ? 'RED' : 'GREEN';
        }

        function checkWinLoss(lastIssueData){
            var actualNum = parseInt(lastIssueData.number);
            var actualSize = lastIssueData.size;
            var actualColor = lastIssueData.color || getColorFromNumber(actualNum);

            if(!currentPredictionObj){
                console.log('GOKU: No prediction object, skipping result check');
                activeBetPending = false;
                return;
            }

            var isWin = false;
            var logFound = predictionLogs.find(function(l){ return l.period === activeBetPending && l.status === 'PENDING'; });
            
            if (logFound) {
                if (logFound.mode === 'COLOR') {
                    isWin = (logFound.pred === actualColor);
                } else {
                    isWin = (logFound.pred === actualSize);
                }
            } else {
                if (activeBetMode === 'COLOR') {
                    isWin = (currentPredictionObj.color === actualColor);
                } else {
                    isWin = (currentPredictionObj.size === actualSize);
                }
            }

            stats.total++;
            var amt = betLevelsArray[currentLevel] || betLevelsArray[0] || 10;
            var totalProfitThisRound = 0;

            if(isWin){
                stats.wins++; totalProfitThisRound += (amt * 0.98); currentLevel = 0;
            } else {
                stats.losses++; totalProfitThisRound -= amt; currentLevel++;
                if(currentLevel >= maxLevelsAllowed) currentLevel = 0;
            }
            stats.profit += totalProfitThisRound;

            if(totalProfitThisRound > 0){
                stats.currentStreak = stats.currentStreak > 0 ? stats.currentStreak + 1 : 1;
                if(stats.currentStreak > stats.bestWinStreak) stats.bestWinStreak = stats.currentStreak;
            } else {
                stats.currentStreak = stats.currentStreak < 0 ? stats.currentStreak - 1 : -1;
                if(Math.abs(stats.currentStreak) > stats.worstLossStreak) stats.worstLossStreak = Math.abs(stats.currentStreak);
            }

            if(logFound){
                logFound.number = actualNum;
                logFound.result = actualSize;
                logFound.resultColor = actualColor;
                logFound.status = totalProfitThisRound > 0 ? 'WIN' : 'LOSS';
            }

            if(isWin){ 
                lossRun = 0; 
            } else {
                lossRun++;
                if(cdEnabled && lossRun >= cdStreak){ 
                    cooldownLeft = cdRounds; 
                    lossRun = 0; 
                    console.log('GOKU: Cooldown Activated for ' + cooldownLeft + ' rounds');
                }
            }

            activeBetPending = false;
            updateStatsUI();
            checkProfitLossTarget();
        }

        function updateStatsUI(){
            $('st-tot').innerText = stats.total;
            $('st-win').innerText = stats.wins;
            $('st-los').innerText = stats.losses;
            var p = $('st-pro');
            p.innerText = (stats.profit >= 0 ? "+" : "-") + Math.abs(stats.profit).toFixed(2);
            p.className = stats.profit >= 0 ? "val-g" : "val-r";
            $('goku-level').innerText = 'LVL: ' + (currentLevel + 1);
            $('goku-mode-lbl').innerText = betMode;
        }

        function dispatchForceClick(node){
            if(!node) return;
            ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(evt){
                node.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
            });
            try {
                node.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
                node.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
            } catch(e){}
        }

        function findColorButton(color, ignorePanel){
            var want = color.toUpperCase();
            var nodes = document.querySelectorAll("button, [role='button'], div, span");
            var matches = [];
            for(var i=0;i<nodes.length;i++){
                var el = nodes[i];
                if(ignorePanel && ignorePanel.contains(el)) continue;
                if(!el.getClientRects().length) continue;
                var txt = (el.innerText || el.textContent || "").trim().toUpperCase();
                if(!txt) continue;
                if(txt.length > 25) continue;

                var isMatch = false;
                var exactMatch = (txt === want);

                if(exactMatch){
                    isMatch = true;
                } else if(txt.indexOf(want) === 0){
                    var nextChar = txt.charAt(want.length);
                    if(!nextChar || !/[A-Z]/.test(nextChar)) isMatch = true;
                }

                if(!isMatch){
                    var sig = ((el.className||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('data-color')||'') + ' ' + (el.getAttribute('data-type')||'')).toLowerCase();
                    if(sig.indexOf('color-' + want.toLowerCase()) !== -1 || sig.indexOf('color_' + want.toLowerCase()) !== -1 || sig.indexOf(want.toLowerCase() + '-btn') !== -1){
                        isMatch = true;
                    }
                }

                if(isMatch){
                    var isBtn = el.tagName.toLowerCase() === 'button' || el.getAttribute('role') === 'button';
                    matches.push({ el: el, depth: el.querySelectorAll("*").length, isBtn: isBtn, exactMatch: exactMatch });
                }
            }
            matches.sort(function(a,b){
                if(a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
                if(a.isBtn !== b.isBtn) return a.isBtn ? -1 : 1;
                return a.depth - b.depth;
            });

            if(matches.length > 0) return matches[0].el;
            
            var dbg = [];
            var btns = document.querySelectorAll("button, [role='button']");
            for(var k=0;k<btns.length;k++){
                if(btns[k].getClientRects().length){
                    var t = (btns[k].innerText || '').replace(/\s+/g,' ').trim().substring(0, 20);
                    if(t) dbg.push(t);
                }
            }
            console.log('GOKU: ' + want + ' button not found. Visible buttons:', dbg);
            return null;
        }

        function findVisibleAmountInput(){
            var inputs = document.querySelectorAll('input');
            var candidates = [];
            for(var i=0;i<inputs.length;i++){
                var inp = inputs[i];
                if(!inp.getClientRects().length) continue;
                if(inp.disabled || inp.readOnly) continue;
                var type = (inp.type || '').toLowerCase();
                if(type !== 'number' && type !== 'tel' && type !== 'text') continue;
                
                var sig = ((inp.className||'') + ' ' + (inp.placeholder||'') + ' ' + (inp.name||'') + ' ' + (inp.id||'')).toLowerCase();
                
                if(type === 'number' || type === 'tel' || /amount|bet|money|coin|stake|total|quantity|input/i.test(sig)){
                    candidates.push(inp);
                }
            }
            return candidates.length > 0 ? candidates[candidates.length-1] : null;
        }

        function setBetAmountOn(inputField, amount){
            if(!inputField) return false;
            try {
                var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                setter.call(inputField, String(amount));
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            } catch(err){
                try {
                    inputField.value = String(amount);
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                } catch(e2){ return false; }
            }
        }

        function checkAgreeCheckbox(){
            var labels = document.querySelectorAll('label, div, span');
            for(var i=0;i<labels.length;i++){
                var txt = (labels[i].innerText || '').toLowerCase();
                if(txt.indexOf('i agree') !== -1 && txt.length < 30) {
                    var checkbox = labels[i].querySelector('input[type="checkbox"]');
                    if(!checkbox) {
                        var prev = labels[i].previousElementSibling;
                        if(prev && prev.tagName === 'INPUT' && prev.type === 'checkbox') checkbox = prev;
                    }
                    
                    if(checkbox && checkbox.checked) return; 
                    
                    dispatchForceClick(labels[i]);
                    if(checkbox) dispatchForceClick(checkbox);
                    console.log('GOKU: Ticked I Agree');
                    return;
                }
            }
        }

        function clickConfirmButtonOnce(){
            var nodes = document.querySelectorAll('button, [role="button"], div, span');
            var matches = [];
            for(var i=0;i<nodes.length;i++){
                var el = nodes[i];
                if(!el.getClientRects().length) continue;
                var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
                if(txt.length > 40) continue;
                
                if(txt.indexOf('total amount') !== -1 || txt.indexOf('confirm') !== -1 || txt.indexOf('place bet') !== -1 || txt.indexOf('bet now') !== -1){
                    matches.push({
                        el: el,
                        depth: el.querySelectorAll("*").length,
                        isBtn: el.tagName.toLowerCase() === 'button' || el.getAttribute('role') === 'button'
                    });
                }
            }
            if(matches.length === 0) return false;
            
            var best = null;
            for(var j=0;j<matches.length;j++){
                if(matches[j].isBtn){ best = matches[j]; break; }
            }
            if(!best){
                matches.sort(function(a,b){ return a.depth - b.depth; });
                best = matches[0];
            }
            dispatchForceClick(best.el);
            return true;
        }

        function closeStuckPopups(){
            var nodes = document.querySelectorAll('button, [role="button"], div, span');
            for(var i=0;i<nodes.length;i++){
                var el = nodes[i];
                if(!el.getClientRects().length) continue;
                var txt = (el.innerText || el.textContent || "").trim().toLowerCase();
                if(txt === 'cancel'){
                    dispatchForceClick(el);
                    console.log('GOKU: Closed stuck popup (Cancel clicked)');
                    return true;
                }
            }
            return false;
        }

        function forceBet(targetVal, amount){
            return new Promise(function(resolve){
                if(isBetPlacing){ resolve(false); return; }
                isBetPlacing = true;
                
                closeStuckPopups();
                setTimeout(function(){
                    var allElements = Array.from(document.querySelectorAll('button, div, span'));
                    var targetBtn = allElements.find(function(el){
                        return el.children.length === 0 && el.innerText && el.innerText.trim().toUpperCase() === targetVal.toUpperCase();
                    }) || allElements.find(function(el){
                        return el.innerText && el.innerText.trim().toUpperCase() === targetVal.toUpperCase();
                    });

                    if(!targetBtn){
                        console.log('GOKU: Size target not found -> ' + targetVal);
                        isBetPlacing = false;
                        resolve(false);
                        return;
                    }

                    dispatchForceClick(targetBtn);

                    var checkInputCount = 0;
                    function pollForPopup() {
                        var inp = findVisibleAmountInput();
                        if (inp) {
                            setBetAmountOn(inp, amount);
                            checkAgreeCheckbox();
                            setTimeout(function(){
                                var ok = clickConfirmButtonOnce();
                                setTimeout(function(){
                                    isBetPlacing = false;
                                    resolve(ok);
                                }, 400);
                            }, 300);
                        } else {
                            checkInputCount++;
                            if (checkInputCount > 10) {
                                console.log('GOKU: Popup input not found after size click');
                                isBetPlacing = false;
                                resolve(false);
                            } else {
                                setTimeout(pollForPopup, 200);
                            }
                        }
                    }
                    pollForPopup();
                }, 200);
            }).catch(function(e) {
                isBetPlacing = false;
                return false;
            });
        }

        function forceColorBet(color, amount){
            if (color.indexOf('RED') !== -1) color = 'RED';
            else if (color.indexOf('GREEN') !== -1) color = 'GREEN';

            if(isBetPlacing){ return Promise.resolve(false); }
            isBetPlacing = true;

            return attemptColorBet(color, amount, 0).then(function(ok){
                isBetPlacing = false;
                return ok;
            }).catch(function(e) {
                isBetPlacing = false;
                return false;
            });
        }

        function attemptColorBet(color, amount, attempt){
            return new Promise(function(resolve){
                closeStuckPopups();
                setTimeout(function(){
                    var btn = findColorButton(color, panel);

                    if(!btn){
                        console.log('GOKU: Color button not found -> ' + color + ' (attempt ' + (attempt+1) + '/3)');
                        if(attempt < 2){
                            setTimeout(function(){
                                attemptColorBet(color, amount, attempt+1).then(resolve);
                            }, 600);
                        } else {
                            resolve(false);
                        }
                        return;
                    }

                    console.log('GOKU: Clicking color ' + color + ' (attempt ' + (attempt+1) + ')');
                    dispatchForceClick(btn);

                    var checkInputCount = 0;
                    function pollForPopup() {
                        var inp = findVisibleAmountInput();
                        if (inp) {
                            setBetAmountOn(inp, amount);
                            checkAgreeCheckbox();
                            setTimeout(function(){
                                var ok = clickConfirmButtonOnce();
                                setTimeout(function(){ resolve(ok); }, 400);
                            }, 300);
                        } else {
                            checkInputCount++;
                            if (checkInputCount > 10) {
                                console.log('GOKU: Popup input not found after color click');
                                if(attempt < 2){
                                    setTimeout(function(){
                                        attemptColorBet(color, amount, attempt+1).then(resolve);
                                    }, 600);
                                } else {
                                    resolve(false);
                                }
                            } else {
                                setTimeout(pollForPopup, 200);
                            }
                        }
                    }
                    pollForPopup();
                }, 200);
            });
        }

        function executeAutoBetSequence(){
            if(plStopped) return;
            if(!currentPredictionObj) return;
            if(activeBetPending) return;
            if(isBetPlacing) return;

            if(Date.now() - lastBetAttemptAt < 2000){
                console.log('GOKU: Bet too soon, skipping (Wait 2s)');
                return;
            }

            if(cooldownLeft > 0){
                cooldownLeft--;
                $('goku-status-txt').innerText = 'PAUSED (' + (cooldownLeft + 1) + ')';
                console.log('GOKU: In Cooldown. Skipping this round.');
                return;
            } else if(isBotRunning){
                $('goku-status-txt').innerText = 'RUNNING';
            }

            if(balCheckEnabled && currentBalance > 0){
                var chkLevels = generateBetLevels();
                var chkAmt = chkLevels[currentLevel] || chkLevels[0] || 10;
                if(chkAmt > currentBalance){
                    stopBotWithReason('LOW BALANCE');
                    showGokuModal(
                        'LOW BALANCE ⚠️',
                        'Next Bet: <b>' + chkAmt + '</b><br>Balance: <b>₹' + currentBalance.toFixed(2) + '</b><br>Bot stopped to prevent errors.',
                        'OK',
                        function() {}
                    );
                    return;
                }
            }

            if(maxBetLimit > 0){
                var currentRawLevels = [];
                var tempCurr = fixedBaseBet;
                for(var i=0;i<maxLevelsAllowed;i++){
                    currentRawLevels.push(tempCurr);
                    tempCurr = Math.round(tempCurr * martingaleMultiplier);
                }
                var nextRawBet = currentRawLevels[currentLevel] || currentRawLevels[0];
                
                if(nextRawBet > maxBetLimit){
                    stopBotWithReason('MAX BET HIT');
                    showGokuModal(
                        'MAX BET LIMIT 🛑',
                        'Next Bet: <b>' + nextRawBet + '</b><br>Max Allowed: <b>' + maxBetLimit + '</b><br>Bot stopped to prevent large bet.',
                        'OK',
                        function() {}
                    );
                    return;
                }
            }

            var currentModeToUse = betMode;
            if (betMode === 'AUTO') {
                if (currentPredictionObj.sizeConf >= currentPredictionObj.colorConf) {
                    currentModeToUse = 'SIZE';
                } else {
                    currentModeToUse = 'COLOR';
                }
            }

            var targetVal = currentModeToUse === 'SIZE' ? currentPredictionObj.size : currentPredictionObj.color;
            activeBetMode = currentModeToUse; 

            var thisPeriod = lastPeriodFetched;
            activeBetPending = thisPeriod;
            lastBetAttemptAt = Date.now();
            betLevelsArray = generateBetLevels();

            var logTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            predictionLogs = predictionLogs.filter(function(l){ return l.period !== thisPeriod; });
            
            predictionLogs.unshift({
                period: thisPeriod,
                pred: targetVal,
                color: currentPredictionObj.color,
                mode: currentModeToUse, 
                number: '?',
                result: 'WAITING',
                status: 'PENDING',
                time: logTime
            });
            if(predictionLogs.length > 20) predictionLogs.length = 20;

            var amtSize = betLevelsArray[currentLevel] || betLevelsArray[0] || 10;

            failedBetRetryCount = 0;
            
            function tryPlaceBet() {
                if (lastPeriodFetched !== thisPeriod) {
                    console.log('GOKU: Period changed, aborting bet retry.');
                    if(activeBetPending === thisPeriod) activeBetPending = false;
                    return; 
                }

                var betPromise = currentModeToUse === 'COLOR' ? 
                    forceColorBet(currentPredictionObj.color, amtSize) : 
                    forceBet(currentPredictionObj.size, amtSize);

                betPromise.then(function(ok){
                    if(!ok){
                        if(failedBetRetryCount < 3) {
                            failedBetRetryCount++;
                            console.log('GOKU: Bet failed. Retrying... Attempt ' + failedBetRetryCount + '/3');
                            $('goku-status-txt').innerText = 'RETRYING (' + failedBetRetryCount + '/3)...';
                            
                            setTimeout(function(){
                                tryPlaceBet();
                            }, 2000);
                        } else {
                            console.log('GOKU: Bet failed after 3 attempts. Rolling back.');
                            if(activeBetPending === thisPeriod) activeBetPending = false;
                            var log = predictionLogs.find(function(l){ return l.period === thisPeriod && l.status === 'PENDING'; });
                            if(log) log.status = 'FAILED';
                            $('goku-status-txt').innerText = 'BET FAILED';
                        }
                    }
                }).catch(function(err) {
                    console.log('GOKU: Bet promise error', err);
                    isBetPlacing = false;
                    if(activeBetPending === thisPeriod) activeBetPending = false;
                });
            }

            tryPlaceBet();
        }

        shadow.querySelectorAll('.goku-mbtn').forEach(function(b){
            if(b.getAttribute('data-m') === betMode) b.classList.add('active');
            else b.classList.remove('active');
        });

        fillSettingsInputs();
        updateStatsUI();
        startLiveClock();
        console.log('GOKU: Bot ready — 2.5s API Delay & Max Bet Hard Stop Active');
    }
})();
