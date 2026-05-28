document.addEventListener("DOMContentLoaded", async () => {
    const gradeSelect = document.getElementById("grade-select");
    const subjectSelect = document.getElementById("subject-select");
    const unitSelect = document.getElementById("unit-select");
    const qCountInput = document.getElementById("question-count");
    const showIntroBtn = document.getElementById("show-intro-btn");
    const startBattleBtn = document.getElementById("start-battle-btn");
    
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

    // 🌐 FirebaseのURLと、GitHub Actionsから埋め込まれるAPIキーをセット
    const dbUrl = window.FIREBASE_DB_URL;
    const apiKey = window.GEMINI_API_KEY;

    // 🌟 固定のモンスターリスト（ここだけプログラム内に保持して最速化）
    const monstersList = [
        { "element": "ほのお", "name": "タスザンリオン" },
        { "element": "みず", "name": "ヒキザンペンギン" },
        { "element": "かみなり", "name": "カケザンウルフ" }
    ];

    // ==========================================
    // 🌐 処理⓪：起動時にFirebaseから全設定データを一括ダウンロード
    // ==========================================
    try {
        if (!dbUrl || dbUrl.includes("あなたのプロジェクト名")) {
            throw new Error("env.js の FIREBASE_DB_URL が正しく設定されていません。");
        }
        
        // ローカルのファイルではなく、Firebaseの「.json」エンドポイントを叩く！
        const response = await fetch(`${dbUrl}.json`);
        if (!response.ok) throw new Error("Firebaseからのデータ取得に失敗しました。");
        
        masterData = await response.json();
        
        // 万が一Firebaseが完全に空っぽ（インポート前）だった場合の安全装置
        if (!masterData || !masterData.grades) {
            throw new Error("Firebaseの中に『grades』のデータが見つかりません。JSONインポートを完了させてください。");
        }
    } catch (error) {
        showError(`データベースとの つながりに しっぱいしました:\n${error.message}`);
        return;
    }

    // 🔄 連動ギミック①：学年 ➔ 教科
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

    // 🔄 連動ギミック②：教科 ➔ 単元
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

    // 🔄 連動ギミック③：単元選択でボタン解禁
    unitSelect.addEventListener("change", () => {
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value; const unitIndex = unitSelect.value;
        if (!unitIndex) { resetMenuButtons(); return; }
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitIndex];
        qCountInput.value = unitData.defaultQuestions;
        
        showIntroBtn.disabled = false;
        startBattleBtn.disabled = false;
    });

    function resetMenuButtons() {
        showIntroBtn.disabled = true;
        startBattleBtn.disabled = true;
        localIntroArea.style.display = "none";
    }

    // ==========================================
    // 📖 選択肢A：Firebaseから引っ張ってきた自作解説を一瞬で開閉する
    // ==========================================
    showIntroBtn.addEventListener("click", () => {
        if (localIntroArea.style.display === "block") {
            localIntroArea.style.display = "none";
        } else {
            const selectedGrade = gradeSelect.value;
            const selectedSubject = subjectSelect.value;
            const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
            localIntroText.innerText = unitData.intro || "みんなで たのしく クイズに いどもう！";
            localIntroArea.style.display = "block";
        }
    });

    // ==========================================
    // ⚔️ 選択肢B：直接バトルへ！（AIから最軽量JSONを一括取得）
    // ==========================================
    startBattleBtn.addEventListener("click", async () => {
        errorBox.style.display = "none";
        if (!apiKey) { showError("APIキーが設定されていません。（GitHubの本番金庫をご確認ください）"); return; }

        maxQuestions = parseInt(qCountInput.value) || 3; 
        currentQuestionNum = 1; 
        monsterHP = 100;
        currentMonster = monstersList[Math.floor(Math.random() * monstersList.length)];
        
        menuArea.style.display = "none";
        quizArea.style.display = "block";
        quizArea.innerHTML = `
            <div id="quiz-loading-text" style="font-weight: bold; color: #2c3e50; text-align: center; padding: 40px; font-size: 20px;">
                ⚡ ${currentMonster.name} が あらわれた！<br>
                <span style="font-size:16px; color:#7f8c8d;">（AIが クイズを まとめて よういしているよ...）</span>
            </div>
        `;

        const success = await loadAllQuizzesAtOnce();
        if (!success) {
            menuArea.style.display = "block";
            quizArea.style.display = "none";
            return;
        }

        setupBattleUI();
        displayCurrentQuiz();
    });

    async function loadAllQuizzesAtOnce() {
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
        const isChoiceMode = unitData.type === "choice";

        let prompt = `小学校${selectedGrade}の${selectedSubject}（単元:${unitData.unit}）の問題を【${maxQuestions}問】作成し、以下のJSON配列のみで返してください。余計な説明文やマークダウンの\`\`\`jsonなどは絶対に含めないでください。
漢字には必ずひらがなでルビを振ってください（例：漢字（かんじ））。

`;

        if (isChoiceMode) {
            prompt += `[{"question": "問題文","choices": ["選1", "選2", "選3", "選4"],"answer": "正解の選択肢"}]`;
        } else {
            prompt += `[{"question": "問題文","answer": "半角数字またはひらがな1単語の正解"}]`;
        }

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) {
                if (response.status === 429) throw new Error("Googleの利用制限（429）にかかりました。1分ほど待ってからもう一度お試しください。");
                throw new Error(`通信エラー (${response.status})`);
            }
            
            const resData = await response.json();
            const rawText = resData.candidates[0].content.parts[0].text.trim();
            const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            quizPackage = JSON.parse(cleanText);
            return true;

        } catch (error) {
            showError(`おべんきょうの じゅんびに しっぱいしちゃったみたい。\n【エラー理由】: ${error.message}`);
            return false;
        }
    }

    function setupBattleUI() {
        quizArea.innerHTML = `
            <div style="background: #34495e; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; margin-bottom: 15px; display: flex; justify-content: space-between;">
                <span id="battle-stage-title">第 ${currentQuestionNum} / ${maxQuestions} 問</span>
            </div>
            <h3 style="margin: 0 0 5px 0; color: #2c3e50;">👿 ${currentMonster.name}</h3>
            
            <div style="background: #e2e8f0; width: 100%; height: 20px; border-radius: 10px; margin-bottom: 20px; overflow: hidden; border: 1px solid #cbd5e1;">
                <div id="hp-bar" style="background: #2ecc71; width: 100%; height: 100%; transition: width 0.5s ease-out;"></div>
            </div>

            <p id="battle-quiz-text" style="font-size: 20px; font-weight: bold; color: #2c3e50; line-height: 1.5; min-height:60px;"></p>
            <div id="battle-input-area"></div>
            <div id="effect-overlay" style="margin-top: 15px; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; font-size: 22px; display: none;"></div>
        `;
    }

    function displayCurrentQuiz() {
        document.getElementById("effect-overlay").style.display = "none";
        document.getElementById("battle-stage-title").innerText = `第 ${currentQuestionNum} / ${maxQuestions} 問`;
        
        const currentQuiz = quizPackage[currentQuestionNum - 1];
        if (!currentQuiz) { showError("クイズデータの読み込みに失敗しました。最初からお試しください。"); return; }
        
        document.getElementById("battle-quiz-text").innerText = currentQuiz.question;
        const inputArea = document.getElementById("battle-input-area");
        inputArea.innerHTML = "";
        document.getElementById("battle-input-area").style.pointerEvents = "auto";

        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];

        if (unitData.type === "choice") {
            currentQuiz.choices.forEach(choice => {
                const btn = document.createElement("button");
                btn.innerText = choice;
                btn.style.cssText = "display:block; width:100%; text-align:left; margin:8px 0; padding:12px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:bold; cursor:pointer; border-radius:8px;";
                btn.addEventListener("click", () => checkAnswer(choice, currentQuiz.answer));
                inputArea.appendChild(btn);
            });
        } else {
            inputArea.innerHTML = `
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <input type="text" id="user-typed-answer" placeholder="ここに こたえを かいてね" style="flex:1; padding:12px; font-size:18px;">
                    <button id="submit-answer-btn" style="width:100px; margin:0; background:#2ecc71;">けってい</button>
                </div>
            `;
            document.getElementById("submit-answer-btn").addEventListener("click", () => {
                const typed = document.getElementById("user-typed-answer").value.trim();
                checkAnswer(typed, currentQuiz.answer);
            });
        }
    }

    function checkAnswer(userAnswer, correctName) {
        document.getElementById("battle-input-area").style.pointerEvents = "none";
        const effectOverlay = document.getElementById("effect-overlay");
        const hpBar = document.getElementById("hp-bar");
        
        const isCorrect = String(userAnswer) === String(correctName);
        effectOverlay.style.display = "block";

        if (isCorrect) {
            effectOverlay.style.cssText = "margin-top:15px; padding:15px; border-radius:8px; text-align:center; font-weight:bold; font-size:22px; background:#d4edda; color:#155724;";
            effectOverlay.innerText = `✨ ぜんりょくアタック！ せいかい！！ ✨\n${currentMonster.name}に ダメージを あたえた！`;
            
            const damagePerQuestion = 100 / maxQuestions;
            monsterHP = Math.max(0, monsterHP - damagePerQuestion);
            hpBar.style.width = `${monsterHP}%`;
            
            if (monsterHP < 30) hpBar.style.background = "#e74c3c";
            else if (monsterHP < 60) hpBar.style.background = "#f39c12";
        } else {
            effectOverlay.style.cssText = "margin-top:15px; padding:15px; border-radius:8px; text-align:center; font-weight:bold; font-size:22px; background:#f8d7da; color:#721c24;";
            effectOverlay.innerText = `😢 ざんねん！ まちがい！\nただしい こたえは 「${correctName}」 だったよ！`;
        }

        setTimeout(() => {
            currentQuestionNum++;
            if (currentQuestionNum > maxQuestions) {
                showResultScreen();
            } else {
                displayCurrentQuiz();
            }
        }, 3000); 
    }

    function showResultScreen() {
        const isVictory = monsterHP <= 5;
        quizArea.innerHTML = `
            <div style="text-align:center; padding:20px;">
                <h1 style="font-size:50px; margin:0;">${isVictory ? "🏆" : "🌟"}</h1>
                <h2 style="color:#2c3e50; margin-top:10px;">${isVictory ? "モンスターに だいしょうり！" : "ぼうけん かんりょう！"}</h2>
                <p style="font-size:18px; font-weight:bold; color:#7f8c8d; line-height:1.6;">
                    最後まで あきらめずに<br>
                    ${maxQuestions}もんの もんだいに よく にいどんだね！
                </p>
                <button onclick="location.reload()" style="background:#3498db; width:200px; height:50px; font-size:18px;">もう一度あそぶ</button>
            </div>
        `;
    }

    function showError(msg) {
        errorBox.innerText = msg;
        errorBox.style.display = "block";
        errorBox.scrollIntoView({ behavior: 'smooth' });
    }
});