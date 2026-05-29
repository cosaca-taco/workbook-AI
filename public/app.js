// 🌐 Firebaseの初期化に必要な設定（Realtime DatabaseのURLからプロジェクトIDを自動抽出）
function initFirebaseApp() {
    const dbUrl = window.FIREBASE_DB_URL;
    if (!dbUrl || dbUrl.includes("あなたのプロジェクト名")) return false;
    
    // URLからプロジェクト名（プロトコルとドメインの間）を自動取得
    const projId = dbUrl.replace("https://", "").split("-default-rtdb")[0];
    
    // すでに初期化されていなければ初期化
    if (!firebase.apps.length) {
        firebase.initializeApp({
            apiKey: window.GEMINI_API_KEY || "dummy",
            authDomain: `${projId}.firebaseapp.com`,
            databaseURL: dbUrl,
            projectId: projId
        });
    }
    return true;
}

document.addEventListener("DOMContentLoaded", async () => {
    // Firebase初期化チェック
    initFirebaseApp();

    const gradeSelect = document.getElementById("grade-select");
    const subjectSelect = document.getElementById("subject-select");
    const unitSelect = document.getElementById("unit-select");
    const qCountInput = document.getElementById("question-count");
    const showIntroBtn = document.getElementById("show-intro-btn");
    const startBattleBtn = document.getElementById("start-battle-btn");
    
    const loginArea = document.getElementById("login-area");
    const menuArea = document.getElementById("menu-area");
    const localIntroArea = document.getElementById("local-intro-area");
    const localIntroText = document.getElementById("local-intro-text");
    const quizArea = document.getElementById("quiz-area");
    const errorBox = document.getElementById("error-box");

    let masterData = null; 
    let currentQuestionNum = 1; 
    let maxQuestions = 3;       
    let currentMonster = null;  
    let monsterHP = 100;        
    let quizPackage = [];       
    let correctCount = 0; // 📊 今回の正解数を数える変数

    // ログイン中のユーザー情報を保持するオブジェクト
    window.currentUser = { name: "", avatar: "", uid: "" };

    const dbUrl = window.FIREBASE_DB_URL;
    const apiKey = window.GEMINI_API_KEY || "{{ secrets.GEMINI_API_KEY }}";

    const monstersList = [
        { "element": "ほのお", "name": "タスザンリオン" },
        { "element": "みず", "name": "ヒキザンペンギン" },
        { "element": "かみなり", "name": "カケザンウルフ" }
    ];

    // ==========================================
    // 🔑 ログイン処理用の関数（HTMLのカードから呼ばれる）
    // ==========================================
    window.loginAsUser = async function(name, avatar) {
        try {
            // Firebaseの匿名認証を実行して、ブラウザ固有の安全なUIDを取得
            const userCredential = await firebase.auth().signInAnonymously();
            window.currentUser = {
                name: name,
                avatar: avatar,
                uid: userCredential.user.uid
            };

            // 画面の切り替え
            loginArea.style.display = "none";
            menuArea.style.display = "block";
            document.getElementById("current-player-display").innerText = `${avatar} ${name}`;
        } catch (error) {
            alert("ログインに失敗しました。FirebaseのAuthentication設定をご確認ください。");
        }
    };

    // 🔄 プレイヤー交代（ログアウト）
    window.logout = async function() {
        await firebase.auth().signOut();
        location.reload();
    };

    // ==========================================
    // 🌐 処理：Firebaseから問題設定データをダウンロード
    // ==========================================
    try {
        if (!dbUrl || dbUrl.includes("あなたのプロジェクト名")) {
            throw new Error("env.js の FIREBASE_DB_URL が正しく設定されていません。");
        }
        const response = await fetch(`${dbUrl}.json`);
        if (!response.ok) throw new Error();
        masterData = await response.json();
    } catch (error) {
        showError(`データベースとの つながりに しっぱいしました。`);
        return;
    }

    // 連動ギミック（学年→教科→単元）はそのまま維持
    gradeSelect.addEventListener("change", () => {
        subjectSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.disabled = true; resetMenuButtons();
        const selectedGrade = gradeSelect.value;
        if (!selectedGrade || !masterData.grades[selectedGrade]) { subjectSelect.disabled = true; return; }
        Object.keys(masterData.grades[selectedGrade]).forEach(sub => {
            const opt = document.createElement("option"); opt.value = sub; opt.innerText = sub; subjectSelect.appendChild(opt);
        });
        subjectSelect.disabled = false;
    });

    subjectSelect.addEventListener("change", () => {
        unitSelect.innerHTML = '<option value="">-- たんげんを えらんでね --</option>';
        resetMenuButtons();
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value;
        if (!selectedSubject) { unitSelect.disabled = true; return; }
        masterData.grades[selectedGrade][selectedSubject].forEach((u, index) => {
            const opt = document.createElement("option"); opt.value = index; opt.innerText = u.unit; unitSelect.appendChild(opt);
        });
        unitSelect.disabled = false;
    });

    unitSelect.addEventListener("change", () => {
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSubject = subjectSelect.value; const unitIndex = unitSelect.value;
        if (!unitIndex) { resetMenuButtons(); return; }
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitIndex];
        qCountInput.value = unitData.defaultQuestions;
        showIntroBtn.disabled = false; startBattleBtn.disabled = false;
    });

    function resetMenuButtons() { showIntroBtn.disabled = true; startBattleBtn.disabled = true; localIntroArea.style.display = "none"; }

    showIntroBtn.addEventListener("click", () => {
        if (localIntroArea.style.display === "block") { localIntroArea.style.display = "none"; } 
        else {
            const unitData = masterData.grades[gradeSelect.value][subjectSelect.value][unitSelect.value];
            localIntroText.innerText = unitData.intro || "みんなで たのしく クイズに いどもう！";
            localIntroArea.style.display = "block";
        }
    });

    // ⚔️ バトル開始
    startBattleBtn.addEventListener("click", async () => {
        errorBox.style.display = "none";
        if (!apiKey || apiKey.includes("secrets.")) { showError("APIキーが設定されていません。"); return; }

        maxQuestions = parseInt(qCountInput.value) || 3; 
        currentQuestionNum = 1; monsterHP = 100; correctCount = 0; // リセット
        currentMonster = monstersList[Math.floor(Math.random() * monstersList.length)];
        
        menuArea.style.display = "none"; quizArea.style.display = "block";
        quizArea.innerHTML = `<div style="font-weight:bold; text-align:center; padding:40px; font-size:20px;">⚡ ${currentMonster.name} が あらわれた！</div>`;

        const success = await loadAllQuizzesAtOnce();
        if (!success) { menuArea.style.display = "block"; quizArea.style.display = "none"; return; }

        setupBattleUI(); displayCurrentQuiz();
    });

    async function loadAllQuizzesAtOnce() {
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
        const isChoiceMode = unitData.type === "choice";
        let prompt = `小学校${selectedGrade}の${selectedSubject}（単元:${unitData.unit}）の問題を【${maxQuestions}問】作成し、JSON配列のみで返してください。漢字には必ずひらがなでルビを振ってください（例：漢字（かんじ））。\n`;
        prompt += isChoiceMode ? `[{"question": "問題文","choices": ["選1", "選2", "選3", "選4"],"answer": "正解の選択肢"}]` : `[{"question": "問題文","answer": "正解"}]`;

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const resData = await response.json();
            const rawText = resData.candidates[0].content.parts[0].text.trim();
            const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            quizPackage = JSON.parse(cleanText);
            return true;
        } catch (error) {
            showError("クイズのじゅんびにしっぱいしちゃった。"); return false;
        }
    }

    function setupBattleUI() {
        quizArea.innerHTML = `
            <div style="background:#34495e; color:white; padding:5px 10px; border-radius:5px; font-weight:bold; margin-bottom:15px; display:flex; justify-content:between;">
                <span id="battle-stage-title">第 ${currentQuestionNum} / ${maxQuestions} 問</span>
            </div>
            <h3>👿 ${currentMonster.name}</h3>
            <div style="background:#e2e8f0; width:100%; height:20px; border-radius:10px; margin-bottom:20px; overflow:hidden;"><div id="hp-bar" style="background:#2ecc71; width:100%; height:100%; transition:width 0.5s;"></div></div>
            <p id="battle-quiz-text" style="font-size:20px; font-weight:bold;"></p>
            <div id="battle-input-area"></div>
            <div id="effect-overlay" style="margin-top:15px; padding:15px; border-radius:8px; display:none; font-size:22px; font-weight:bold;"></div>
        `;
    }

    function displayCurrentQuiz() {
        document.getElementById("effect-overlay").style.display = "none";
        document.getElementById("battle-stage-title").innerText = `第 ${currentQuestionNum} / ${maxQuestions} 問`;
        const currentQuiz = quizPackage[currentQuestionNum - 1];
        document.getElementById("battle-quiz-text").innerText = currentQuiz.question;
        const inputArea = document.getElementById("battle-input-area");
        inputArea.innerHTML = ""; inputArea.style.pointerEvents = "auto";

        const unitData = masterData.grades[gradeSelect.value][subjectSelect.value][unitSelect.value];
        if (unitData.type === "choice") {
            currentQuiz.choices.forEach(choice => {
                const btn = document.createElement("button"); btn.innerText = choice;
                btn.style.cssText = "display:block; width:100%; text-align:left; margin:8px 0; padding:12px; font-weight:bold; border-radius:8px;";
                btn.addEventListener("click", () => checkAnswer(choice, currentQuiz.answer));
                inputArea.appendChild(btn);
            });
        } else {
            inputArea.innerHTML = `<div style="display:flex; gap:10px;"><input type="text" id="user-typed-answer" style="flex:1; padding:12px;"><button id="submit-answer-btn" style="width:100px; background:#2ecc71; color:white;">けってい</button></div>`;
            document.getElementById("submit-answer-btn").addEventListener("click", () => checkAnswer(document.getElementById("user-typed-answer").value.trim(), currentQuiz.answer));
        }
    }

    function checkAnswer(userAnswer, correctName) {
        document.getElementById("battle-input-area").style.pointerEvents = "none";
        const effectOverlay = document.getElementById("effect-overlay");
        const isCorrect = String(userAnswer) === String(correctName);
        effectOverlay.style.display = "block";

        if (isCorrect) {
            correctCount++; // 正解数をカウントアップ！
            effectOverlay.style.cssText = "background:#d4edda; color:#155724; padding:10px; margin-top:10px; border-radius:8px;";
            effectOverlay.innerText = "✨ せいかい！！ ✨";
            monsterHP = Math.max(0, monsterHP - (100 / maxQuestions));
            document.getElementById("hp-bar").style.width = `${monsterHP}%`;
        } else {
            effectOverlay.style.cssText = "background:#f8d7da; color:#721c24; padding:10px; margin-top:10px; border-radius:8px;";
            effectOverlay.innerText = `😢 まちがい！ こたえは 「${correctName}」`;
        }

        setTimeout(() => {
            currentQuestionNum++;
            if (currentQuestionNum > maxQuestions) { saveRecordAndShowResult(); } 
            else { displayCurrentQuiz(); }
        }, 2500); 
    }

    // ==========================================
    // 📊 今回の新機能：冒険の記録をFirebaseへセーブ！
    // ==========================================
    async function saveRecordAndShowResult() {
        const isVictory = monsterHP <= 5;
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];

        quizArea.innerHTML = `<div style="text-align:center; padding:20px;"><h3>⏳ ぼうけんの きろくを セーブ中...</h3></div>`;

        // 📝 1. セーブデータオブジェクトを作成
        const newRecord = {
            playerName: window.currentUser.name,
            date: new Date().toLocaleString("ja-JP"), // 解いた日時
            grade: selectedGrade,
            subject: selectedSubject,
            unit: unitData.unit,
            totalQuestions: maxQuestions,
            correctQuestions: correctCount,
            isCleared: isVictory
        };

        try {
            // 📝 2. Firebaseの 「/records/[ユーザーのなまえ]」 の中に新しい記録を追記保存
            const recordUrl = `${dbUrl}records/${window.currentUser.name}.json`;
            
            // 既存のデータを取得して配列として追記する
            const response = await fetch(recordUrl);
            let userRecords = [];
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) userRecords = data;
            }
            userRecords.push(newRecord);

            await fetch(recordUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(userRecords)
            });
        } catch (e) {
            console.error("セーブに失敗しました", e);
        }

        // 🏁 3. 結果画面の表示
        quizArea.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <h1 style="font-size:50px; margin:0;">${isVictory ? "🏆" : "🌟"}</h1>
                <h2>${isVictory ? "モンスターに だいしょうり！" : "ぼうけん かんりょう！"}</h2>
                <p style="font-size:18px; font-weight:bold; color:#7f8c8d;">
                    ${maxQuestions}もん中、${correctCount}もん せいかいしたよ！
                </p>
                <button onclick="location.reload()" style="background:#3498db; color:white; width:200px;">もう一度あそぶ</button>
            </div>
        `;
    }

    function showError(msg) { errorBox.innerText = msg; errorBox.style.display = "block"; }
});