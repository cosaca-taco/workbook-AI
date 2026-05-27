document.addEventListener("DOMContentLoaded", async () => {
    // 画面のパーツを取得
    const gradeSelect = document.getElementById("grade-select");
    const subjectSelect = document.getElementById("subject-select");
    const unitSelect = document.getElementById("unit-select");
    const qCountInput = document.getElementById("question-count");
    const startBtn = document.getElementById("start-btn");
    
    const menuArea = document.getElementById("menu-area");
    const introArea = document.getElementById("intro-area");
    const introText = document.getElementById("intro-text");
    const battleStartBtn = document.getElementById("battle-start-btn");
    
    const quizArea = document.getElementById("quiz-area");
    const errorBox = document.getElementById("error-box");

    let masterData = null; 

    // 🎮 バトル・クイズ管理用の変数
    let currentQuestionNum = 1; 
    let maxQuestions = 3;       
    let currentMonster = null;  
    let monsterHP = 100;        
    let quizPackage = [];       // ★ここにGeminiから一括で届いた全問題を保管する

    const apiKey = window.GEMINI_API_KEY;

    // 1. database.json の読み込み
    try {
        const response = await fetch("./database.json");
        if (!response.ok) throw new Error("database.jsonの読み込みに失敗しました。");
        masterData = await response.json();
    } catch (error) {
        showError(`設定データのよみこみに しっぱいしました: ${error.message}`);
        return;
    }

    // 🔄 連動ギミック
    gradeSelect.addEventListener("change", () => {
        subjectSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.disabled = true; startBtn.disabled = true;
        const selectedGrade = gradeSelect.value;
        if (!selectedGrade || !masterData.grades[selectedGrade]) { subjectSelect.disabled = true; return; }
        Object.keys(masterData.grades[selectedGrade]).forEach(sub => {
            const opt = document.createElement("option"); opt.value = sub; opt.innerText = sub; subjectSelect.appendChild(opt);
        });
        subjectSelect.disabled = false;
    });

    subjectSelect.addEventListener("change", () => {
        unitSelect.innerHTML = '<option value="">-- たんげんを えらんでね --</option>';
        startBtn.disabled = true;
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value;
        if (!selectedSubject) { unitSelect.disabled = true; return; }
        masterData.grades[selectedGrade][selectedSubject].forEach((u, index) => {
            const opt = document.createElement("option"); opt.value = index; opt.innerText = u.unit; unitSelect.appendChild(opt);
        });
        unitSelect.disabled = false;
    });

    unitSelect.addEventListener("change", () => {
        const selectedGrade = gradeSelect.value; const selectedSubject = subjectSelect.value; const unitIndex = unitSelect.value;
        if (!unitIndex) { startBtn.disabled = true; return; }
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitIndex];
        qCountInput.value = unitData.defaultQuestions;
        startBtn.disabled = false;
    });

    // ==========================================
    // 📖 処理①：単元の「解説」を生成する
    // ==========================================
    startBtn.addEventListener("click", async () => {
        errorBox.style.display = "none";
        if (!apiKey) { showError("APIキーが設定されていません。"); return; }

        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
        maxQuestions = parseInt(qCountInput.value) || 3; 

        startBtn.innerText = "せんせいをお呼びしています...";
        startBtn.disabled = true;

        try {
            const prompt = `あなたは世界一優しい小学校の先生です。${selectedGrade}の${selectedSubject}における、単元「${unitData.unit}」について、これからバトルに挑む子どもに向けて、分かりやすい「考え方のコツ」や「ルール」を教える解説文を200文字程度で作成してください。
【絶対に守るルール】:
1. 漢字は${selectedGrade}で習うものだけを使い、できるだけ「ひらがな」「カタカナ」を多くしてください。
2. 普通の文章（テキスト）としてそのまま返答してください。`;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error(`通信エラー (${response.status})`);
            const resData = await response.json();
            
            menuArea.style.display = "none";
            introText.innerText = resData.candidates[0].content.parts[0].text.trim();
            introArea.style.display = "block";

        } catch (error) {
            showError(`おべんきょうの じゅんびに しっぱいしちゃったみたい。\n${error.message}`);
            startBtn.innerText = "ぼうけんに でかける！";
            startBtn.disabled = false;
        }
    });

    // ==========================================
    // 👾 処理②：解説が終わり「いざバトル開始！」（ここで一括生成！）
    // ==========================================
    battleStartBtn.addEventListener("click", async () => {
        introArea.style.display = "none";
        quizArea.style.display = "block";
        
        currentQuestionNum = 1; 
        monsterHP = 100;
        currentMonster = masterData.monsters[Math.floor(Math.random() * masterData.monsters.length)];
        
        // まずバトル画面の「枠」だけ表示してローカル表示にする
        quizArea.innerHTML = `
            <div id="quiz-loading-text" style="font-weight: bold; color: #2c3e50; text-align: center; padding: 40px; font-size: 20px;">
                ⚡ ${currentMonster.name} が あらわれた！<br>
                <span style="font-size:16px; color:#7f8c8d;">（AIが いっしょに あそぶ もんだいを まとめて じゅんび中だよ...）</span>
            </div>
        `;

        // 🧠 ★ここで指定された問題数を「一括でまとめて」Geminiから召喚する！
        const success = await loadAllQuizzesAtOnce();
        if (!success) return; // 失敗時はエラー表示が出ているので抜ける

        // 画面の本格レイアウトを設置
        setupBattleUI();
        
        // すでに手元にある1問目を表示（通信なしなので一瞬で出ます！）
        displayCurrentQuiz();
    });

    // 🧠 新機能：全問題を一括で取得する関数
    async function loadAllQuizzesAtOnce() {
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];
        const isChoiceMode = unitData.type === "choice";

        let prompt = `あなたは優秀な小学校の先生です。${selectedGrade}の${selectedSubject}、単元「${unitData.unit}」に関する問題を【絶対に${maxQuestions}問ぴったり】作成し、1つのJSON配列にして返してください。
子どもが1人で読めるように、問題文はひらがな・カタカナを多くし、難しい漢字にはひらがなで括弧書きのルビ（例：漢字（かんじ））を振ってください。

`;

        if (isChoiceMode) {
            prompt += `出題形式はすべて【4択問題】です。以下の正確な配列JSONフォーマットのみで返答してください。マークダウンの\`\`\`jsonなどは一切含めないでください。
[
  {
    "question": "1問目の問題文",
    "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "answer": "正解の選択肢"
  },
  ...これを${maxQuestions}問分ループ
]`;
        } else {
            prompt += `出題形式はすべて【キーボード入力問題】です。答え（answer）は「半角数字のみ」または「短いひらがなのみ」の1単語にしてください。以下の正確な配列JSONフォーマットのみで返答してください。
[
  {
    "question": "1問目の問題文",
    "answer": "正確な正解の文字列"
  },
  ...これを${maxQuestions}問分ループ
]`;
        }

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error("API一括通信エラー");
            const resData = await response.json();
            const rawText = resData.candidates[0].content.parts[0].text.trim();
            const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            // 全問のデータを配列としてグローバルに保存！
            quizPackage = JSON.parse(cleanText);
            return true;

        } catch (error) {
            showError(`もんだいの まとめてしょうかんに しっぱいしました。\n${error.message}`);
            return false;
        }
    }

    function setupBattleUI() {
        quizArea.innerHTML = `
            <div style="background: #34495e; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; margin-bottom: 15px; display: flex; justify-content: space-between;">
                <span id="battle-stage-title">第 ${currentQuestionNum} / ${maxQuestions} 問</span>
                <span>属性: ${currentMonster.element}</span>
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

    // ⚡ 手元（メモリ内）に溜めてある問題を取り出して一瞬で画面表示する関数
    function displayCurrentQuiz() {
        document.getElementById("effect-overlay").style.display = "none";
        document.getElementById("battle-stage-title").innerText = `第 ${currentQuestionNum} / ${maxQuestions} 問`;
        
        // 配列から「現在の問題番号（インデックスは-1）」のデータをもぎ取る
        const currentQuiz = quizPackage[currentQuestionNum - 1];
        
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

    // 🎯 答え合わせ
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
                // ★通信を挟まないので、次の瞬間（0秒）に2問目がパッと出ます！
                displayCurrentQuiz();
            }
        }, 3000); // 演出時間はじっくり3秒キープ
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