function initFirebaseApp() {
    const dbUrl = window.FIREBASE_DB_URL;
    if (!dbUrl || dbUrl.includes("あなたのプロジェクト名")) return false;
    const projId = dbUrl.replace("https://", "").split("-default-rtdb")[0];
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
    initFirebaseApp();

    const loginArea = document.getElementById("login-area");
    const registerArea = document.getElementById("register-area");
    const menuArea = document.getElementById("menu-area");
    const userListGrid = document.getElementById("user-list-grid");
    const loadingUsers = document.getElementById("loading-users");
    
    const gradeSelect = document.getElementById("grade-select");
    const subjectSelect = document.getElementById("subject-select");
    const unitSelect = document.getElementById("unit-select");
    const qCountInput = document.getElementById("question-count");
    const showIntroBtn = document.getElementById("show-intro-btn");
    const startBattleBtn = document.getElementById("start-battle-btn");
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
    let correctCount = 0;
    let selectedAvatarIcon = "👦"; // デフォルトアイコン

    window.currentUser = { name: "", avatar: "", uid: "" };
    const dbUrl = window.FIREBASE_DB_URL;
    const apiKey = window.GEMINI_API_KEY || "{{ secrets.GEMINI_API_KEY }}";

    const monstersList = [
        { "element": "ほのお", "name": "タスザンリオン" },
        { "element": "みず", "name": "ヒキザンペンギン" },
        { "element": "かみなり", "name": "カケザンウルフ" }
    ];

    // ==========================================
    // 👤 ユーザー一覧をFirebaseから読み込んで表示する
    // ==========================================
    async function loadUserCards() {
        userListGrid.innerHTML = "";
        loadingUsers.style.display = "block";
        try {
            const res = await fetch(`${dbUrl}users.json`);
            const usersData = await res.json();
            loadingUsers.style.display = "none";

            if (!usersData) {
                userListGrid.innerHTML = "<p style='color:#7f8c8d;'>まだプレイヤーがいません。したのボタンからつくってね！</p>";
                return;
            }

            Object.keys(usersData).forEach(key => {
                const user = usersData[key];
                const card = document.createElement("div");
                card.className = "user-card";
                card.innerHTML = `
                    <div class="user-avatar">${user.avatar}</div>
                    <div class="user-name">${user.name}</div>
                `;
                // カードを押したらその人としてログイン
                card.addEventListener("click", () => loginAsUser(user.name, user.avatar));
                userListGrid.appendChild(card);
            });
        } catch (e) {
            loadingUsers.innerText = "プレイヤーのよみこみにしっぱいしました。";
        }
    }

    // ==========================================
    // 🔑 ログイン・ログアウト処理
    // ==========================================
    window.loginAsUser = async function(name, avatar) {
        try {
            const userCredential = await firebase.auth().signInAnonymously();
            window.currentUser = { name: name, avatar: avatar, uid: userCredential.user.uid };
            loginArea.style.display = "none";
            registerArea.style.display = "none";
            menuArea.style.display = "block";
            document.getElementById("current-player-display").innerText = `${avatar} ${name}`;
        } catch (error) {
            alert("ログインに失敗しました。");
        }
    };

    window.logout = async function() {
        await firebase.auth().signOut();
        location.reload();
    };

    // ==========================================
    // ➕ 新規プレイヤーの登録処理
    // ==========================================
    window.selectAvatar = function(avatar) {
        selectedAvatarIcon = avatar;
        document.querySelectorAll(".avatar-option").forEach(el => {
            el.classList.remove("selected");
            if (el.innerText === avatar) el.classList.add("selected");
        });
    };
    // 初期選択状態にする
    selectAvatar("👦");

    document.getElementById("submit-register-btn").addEventListener("click", async () => {
        const nameInput = document.getElementById("new-user-name").value.trim();
        if (!nameInput) { alert("おなまえを いれてね！"); return; }

        try {
            // Firebaseの `/users` に保存
            const newUser = { name: nameInput, avatar: selectedAvatarIcon };
            const response = await fetch(`${dbUrl}users.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newUser)
            });
            if (!response.ok) throw new Error();

            // 登録できたらそのままそのユーザーでログイン！
            loginAsUser(nameInput, selectedAvatarIcon);
        } catch (e) {
            alert("登録に失敗しました。");
        }
    });

    // 画面切り替えのイベント
    document.getElementById("go-to-register-btn").addEventListener("click", () => { loginArea.style.display = "none"; registerArea.style.display = "block"; });
    document.getElementById("go-to-login-btn").addEventListener("click", () => { loginArea.style.display = "block"; registerArea.style.display = "none"; });

    // ==========================================
    // 🌐 単元データのロード ＆ いつものクイズシステム
    // ==========================================
    try {
        const response = await fetch(`${dbUrl}.json`);
        masterData = await response.json();
        loadUserCards(); // ユーザー一覧を読み込み
    } catch (error) {
        showError(`データベースとの つながりに しっぱいしました。`);
        return;
    }

    // 学年・教科・単元の連動処理（既存どおり）
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
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value; const unitIndex = unitSelect.value;
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

    startBattleBtn.addEventListener("click", async () => {
        errorBox.style.display = "none";
        if (!apiKey || apiKey.includes("secrets.")) { showError("APIキーが設定されていません。"); return; }
        maxQuestions = parseInt(qCountInput.value) || 3; currentQuestionNum = 1; monsterHP = 100; correctCount = 0;
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
            <div style="background:#34495e; color:white; padding:5px 10px; border-radius:5px; font-weight:bold; margin-bottom:15px; display:flex; justify-content:space-between;">
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
            correctCount++;
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

    async function saveRecordAndShowResult() {
        const isVictory = monsterHP <= 5;
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
        quizArea.innerHTML = `<div style="text-align:center; padding:20px;"><h3>⏳ ぼうけんの きろくを セーブ中...</h3></div>`;

        const newRecord = {
            playerName: window.currentUser.name,
            date: new Date().toLocaleString("ja-JP"),
            grade: selectedGrade,
            subject: selectedSubject,
            unit: unitData.unit,
            totalQuestions: maxQuestions,
            correctQuestions: correctCount,
            isCleared: isVictory
        };

        try {
            const recordUrl = `${dbUrl}records/${window.currentUser.name}.json`;
            const response = await fetch(recordUrl);
            let userRecords = [];
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) userRecords = data;
            }
            userRecords.push(newRecord);
            await fetch(recordUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userRecords) });
        } catch (e) {
            console.error("セーブに失敗しました", e);
        }

        quizArea.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <h1 style="font-size:50px; margin:0;">${isVictory ? "🏆" : "🌟"}</h1>
                <h2>${isVictory ? "モンスターに だいしょうり！" : "ぼうけん かんりょう！"}</h2>
                <p style="font-size:18px; font-weight:bold; color:#7f8c8d;">${maxQuestions}もん中、${correctCount}もん せいかいしたよ！</p>
                <button onclick="location.reload()" style="background:#3498db; color:white; width:200px;">もう一度あそぶ</button>
            </div>
        `;
    }

    function showError(msg) { errorBox.innerText = msg; errorBox.style.display = "block"; }
});