document.addEventListener("DOMContentLoaded", async () => {
    // 画面のパーツをすべて取得
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
    const monsterNameEle = document.getElementById("monster-name");
    const quizTextEle = document.getElementById("quiz-text");
    const choicesArea = document.getElementById("choices-area");

    let masterData = null; 

    // バトル管理用の変数（状態変数）
    let currentQuestionNum = 1; // 今何問目か
    let maxQuestions = 3;       // 全部で何問やるか
    let currentMonster = null;  // 今戦っているモンスター
    let monsterHP = 100;        // モンスターの体力
    let currentQuizJson = null; // Geminiが作った現在のクイズデータ

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

    // 🔄 連動ギミック①：学年 ➔ 教科
    gradeSelect.addEventListener("change", () => {
        subjectSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.innerHTML = '<option value="">-- きょうかを えらんでね --</option>';
        unitSelect.disabled = true;
        startBtn.disabled = true;
        const selectedGrade = gradeSelect.value;
        if (!selectedGrade || !masterData.grades[selectedGrade]) { subjectSelect.disabled = true; return; }
        Object.keys(masterData.grades[selectedGrade]).forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub; opt.innerText = sub; subjectSelect.appendChild(opt);
        });
        subjectSelect.disabled = false;
    });

    // 🔄 連動ギミック②：教科 ➔ 単元
    subjectSelect.addEventListener("change", () => {
        unitSelect.innerHTML = '<option value="">-- たんげんを えらんでね --</option>';
        startBtn.disabled = true;
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        if (!selectedSubject) { unitSelect.disabled = true; return; }
        masterData.grades[selectedGrade][selectedSubject].forEach((u, index) => {
            const opt = document.createElement("option");
            opt.value = index; opt.innerText = u.unit; unitSelect.appendChild(opt);
        });
        unitSelect.disabled = false;
    });

    // 🔄 連動ギミック③：単元選択で決定
    unitSelect.addEventListener("change", () => {
        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitIndex = unitSelect.value;
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
        maxQuestions = parseInt(qCountInput.value) || 3; // 総問題数を確定

        startBtn.innerText = "せんせいをお呼びしています...";
        startBtn.disabled = true;

        try {
            const prompt = `あなたは世界一優しい小学校の先生です。${selectedGrade}の${selectedSubject}における、単元「${unitData.unit}」について、これからバトルに挑む子どもに向けて、分かりやすい「考え方のコツ」や「ルール」を教える解説文を200文字程度で作成してください。
【絶対に守るルール】:
1. 漢字は${selectedGrade}で習うものだけを使い、できるだけ「ひらがな」「カタカナ」を多くしてください。
2. 「〜だよ」「〜かな？」といった言葉遣いにしてください。
3. 普通の文章（テキスト）としてそのまま返答してください。`;

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
    // 👾 処理②：解説が終わり「いざバトル開始！」
    // ==========================================
    battleStartBtn.addEventListener("click", () => {
        introArea.style.display = "none";
        quizArea.style.display = "block";
        
        currentQuestionNum = 1; // 1問目からスタート
        
        // ランダムで出現モンスターを決定
        currentMonster = masterData.monsters[Math.floor(Math.random() * masterData.monsters.length)];
        
        // 画面に「バトル画面（HPバー付き）」の土台を構築
        setupBattleUI();
        
        // 最初（1問目）のクイズを召喚
        loadNextQuiz();
    });

    // バトル画面のHPバーやレイアウトの初期化
    function setupBattleUI() {
        quizArea.innerHTML = `
            <div style="background: #34495e; color: white; padding: 5px 10px; border-radius: 5px; font-weight: bold; margin-bottom: 15px; display: flex; justify-content: space-between;">
                <span id="battle-stage-title">第 ${currentQuestionNum} / ${maxQuestions} 問</span>
                <span>属性: ${currentMonster.element}</span>
            </div>
            <h3 id="monster-name-title" style="margin: 0 0 5px 0; color: #2c3e50;">👿 ${currentMonster.name}</h3>
            
            <div style="background: #e2e8f0; width: 100%; height: 20px; border-radius: 10px; margin-bottom: 20px; overflow: hidden; border: 1px solid #cbd5e1;">
                <div id="hp-bar" style="background: #2ecc71; width: 100%; height: 100%; transition: width 0.5s ease-out;"></div>
            </div>

            <div id="quiz-loading-text" style="font-weight: bold; color: #7f8c8d; text-align: center; padding: 20px;">⚡ モンスターが攻撃をためています（もんだい作成中）...</div>
            <p id="battle-quiz-text" style="font-size: 20px; font-weight: bold; color: #2c3e50; display: none; line-height: 1.5;"></p>
            
            <div id="battle-input-area"></div>
            
            <div id="effect-overlay" style="margin-top: 15px; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; font-size: 22px; display: none;"></div>
        `;
    }

    // Geminiから1問ずつクイズを召喚する関数
    async function loadNextQuiz() {
        // UIをローディング状態に戻す
        document.getElementById("quiz-loading-text").style.display = "block";
        document.getElementById("battle-quiz-text").style.display = "none";
        const inputArea = document.getElementById("battle-input-area");
        inputArea.innerHTML = "";
        document.getElementById("effect-overlay").style.display = "none";
        
        document.getElementById("battle-stage-title").innerText = `第 ${currentQuestionNum} / ${maxQuestions} 問`;

        const selectedGrade = gradeSelect.value;
        const selectedSubject = subjectSelect.value;
        const unitData = masterData.grades[selectedGrade][selectedSubject][unitSelect.value];

        // 4択(choice)か入力(input)か判別
        const isChoiceMode = unitData.type === "choice";

        // Geminiへの問題作成プロンプト（形式によって命令を分ける）
        let prompt = `あなたは優秀な小学校の先生です。${selectedGrade}の${selectedSubject}、単元「${unitData.unit}」に関する問題を【1問】作成してください。
子どもが1人で読めるように、問題文はできるだけ「ひらがな」「カタカナ」を多くし、難しい漢字にはひらがなで括弧書きのルビ（例：漢字（かんじ））を振ってください。

`;

        if (isChoiceMode) {
            prompt += `出題形式は【4択問題】です。以下の正確なJSONフォーマットのみで返答してください。マークダウンの\`\`\`jsonなどは一切含めないでください。
{
  "question": "問題文",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "answer": "正解の選択肢（choicesの中に完全一致するもの）"
}`;
        } else {
            prompt += `出題形式は【キーボード入力問題】です。子どもが手元で入力しやすいように、答え（answer）は「半角数字のみ（例: "12"）」または「短いひらがなのみ（例: "いぬ"）」の1単語にしてください。以下の正確なJSONフォーマットのみで返答してください。マークダウンなどは一切含めないでください。
{
  "question": "問題文",
  "answer": "正確な正解の文字列"
}`;
        }

        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!response.ok) throw new Error("API通信エラー");
            const resData = await response.json();
            const rawText = resData.candidates[0].content.parts[0].text.trim();
            const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            
            currentQuizJson = JSON.parse(cleanText);

            // 画面に問題をセット
            document.getElementById("quiz-loading-text").style.display = "none";
            const qTextEle = document.getElementById("battle-quiz-text");
            qTextEle.innerText = currentQuizJson.question;
            qTextEle.style.display = "block";

            // 🎮 出題形式（4択 vs 入力）に応じて画面のボタンやテキストボックスを生成
            if (isChoiceMode) {
                // 4択ボタンを生成
                currentQuizJson.choices.forEach(choice => {
                    const btn = document.createElement("button");
                    btn.innerText = choice;
                    btn.style.cssText = "display:block; width:100%; text-align:left; margin:8px 0; padding:12px; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; font-weight:bold; cursor:pointer; border-radius:8px;";
                    btn.addEventListener("click", () => checkAnswer(choice));
                    inputArea.appendChild(btn);
                });
            } else {
                // キーボード入力欄 ＋ けっていボタンを生成
                inputArea.innerHTML = `
                    <div style="display:flex; gap:10px; margin-top:10px;">
                        <input type="text" id="user-typed-answer" placeholder="ここに こたえを かいてね" style="flex:1; padding:12px; font-size:18px;">
                        <button id="submit-answer-btn" style="width:100px; margin:0; background:#2ecc71;">けってい</button>
                    </div>
                `;
                document.getElementById("submit-answer-btn").addEventListener("click", () => {
                    const typed = document.getElementById("user-typed-answer").value.trim();
                    checkAnswer(typed);
                });
            }

        } catch (error) {
            showError(`もんだいの しょうかんに しっぱいしました。\n${error.message}`);
        }
    }

    // 🎯 答え合わせ ＆ バトル演出処理
    function checkAnswer(userAnswer) {
        // 連打防止のため入力エリアを無効化
        document.getElementById("battle-input-area").style.pointerEvents = "none";
        
        const effectOverlay = document.getElementById("effect-overlay");
        const hpBar = document.getElementById("hp-bar");
        
        const isCorrect = String(userAnswer) === String(currentQuizJson.answer);
        
        effectOverlay.style.display = "block";

        if (isCorrect) {
            // 🎉 正解演出！モンスターにダメージ！
            effectOverlay.style.cssText = "margin-top:15px; padding:15px; border-radius:8px; text-align:center; font-weight:bold; font-size:22px; background:#d4edda; color:#155724; animation: pulse 0.5s infinite;";
            effectOverlay.innerText = `✨ ぜんりょくアタック！ せいかい！！ ✨\n${currentMonster.name}に ダメージを あたえた！`;
            
            // 1問ごとに均等にHPを減らす計算
            const damagePerQuestion = 100 / maxQuestions;
            monsterHP = Math.max(0, monsterHP - damagePerQuestion);
            hpBar.style.width = `${monsterHP}%`;
            
            // 残り体力量に応じて色を変えるニクい演出
            if (monsterHP < 30) hpBar.style.background = "#e74c3c"; // ピンチは赤
            else if (monsterHP < 60) hpBar.style.background = "#f39c12"; // 中ダメージはオレンジ
            
        } else {
            // 😢 不正解演出
            effectOverlay.style.cssText = "margin-top:15px; padding:15px; border-radius:8px; text-align:center; font-weight:bold; font-size:22px; background:#f8d7da; color:#721c24;";
            effectOverlay.innerText = `😢 ざんねん！ まちがい！\nただしい こたえは 「${currentQuizJson.answer}」 だったよ！`;
        }

        // 3秒間演出を見せてから、次へ進むか全クリア画面へ進むか判定
        setTimeout(() => {
            currentQuestionNum++;
            
            if (currentQuestionNum > maxQuestions) {
                // 🎉 全問終了 ➔ リザルト（結果）画面へ
                showResultScreen();
            } else {
                // 次の問題を読み込む
                document.getElementById("battle-input-area").style.pointerEvents = "auto";
                loadNextQuiz();
            }
        }, 3500);
    }

    // 🏆 ゲーム終了・大勝利画面
    function showResultScreen() {
        const isVictory = monsterHP <= 5; // 体力がほぼゼロなら勝ち
        
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