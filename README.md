# キューブならべ！ — 立体四目ならべ 4×4×4

ブラウザだけで遊べる、子ども向けの立体四目ならべです。外部API、アカウント、サーバーは使いません。

## 遊び方

`index.html` を静的Webサーバーで公開してください。ES Modules と Web Worker を使うため、`file://` ではなくHTTP(S)で開きます。

```sh
python -m http.server 8080
```

その後 `http://localhost:8080` を開きます。GitHub Pagesではリポジトリ直下を公開対象にできます。

## 機能

- 4×4×4、全76勝利ライン、重力ルール
- ローカル2人対戦／CPU対戦（やさしい・ふつう・つよい）
- CPUはブラウザ内の反復深化・ミニマックス・αβ枝刈り（Web Worker）
- ドラッグ／スワイプ回転、ホイールズーム、ゴースト球
- 待った、透過表示、直前手と勝利ラインの表示
- 効果音、ミュート、遊び方、勝利演出

## 構成

- `src/core.js`: 盤面、76ライン、着手、勝敗判定
- `src/ai-worker.js`: 探索AI
- `src/renderer.js`: Canvas 3D投影と操作
- `src/audio.js`: Web Audio効果音
- `src/main.js`: UIとゲーム進行

## GitHub Pages

リポジトリ設定の Pages で Source を `GitHub Actions` にします。PRを `main` にマージすると、同梱のワークフローが自動公開します。
