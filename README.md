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
- Supabase Realtimeによる、6文字の合言葉を使った2台対戦
- QRコードまたは共有URLからの自動入室
- CPUはブラウザ内の反復深化・ミニマックス・αβ枝刈り（Web Worker）
- ドラッグ／スワイプ回転、ホイールズーム、ゴースト球
- 待った、透過表示、直前手と勝利ラインの表示
- CC0の宇宙系ループBGM、Web Audio効果音、3段階音声切替、遊び方、勝利演出

## 構成

- `src/core.js`: 盤面、76ライン、着手、勝敗判定
- `src/ai-worker.js`: 探索AI
- `src/renderer.js`: Canvas 3D投影と操作
- `src/audio.js`: ループBGMとWeb Audio効果音
- `src/main.js`: UIとゲーム進行
- `src/online.js`: 合言葉ルームとRealtime同期

## 2台対戦の設定

CPU対戦とローカル対戦は設定不要でオフライン動作します。2台対戦だけSupabase Realtimeを使用します。ブラウザ公開用の `config.js` にはProject URLとPublishable keyだけを設定します。Database passwordやSecret keyは使用しません。

## GitHub Pages

GitHub Pagesは `main` ブランチのリポジトリ直下を直接公開します。
