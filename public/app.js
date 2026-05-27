document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const gradeSelect = document.getElementById("grade-select");
    const quizArea = document.getElementById("quiz-area");
    const errorBox = document.getElementById("error-box");
    const monsterNameEle = document.getElementById("monster-name");
    const quizTextEle = document.getElementById("quiz-text");
    const choicesArea = document.getElementById("choices-area");

    startBtn.addEventListener("click", async () => {
        // 表示をリセット
        errorBox.style.display = "none";
        quizArea.style.display = "none";
        choicesArea.innerHTML = "";

        // 🔒 鉄壁のキー取得：最優先でwindow上のキー（test.html用）を読み込み、なければダミーにします
const apiKey = window.GEMINI_API_KEY;

if (!apiKey) {
    showError("APIキーが設定されていません。");
    return;
}
        const selectedGrade = gradeSelect.value;
        startBtn.innerText = "しょうかん中...";
        startBtn.disabled = true;

        try {
            // 1. database.json からベースデータを取得
            const dbResponse = await fetch("./database.json");
            if (!dbResponse.ok) throw new Error("database.jsonの読み込みに失敗しました。");
            const monsterData = await dbResponse.json();

            // 学年にあうモンスターをランダム選出
            const gMonsters = monsterData.monsters.filter(m => m.grade === selectedGrade);
            if (gMonsters.length === 0) throw new Error(`${selectedGrade}のモンスターが見つかりません。`);
            const monster = gMonsters[Math.floor(Math.random() * gMonsters.length)];

            // 2. Gemini API を呼び出してクイズを生成
            const prompt = `${selectedGrade}向けの算数または国語の問題を1問作ってください。
以下のJSONフォーマットのみで正確に返答してください。余計な説明文や\`\`\`jsonなどのマークダウンは一切含めないでください。

{
  "question": "問題文",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
  "answer": "正解の選択肢（choicesの中に完全に一致するもの）"
}`;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const apiResponse = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (!apiResponse.ok) {
                const errData = await apiResponse.json().catch(() => ({}));
                const errMsg = errData.error?.message || "原因不明のエラー";
                const errCode = apiResponse.status;
                throw new Error(`Google API制限エラー: ${errMsg} (コード:${errCode})`);
            }

            const resData = await apiResponse.json();
            const rawText = resData.candidates[0].content.parts[0].text.trim();
            
            // マークダウンのゴミ（```json 等）がついていた場合のクレンジング
            const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
            const quizJson = JSON.parse(cleanText);

            // 3. 画面に表示
            monsterNameEle.innerText = `出現！【${monster.name}】（属性: ${monster.element} / 必殺技: ${monster.skill}）`;
            quizTextEle.innerText = quizJson.question;

            quizJson.choices.forEach(choice => {
                const btn = document.createElement("button");
                btn.innerText = choice;
                btn.style.display = "block";
                btn.style.width = "100%";
                btn.style.textAlign = "left";
                btn.style.margin = "8px 0";
                btn.style.backgroundColor = "#ecf0f1";
                btn.style.color = "#333";
                
                btn.addEventListener("click", () => {
                    if (choice === quizJson.answer) {
                        alert(`🎉 せいかい！\n${monster.name}に ダメージを あたえた！`);
                    } else {
                        alert(`😢 ざんねん！ まちがい！\n正解は「${quizJson.answer}」だったよ。`);
                    }
                });
                choicesArea.appendChild(btn);
            });

            quizArea.style.display = "block";

        } catch (error) {
            showError(`モンスターのじゅんびにしっぱいしちゃったみたい。\n【詳しいエラー理由】:\n${error.message}`);
        } finally {
            startBtn.innerText = "にいどむ！";
            startBtn.disabled = false;
        }
    });

    function showError(msg) {
        errorBox.innerText = msg;
        errorBox.style.display = "block";
        errorBox.scrollIntoView({ behavior: 'smooth' });
    }
});